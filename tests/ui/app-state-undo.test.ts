// tests/ui/app-state-undo.test.ts — Undo/Redo an der Schale (BL-01, Spec 20 §1.2,
// ADR-v9-92). Der Stack selbst ist in tests/services/undo-stack.test.ts geprüft; hier
// geht es um die Verdrahtung: Legt JEDES Editier-Kommando einen Schritt ab, und stellt
// ein Undo den vorherigen Zustand wirklich wieder her?
//
// Der Merge-Fall ist bewusst ausführlich: ADR-v9-92 Punkt 4 nennt den versehentlichen
// Dubletten-Merge „mit Abstand der teuerste umkehrbare Fehler im Orts-Komplex" — er ist
// der Grund, warum Orte/Höfe überhaupt im Undo-Umfang liegen.
import { describe, expect, it } from 'vitest';
import { createAppState, type AppState } from '../../ui/shell/app-state.svelte';
import { makeDatabase, makePerson, makeEvent } from '../../core/model';
import { place, hof } from '../core/places-fixtures';

function seeded(): AppState {
  const appState = createAppState();
  const db = makeDatabase();
  db.individuals.set('@I1@', makePerson('@I1@', { given: 'Otto' }));
  appState.loadDatabase(db, 'test.ged');
  return appState;
}
const given = (a: AppState) => a.db.individuals.get('@I1@')!.given;

describe('AppState — Undo/Redo Grundverhalten', () => {
  it('frisch geladen ist nichts rücknehmbar', () => {
    const appState = seeded();
    expect(appState.canUndo).toBe(false);
    expect(appState.canRedo).toBe(false);
    expect(appState.undo()).toBe(false);
    expect(appState.redo()).toBe(false);
  });

  it('nimmt ein savePerson zurück und stellt es per redo wieder her', () => {
    const appState = seeded();
    appState.savePerson({ ...appState.db.individuals.get('@I1@')!, given: 'Geändert' });
    expect(given(appState)).toBe('Geändert');

    expect(appState.undo()).toBe(true);
    expect(given(appState)).toBe('Otto');
    expect(appState.canRedo).toBe(true);

    expect(appState.redo()).toBe(true);
    expect(given(appState)).toBe('Geändert');
  });

  it('geht mehrere Kommandos in umgekehrter Reihenfolge zurück', () => {
    const appState = seeded();
    for (const name of ['A', 'B', 'C']) {
      appState.savePerson({ ...appState.db.individuals.get('@I1@')!, given: name });
    }

    appState.undo();
    expect(given(appState)).toBe('B');
    appState.undo();
    expect(given(appState)).toBe('A');
    appState.undo();
    expect(given(appState)).toBe('Otto');
    expect(appState.canUndo).toBe(false);
  });

  it('deckt auch die Forschungsdaten-Kommandos ab (ein Eintrag je AppState-Kommando)', () => {
    const appState = seeded();
    appState.addTask('person', '@I1@', 't1', 'Kirchenbuch', 'Kirchenbuch', '2026-07-18');
    expect(appState.db.individuals.get('@I1@')!.tasks).toHaveLength(1);

    expect(appState.undo()).toBe(true);
    expect(appState.db.individuals.get('@I1@')!.tasks).toHaveLength(0);
  });

  it('ein wirkungsloses Kommando erzeugt KEINEN Schritt (kein Leer-Undo)', () => {
    const appState = seeded();
    // Zielentität existiert nicht → Kommando greift nicht.
    appState.addTask('person', '@I999@', 't1', 'x', 'y', '2026-07-18');
    expect(appState.canUndo).toBe(false);
  });

  it('ein neues Kommando nach einem Undo verwirft den Redo-Zweig', () => {
    const appState = seeded();
    appState.savePerson({ ...appState.db.individuals.get('@I1@')!, given: 'A' });
    appState.undo();
    expect(appState.canRedo).toBe(true);

    appState.savePerson({ ...appState.db.individuals.get('@I1@')!, given: 'B' });

    expect(appState.canRedo).toBe(false);
    expect(appState.redo()).toBe(false);
  });
});

