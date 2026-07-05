// tests/core/place-disambiguation.test.ts — Resolver-Konsistenz-Guard (3c) +
// Eltern-Disambiguierung (3c′), ADR-v9-29, Phase 1.1b.
//
// Ein eindeutiger Leitname genügt NICHT: die PLAC-Folgesegmente müssen mit der
// modellierten enclosureChain des Kandidaten verträglich sein. Widersprechender Elter
// (Oldenburg, USA vs. Kette Niedersachsen) = Veto, kein Match. Mehrere gleichnamige
// Kandidaten → der über die Elternkette verträgliche gewinnt. Rest-Mehrdeutigkeit bleibt
// unaufgelöst (placeId null) — die Sichtbarmachung als Review-Klasse P ist Slice 1.1c.
import { describe, it, expect } from 'vitest';
import { resolveEvents } from '../../core/places/index';
import { place, placeMap, hofMap, ev } from './places-fixtures';

// Zwei gleichnamige Oldenburgs mit DISTINKTER Verwaltungskette.
const oldenburgNS = place('@OLD_NS@', {
  title: 'Oldenburg',
  type: 'Town',
  enclosedBy: [{ placeId: '@NDS@', from: null, to: null }],
});
const niedersachsen = place('@NDS@', {
  title: 'Niedersachsen',
  type: 'State',
  enclosedBy: [{ placeId: '@DE@', from: null, to: null }],
});
const deutschland = place('@DE@', { title: 'Deutschland', type: 'Country' });
const oldenburgUS = place('@OLD_US@', {
  title: 'Oldenburg',
  type: 'Town',
  enclosedBy: [{ placeId: '@USA@', from: null, to: null }],
});
const usa = place('@USA@', { title: 'USA', type: 'Country' });

describe('Resolver-Konsistenz-Guard (3c) — Veto bei widersprechendem Elter', () => {
  it('nur deutsches Oldenburg vorhanden: "Oldenburg, USA" wird NICHT gebunden (kein Fehl-Match)', () => {
    const places = placeMap(oldenburgNS, niedersachsen, deutschland);
    const res = resolveEvents([ev('BIRT', { place: 'Oldenburg, USA', date: '1900' })], places, hofMap());
    expect(res.events[0].event.placeId).toBeNull();
    expect(res.events[0].path).toBe('none');
  });

  it('verträglicher Elter bindet weiterhin: "Oldenburg, Niedersachsen" → deutsches Oldenburg', () => {
    const places = placeMap(oldenburgNS, niedersachsen, deutschland);
    const res = resolveEvents([ev('BIRT', { place: 'Oldenburg, Niedersachsen', date: '1900' })], places, hofMap());
    expect(res.events[0].event.placeId).toBe('@OLD_NS@');
    expect(res.events[0].path).toBe('hierarchy-lead');
  });

  it('bare PlaceObject ohne Kette bleibt verträglich mit rich-PLAC (lenient, Präfix)', () => {
    const bare = place('@O@', { title: 'Ochtrup', type: 'Town' }); // keine enclosedBy
    const res = resolveEvents(
      [ev('BIRT', { place: 'Ochtrup, Kreis Steinfurt, Westfalen', date: '1900' })],
      placeMap(bare),
      hofMap(),
    );
    expect(res.events[0].event.placeId).toBe('@O@');
    expect(res.events[0].path).toBe('hierarchy-lead');
  });
});

describe('Eltern-Disambiguierung (3c′) — zwei gleichnamige Oldenburgs', () => {
  const places = placeMap(oldenburgNS, niedersachsen, deutschland, oldenburgUS, usa);

  it('"Oldenburg, Niedersachsen, Deutschland" → das niedersächsische Oldenburg', () => {
    const res = resolveEvents(
      [ev('BIRT', { place: 'Oldenburg, Niedersachsen, Deutschland', date: '1900' })],
      places,
      hofMap(),
    );
    expect(res.events[0].event.placeId).toBe('@OLD_NS@');
  });

  it('"Oldenburg, USA" → das US-Oldenburg', () => {
    const res = resolveEvents([ev('DEAT', { place: 'Oldenburg, USA', date: '1900' })], places, hofMap());
    expect(res.events[0].event.placeId).toBe('@OLD_US@');
  });

  it('kein verträglicher Kandidat: "Oldenburg, Frankreich" → unaufgelöst (placeId null)', () => {
    const res = resolveEvents([ev('BIRT', { place: 'Oldenburg, Frankreich', date: '1900' })], places, hofMap());
    expect(res.events[0].event.placeId).toBeNull();
  });
});
