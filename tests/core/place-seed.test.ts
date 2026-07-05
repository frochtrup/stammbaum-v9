// tests/core/place-seed.test.ts — seedPlacesFromEvents (ADR-v9-28/-29, Phase 1.1a).
// Reine, deterministische Kernfunktion (TST-3/INV-ARCH-1): erzeugt Village-PlaceObjects
// aus distinkten PLAC-Hierarchien. Dedup-Regel = Name + Hierarchie-Verträglichkeit:
// gleicher Leitname + verträgliche Eltern → EIN Ort; widersprüchliche Eltern → distinkt.
// Höfe entstehen NIE im Seed.
import { describe, it, expect } from 'vitest';
import { seedPlacesFromEvents, makePlaceRegistry, makeHofRegistry } from '../../core/places/index';
import type { PlaceContext, PlaceObject } from '../../core/places/index';
import { place, placeMap, hofMap, ev } from './places-fixtures';

function ctxFrom(...ps: PlaceObject[]): PlaceContext {
  return { places: makePlaceRegistry(placeMap(...ps)), hofs: makeHofRegistry(hofMap()) };
}

/** Findet unter den erzeugten POs den (ersten) mit gegebenem Titel. */
function byTitle(created: PlaceObject[], title: string): PlaceObject | undefined {
  return created.find((p) => p.title === title);
}
/** Titel des unmittelbaren enclosedBy-Elternteils (aus den erzeugten POs). */
function parentTitle(created: PlaceObject[], po: PlaceObject): string | null {
  const pid = po.enclosedBy[0]?.placeId;
  if (!pid) return null;
  return created.find((p) => p.id === pid)?.title ?? null;
}

