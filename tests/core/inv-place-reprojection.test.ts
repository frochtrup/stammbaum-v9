// INV-PLACE (Spec 11 §3): Ist placeId/hofId gesetzt, ist ev.place ausschließlich die
// periodengerechte Projektion buildPlacForGedcom(ev, year). Projektions-Cache, keine
// eigene Wahrheit. Reprojektion läuft am Ende JEDES Pfads → Stale-Cache ausgeschlossen.
import { describe, it, expect } from 'vitest';
import {
  resolveEvents,
  buildPlacForGedcom,
  makePlaceRegistry,
  makeHofRegistry,
  eventYear,
} from '../../core/places/index';
import { place, hof, placeMap, hofMap, ev } from './places-fixtures';

const village = place('@OCHTRUP@', {
  title: 'Ochtrup',
  type: 'Town',
  enclosedBy: [{ placeId: '@DE@', from: null, to: null }],
});
const country = place('@DE@', { title: 'Deutschland', type: 'Country' });
const places = placeMap(village, country);

describe('INV-PLACE — Reprojektion am Pfad-Ende', () => {
  it('nach Auflösung ist ev.place == buildPlacForGedcom (Projektions-Identität)', () => {
    const hofs = hofMap(
      hof('_hof_wall_33_ochtrup', '@OCHTRUP@', {
        addrs: [{ value: 'Wall 33', from: null, to: null }],
      }),
    );
    const res = resolveEvents(
      [ev('RESI', { place: 'Wall 33, Ochtrup, Deutschland', addr: 'Wall 33', date: '1900' })],
      places,
      hofs,
    );
    const out = res.events[0].event;
    const ctx = { places: makePlaceRegistry(places), hofs: makeHofRegistry(res.hofObjects) };
    expect(out.place).toBe(buildPlacForGedcom(out, eventYear(out), ctx));
  });

  it('ev.place = periodengerechte Projektion (pname greift im Jahr)', () => {
    const historic = placeMap(
      place('@S@', {
        title: 'Sassenberg',
        type: 'Town',
        pnames: [{ value: 'Sassenbergk', from: 1600, to: 1750 }],
      }),
    );
    const res = resolveEvents([ev('BIRT', { place: 'Sassenberg', date: '1700' })], historic, hofMap());
    // Modell-Wahrheit ändert die Anzeige: 1700 → historische Schreibweise.
    expect(res.events[0].event.place).toBe('Sassenbergk');
  });

  it('Durchreich-REPROJECT: bereits gelinktes Event wird periodengerecht aktualisiert', () => {
    // event kommt aus GRAMPS-Parser bereits mit placeId, aber veraltetem place-Cache.
    const historic = placeMap(
      place('@S@', {
        title: 'Sassenberg',
        pnames: [{ value: 'Sassenbergk', from: 1600, to: 1750 }],
      }),
    );
    const stale = ev('BIRT', { placeId: '@S@', place: 'VERALTET', date: '1700' });
    const res = resolveEvents([stale], historic, hofMap());
    expect(res.events[0].path).toBe('reproject');
    expect(res.events[0].event.place).toBe('Sassenbergk');
  });

  it('ohne placeId/hofId bleibt ev.place unverändert (kein Cache-Overwrite von Wire-Daten)', () => {
    const res = resolveEvents([ev('EVEN', { place: 'Unbekannter Ort XYZ' })], places, hofMap());
    expect(res.events[0].event.placeId).toBeNull();
    expect(res.events[0].event.place).toBe('Unbekannter Ort XYZ');
  });

  it('ev.addr bleibt byte-identisch, wenn gesetzt (ADDR-Roundtrip)', () => {
    const hofs = hofMap(
      hof('_hof_wall_33_ochtrup', '@OCHTRUP@', {
        addrs: [{ value: 'Wall 33', from: null, to: null }],
      }),
    );
    const res = resolveEvents(
      [ev('RESI', { place: 'Ochtrup, Deutschland', addr: 'Wall 33, 48607 Ochtrup', date: '1900' })],
      places,
      hofs,
    );
    // Reprojektion füllt ev.addr NUR wenn leer — hier bleibt der Wire-Wert.
    expect(res.events[0].event.addr).toBe('Wall 33, 48607 Ochtrup');
  });

  it('reine Funktion: die Eingabe-Events werden nicht mutiert', () => {
    const input = ev('RESI', { place: 'Wall 33, Ochtrup, Deutschland', addr: 'Wall 33', date: '1900' });
    const before = { ...input };
    resolveEvents([input], places, hofMap());
    expect(input).toEqual(before);
    expect(input.hofId).toBeNull();
    expect(input.placeId).toBeNull();
  });
});
