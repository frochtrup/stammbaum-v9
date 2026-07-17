// @vitest-environment happy-dom
// tests/ui/LogView.component.test.ts — globaler Forschungsprotokoll-Tab (Spec 12 §2,
// Spec 20 §1.11 [S]). Deckt Filter, Hinzufügen/Bearbeiten/Löschen (index-adressiert,
// LogEntry hat keine eigene id) und den Export-Button ab.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import LogView from '../../ui/views/research-log/LogView.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { makeDatabase, makePerson, makeRepository, makeSource } from '../../core/model';
import { makeLogEntry, makeTask } from '../../core/research/index';

function seedDb() {
  const db = makeDatabase();
  const p1 = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
  p1.researchLog.push(makeLogEntry({ date: '2026-01-01', query: 'Taufeintrag Otto', result: 'found' }));
  p1.researchLog.push(makeLogEntry({ date: '2026-01-02', query: 'Sterbeeintrag Otto', result: 'notfound' }));
  db.individuals.set('@I1@', p1);
  const p2 = makePerson('@I2@', { given: 'Anna', surname: 'Klein' });
  db.individuals.set('@I2@', p2);
  return db;
}

function renderView(db: ReturnType<typeof makeDatabase>) {
  const appState = createAppState();
  appState.loadDatabase(db, 'test.ged');
  const onNavigateToPerson = vi.fn();
  const onNavigateToFamily = vi.fn();
  const utils = render(LogView, { props: { appState, onNavigateToPerson, onNavigateToFamily } });
  return { ...utils, appState, onNavigateToPerson, onNavigateToFamily };
}

describe('LogView — Liste + Filter', () => {
  it('zeigt alle Einträge standardmäßig (Filter "Alle")', () => {
    renderView(seedDb());
    expect(screen.getByText('Taufeintrag Otto')).toBeTruthy();
    expect(screen.getByText('Sterbeeintrag Otto')).toBeTruthy();
  });

  it('Filter "Gefunden" zeigt nur Einträge mit result=found', async () => {
    renderView(seedDb());
    await fireEvent.click(screen.getByRole('button', { name: 'Gefunden' }));
    expect(screen.getByText('Taufeintrag Otto')).toBeTruthy();
    expect(screen.queryByText('Sterbeeintrag Otto')).toBeNull();
  });

  it('leerer Zustand ohne Einträge zeigt einen Hinweistext', () => {
    renderView(makeDatabase());
    expect(screen.getByText(/Keine Protokoll-Einträge/)).toBeTruthy();
  });
});

describe('LogView — Eintrag hinzufügen', () => {
  it('legt einen neuen Eintrag an einer Person an', async () => {
    const { appState } = renderView(seedDb());
    await fireEvent.click(screen.getByRole('button', { name: '+ Eintrag' }));

    await fireEvent.input(screen.getByPlaceholderText('Wonach wurde gesucht?'), { target: { value: 'Neuer Sucheintrag' } });

    await fireEvent.click(screen.getByLabelText('Ziel-Person'));
    await fireEvent.click(screen.getByText('Otto Bauer'));

    await fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    const allQueries = [...appState.db.individuals.values()].flatMap((p) => p.researchLog.map((e) => e.query));
    expect(allQueries).toContain('Neuer Sucheintrag');
  });

  it('setzt Archiv/Quelle über RepositoryPicker/SourcePicker und einen Aufgaben-Bezug über die generische Picker-Shell (ADR-v9-40)', async () => {
    const db = seedDb();
    db.repositories.set('@R1@', makeRepository('@R1@', { name: 'Pfarrarchiv Musterdorf' }));
    db.sources.set('@S1@', makeSource('@S1@', { abbr: 'KB Musterdorf' }));
    const p1 = db.individuals.get('@I1@')!;
    p1.tasks.push(makeTask('t1', { text: 'Taufeintrag suchen', status: 'todo', created: '2026-01-01' }));
    const { appState } = renderView(db);

    await fireEvent.click(screen.getByRole('button', { name: '+ Eintrag' }));
    await fireEvent.input(screen.getByPlaceholderText('Wonach wurde gesucht?'), { target: { value: 'Mit Archiv/Quelle' } });

    await fireEvent.click(screen.getByLabelText('Archiv'));
    await fireEvent.click(screen.getByText('Pfarrarchiv Musterdorf'));

    await fireEvent.click(screen.getByLabelText('Quelle'));
    await fireEvent.click(screen.getByText('KB Musterdorf'));

    await fireEvent.click(screen.getByLabelText('Ziel-Person'));
    await fireEvent.click(screen.getByText('Otto Bauer'));

    await fireEvent.click(screen.getByLabelText('Aufgaben-Bezug'));
    await fireEvent.click(screen.getByText('Taufeintrag suchen'));

    await fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    const saved = appState.db.individuals.get('@I1@')!.researchLog.find((e) => e.query === 'Mit Archiv/Quelle');
    expect(saved?.repoRef).toBe('@R1@');
    expect(saved?.sourceRef).toBe('@S1@');
    expect(saved?.taskId).toBe('t1');
  });

  it('Abbrechen schließt das Formular ohne Eintrag anzulegen', async () => {
    const { appState } = renderView(seedDb());
    const before = appState.db.individuals.get('@I1@')!.researchLog.length;
    await fireEvent.click(screen.getByRole('button', { name: '+ Eintrag' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));

    expect(screen.queryByPlaceholderText('Wonach wurde gesucht?')).toBeNull();
    expect(appState.db.individuals.get('@I1@')!.researchLog.length).toBe(before);
  });
});

describe('LogView — Bearbeiten/Löschen (index-adressiert)', () => {
  it('bearbeitet einen bestehenden Eintrag über den ✎-Button', async () => {
    const { appState } = renderView(seedDb());
    const editButtons = screen.getAllByLabelText('Eintrag bearbeiten');
    await fireEvent.click(editButtons[0]!);

    const queryInput = screen.getByPlaceholderText('Wonach wurde gesucht?') as HTMLInputElement;
    await fireEvent.input(queryInput, { target: { value: 'Geänderter Suchbegriff' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    const allQueries = [...appState.db.individuals.values()].flatMap((p) => p.researchLog.map((e) => e.query));
    expect(allQueries).toContain('Geänderter Suchbegriff');
  });

  it('löscht einen Eintrag über den ×-Button', async () => {
    const { appState } = renderView(seedDb());
    const before = appState.db.individuals.get('@I1@')!.researchLog.length;

    const deleteButtons = screen.getAllByLabelText('Eintrag löschen');
    await fireEvent.click(deleteButtons[0]!);

    expect(appState.db.individuals.get('@I1@')!.researchLog.length).toBe(before - 1);
  });
});

describe('LogView — Klick-Navigation zur Trägerentität', () => {
  it('Klick auf den Trägerentität-Link ruft den passenden onNavigate-Callback auf', async () => {
    const { onNavigateToPerson } = renderView(seedDb());
    await fireEvent.click(screen.getAllByText(/Otto Bauer ›/)[0]!);
    expect(onNavigateToPerson).toHaveBeenCalledWith('@I1@');
  });
});

describe('LogView — MD-Export-Button vorhanden', () => {
  it('rendert den Export-Button', () => {
    renderView(seedDb());
    expect(screen.getByRole('button', { name: 'Als Markdown exportieren' })).toBeTruthy();
  });
});
