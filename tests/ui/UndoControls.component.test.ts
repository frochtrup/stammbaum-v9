// @vitest-environment happy-dom
// tests/ui/UndoControls.component.test.ts — Undo/Redo-Leiste als Component-Test
// (Spec 32 §6, BL-01).
//
// WARUM DIESER TEST EXISTIERT — am laufenden System gefunden, nicht vorab bedacht:
// Die Undo-Logik war vollständig und ihre 15 Unit-Tests grün, die Schaltflächen blieben
// aber dauerhaft ausgegraut. Grund: der Undo-Stack ist framework-frei (INV-ARCH-1) und
// hält einfache Arrays — Svelte kann Änderungen daran nicht bemerken. Ein Test, der
// `appState.canUndo` DIREKT liest, läuft außerhalb jedes reaktiven Kontexts und bemerkt
// das nie; nur ein gerendertes Bauteil tut es.
//
// Die Lehre ist allgemeiner als dieser Fall: für Zustand, der aus einem framework-freien
// Dienst stammt, ist „der Getter liefert den richtigen Wert" NICHT dasselbe wie „die
// Oberfläche zeigt ihn an".
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import UndoControls from '../../ui/shell/UndoControls.svelte';
import { createAppState, type AppState } from '../../ui/shell/app-state.svelte';
import { makeDatabase, makePerson } from '../../core/model';

function seeded(): AppState {
  const appState = createAppState();
  const db = makeDatabase();
  db.individuals.set('@I1@', makePerson('@I1@', { given: 'Otto' }));
  appState.loadDatabase(db, 'test.ged');
  return appState;
}

const undoBtn = () => screen.getByLabelText('Rückgängig') as HTMLButtonElement;
const redoBtn = () => screen.getByLabelText('Wiederherstellen') as HTMLButtonElement;

describe('UndoControls', () => {
  it('beide Schaltflächen sind anfangs deaktiviert', () => {
    render(UndoControls, { props: { appState: seeded() } });
    expect(undoBtn().disabled).toBe(true);
    expect(redoBtn().disabled).toBe(true);
  });

  it('aktiviert „Rückgängig", sobald ein Kommando gelaufen ist', async () => {
    const appState = seeded();
    render(UndoControls, { props: { appState } });

    appState.savePerson({ ...appState.db.individuals.get('@I1@')!, given: 'Geändert' });
    await Promise.resolve(); // Svelte-Aktualisierung abwarten

    // Genau das war kaputt: der Getter stimmte, die Schaltfläche blieb ausgegraut.
    expect(undoBtn().disabled).toBe(false);
  });

  it('Klick auf „Rückgängig" stellt den Vorzustand her und aktiviert „Wiederherstellen"', async () => {
    const appState = seeded();
    render(UndoControls, { props: { appState } });
    appState.savePerson({ ...appState.db.individuals.get('@I1@')!, given: 'Geändert' });
    await Promise.resolve();

    await fireEvent.click(undoBtn());

    expect(appState.db.individuals.get('@I1@')!.given).toBe('Otto');
    expect(redoBtn().disabled).toBe(false);
    expect(undoBtn().disabled).toBe(true);
  });

  it('Klick auf „Wiederherstellen" führt den Schritt erneut aus', async () => {
    const appState = seeded();
    render(UndoControls, { props: { appState } });
    appState.savePerson({ ...appState.db.individuals.get('@I1@')!, given: 'Geändert' });
    await Promise.resolve();
    await fireEvent.click(undoBtn());

    await fireEvent.click(redoBtn());

    expect(appState.db.individuals.get('@I1@')!.given).toBe('Geändert');
  });

  it('zeigt „Zum geladenen Stand" nur, solange nichts rücknehmbar ist (Fallback, Spec 20 §1.2)', async () => {
    const appState = seeded();
    render(UndoControls, { props: { appState } });
    expect(screen.queryByText('Zum geladenen Stand')).not.toBeNull();

    appState.savePerson({ ...appState.db.individuals.get('@I1@')!, given: 'Geändert' });
    await Promise.resolve();

    // Sobald ein feinerer Weg zurück existiert, tritt die grobe Notbremse in den Hintergrund.
    expect(screen.queryByText('Zum geladenen Stand')).toBeNull();
  });

  it('blendet den Fallback aus, solange keine Datei geladen ist', () => {
    render(UndoControls, { props: { appState: createAppState() } });
    expect(screen.queryByText('Zum geladenen Stand')).toBeNull();
  });
});
