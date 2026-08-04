// tests/ui/place-ref-integrity.test.ts — der Wächter hinter ADR-v9-195: NACH KEINEM
// Orts-/Hof-Kommando von AppState darf ein `event.placeId`/`event.hofId` auf ein Objekt
// zeigen, das es nicht mehr gibt.
//
// WARUM ALS EIGENER, KOMMANDO-ÜBERGREIFENDER TEST und nicht je Kommando: die Lücke, die
// ihn ausgelöst hat, war keine falsche Zeile, sondern eine VERGESSENE. `deletePlace`,
// `deleteHof`, `moveHof` und `mergeHof` räumten ihre Referenzen alle korrekt auf — nur
// `mergePlace` nicht, weil der Nachlauf dort nie geschrieben wurde. Ein Test je Kommando
// hätte genau die fehlende Datei nicht gehabt. Dieser hier zählt stattdessen ALLE
// Kommandos auf, die Orte oder Höfe entfernen können, und prüft nach jedem dieselbe
// Zusicherung — wer ein neues solches Kommando baut, trägt es hier ein und bekommt die
// Frage gestellt, statt sich an sie erinnern zu müssen (ADR-v9-83: Zwang schlägt
// Dokumentation).
//
// Abgrenzung zu `app-state-cow.test.ts`: dort geht es um den VORZUSTAND (Undo darf nicht
// mitverändert werden), hier um den NEUEN Stand (keine toten Referenzen).
import { describe, expect, it } from 'vitest';
import { createAppState, type AppState } from '../../ui/shell/app-state.svelte';
import { makeDatabase, makePerson, makeFamily, makeEvent } from '../../core/model';
import type { Database } from '../../core/model/types';
import { collectAllEvents } from '../../ui/shell/all-events';
import { place, hof } from '../core/places-fixtures';

/** Jede tote Orts-/Hof-Referenz im Bestand, als lesbare Liste für die Fehlermeldung. */
function danglingRefs(db: Database): string[] {
  const out: string[] = [];
  for (const ev of collectAllEvents(db)) {
    if (ev.placeId != null && !db.placeObjects.has(ev.placeId)) out.push(`${ev.type}.placeId → ${ev.placeId}`);
    if (ev.hofId != null && !db.hofObjects.has(ev.hofId)) out.push(`${ev.type}.hofId → ${ev.hofId}`);
  }
  return out;
}

/** Zwei Dörfer mit je einem Hof; das Ereignis der Person hängt am zweiten Dorf. */
function seeded(): AppState {
  const appState = createAppState();
  const db = makeDatabase();
  db.individuals.set(
    '@I1@',
    makePerson('@I1@', {
      given: 'Otto',
      death: makeEvent('RESI', { addr: 'Wall 33', place: 'Ochtorp' }),
    }),
  );
  db.families.set('@F1@', makeFamily('@F1@'));
  appState.loadDatabase(db, 'test.ged');
  appState.savePlace(place('@OCHTRUP@', { title: 'Ochtrup', type: 'Town' }));
  appState.savePlace(place('@OCHTORP@', { title: 'Ochtorp', type: 'Town' }));
  appState.saveHof(hof('_hof_a', '@OCHTRUP@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
  appState.saveHof(hof('_hof_b', '@OCHTORP@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
  return appState;
}

const target = (appState: AppState) => appState.db.individuals.get('@I1@')!.death;

describe('Kein Orts-/Hof-Kommando hinterlässt eine tote Referenz (ADR-v9-195)', () => {
  it('mergePlace — der Fall, der den Wächter ausgelöst hat', () => {
    const appState = seeded();
    appState.linkEventToPlace(target(appState), '@OCHTORP@');

    appState.mergePlace('@OCHTRUP@', ['@OCHTORP@']);

    expect(danglingRefs(appState.db)).toEqual([]);
    expect(target(appState).placeId).toBe('@OCHTRUP@');
  });

  it('mergePlace mit automatischem Hof-Nachlauf — beide Referenzarten in EINEM Kommando', () => {
    const appState = seeded();
    appState.linkEventToHof(target(appState), '_hof_b');
    appState.linkEventToPlace(target(appState), '@OCHTORP@');

    // Der Merge zieht die Höfe unter dem Gewinner-Dorf zusammen (gleiche Adresse) — die
    // Ereignis-Referenz muss BEIDE Umhängungen überstehen.
    const result = appState.mergePlace('@OCHTRUP@', ['@OCHTORP@']);
    expect(result.hofsMerged).toBe(1);

    expect(danglingRefs(appState.db)).toEqual([]);
  });

  it('mergeHof', () => {
    const appState = seeded();
    appState.linkEventToHof(target(appState), '_hof_b');

    appState.mergeHof('_hof_a', ['_hof_b']);

    expect(danglingRefs(appState.db)).toEqual([]);
  });

  it('deletePlace', () => {
    const appState = seeded();
    appState.linkEventToPlace(target(appState), '@OCHTORP@');

    appState.deletePlace('@OCHTORP@');

    expect(danglingRefs(appState.db)).toEqual([]);
  });

  it('deleteHof', () => {
    const appState = seeded();
    appState.linkEventToHof(target(appState), '_hof_b');

    appState.deleteHof('_hof_b');

    expect(danglingRefs(appState.db)).toEqual([]);
  });

  it('moveHof — Dorfwechsel mit Kollisions-Konsolidierung im Zieldorf', () => {
    const appState = seeded();
    appState.linkEventToHof(target(appState), '_hof_b');

    // `_hof_b` zieht unter das Dorf von `_hof_a` — gleiche Adresse, also konsolidiert der
    // Nachlauf die beiden (ADR-v9-172) und einer der beiden verschwindet.
    appState.moveHof('_hof_b', '@OCHTRUP@');

    expect(danglingRefs(appState.db)).toEqual([]);
  });
});