describe('AppState — Undo im Orts-/Hof-Komplex (ADR-v9-92 Punkt 4)', () => {
  function withTwoHofs(): AppState {
    const appState = seeded();
    appState.savePlace(place('@OCHTRUP@', { title: 'Ochtrup', type: 'Town' }));
    appState.saveHof(hof('_hof_a', '@OCHTRUP@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    appState.saveHof(hof('_hof_b', '@OCHTRUP@', { addrs: [{ value: 'Wall 33a', from: null, to: null }] }));
    return appState;
  }

  it('nimmt einen Hof-Merge vollständig zurück — Verlierer UND Ereignis-Referenz', () => {
    const appState = withTwoHofs();
    appState.savePerson(
      makePerson('@I2@', { death: makeEvent('DEAT', { addr: 'Wall 33a', place: 'Ochtrup' }) }),
    );
    appState.linkEventToHof(appState.db.individuals.get('@I2@')!.death, '_hof_b');

    appState.mergeHof('_hof_a', ['_hof_b']);
    expect(appState.db.hofObjects.has('_hof_b')).toBe(false);
    expect(appState.db.individuals.get('@I2@')!.death.hofId).toBe('_hof_a');

    expect(appState.undo()).toBe(true);

    // Der Verlierer ist zurück — UND das Ereignis zeigt wieder auf ihn. Ohne die
    // Copy-on-Write-Umhängung (hofRemap) wäre nur die halbe Rücknahme passiert.
    expect(appState.db.hofObjects.has('_hof_b')).toBe(true);
    expect(appState.db.individuals.get('@I2@')!.death.hofId).toBe('_hof_b');
  });

  it('nimmt eine Hof-Umbenennung samt referenzierender Ereignisse zurück', () => {
    const appState = withTwoHofs();
    appState.savePerson(
      makePerson('@I2@', { death: makeEvent('DEAT', { addr: '', place: 'Ochtrup' }) }),
    );
    appState.linkEventToHof(appState.db.individuals.get('@I2@')!.death, '_hof_a');
    expect(appState.db.individuals.get('@I2@')!.death.addr).toBe('Wall 33');

    appState.updateHofAddr('_hof_a', 0, 'Wall 99', null, null);
    expect(appState.db.individuals.get('@I2@')!.death.addr).toBe('Wall 99');

    expect(appState.undo()).toBe(true);

    expect(appState.db.hofObjects.get('_hof_a')!.addrs[0]!.value).toBe('Wall 33');
    expect(appState.db.individuals.get('@I2@')!.death.addr).toBe('Wall 33');
  });

  it('nimmt eine Hof-Löschung samt Kaskade zurück', () => {
    const appState = withTwoHofs();
    appState.savePerson(
      makePerson('@I2@', { death: makeEvent('DEAT', { addr: 'Wall 33', place: 'Ochtrup' }) }),
    );
    appState.linkEventToHof(appState.db.individuals.get('@I2@')!.death, '_hof_a');

    appState.deleteHof('_hof_a');
    expect(appState.db.individuals.get('@I2@')!.death.hofId).toBeNull();

    expect(appState.undo()).toBe(true);

    expect(appState.db.hofObjects.has('_hof_a')).toBe(true);
    expect(appState.db.individuals.get('@I2@')!.death.hofId).toBe('_hof_a');
  });
});

describe('AppState — Stack-Grenzen und „Revert to Saved" (Spec 20 §1.2)', () => {
  it('loadDatabase leert den Stack (kein Undo über eine Dateiöffnung hinweg)', () => {
    const appState = seeded();
    appState.savePerson({ ...appState.db.individuals.get('@I1@')!, given: 'Geändert' });
    expect(appState.canUndo).toBe(true);

    appState.loadDatabase(makeDatabase(), 'andere.ged');

    expect(appState.canUndo).toBe(false);
    expect(appState.canRedo).toBe(false);
  });

  it('revertToSaved stellt den zuletzt GELADENEN Stand wieder her', () => {
    const appState = seeded();
    appState.savePerson({ ...appState.db.individuals.get('@I1@')!, given: 'A' });
    appState.savePerson({ ...appState.db.individuals.get('@I1@')!, given: 'B' });
    appState.addTask('person', '@I1@', 't1', 'x', 'y', '2026-07-18');

    expect(appState.revertToSaved()).toBe(true);

    expect(given(appState)).toBe('Otto');
    expect(appState.db.individuals.get('@I1@')!.tasks).toHaveLength(0);
  });

  it('revertToSaved ist selbst rücknehmbar (Schutz gegen versehentliches Auslösen)', () => {
    const appState = seeded();
    appState.savePerson({ ...appState.db.individuals.get('@I1@')!, given: 'Wichtig' });

    appState.revertToSaved();
    expect(given(appState)).toBe('Otto');

    expect(appState.undo()).toBe(true);
    expect(given(appState)).toBe('Wichtig');
  });

  it('revertToSaved meldet false, solange nichts geladen wurde', () => {
    const appState = createAppState();
    expect(appState.revertToSaved()).toBe(false);
  });

  it('hält ≥30 Schritte vor (Spec 20 §1.2)', () => {
    const appState = seeded();
    for (let i = 0; i < 30; i++) {
      appState.savePerson({ ...appState.db.individuals.get('@I1@')!, given: `S${i}` });
    }

    for (let i = 29; i > 0; i--) {
      expect(appState.undo()).toBe(true);
      expect(given(appState)).toBe(`S${i - 1}`);
    }
    expect(appState.undo()).toBe(true);
    expect(given(appState)).toBe('Otto');
  });
});

describe('AppState — Undo und Persistenz (ADR-v9-92 Punkt 6)', () => {
  it('schreibt die Arbeitskopie nach einem Undo fort (kein Sonderpfad auf Datei-Ebene)', () => {
    let calls = 0;
    const appState = createAppState({ persistWorkingCopy: () => (calls += 1) });
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Otto' }));
    appState.loadDatabase(db, 'test.ged');

    appState.savePerson({ ...appState.db.individuals.get('@I1@')!, given: 'Geändert' });
    const afterEdit = calls;

    appState.undo();

    expect(calls).toBe(afterEdit + 1);
  });
});
