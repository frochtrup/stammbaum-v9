// suggestPlaceCandidates — Orte-Bootstrap-Vorschlag als reine Kernfunktion (ADR-v9-27).
// Reine Funktion (TST-3/INV-ARCH-1): sammelt distinkte, noch UNAUFGELÖSTE PLAC-Hierarchien
// aus geladenen Events als PlaceObject-Entwürfe zur Nutzer-Sichtung — legt NICHTS automatisch
// an. Bewahrt die kuratierte Natur von placeObjects (Spec 11 §2).
import { describe, it, expect } from 'vitest';
import { suggestPlaceCandidates } from '../../core/places/index';
import { makePlaceRegistry, makeHofRegistry } from '../../core/places/index';
import { place, placeMap, hofMap, ev } from './places-fixtures';
import type { PlaceContext } from '../../core/places/index';

function ctxFrom(places = placeMap(), hofs = hofMap()): PlaceContext {
  return { places: makePlaceRegistry(places), hofs: makeHofRegistry(hofs) };
}

describe('suggestPlaceCandidates — Bootstrap-Vorschlag (ADR-v9-27)', () => {
  it('keine Kandidaten, wenn alle Events schon aufgelöst sind (placeId gesetzt)', () => {
    const ctx = ctxFrom(placeMap(place('@P1@', { title: 'Ochtrup', type: 'Town' })));
    const events = [
      ev('BIRT', { place: 'Ochtrup', placeId: '@P1@' }),
      ev('DEAT', { place: 'Ochtrup', placeId: '@P1@' }),
    ];
    expect(suggestPlaceCandidates(events, ctx)).toEqual([]);
  });

  it('keine Kandidaten, wenn Ort über findByName bereits als PlaceObject existiert', () => {
    const ctx = ctxFrom(placeMap(place('@P1@', { title: 'Ochtrup', type: 'Town' })));
    // placeId NICHT gesetzt (roher GEDCOM-Import), aber findByName löst auf → schon vorhanden.
    const events = [ev('BIRT', { place: 'Ochtrup' })];
    expect(suggestPlaceCandidates(events, ctx)).toEqual([]);
  });

  it('bereits vorhanden auch bei Namensvariante über pnames (kein Vorschlag)', () => {
    const ctx = ctxFrom(
      placeMap(
        place('@P1@', {
          title: 'Sassenberg',
          type: 'Town',
          pnames: [{ value: 'Sassenbergk', from: null, to: null }],
        }),
      ),
    );
    const events = [ev('BIRT', { place: 'Sassenbergk' })];
    expect(suggestPlaceCandidates(events, ctx)).toEqual([]);
  });

  it('atomarer PLAC ohne PO wird als eigener Kandidat vorgeschlagen', () => {
    const ctx = ctxFrom();
    const events = [ev('BIRT', { place: 'Ochtrup' })];
    const cands = suggestPlaceCandidates(events, ctx);
    expect(cands).toHaveLength(1);
    expect(cands[0].title).toBe('Ochtrup');
    expect(cands[0].sourceEventCount).toBe(1);
    expect(cands[0].sampleEventType).toBe('BIRT');
  });

  it('Komma-Hierarchie ohne PO: Leitsegment (Verwaltungsebene) ist der Kandidat', () => {
    const ctx = ctxFrom();
    const events = [ev('BIRT', { place: 'Ochtrup, Kreis Steinfurt, Deutschland' })];
    const cands = suggestPlaceCandidates(events, ctx);
    expect(cands).toHaveLength(1);
    expect(cands[0].title).toBe('Ochtrup');
  });

  it('Hof-Typ-Event mit rich-PLAC (Konvention 1: Hof, Dorf, …): Dorf-Segment ist der Kandidat, nicht der Hof', () => {
    const ctx = ctxFrom();
    // Konvention 1: Leitsegment = Hof (Wall 33), segs[1] = Dorf (Ochtrup).
    const events = [ev('RESI', { place: 'Wall 33, Ochtrup, Deutschland', addr: 'Wall 33' })];
    const cands = suggestPlaceCandidates(events, ctx);
    expect(cands).toHaveLength(1);
    expect(cands[0].title).toBe('Ochtrup');
  });

  it('Dedup über mehrere Events mit demselben Ort (ein Kandidat, Count summiert)', () => {
    const ctx = ctxFrom();
    const events = [
      ev('BIRT', { place: 'Ochtrup' }),
      ev('DEAT', { place: 'ochtrup' }), // Norm-Variante
      ev('MARR', { place: 'Ochtrup, Deutschland' }), // Hierarchie, gleiches Leitsegment
    ];
    const cands = suggestPlaceCandidates(events, ctx);
    expect(cands).toHaveLength(1);
    expect(cands[0].sourceEventCount).toBe(3);
  });

  it('mehrere distinkte Orte werden alle vorgeschlagen', () => {
    const ctx = ctxFrom();
    const events = [
      ev('BIRT', { place: 'Ochtrup' }),
      ev('DEAT', { place: 'Münster' }),
    ];
    const cands = suggestPlaceCandidates(events, ctx);
    expect(cands.map((c) => c.title).sort()).toEqual(['Münster', 'Ochtrup']);
  });

  it('leere/fehlende PLACs erzeugen keine Kandidaten', () => {
    const ctx = ctxFrom();
    const events = [
      ev('BIRT', { place: null }),
      ev('DEAT', { place: '' }),
      ev('MARR', { place: '   ' }),
      ev('OCCU', { place: ', , ,' }), // nur leere Segmente
    ];
    expect(suggestPlaceCandidates(events, ctx)).toEqual([]);
  });

  it('gemischt: aufgelöste Orte übersprungen, unaufgelöste vorgeschlagen', () => {
    const ctx = ctxFrom(placeMap(place('@P1@', { title: 'Ochtrup', type: 'Town' })));
    const events = [
      ev('BIRT', { place: 'Ochtrup' }), // schon vorhanden → skip
      ev('DEAT', { place: 'Wettringen' }), // neu → Kandidat
    ];
    const cands = suggestPlaceCandidates(events, ctx);
    expect(cands.map((c) => c.title)).toEqual(['Wettringen']);
  });

  it('Determinismus: gleiche Eingabe → gleiche Reihenfolge und Ergebnis', () => {
    const ctx = ctxFrom();
    const events = [
      ev('BIRT', { place: 'Zwolle' }),
      ev('DEAT', { place: 'Ochtrup' }),
      ev('MARR', { place: 'Ochtrup' }),
      ev('BIRT', { place: 'Ahaus' }),
    ];
    const a = suggestPlaceCandidates(events, ctx);
    const b = suggestPlaceCandidates(events, ctx);
    expect(a).toEqual(b);
    // Reihenfolge = erstes Auftreten des jeweiligen Norm-Namens (stabil).
    expect(a.map((c) => c.title)).toEqual(['Zwolle', 'Ochtrup', 'Ahaus']);
  });

  it('reine Funktion: mutiert die Eingabe-Events nicht', () => {
    const ctx = ctxFrom();
    const events = [ev('BIRT', { place: 'Ochtrup, Deutschland' })];
    const before = JSON.parse(JSON.stringify(events));
    suggestPlaceCandidates(events, ctx);
    expect(events).toEqual(before);
  });
});
