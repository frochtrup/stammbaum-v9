// Determinismus (Spec 11 §4.1, TST-3): die Auflösung ist eine reine Funktion —
// gleiche Eingabe → gleiche Ausgabe. Property-Test (fast-check) über die Naht
// (events, placeObjects, hofObjects) → (placeId, hofId, place, addr, path, review).
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { resolveEvents } from '../../core/places/index';
import type { Event } from '../../core/model/types';
import { place, hof, placeMap, hofMap, ev } from './places-fixtures';

// Fester Orts-/Hof-Kontext; die Events variieren.
const places = placeMap(
  place('@OCHTRUP@', {
    title: 'Ochtrup',
    type: 'Town',
    pnames: [{ value: 'Ochtorpe', from: 1200, to: 1500 }],
    enclosedBy: [{ placeId: '@DE@', from: null, to: null }],
  }),
  place('@DE@', { title: 'Deutschland', type: 'Country' }),
  place('@MUENSTER@', { title: 'Münster', type: 'City' }),
);
const hofs = hofMap(
  hof('_hof_wall_33_ochtrup', '@OCHTRUP@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }),
);

const eventTypeArb = fc.constantFrom('RESI', 'PROP', 'CENS', 'OCCU', 'BIRT', 'DEAT', 'MARR', 'EVEN');
const placeArb = fc.constantFrom(
  'Wall 33, Ochtrup, Deutschland',
  'Ochtrup, Deutschland',
  'Ochtrup',
  'Wall 33',
  'Münster',
  'Unbekannt XYZ',
  '',
);
const addrArb = fc.constantFrom('Wall 33', 'Oster 5', 'Ochtrup', '');
const yearArb = fc.constantFrom('1300', '1900', '2001', '');

const eventArb: fc.Arbitrary<Event> = fc
  .record({ type: eventTypeArb, place: placeArb, addr: addrArb, date: yearArb })
  .map(({ type, place: p, addr, date }) =>
    ev(type, { place: p || null, addr, date: date || null }),
  );

// Vergleichbare, JSON-serialisierbare Projektion des Ergebnisses.
function snapshot(events: readonly Event[]) {
  const res = resolveEvents(events, places, hofs);
  return JSON.stringify({
    events: res.events.map((r) => ({
      path: r.path,
      placeId: r.event.placeId,
      hofId: r.event.hofId,
      place: r.event.place,
      addr: r.event.addr,
    })),
    hofs: [...res.hofObjects.keys()].sort(),
    review: res.review.map((r) => ({ i: r.index, k: r.klass, c: r.candidates.slice().sort() })),
  });
}

describe('Determinismus — gleiche Eingabe → gleiche Ausgabe', () => {
  it('zwei Läufe derselben Event-Liste liefern identische Ausgabe', () => {
    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 8 }), (events) => {
        expect(snapshot(events)).toBe(snapshot(events));
      }),
      { numRuns: 300 },
    );
  });

  it('die Eingabe wird nie mutiert (Idempotenz der Eingabe)', () => {
    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 6 }), (events) => {
        const before = events.map((e) => JSON.stringify(e));
        resolveEvents(events, places, hofs);
        const after = events.map((e) => JSON.stringify(e));
        expect(after).toEqual(before);
      }),
      { numRuns: 200 },
    );
  });

  it('Bootstrap ist reihenfolgestabil: Re-Auflösung des Ergebnisses ist idempotent', () => {
    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 6 }), (events) => {
        const first = resolveEvents(events, places, hofs);
        // Ergebnis erneut auflösen (mit gebootstrappten Höfen) → keine neuen Höfe.
        const reInput = first.events.map((r) => r.event);
        const second = resolveEvents(reInput, places, first.hofObjects);
        expect(second.hofObjects.size).toBe(first.hofObjects.size);
      }),
      { numRuns: 200 },
    );
  });
});
