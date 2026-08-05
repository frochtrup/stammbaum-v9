// tests/core/places-merge-mass.test.ts — Massen-Merge + Hof-Merge + automatischer
// Hof-Nachlauf nach Dorf-Merge (Spec 11 §9.2, ADR-v9-45 inkl. Nachtrag 2026-07-10).
import { describe, expect, it } from 'vitest';
import { mergePlaceObjects, mergeHofObjects } from '../../core/places/commands';
import { makeHofRegistry } from '../../core/places/index';
import { place, hof, placeMap, hofMap, ev } from './places-fixtures';

describe('mergePlaceObjects — Array von Verlierern (Massen-Merge, §9.2 Punkt 2)', () => {
  it('führt mehrere Verlierer zusammen: der Gewinner behält seine Namen, Lücken werden gefüllt', () => {
    const places = placeMap(
      place('@A@', { title: 'Ochtrup' }),
      place('@B@', { title: 'Ochtorp' }),
      place('@C@', { title: 'Ochtrupe', lat: 52.2, long: 7.2 }),
    );
    const res = mergePlaceObjects(places, hofMap(), '@A@', ['@B@', '@C@']);
    expect(places.has('@B@')).toBe(false);
    expect(places.has('@C@')).toBe(false);
    // ADR-v9-222: keine Namensfaltung — die Schreibweisen ALLER Verlierer stehen
    // stattdessen in `mentionNames`, für das Umschreiben der Ortsnennungen.
    expect(places.get('@A@')!.pnames).toEqual([]);
    expect(res.mentionNames.sort()).toEqual(['ochtorp', 'ochtrup', 'ochtrupe']);
    expect(places.get('@A@')!.lat).toBe(52.2); // Lücke aus @C@ gefüllt
  });

  // shortName ist reine Anzeige (ADR-v9-90/-100): er folgt der fill-if-empty-Regel der
  // übrigen Metadaten (type/note/govId) und landet NICHT in `pnames` — dort stehen
  // Identitätsnamen, die der Resolver matcht. Ein Anzeigename dort würde zum
  // Match-Kriterium und genau die Trennung aufheben, für die das Feld existiert.
  it('füllt einen fehlenden shortName aus dem Verlierer (fill-if-empty)', () => {
    const places = placeMap(
      place('@A@', { title: 'Frankfurt' }),
      place('@B@', { title: 'Franckfurt', shortName: 'Frankfurt (Main)' }),
    );
    mergePlaceObjects(places, hofMap(), '@A@', '@B@');
    expect(places.get('@A@')!.shortName).toBe('Frankfurt (Main)');
  });

  it('überschreibt einen vorhandenen shortName des Gewinners nie', () => {
    const places = placeMap(
      place('@A@', { title: 'Frankfurt', shortName: 'Frankfurt (Main)' }),
      place('@B@', { title: 'Franckfurt', shortName: 'Frankfurt (Oder)' }),
    );
    mergePlaceObjects(places, hofMap(), '@A@', '@B@');
    expect(places.get('@A@')!.shortName).toBe('Frankfurt (Main)');
  });

  it('bringt den shortName des Verlierers auch nicht als Ortsnennung ins Spiel (kein Match-Kriterium)', () => {
    const places = placeMap(
      place('@A@', { title: 'Frankfurt' }),
      place('@B@', { title: 'Franckfurt', shortName: 'Frankfurt (Main)' }),
    );
    const res = mergePlaceObjects(places, hofMap(), '@A@', '@B@');
    expect(places.get('@A@')!.pnames).toEqual([]);
    // `mentionNames` speist die Nachbindung von Ortsnennungen — ein reiner Anzeigename
    // gehört dort so wenig hin wie früher in `pnames` (ADR-v9-90/-100).
    expect(res.mentionNames.sort()).toEqual(['franckfurt', 'frankfurt']);
  });

  it('bleibt rückwärtskompatibel: einzelner String-Verlierer funktioniert weiter', () => {
    const places = placeMap(place('@A@', { title: 'Ochtrup' }), place('@B@', { title: 'Ochtorp' }));
    const res = mergePlaceObjects(places, hofMap(), '@A@', '@B@');
    expect(places.has('@B@')).toBe(false);
    expect(places.get('@A@')!.pnames).toEqual([]);
    expect(res.mentionNames.sort()).toEqual(['ochtorp', 'ochtrup']);
  });
});

