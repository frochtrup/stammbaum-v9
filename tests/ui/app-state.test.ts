// tests/ui/app-state.test.ts — AppState-Kommandos für Orte/Höfe (Spec 20 §1.7/§1.8 [K]
// "Bearbeitung"). Kein DOM nötig (reine Runes-Logik) — Docblock @vitest-environment
// bewusst NICHT gesetzt (läuft mit dem globalen 'node'-Environment, s. vitest.config.ts).
import { describe, expect, it } from 'vitest';
import { createAppState } from '../../ui/shell/app-state.svelte';
import type { PlaceObject, HofObject } from '../../core/places';

function place(id: string, patch: Partial<PlaceObject> = {}): PlaceObject {
  return {
    id,
    title: '',
    type: '',
    pnames: [],
    enclosedBy: [],
    lat: null,
    long: null,
    note: '',
    existsFrom: null,
    existsTo: null,
    govId: null,
    govTypes: null,
    ...patch,
  };
}

function hof(id: string, villageId: string, patch: Partial<HofObject> = {}): HofObject {
  return {
    id,
    villageId,
    addrs: [],
    lat: null,
    long: null,
    note: '',
    existsFrom: null,
    existsTo: null,
    predecessor: null,
    successor: null,
    govId: null,
    govTypes: null,
    schemaVersion: 1,
    ...patch,
  };
}

describe('AppState.savePlace/deletePlace — Chokepoint-Kontext bleibt konsistent', () => {
  it('savePlace fügt ein PlaceObject hinzu, das über db + placeContext sichtbar wird', () => {
    const appState = createAppState();
    appState.savePlace(place('@P1@', { title: 'Ochtrup' }));

    expect(appState.db.placeObjects.get('@P1@')?.title).toBe('Ochtrup');
    expect(appState.placeContext.places.byId('@P1@')?.title).toBe('Ochtrup');
    expect(appState.placeContext.places.findByName('Ochtrup')).toBe('@P1@');
  });

  it('savePlace ersetzt ein bestehendes PlaceObject vollständig', () => {
    const appState = createAppState();
    appState.savePlace(place('@P1@', { title: 'Alt' }));
    appState.savePlace(place('@P1@', { title: 'Neu' }));

    expect(appState.db.placeObjects.get('@P1@')?.title).toBe('Neu');
  });

  it('deletePlace entfernt ein PlaceObject wieder', () => {
    const appState = createAppState();
    appState.savePlace(place('@P1@'));
    appState.deletePlace('@P1@');

    expect(appState.db.placeObjects.has('@P1@')).toBe(false);
  });
});

describe('AppState.saveHof/deleteHof — Chokepoint-Kontext bleibt konsistent', () => {
  it('saveHof fügt einen Hof hinzu, der über placeContext.hofs sichtbar wird', () => {
    const appState = createAppState();
    appState.savePlace(place('@P1@', { title: 'Ochtrup' }));
    appState.saveHof(hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));

    expect(appState.db.hofObjects.get('@H1@')?.addrs[0]?.value).toBe('Wall 33');
    expect(appState.placeContext.hofs.byVillage('@P1@')).toEqual(['@H1@']);
  });

  it('deleteHof entfernt einen Hof wieder', () => {
    const appState = createAppState();
    appState.saveHof(hof('@H1@', '@P1@'));
    appState.deleteHof('@H1@');

    expect(appState.db.hofObjects.has('@H1@')).toBe(false);
  });
});

describe('AppState.touch — erzwungene Aktualisierung nach In-Place-Event-Mutation', () => {
  it('gibt eine neue db-Referenz zurück, mit unverändertem Inhalt', () => {
    const appState = createAppState();
    appState.savePlace(place('@P1@', { title: 'Ochtrup' }));
    const before = appState.db;

    appState.touch();

    expect(appState.db).not.toBe(before);
    expect(appState.db.placeObjects).toBe(before.placeObjects); // Maps bleiben identisch (kein unnötiges Klonen)
    expect(appState.db.placeObjects.get('@P1@')?.title).toBe('Ochtrup');
  });
});
