// tests/core/places-curation.test.ts — Kurations-Layer (Spec 11 §9, ADR-v9-44/45/46).
// Reine, headless testbare Kern-Funktionen (TST-3): isEnrichedPlace/isEnrichedHof (§9.1),
// hasReference (§9.3), findPlaceDuplicates (§9.2). Unit + Property.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  isEnrichedPlace,
  isEnrichedHof,
  hasReference,
  findPlaceDuplicates,
  makePlaceRegistry,
  makeHofRegistry,
  seedPlacesFromEvents,
  findOrCreateHof,
} from '../../core/places/index';
import type { PlaceContext } from '../../core/places/index';
import { place, hof, placeMap, hofMap, ev } from './places-fixtures';

function ctxOf(places = placeMap(), hofs = hofMap()): PlaceContext {
  return { places: makePlaceRegistry(places), hofs: makeHofRegistry(hofs) };
}

describe('isEnrichedPlace (§9.1) — Anzeige-Prädikat, kein Schreibgate', () => {
  it('plain (Seed-Rohzustand, 1 undatiertes enclosedBy) → false', () => {
    const pl = place('@P1@', { title: 'Ochtrup', enclosedBy: [{ placeId: '@DE@', from: null, to: null }] });
    expect(isEnrichedPlace(pl)).toBe(false);
  });

  it('plain ohne enclosedBy (geseedetes Top-Level-Land) → false', () => {
    // makeSeededPlace erzeugt bei parentId=null enclosedBy=[] — muss ebenfalls plain sein.
    expect(isEnrichedPlace(place('@DE@', { title: 'Deutschland' }))).toBe(false);
  });

  it('gesetzter type → angereichert', () => {
    expect(isEnrichedPlace(place('@P1@', { title: 'Ochtrup', type: 'Town' }))).toBe(true);
  });

  it('zusätzlicher Name (pnames) → angereichert', () => {
    expect(isEnrichedPlace(place('@P1@', { pnames: [{ value: 'Ochtorp', from: null, to: null }] }))).toBe(true);
  });

  it('zweite enclosedBy-Zeile → angereichert', () => {
    expect(
      isEnrichedPlace(
        place('@P1@', {
          enclosedBy: [
            { placeId: '@A@', from: null, to: null },
            { placeId: '@B@', from: null, to: null },
          ],
        }),
      ),
    ).toBe(true);
  });

  it('datierte enclosedBy-Zeile → angereichert', () => {
    expect(isEnrichedPlace(place('@P1@', { enclosedBy: [{ placeId: '@A@', from: 1900, to: null }] }))).toBe(true);
  });

  it.each([
    ['lat', { lat: 52.2 }],
    ['long', { long: 7.2 }],
    ['note', { note: 'Quelle X' }],
    ['existsFrom', { existsFrom: 1200 }],
    ['existsTo', { existsTo: 1900 }],
    ['govId', { govId: 'GOV123' }],
    ['govTypes', { govTypes: ['x'] }],
  ])('gesetztes %s → angereichert', (_name, patch) => {
    expect(isEnrichedPlace(place('@P1@', { title: 'Ochtrup', ...patch }))).toBe(true);
  });

  it('Property: JEDES seedPlacesFromEvents-Ergebnis ist plain (nie angereichert)', () => {
    const typeArb = fc.constantFrom('RESI', 'PROP', 'BIRT', 'DEAT', 'OCCU', 'MARR');
    const placeArb = fc.constantFrom(
      'Ochtrup, Deutschland',
      'Ochtrup',
      'Münster, NRW, Deutschland',
      'Wall 33, Ochtrup, Deutschland',
      'Oldenburg, USA',
      '',
    );
    const eventArb = fc
      .record({ type: typeArb, place: placeArb, addr: fc.constantFrom('Wall 33', '') })
      .map(({ type, place: p, addr }) => ev(type, { place: p || null, addr }));
    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 8 }), (events) => {
        const created = seedPlacesFromEvents(events, ctxOf());
        for (const po of created) expect(isEnrichedPlace(po)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });
});