// ADR-v9-195: der Orts-Merge meldet seine Verlierer→Gewinner-Zuordnung genauso wie der
// Hof-Nachlauf (`hofRemap`) — der Aufrufer zieht `event.placeId` copy-on-write nach.
// Vorher hing jedes Ereignis eines Verlierers auf einer gelöschten ID („runtime-only, wird
// beim nächsten resolveEvents() neu abgeleitet" — die Annahme trug nicht, s. B2 in
// place-disambiguation.test.ts); sichtbar als „Ort nicht gefunden" am Ereignis-Link.
describe('mergePlaceObjects — meldet placeRemap (ADR-v9-195)', () => {
  it('bildet jeden Verlierer auf den Überlebenden ab', () => {
    const places = placeMap(
      place('@A@', { title: 'Ochtrup' }),
      place('@B@', { title: 'Ochtorp' }),
      place('@C@', { title: 'Ochtrupe' }),
    );
    const result = mergePlaceObjects(places, hofMap(), '@A@', ['@B@', '@C@']);
    expect(result.placeRemap.get('@B@')).toBe('@A@');
    expect(result.placeRemap.get('@C@')).toBe('@A@');
    expect(result.placeRemap.has('@A@')).toBe(false);
  });

  it('meldet nur tatsächlich zusammengeführte Orte (No-Op-Fälle bleiben draußen)', () => {
    const places = placeMap(place('@A@', { title: 'Ochtrup' }));
    const result = mergePlaceObjects(places, hofMap(), '@A@', ['@A@', '@MISSING@']);
    expect(result.placeRemap.size).toBe(0);
  });

  it('mutiert die übergebenen Ereignisse NICHT (sie dienen nur der Hof-Heuristik)', () => {
    const places = placeMap(place('@A@', { title: 'Ochtrup' }), place('@B@', { title: 'Ochtorp' }));
    const e = ev('BIRT', { placeId: '@B@' });
    mergePlaceObjects(places, hofMap(), '@A@', ['@B@'], [e]);
    // ADR-v9-92: der Kern meldet, der Aufrufer schreibt — sonst landet die Änderung in
    // gehaltenen Undo-Snapshots.
    expect(e.placeId).toBe('@B@');
  });
});

// ADR-v9-195: Schritt 4 des Merge hängt fremde `enclosedBy`-Verweise auf den Verlierer um.
// Trifft das den Überlebenden selbst (Merge eines Ortes in sein eigenes Kind) oder einen
// Verlierer derselben Gruppe, entstünde ein Selbstbezug — ein Ort, der sich selbst enthält.
// Er überlebt in orte.json jeden Reload; `enclosureIdsAsOf` bricht dank `seen`-Guard zwar
// nicht, die Kette endet aber still beim Ort selbst.
describe('mergePlaceObjects — kein Selbstbezug in enclosedBy (ADR-v9-195)', () => {
  it('Ort in sein eigenes Kind zusammengeführt: der Verweis fällt weg, statt auf sich zu zeigen', () => {
    const places = placeMap(
      place('@S@', { title: 'Ochtrup', enclosedBy: [{ placeId: '@L@', from: null, to: null }] }),
      place('@L@', { title: 'Kirchspiel Ochtrup' }),
    );
    mergePlaceObjects(places, hofMap(), '@S@', ['@L@']);
    expect(places.get('@S@')!.enclosedBy.map((e) => e.placeId)).toEqual([]);
  });

  it('Verlierer als Elter eines anderen Verlierers derselben Gruppe', () => {
    const places = placeMap(
      place('@S@', { title: 'Ochtrup' }),
      place('@L1@', { title: 'Ochtorp', enclosedBy: [{ placeId: '@L2@', from: null, to: null }] }),
      place('@L2@', { title: 'Ochtrupe' }),
    );
    mergePlaceObjects(places, hofMap(), '@S@', ['@L1@', '@L2@']);
    expect(places.get('@S@')!.enclosedBy.map((e) => e.placeId)).toEqual([]);
  });

  it('der eigene Elternverweis des Gewinners bleibt unangetastet — der des Verlierers kommt nicht hinzu', () => {
    const places = placeMap(
      place('@S@', { title: 'Ochtrup', enclosedBy: [{ placeId: '@KREIS@', from: null, to: null }] }),
      place('@L@', { title: 'Ochtorp', enclosedBy: [{ placeId: '@LAND@', from: null, to: null }] }),
      place('@KREIS@', { title: 'Kreis Steinfurt' }),
      place('@LAND@', { title: 'Westfalen' }),
    );
    mergePlaceObjects(places, hofMap(), '@S@', ['@L@']);
    expect(places.get('@S@')!.enclosedBy.map((e) => e.placeId)).toEqual(['@KREIS@']);
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

// ADR-v9-191 / BL-266 — der Prüf-Marker folgt NICHT dem fill-if-empty-Muster.
describe('Merge und der Prüf-Marker (ADR-v9-191)', () => {
  it('erbt reviewedAt NICHT vom Verlierer — der Merge ist kein automatischer Weg zum Marker', () => {
    const places = placeMap(
      place('@S@', { title: 'Ochtrup' }),
      place('@L@', { title: 'Ochtrup', reviewedAt: 1_700_000_000_000, note: 'geprüft und gepflegt' }),
    );

    mergePlaceObjects(places, hofMap(), '@S@', ['@L@']);

    const survivor = places.get('@S@')!;
    // Die Notiz wandert (fill-if-empty, Inhalt — der Gewinner hat keine), der Marker nicht
    // (Aussage über einen Menschen — sie fand nie am Überlebenden statt).
    expect(survivor.note).toBe('geprüft und gepflegt');
    expect(survivor.reviewedAt ?? null).toBeNull();
  });

  it('lässt einen bereits gesetzten Marker des Überlebenden stehen', () => {
    const places = placeMap(
      place('@S@', { title: 'Ochtrup', reviewedAt: 42 }),
      place('@L@', { title: 'Ochtrup' }),
    );

    mergePlaceObjects(places, hofMap(), '@S@', ['@L@']);

    expect(places.get('@S@')!.reviewedAt).toBe(42);
  });
});
