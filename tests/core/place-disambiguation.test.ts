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

describe('Review-Klasse P (1.1c) — Orts-Mehrdeutigkeit wird sichtbar, kein stiller Guess', () => {
  const places = placeMap(oldenburgNS, niedersachsen, deutschland, oldenburgUS, usa);

  it('atomarer "Oldenburg" trifft ≥2 gleichnamige POs → placeId null + Review-Klasse P mit Kandidaten', () => {
    const res = resolveEvents([ev('BIRT', { place: 'Oldenburg', date: '1900' })], places, hofMap());
    expect(res.events[0].event.placeId).toBeNull();
    expect(res.review).toHaveLength(1);
    expect(res.review[0].klass).toBe('P');
    expect(res.review[0].candidates.slice().sort()).toEqual(['@OLD_NS@', '@OLD_US@']);
  });

  it('rich-PLAC mit widersprechendem Elter (Guard-Veto) → Klasse P (Kandidat sichtbar)', () => {
    const onlyDe = placeMap(oldenburgNS, niedersachsen, deutschland);
    const res = resolveEvents([ev('DEAT', { place: 'Oldenburg, USA', date: '1900' })], onlyDe, hofMap());
    expect(res.events[0].event.placeId).toBeNull();
    expect(res.review).toHaveLength(1);
    expect(res.review[0].klass).toBe('P');
    expect(res.review[0].candidates).toEqual(['@OLD_NS@']);
  });

  it('rich-PLAC mit ≥2 verträglichen Kandidaten (bare + kontextualisiert) → Klasse P', () => {
    const bare = place('@OLD_BARE@', { title: 'Oldenburg', type: 'Town' }); // keine Kette → verträglich
    const res = resolveEvents(
      [ev('BIRT', { place: 'Oldenburg, Niedersachsen', date: '1900' })],
      placeMap(bare, oldenburgNS, niedersachsen, deutschland),
      hofMap(),
    );
    expect(res.events[0].event.placeId).toBeNull();
    expect(res.review[0].klass).toBe('P');
    expect(res.review[0].candidates.slice().sort()).toEqual(['@OLD_BARE@', '@OLD_NS@']);
  });

  it('eindeutig auflösbar erzeugt KEIN Review (kein falscher P-Alarm)', () => {
    const res = resolveEvents(
      [ev('BIRT', { place: 'Oldenburg, USA', date: '1900' })],
      places,
      hofMap(),
    );
    expect(res.events[0].event.placeId).toBe('@OLD_US@');
    expect(res.review).toHaveLength(0);
  });
});

// B1 (ADR-v9-72): für UNDATIERTE Events (year==null) muss der Konsistenz-Guard ALLE
// undatierten enclosedBy-Ketten eines gemergten Kandidaten durchsuchen — nicht nur
// enclosedBy[0]. Sonst kippt ein Event, dessen Kette der zweiten (gemergten) Kette
// entspricht, grundlos in Review-Klasse P (und der Seed legte den Ort neu an, B1-Symptom).
describe('B1 — undatierter Konsistenz-Guard über mehrere gemergte enclosedBy-Ketten (ADR-v9-72)', () => {
  // Kuratierter Ochtrup mit ZWEI historischen Ketten (Merge-Ergebnis).
  const ochtrup = place('@OCH@', {
    title: 'Ochtrup',
    type: 'Town',
    enclosedBy: [
      { placeId: '@KR_STEINFURT@', from: null, to: null }, // Index 0
      { placeId: '@KR_AHAUS@', from: null, to: null }, // Index 1
    ],
  });
  const steinfurt = place('@KR_STEINFURT@', { title: 'Kreis Steinfurt', type: 'District', enclosedBy: [{ placeId: '@WESTF@', from: null, to: null }] });
  const ahaus = place('@KR_AHAUS@', { title: 'Kreis Ahaus', type: 'District', enclosedBy: [{ placeId: '@WESTF@', from: null, to: null }] });
  const westf = place('@WESTF@', { title: 'Westfalen', type: 'Region' });
  const places = placeMap(ochtrup, steinfurt, ahaus, westf);

  it('undatiertes Event mit der ZWEITEN Kette → bindet den Überlebenden (kein Review-P)', () => {
    const res = resolveEvents([ev('BIRT', { place: 'Ochtrup, Kreis Ahaus, Westfalen' })], places, hofMap());
    expect(res.events[0].event.placeId).toBe('@OCH@');
    expect(res.events[0].path).toBe('hierarchy-lead');
    expect(res.review).toHaveLength(0);
  });

  it('undatiertes Event mit der ERSTEN Kette → bindet ebenfalls (Regression Index 0)', () => {
    const res = resolveEvents([ev('BIRT', { place: 'Ochtrup, Kreis Steinfurt, Westfalen' })], places, hofMap());
    expect(res.events[0].event.placeId).toBe('@OCH@');
  });

  it('undatiertes Event mit widersprüchlicher Kette → weiterhin Veto (kein Fehl-Match)', () => {
    const res = resolveEvents([ev('BIRT', { place: 'Ochtrup, USA' })], places, hofMap());
    expect(res.events[0].event.placeId).toBeNull();
  });
});
