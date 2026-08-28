// @vitest-environment happy-dom
// tests/ui/StartScreen.component.test.ts — was ein Erstnutzer sieht, solange nichts geladen
// ist (Spec 20 §1.1, [ADR-v9-297]).
//
// DIE LÜCKE, DIE ER SCHLIESST: der Erstnutzer-Rundgang ([ADR-v9-190]) läuft erst NACH dem
// Demo-Laden und nur im mobilen Layout. Davor stand ein einzelner Satz in einer leeren
// Liste — auf dem Desktop war das alles.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import StartScreen from '../../ui/shell/StartScreen.svelte';
import EntityTab from '../../ui/views/EntityTab.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { createRoute } from '../../ui/shell/route.svelte';
import { makeDatabase, makePerson } from '../../core/model';

describe('StartScreen', () => {
  it('bietet „Leer beginnen" auch ohne Datei-Dienste an (isolierter Kontext)', () => {
    render(StartScreen, { props: { appState: createAppState() } });
    expect(screen.getByRole('button', { name: 'Leer beginnen' })).toBeTruthy();
  });

  it('„Leer beginnen" setzt einen Dateinamen — sonst bliebe der Bildschirm stehen', async () => {
    const appState = createAppState();
    render(StartScreen, { props: { appState } });
    expect(appState.fileName).toBe('');

    await fireEvent.click(screen.getByRole('button', { name: 'Leer beginnen' }));

    // DIE Zusicherung: `fileName` ist das Signal „etwas ist geladen". Ohne ihn säße der
    // Nutzer weiter im Startbildschirm, während er schon Personen anlegt — und die
    // Arbeitskopie bliebe stumm (`persistWorkingCopyIfLoaded` prüft genau dieses Feld).
    expect(appState.fileName).not.toBe('');
    expect(appState.db.individuals.size).toBe(0);
  });

  it('meldet dem Aufrufer, dass es keinen Datei-Handle gibt', async () => {
    const appState = createAppState();
    const onFileHandleChanged = vi.fn();
    render(StartScreen, { props: { appState, onFileHandleChanged } });

    await fireEvent.click(screen.getByRole('button', { name: 'Leer beginnen' }));

    // Ein zuvor gemerkter Handle einer ANDEREN Datei darf nicht stehen bleiben — sonst
    // schriebe „Speichern" den neuen, leeren Baum in die alte Datei.
    expect(onFileHandleChanged).toHaveBeenCalledWith(undefined);
  });
});

describe('EntityTab — wann der Startbildschirm die Liste ersetzt', () => {
  const mount = (appState: ReturnType<typeof createAppState>, entityTarget: 'person' | 'place') =>
    render(EntityTab, {
      props: { appState, viewState: createViewState(), route: createRoute({ entityTarget }) },
    });

  it('ohne geladene Datei steht er im Personen-Segment', () => {
    mount(createAppState(), 'person');
    expect(screen.getByRole('button', { name: 'Leer beginnen' })).toBeTruthy();
  });

  it('ORTE bleiben erreichbar — sie tragen cross-Stammbaum-Wissen, auch ohne Baum', () => {
    // Die Zusicherung, wegen der der Startbildschirm NICHT die ganze Fläche ersetzt: ein
    // kuratierter Ortsbestand ist ohne geladene Genealogie vollständig da (Spec 11 §2).
    // Ein Startbildschirm davor hätte ihn samt Segmentreihe verdeckt.
    mount(createAppState(), 'place');
    expect(screen.queryByRole('button', { name: 'Leer beginnen' })).toBeNull();
  });

  it('mit geladener Datei ist er weg — auch wenn der Baum leer ist', () => {
    const appState = createAppState();
    appState.loadDatabase(makeDatabase(), 'Neuer Stammbaum.ged');
    mount(appState, 'person');
    expect(screen.queryByRole('button', { name: 'Leer beginnen' })).toBeNull();
  });

  it('… und erst recht mit Personen darin', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@'));
    appState.loadDatabase(db, 'test.ged');
    mount(appState, 'person');
    expect(screen.queryByRole('button', { name: 'Leer beginnen' })).toBeNull();
  });
});
