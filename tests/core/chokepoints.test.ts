// Die vier Chokepoints (Spec 11 §5): eventPlaceId, eventHofId, eventCoords,
// buildPlacForGedcom — die einzigen erlaubten Orts-/Hof-Reads.
import { describe, it, expect } from 'vitest';
import {
  eventPlaceId,
  eventHofId,
  eventCoords,
  buildPlacForGedcom,
  buildFullPlaceName,
  makePlaceRegistry,
  makeHofRegistry,
  eventYear,
} from '../../core/places/index';
import type { PlaceContext } from '../../core/places/index';
import { place, hof, placeMap, hofMap, ev } from './places-fixtures';

const places = placeMap(
  place('@OCHTRUP@', {
    title: 'Ochtrup',
    type: 'Town',
    lat: 52.2,
    long: 7.19,
    enclosedBy: [{ placeId: '@DE@', from: null, to: null }],
  }),
  place('@DE@', { title: 'Deutschland', type: 'Country' }),
);
const hofs = hofMap(
  hof('_hof_wall_33_ochtrup', '@OCHTRUP@', {
    addrs: [{ value: 'Wall 33', from: null, to: null }],
    lat: 52.21,
    long: 7.2,
  }),
);
const ctx: PlaceContext = { places: makePlaceRegistry(places), hofs: makeHofRegistry(hofs) };

describe('eventPlaceId — Welches Dorf?', () => {
  it('A: ev.placeId ist Wahrheit', () => {
    expect(eventPlaceId(ev('RESI', { placeId: '@OCHTRUP@' }), ctx)).toBe('@OCHTRUP@');
  });
  it('B: findByName(ev.place) als Projektion', () => {
    expect(eventPlaceId(ev('RESI', { place: 'Ochtrup' }), ctx)).toBe('@OCHTRUP@');
  });
  it('null, wenn nichts auflösbar', () => {
    expect(eventPlaceId(ev('RESI', { place: 'Unbekannt' }), ctx)).toBeNull();
  });
});

describe('eventHofId — Welcher Hof?', () => {
  it('A: ev.hofId direkt', () => {
    expect(eventHofId(ev('RESI', { hofId: '_hof_wall_33_ochtrup' }), ctx)).toBe('_hof_wall_33_ochtrup');
  });
  it('B: findByAddr im Dorf-Scope', () => {
    expect(
      eventHofId(ev('RESI', { place: 'Ochtrup', addr: 'Wall 33', date: '1900' }), ctx),
    ).toBe('_hof_wall_33_ochtrup');
  });
});

describe('eventCoords — Welche Koordinaten?', () => {
  it('Hof-Koordinaten haben Vorrang', () => {
    expect(eventCoords(ev('RESI', { hofId: '_hof_wall_33_ochtrup' }), ctx)).toEqual({ lat: 52.21, long: 7.2 });
  });
  it('placeObject-Koordinaten, wenn kein Hof', () => {
    expect(eventCoords(ev('BIRT', { placeId: '@OCHTRUP@' }), ctx)).toEqual({ lat: 52.2, long: 7.19 });
  });
  it('ev.lati/long nur als Fallback', () => {
    expect(eventCoords(ev('EVEN', { lati: 1, long: 2 }), ctx)).toEqual({ lat: 1, long: 2 });
  });
});

describe('buildPlacForGedcom — welcher PLAC würde geschrieben?', () => {
  it('Hof + Dorf-Hierarchie, periodengerecht', () => {
    const e = ev('RESI', { hofId: '_hof_wall_33_ochtrup', date: '1900' });
    expect(buildPlacForGedcom(e, eventYear(e), ctx)).toBe('Wall 33, Ochtrup, Deutschland');
  });
  it('nur Dorf-Hierarchie ohne Hof', () => {
    const e = ev('BIRT', { placeId: '@OCHTRUP@', date: '1900' });
    expect(buildPlacForGedcom(e, eventYear(e), ctx)).toBe('Ochtrup, Deutschland');
  });
  it('stale hofId (Hof fehlt) → null (Aufrufer fällt auf ev.place zurück)', () => {
    const e = ev('RESI', { hofId: '_hof_missing', placeId: '@OCHTRUP@', date: '1900' });
    expect(buildPlacForGedcom(e, eventYear(e), ctx)).toBeNull();
  });
  it('Komma-Schutz: Hof-Adresse mit Komma wird via Konvention α gekürzt', () => {
    const kommaHofs = hofMap(
      hof('_hof_k', '@OCHTRUP@', { addrs: [{ value: 'Oster 82a, Wester 141', from: null, to: null }] }),
    );
    const kctx: PlaceContext = { places: makePlaceRegistry(places), hofs: makeHofRegistry(kommaHofs) };
    const e = ev('RESI', { hofId: '_hof_k', date: '1900' });
    expect(buildPlacForGedcom(e, eventYear(e), kctx)).toBe('Oster 82a, Ochtrup, Deutschland');
  });
});

describe('buildFullPlaceName — periodenunabhängige volle Namenskette (ADR-v9-50, Massen-Dedup-Anzeige)', () => {
  it('volle Kette, nicht nur der atomare Einzelname (Unterschied zu buildFormString bei year=null)', () => {
    expect(buildFullPlaceName(ctx.places, '@OCHTRUP@')).toBe('Ochtrup, Deutschland');
  });
  it('Top-Level-Ort ohne Eltern → nur der eigene Name', () => {
    expect(buildFullPlaceName(ctx.places, '@DE@')).toBe('Deutschland');
  });
  it('null placeId → null', () => {
    expect(buildFullPlaceName(ctx.places, null)).toBeNull();
  });
});