describe('seedPlacesFromEvents — Auto-Seed (ADR-v9-28)', () => {
  it('hunderte identische atomare PLAC "Ochtrup" → GENAU EIN PlaceObject', () => {
    const events = Array.from({ length: 200 }, () => ev('BIRT', { place: 'Ochtrup' }));
    const created = seedPlacesFromEvents(events, ctxFrom());
    const ochtrups = created.filter((p) => p.title === 'Ochtrup');
    expect(ochtrups).toHaveLength(1);
    expect(created).toHaveLength(1);
  });

  it('atomarer + reicher "Ochtrup" gemischt → EIN Ort (atomar ist Präfix, verträglich)', () => {
    const events = [
      ev('BIRT', { place: 'Ochtrup' }),
      ev('DEAT', { place: 'Ochtrup, Kreis Steinfurt, Westfalen' }),
    ];
    const created = seedPlacesFromEvents(events, ctxFrom());
    expect(created.filter((p) => p.title === 'Ochtrup')).toHaveLength(1);
    // Der reiche Zweig gewinnt: Ochtrup ist in Kreis Steinfurt eingebettet.
    const ochtrup = byTitle(created, 'Ochtrup')!;
    expect(parentTitle(created, ochtrup)).toBe('Kreis Steinfurt');
    // Elternkette wurde als eigene POs mit angelegt.
    expect(created.map((p) => p.title).sort()).toEqual(['Kreis Steinfurt', 'Ochtrup', 'Westfalen']);
  });

  it('gleichnamig, widersprüchliche Eltern: Oldenburg/Niedersachsen ≠ Oldenburg/USA → ZWEI Orte', () => {
    const events = [
      ev('BIRT', { place: 'Oldenburg, Niedersachsen, Deutschland' }),
      ev('DEAT', { place: 'Oldenburg, USA' }),
    ];
    const created = seedPlacesFromEvents(events, ctxFrom());
    const oldenburgs = created.filter((p) => p.title === 'Oldenburg');
    expect(oldenburgs).toHaveLength(2);
    // Sie sind über den unmittelbaren Elternteil unterscheidbar (Grundlage für 3c′).
    const parents = oldenburgs.map((o) => parentTitle(created, o)).sort();
    expect(parents).toEqual(['Niedersachsen', 'USA']);
    // Zwei distinkte IDs.
    expect(new Set(oldenburgs.map((o) => o.id)).size).toBe(2);
  });

  it('existiert das deutsche Oldenburg bereits, "Oldenburg, USA" wird NICHT daran gebunden, sondern neu angelegt', () => {
    const ctx = ctxFrom(
      place('@OLD_DE@', {
        title: 'Oldenburg',
        type: 'Town',
        enclosedBy: [{ placeId: '@NDS@', from: null, to: null }],
      }),
      place('@NDS@', { title: 'Niedersachsen', type: 'State' }),
    );
    const created = seedPlacesFromEvents([ev('DEAT', { place: 'Oldenburg, USA' })], ctx);
    const oldenburgs = created.filter((p) => p.title === 'Oldenburg');
    expect(oldenburgs).toHaveLength(1); // ein NEUES US-Oldenburg
    expect(oldenburgs[0].id).not.toBe('@OLD_DE@');
    expect(parentTitle(created, oldenburgs[0])).toBe('USA');
  });

  it('existiert das deutsche Oldenburg bereits, "Oldenburg, Niedersachsen" ist verträglich → KEIN neues PO', () => {
    const ctx = ctxFrom(
      place('@OLD_DE@', {
        title: 'Oldenburg',
        type: 'Town',
        enclosedBy: [{ placeId: '@NDS@', from: null, to: null }],
      }),
      place('@NDS@', { title: 'Niedersachsen', type: 'State' }),
    );
    const created = seedPlacesFromEvents([ev('BIRT', { place: 'Oldenburg, Niedersachsen' })], ctx);
    expect(created.filter((p) => p.title === 'Oldenburg')).toHaveLength(0);
  });

  it('Höfe werden NIE geseedet: Konvention 1 (Hof, Dorf, …) seedet das Dorf, nicht den Hof', () => {
    const events = [ev('RESI', { place: 'Wall 33, Ochtrup, Deutschland', addr: 'Wall 33' })];
    const created = seedPlacesFromEvents(events, ctxFrom());
    const titles = created.map((p) => p.title);
    expect(titles).toContain('Ochtrup');
    expect(titles).not.toContain('Wall 33'); // der Hof-Leitsegment wird NICHT als Ort angelegt
  });

  it('hof-relevanter Typ, reicher PLAC OHNE ADDR: Leitsegment gilt als (potenzieller) Hof → Dorf geseedet, nicht das Leitsegment (Resolver-Konsistenz Pfad C)', () => {
    const created = seedPlacesFromEvents([ev('RESI', { place: 'Wall 33, Ochtrup, Deutschland' })], ctxFrom());
    const titles = created.map((p) => p.title);
    expect(titles).toContain('Ochtrup');
    expect(titles).not.toContain('Wall 33');
  });

  it('atomar mehrdeutig gegenüber ≥2 widersprüchlichen Clustern → kein stilles Merge (kein PO aus dem atomaren Event)', () => {
    const events = [
      ev('BIRT', { place: 'Oldenburg, Niedersachsen' }),
      ev('DEAT', { place: 'Oldenburg, USA' }),
      ev('MARR', { place: 'Oldenburg' }), // atomar, uneindeutig → trägt nichts bei
    ];
    const created = seedPlacesFromEvents(events, ctxFrom());
    // Nur die zwei kontextualisierten Oldenburgs, kein drittes „nacktes".
    expect(created.filter((p) => p.title === 'Oldenburg')).toHaveLength(2);
  });

  it('bereits aufgelöste Events (placeId ODER findByName) tragen nichts bei', () => {
    const ctx = ctxFrom(place('@P1@', { title: 'Ochtrup', type: 'Town' }));
    const events = [
      ev('BIRT', { place: 'Ochtrup', placeId: '@P1@' }), // placeId gesetzt
      ev('DEAT', { place: 'Ochtrup' }), // findByName trifft → aufgelöst
    ];
    expect(seedPlacesFromEvents(events, ctx)).toEqual([]);
  });

  it('Determinismus: gleiche Eingabe → identisches Ergebnis (IDs + Reihenfolge)', () => {
    const events = [
      ev('BIRT', { place: 'Zwolle' }),
      ev('DEAT', { place: 'Oldenburg, USA' }),
      ev('MARR', { place: 'Oldenburg, Niedersachsen, Deutschland' }),
    ];
    const a = seedPlacesFromEvents(events, ctxFrom());
    const b = seedPlacesFromEvents(events, ctxFrom());
    expect(a).toEqual(b);
  });

  it('reine Funktion: mutiert die Eingabe-Events nicht', () => {
    const events = [ev('RESI', { place: 'Wall 33, Ochtrup', addr: 'Wall 33' })];
    const before = JSON.parse(JSON.stringify(events));
    seedPlacesFromEvents(events, ctxFrom());
    expect(events).toEqual(before);
  });
});