describe('isEnrichedHof (§9.1) — Bootstrap-Rohzustand aus findOrCreateHof', () => {
  it('plain (1 undatierte Adresse) → false', () => {
    expect(isEnrichedHof(hof('@H1@', '@V@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }))).toBe(false);
  });

  it('zweite Adress-Zeile (Historie) → angereichert', () => {
    expect(
      isEnrichedHof(
        hof('@H1@', '@V@', {
          addrs: [
            { value: 'Wall 33', from: null, to: null },
            { value: 'Wall 33a', from: 1950, to: null },
          ],
        }),
      ),
    ).toBe(true);
  });

  it('datierte Adresse → angereichert', () => {
    expect(isEnrichedHof(hof('@H1@', '@V@', { addrs: [{ value: 'Wall 33', from: 1900, to: null }] }))).toBe(true);
  });

  it.each([
    ['lat', { lat: 52.2 }],
    ['long', { long: 7.2 }],
    ['note', { note: 'Hof am Bach' }],
    ['existsFrom', { existsFrom: 1700 }],
    ['existsTo', { existsTo: 1900 }],
    ['predecessor', { predecessor: '@H0@' }],
    ['successor', { successor: '@H2@' }],
    ['govId', { govId: 'GOV1' }],
    ['govTypes', { govTypes: ['x'] }],
  ])('gesetztes %s → angereichert', (_name, patch) => {
    expect(
      isEnrichedHof(hof('@H1@', '@V@', { addrs: [{ value: 'Wall 33', from: null, to: null }], ...patch })),
    ).toBe(true);
  });

  it('Property: JEDER findOrCreateHof-Bootstrap ist plain (nie angereichert)', () => {
    const addrArb = fc.constantFrom('Wall 33', 'Wall 33, 48607 Ochtrup', 'Schulze-Hof', 'Oster 82a, Wester 141');
    fc.assert(
      fc.property(addrArb, (addr) => {
        const r = findOrCreateHof(addr, '@V@', hofMap());
        expect(r).not.toBeNull();
        if (r?.created) expect(isEnrichedHof(r.created)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});

describe('hasReference (§9.3) — löst mind. ein Event auf id auf?', () => {
  it('Event mit ev.placeId (Wahrheit) → referenziert', () => {
    const ctx = ctxOf(placeMap(place('@P1@', { title: 'Ochtrup' })));
    const events = [ev('BIRT', { placeId: '@P1@' })];
    expect(hasReference('@P1@', events, ctx)).toBe(true);
  });

  it('Event, das nur per findByName(ev.place) auflöst → referenziert (Projektion)', () => {
    const ctx = ctxOf(placeMap(place('@P1@', { title: 'Ochtrup', type: 'Town' })));
    const events = [ev('BIRT', { place: 'Ochtrup' })];
    expect(hasReference('@P1@', events, ctx)).toBe(true);
  });

  it('Event mit ev.hofId → Hof referenziert', () => {
    const places = placeMap(place('@V@', { title: 'Ochtrup' }));
    const hofs = hofMap(hof('@H1@', '@V@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    const ctx = ctxOf(places, hofs);
    const events = [ev('RESI', { hofId: '@H1@' })];
    expect(hasReference('@H1@', events, ctx)).toBe(true);
    // Das Dorf des Hofs zählt NICHT automatisch mit — nur direkte Auflösung.
    expect(hasReference('@V@', events, ctx)).toBe(false);
  });

  it('kein Event → referenzlos', () => {
    const ctx = ctxOf(placeMap(place('@P1@', { title: 'Ochtrup' })));
    expect(hasReference('@P1@', [], ctx)).toBe(false);
    expect(hasReference('@P1@', [ev('BIRT', { place: 'Woanders' })], ctx)).toBe(false);
  });
});

describe('findPlaceDuplicates — kind=places (§9.2, ADR-v9-45)', () => {
  it('Kriterium 1: gleicher Leitname + verträgliche Eltern → EINE Gruppe', () => {
    const places = placeMap(
      place('@A@', { title: 'Ochtrup', enclosedBy: [{ placeId: '@DE@', from: null, to: null }] }),
      place('@B@', { title: 'Ochtrup' }), // atomar (leere Eltern) → verträglich
      place('@DE@', { title: 'Deutschland' }),
    );
    const groups = findPlaceDuplicates(places, 'places');
    const withAB = groups.find((g) => g.ids.includes('@A@') && g.ids.includes('@B@'));
    expect(withAB).toBeTruthy();
  });

  it('Kriterium 1 GUARD (ADR-v9-29): gleicher Name, UNVERträgliche Eltern → KEINE Gruppe (auch Kriterium 4 greift nicht, da Ketten VÖLLIG fremd — kein gemeinsamer Vorfahre)', () => {
    const places = placeMap(
      place('@NS@', { title: 'Oldenburg', enclosedBy: [{ placeId: '@DE@', from: null, to: null }] }),
      place('@US@', { title: 'Oldenburg', enclosedBy: [{ placeId: '@USA@', from: null, to: null }] }),
      place('@DE@', { title: 'Deutschland' }),
      place('@USA@', { title: 'USA' }),
    );
    const groups = findPlaceDuplicates(places, 'places');
    const bad = groups.find((g) => g.ids.includes('@NS@') && g.ids.includes('@US@'));
    expect(bad).toBeFalsy();
  });

  it('Kriterium 4 (ADR-v9-50, Spec 11 §8 Restklasse 3 „Arpke"): gleicher Name, unmittelbare Eltern widersprüchlich, ABER gemeinsamer Vorfahre weiter oben (Region) → Gruppe MIT conflict:true', () => {
    const places = placeMap(
      // Arpke gehörte laut Quelle A zu Burgdorf, laut Quelle B zu Uetze — beides real
      // (Gebiets-/Kreisreform), beide Ketten enden aber gemeinsam in derselben Region.
      place('@A@', {
        title: 'Arpke',
        enclosedBy: [{ placeId: '@BURGDORF@', from: null, to: null }],
      }),
      place('@B@', {
        title: 'Arpke',
        enclosedBy: [{ placeId: '@UETZE@', from: null, to: null }],
      }),
      place('@BURGDORF@', { title: 'Burgdorf', enclosedBy: [{ placeId: '@REGION@', from: null, to: null }] }),
      place('@UETZE@', { title: 'Uetze', enclosedBy: [{ placeId: '@REGION@', from: null, to: null }] }),
      place('@REGION@', { title: 'Region Hannover' }),
    );
    const groups = findPlaceDuplicates(places, 'places');
    const g = groups.find((x) => x.ids.includes('@A@') && x.ids.includes('@B@'));
    expect(g).toBeTruthy();
    expect(g?.conflict).toBe(true);
  });

  it('Kriterium 1 (verträglich) erzeugt KEIN conflict-Flag', () => {
    const places = placeMap(
      place('@A@', { title: 'Ochtrup', enclosedBy: [{ placeId: '@DE@', from: null, to: null }] }),
      place('@B@', { title: 'Ochtrup' }),
      place('@DE@', { title: 'Deutschland' }),
    );
    const groups = findPlaceDuplicates(places, 'places');
    const g = groups.find((x) => x.ids.includes('@A@') && x.ids.includes('@B@'));
    expect(g?.conflict).toBeFalsy();
  });

  it('Kriterium 2: gleicher Titel-Fold, unverträgliche Eltern, ABER Koordinaten ≤ toleranceKm → Gruppe', () => {
    const places = placeMap(
      place('@NS@', { title: 'Oldenburg', lat: 53.14, long: 8.21, enclosedBy: [{ placeId: '@DE@', from: null, to: null }] }),
      place('@US@', { title: 'Oldenburg', lat: 53.1401, long: 8.2101, enclosedBy: [{ placeId: '@USA@', from: null, to: null }] }),
      place('@DE@', { title: 'Deutschland' }),
      place('@USA@', { title: 'USA' }),
    );
    const groups = findPlaceDuplicates(places, 'places', 1);
    const g = groups.find((x) => x.ids.includes('@NS@') && x.ids.includes('@US@'));
    expect(g).toBeTruthy();
  });

  it('Kriterium 2: weit entfernte Koordinaten → KEINE Gruppe', () => {
    const places = placeMap(
      place('@NS@', { title: 'Oldenburg', lat: 53.14, long: 8.21, enclosedBy: [{ placeId: '@DE@', from: null, to: null }] }),
      place('@US@', { title: 'Oldenburg', lat: 39.17, long: -76.62, enclosedBy: [{ placeId: '@USA@', from: null, to: null }] }),
      place('@DE@', { title: 'Deutschland' }),
      place('@USA@', { title: 'USA' }),
    );
    const groups = findPlaceDuplicates(places, 'places', 1);
    const g = groups.find((x) => x.ids.includes('@NS@') && x.ids.includes('@US@'));
    expect(g).toBeFalsy();
  });

  it('Kriterium 3 (bare↔reich Cross-Achse): plain Komma-Titel-PO + reiches PO mit Leitsegment-Titel → Gruppe', () => {
    const places = placeMap(
      place('@BARE@', { title: 'Dolgen, Stadt Sehnde, Region Hannover' }), // plain, Komma-Titel, keine enclosedBy
      place('@RICH@', { title: 'Dolgen', type: 'Village', enclosedBy: [{ placeId: '@SEHNDE@', from: null, to: null }] }),
      place('@SEHNDE@', { title: 'Stadt Sehnde' }),
    );
    const groups = findPlaceDuplicates(places, 'places');
    const g = groups.find((x) => x.ids.includes('@BARE@') && x.ids.includes('@RICH@'));
    expect(g).toBeTruthy();
  });

  it('nur Gruppen mit ≥2 Mitgliedern; Singles nicht gemeldet', () => {
    const places = placeMap(place('@A@', { title: 'Einzigartig' }), place('@B@', { title: 'AndersEinzig' }));
    expect(findPlaceDuplicates(places, 'places')).toEqual([]);
  });
});

describe('findPlaceDuplicates — kind=farms (§9.2)', () => {
  it('Kriterium 1: gleiche norm. Adresse + gleiches villageId → Gruppe', () => {
    const hofs = hofMap(
      hof('@H1@', '@V@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }),
      hof('@H2@', '@V@', { addrs: [{ value: 'wall 33', from: null, to: null }] }), // Norm-Duplikat
    );
    const groups = findPlaceDuplicates(hofs, 'farms');
    expect(groups).toHaveLength(1);
    expect(groups[0].ids.slice().sort()).toEqual(['@H1@', '@H2@']);
  });

  it('gleiche Adresse, aber VERSCHIEDENE Dörfer → KEINE Gruppe (Hof-Identität ist dorf-scoped)', () => {
    const hofs = hofMap(
      hof('@H1@', '@V1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }),
      hof('@H2@', '@V2@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }),
    );
    expect(findPlaceDuplicates(hofs, 'farms')).toEqual([]);
  });

  it('Kriterium 3 (bare↔reich) wird bei farms übersprungen', () => {
    // Ein Hof mit Komma-Adresse darf NICHT über eine Leitsegment-Cross-Achse gruppiert werden.
    const hofs = hofMap(
      hof('@H1@', '@V@', { addrs: [{ value: 'Wall 33, 48607 Ochtrup', from: null, to: null }] }),
      hof('@H2@', '@V2@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }),
    );
    expect(findPlaceDuplicates(hofs, 'farms')).toEqual([]);
  });
});

describe('findPlaceDuplicates — Determinismus (TST-3, Property)', () => {
  const titleArb = fc.constantFrom('Ochtrup', 'Oldenburg', 'Dolgen, Stadt Sehnde', 'Münster', 'Ochtrup ');
  const poArb = fc
    .record({
      id: fc.string({ minLength: 1, maxLength: 4 }).map((s) => `@${s}@`),
      title: titleArb,
      hasParent: fc.boolean(),
      lat: fc.option(fc.constantFrom(53.14, 39.17), { nil: null }),
    })
    .map(({ id, title, hasParent, lat }) =>
      place(id, {
        title,
        lat,
        long: lat,
        enclosedBy: hasParent ? [{ placeId: '@DE@', from: null, to: null }] : [],
      }),
    );

  it('zwei Läufe über dieselbe Sammlung liefern identische Gruppen', () => {
    fc.assert(
      fc.property(fc.array(poArb, { maxLength: 8 }), (pos) => {
        const map = placeMap(...pos); // Map dedupliziert kollidierende IDs
        const a = JSON.stringify(findPlaceDuplicates(map, 'places'));
        const b = JSON.stringify(findPlaceDuplicates(map, 'places'));
        expect(a).toBe(b);
      }),
      { numRuns: 200 },
    );
  });
});
