// tests/core/places-merge-mass.test.ts — Massen-Merge + Hof-Merge + automatischer
// Hof-Nachlauf nach Dorf-Merge (Spec 11 §9.2, ADR-v9-45 inkl. Nachtrag 2026-07-10).
import { describe, expect, it } from 'vitest';
import { mergePlaceObjects, mergeHofObjects } from '../../core/places/commands';
import { makeHofRegistry } from '../../core/places/index';
import { place, hof, placeMap, hofMap, ev } from './places-fixtures';

describe('mergePlaceObjects — Array von Verlierern (Massen-Merge, §9.2 Punkt 2)', () => {
  it('führt mehrere Verlierer verlustfrei in den Gewinner zusammen', () => {
    const places = placeMap(
      place('@A@', { title: 'Ochtrup' }),
      place('@B@', { title: 'Ochtorp' }),
      place('@C@', { title: 'Ochtrupe', lat: 52.2, long: 7.2 }),
    );
    mergePlaceObjects(places, hofMap(), '@A@', ['@B@', '@C@']);
    expect(places.has('@B@')).toBe(false);
    expect(places.has('@C@')).toBe(false);
    expect(places.get('@A@')!.pnames.map((p) => p.value).sort()).toEqual(['Ochtorp', 'Ochtrupe']);
    expect(places.get('@A@')!.lat).toBe(52.2); // Lücke aus @C@ gefüllt
  });

  it('bleibt rückwärtskompatibel: einzelner String-Verlierer funktioniert weiter', () => {
    const places = placeMap(place('@A@', { title: 'Ochtrup' }), place('@B@', { title: 'Ochtorp' }));
    mergePlaceObjects(places, hofMap(), '@A@', '@B@');
    expect(places.has('@B@')).toBe(false);
    expect(places.get('@A@')!.pnames.map((p) => p.value)).toEqual(['Ochtorp']);
  });
});

describe('mergeHofObjects — verlustfreier Hof-Merge (§9.2)', () => {
  it('vereinigt addrs (dedupliziert über Norm), füllt Lücken, hängt event.hofId um, löscht Verlierer', () => {
    const hofs = hofMap(
      hof('@H1@', '@V@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }),
      hof('@H2@', '@V@', {
        addrs: [
          { value: 'wall 33', from: null, to: null }, // Norm-Duplikat → nicht doppeln
          { value: 'Wall 33a', from: 1950, to: null }, // echte Variante → übernehmen
        ],
        lat: 52.2,
        long: 7.2,
        note: 'Hof am Bach',
      }),
    );
    const remap = mergeHofObjects(hofs, '@H1@', ['@H2@']);
    expect(hofs.has('@H2@')).toBe(false);
    const w = hofs.get('@H1@')!;
    expect(w.addrs.map((a) => a.value).sort()).toEqual(['Wall 33', 'Wall 33a']);
    expect(w.lat).toBe(52.2); // Lücke gefüllt
    expect(w.note).toBe('Hof am Bach');
    // Die event.hofId-Umhängung wird seit ADR-v9-92 GEMELDET statt in-place ausgeführt
    // (der Aufrufer zieht sie copy-on-write nach) — sonst schriebe der Merge in gehaltene
    // Undo-Snapshots. Geprüft wird deshalb die Meldung, nicht die Mutation.
    expect(remap.get('@H2@')).toBe('@H1@');
    expect(remap.has('@H1@')).toBe(false);
  });

  it('No-Op bei fehlendem Gewinner/Verlierer oder Selbst-Merge', () => {
    const hofs = hofMap(hof('@H1@', '@V@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    mergeHofObjects(hofs, '@H1@', ['@H1@', '@MISSING@']);
    expect(hofs.size).toBe(1);
    expect(hofs.get('@H1@')!.addrs).toHaveLength(1);
  });
});

describe('Automatischer Hof-Nachlauf nach Dorf-Merge (ADR-v9-45 Nachtrag — Resolver-Regression)', () => {
  it('REGRESSION: zwei „Wall 33"-Höfe unter je einem Dorf → nach Dorf-Merge genau EINER, findByAddr bleibt eindeutig', () => {
    const places = placeMap(
      place('@V1@', { title: 'Ochtrup' }),
      place('@V2@', { title: 'Ochtrup (Kreis Steinfurt)' }),
    );
    const hofs = hofMap(
      hof('_hof_wall_v1', '@V1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }),
      hof('_hof_wall_v2', '@V2@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }),
    );
    const events = [ev('RESI', { hofId: '_hof_wall_v1' }), ev('RESI', { hofId: '_hof_wall_v2' })];

    // Vorher: unter je verschiedenem Dorf ist jeder Hof eindeutig auflösbar.
    const regBefore = makeHofRegistry(hofs);
    expect(regBefore.findByAddr('Wall 33', null, '@V1@')).toBe('_hof_wall_v1');
    expect(regBefore.findByAddr('Wall 33', null, '@V2@')).toBe('_hof_wall_v2');

    const result = mergePlaceObjects(places, hofs, '@V2@', ['@V1@'], events);

    // Nachher: genau EIN „Wall 33"-Hof unter @V2@ — findByAddr bleibt eindeutig (kein Review-C).
    const wall = [...hofs.values()].filter((h) => h.villageId === '@V2@' && h.addrs.some((a) => a.value === 'Wall 33'));
    expect(wall).toHaveLength(1);
    const regAfter = makeHofRegistry(hofs);
    expect(regAfter.findByAddr('Wall 33', null, '@V2@')).not.toBeNull();

    // Rückgabe meldet, WAS automatisch konsolidiert wurde (für den späteren UI-Toast).
    expect(result.hofsMerged).toBe(1);
    expect(result.villageId).toBe('@V2@');
  });

  it('Gewinner-Heuristik: der im Baum häufiger genutzte Hof überlebt', () => {
    const places = placeMap(place('@V1@', { title: 'A' }), place('@V2@', { title: 'B' }));
    const hofs = hofMap(
      hof('_hof_a', '@V1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }),
      hof('_hof_b', '@V2@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }),
    );
    // _hof_b wird zweimal referenziert, _hof_a einmal → _hof_b gewinnt (meiste Nutzung).
    const events = [
      ev('RESI', { hofId: '_hof_a' }),
      ev('RESI', { hofId: '_hof_b' }),
      ev('RESI', { hofId: '_hof_b' }),
    ];
    mergePlaceObjects(places, hofs, '@V2@', ['@V1@'], events);
    expect(hofs.has('_hof_b')).toBe(true);
    expect(hofs.has('_hof_a')).toBe(false);
  });

  it('kein Nachlauf, wenn keine Adress-Kollision entsteht (verschiedene Adressen)', () => {
    const places = placeMap(place('@V1@', { title: 'A' }), place('@V2@', { title: 'B' }));
    const hofs = hofMap(
      hof('_hof_a', '@V1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }),
      hof('_hof_b', '@V2@', { addrs: [{ value: 'Oster 5', from: null, to: null }] }),
    );
    const result = mergePlaceObjects(places, hofs, '@V2@', ['@V1@'], []);
    expect(hofs.size).toBe(2);
    expect(result.hofsMerged).toBe(0);
    expect(result.villageId).toBeNull();
  });
});
