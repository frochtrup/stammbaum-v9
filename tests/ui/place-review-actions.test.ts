// tests/ui/place-review-actions.test.ts — "Ort wählen" (Klasse P, Spec 11 §6).
// Gegenstück zu hof-review-actions.test.ts. Prüft, dass die Aktion über den Kern-
// Chokepoint `linkEventToPlace` läuft (ADR-v9-19/-42: ID UND Text SOFORT atomar
// reprojiziert) und das ECHTE Event trifft, nicht die resolveEvents-Kopie.
import { describe, expect, it } from 'vitest';
import { makeDatabase, makePerson } from '../../core/model';
import { place, placeMap } from '../core/places-fixtures';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { buildPlaceReview } from '../../ui/views/place/place-review-model';
import { applyPlaceChoice } from '../../ui/views/place/place-review-actions';

function ambiguousDb() {
  const db = makeDatabase();
  db.placeObjects = placeMap(
    place('@NDS@', { title: 'Niedersachsen' }),
    place('@USA@', { title: 'USA' }),
    place('@OL_DE@', { title: 'Oldenburg', enclosedBy: [{ placeId: '@NDS@', from: null, to: null }] }),
    place('@OL_US@', { title: 'Oldenburg', enclosedBy: [{ placeId: '@USA@', from: null, to: null }] }),
  );
  const person = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
  person.death.place = 'Oldenburg';
  person.death.date = '1900';
  db.individuals.set('@I1@', person);
  return db;
}

describe('applyPlaceChoice — "Ort wählen" (Klasse P)', () => {
  it('setzt ev.placeId auf den gewählten Kandidaten am ECHTEN Event', () => {
    const appState = createAppState();
    appState.loadDatabase(ambiguousDb(), 'test.ged');
    const review = buildPlaceReview(appState.db, appState.placeContext);
    const ev = review.flatEvents[review.rows[0].index];

    const res = applyPlaceChoice(appState, ev, '@OL_US@');

    expect(res.ok).toBe(true);
    // Das in der Person lebende Original muss getroffen sein, nicht eine Kopie.
    expect(appState.db.individuals.get('@I1@')!.death.placeId).toBe('@OL_US@');
  });

  it('reprojiziert den PLAC-Text sofort mit (ADR-v9-19/-42, INV-PLACE) — nicht erst beim nächsten Laden', () => {
    const appState = createAppState();
    appState.loadDatabase(ambiguousDb(), 'test.ged');
    const review = buildPlaceReview(appState.db, appState.placeContext);
    const ev = review.flatEvents[review.rows[0].index];
    expect(ev.place).toBe('Oldenburg'); // vorher: der mehrdeutige Rohtext

    applyPlaceChoice(appState, ev, '@OL_US@');

    // Nachher trägt der Text die disambiguierende Kette — genau das macht die
    // Zuordnung beim nächsten Load deterministisch (kein erneutes Klasse-P).
    expect(appState.db.individuals.get('@I1@')!.death.place).toContain('USA');
  });

  it('die Zeile verschwindet nach der Wahl aus dem Review (Mehrdeutigkeit gelöst)', () => {
    const appState = createAppState();
    appState.loadDatabase(ambiguousDb(), 'test.ged');
    const before = buildPlaceReview(appState.db, appState.placeContext);
    expect(before.rows).toHaveLength(1);

    applyPlaceChoice(appState, before.flatEvents[before.rows[0].index], '@OL_DE@');

    const after = buildPlaceReview(appState.db, appState.placeContext);
    expect(after.rows).toHaveLength(0);
  });

  it('lehnt eine leere/unbekannte Ziel-Id ab, statt sie stillschweigend zu setzen', () => {
    const appState = createAppState();
    appState.loadDatabase(ambiguousDb(), 'test.ged');
    const review = buildPlaceReview(appState.db, appState.placeContext);
    const ev = review.flatEvents[review.rows[0].index];

    const res = applyPlaceChoice(appState, ev, '');

    expect(res.ok).toBe(false);
    expect(appState.db.individuals.get('@I1@')!.death.placeId).toBeNull();
  });
});
