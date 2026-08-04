// INV-PLACE (Spec 11 §3), Fassung nach ADR-v9-197/BL-288.
//
// GEÄNDERT: Der Ladepass schreibt `ev.place` NICHT mehr um. Bis dahin galt „ev.place ist
// ausschließlich die periodengerechte Projektion" — das war strukturell elegant (kein
// Stale-Cache möglich) und kostete an `Unsere Familie 2026.ged` 668 umgeschriebene
// PLAC-Werte bei jedem Speichern, an Ereignissen, die niemand angefasst hatte.
//
// Was bleibt, ist das ZIEL: der Nutzer sieht die periodengerechte Form. Nur der Weg ist
// ein anderer — sie entsteht in der ANZEIGE (`buildFormString` aus `placeId`), nicht durch
// Überschreiben der Quelle. `ev.place` ist wieder Wire-Wahrheit; aktuell gehalten wird sie
// von den Kurations-Kommandos (user-induziert, mit Undo).
import { describe, it, expect } from 'vitest';
import {
  resolveEvents,
  buildPlacForGedcom,
  buildFormString,
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

  it('Anzeige periodengerecht, Datei unangetastet (pname greift im Jahr)', () => {
    const historic = placeMap(
      place('@S@', {
        title: 'Sassenberg',
        type: 'Town',
        pnames: [{ value: 'Sassenbergk', from: 1600, to: 1750 }],
      }),
    );
    const res = resolveEvents([ev('BIRT', { place: 'Sassenberg', date: '1700' })], historic, hofMap());
    const e = res.events[0].event;
    expect(e.placeId).toBe('@S@'); // gebunden …
    expect(e.place).toBe('Sassenberg'); // … aber die Quelle bleibt, wie sie war
    // Die historische Schreibweise liefert die Projektion — das ist, was der Nutzer sieht.
    expect(buildFormString(makePlaceRegistry(historic), '@S@', 1700)).toBe('Sassenbergk');
  });

  it('Durchreich-Pfad: ein bereits gelinktes Event behält seinen Dateiwert', () => {
    // Event kommt aus dem GRAMPS-Parser bereits mit placeId. Sein `place` mag von der
    // Projektion abweichen — das ist KEIN „stale Cache" mehr, sondern die Quelle.
    const historic = placeMap(
      place('@S@', {
        title: 'Sassenberg',
        pnames: [{ value: 'Sassenbergk', from: 1600, to: 1750 }],
      }),
    );
    const wire = ev('BIRT', { placeId: '@S@', place: 'Abweichender Wire-Wert', date: '1700' });
    const res = resolveEvents([wire], historic, hofMap());
    expect(res.events[0].path).toBe('reproject'); // Pfadname unverändert (Durchreichen)
    expect(res.events[0].event.place).toBe('Abweichender Wire-Wert');
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
