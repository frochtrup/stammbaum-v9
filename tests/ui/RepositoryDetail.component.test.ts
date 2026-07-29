// @vitest-environment happy-dom
// tests/ui/RepositoryDetail.component.test.ts — Archiv-Detail als Component-Test
// (Spec 32 §6; Spec 20 §1.6 [K]: "Detail mit verlinkten Quellen, Signatur").
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import RepositoryDetail from '../../ui/views/repository/RepositoryDetail.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { makeDatabase, makeRepository, makeSource } from '../../core/model';

describe('RepositoryDetail — verlinkte Quellen inkl. Signatur (Component)', () => {
  it('rendert eine verlinkte Quelle mit Signatur und ruft onNavigateToSource bei Klick auf', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    db.repositories.set('@R1@', makeRepository('@R1@', { name: 'Bistumsarchiv' }));
    db.sources.set('@S1@', makeSource('@S1@', { repo: '@R1@', abbr: 'KB', callNumber: 'A-12' }));
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('repository', '@R1@');
    const onNavigateToSource = vi.fn();

    render(RepositoryDetail, { props: { appState, viewState, onNavigateToSource } });

    expect(screen.getByText('Sign. A-12')).toBeTruthy();
    await fireEvent.click(screen.getByText('KB'));

    expect(onNavigateToSource).toHaveBeenCalledWith('@S1@');
  });

  it('zeigt einen definierten Leerzustand, wenn die id nicht (mehr) im Datenbestand existiert', () => {
    const appState = createAppState();
    const viewState = createViewState();
    viewState.setCurrent('repository', '@R-gone@');

    render(RepositoryDetail, { props: { appState, viewState, onNavigateToSource: vi.fn() } });

    expect(screen.getByText(/nicht gefunden/)).toBeTruthy();
  });
});

describe('RepositoryDetail — Archivtyp deutsch (BL-203)', () => {
  it('zeigt das deutsche Label statt des rohen GRAMPS-Werts', () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    db.repositories.set('@R1@', makeRepository('@R1@', { name: 'Stadtbücherei', type: 'Library' }));
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('repository', '@R1@');

    render(RepositoryDetail, { props: { appState, viewState, onNavigateToSource: vi.fn() } });

    expect(screen.getByText('Bibliothek')).toBeTruthy();
    expect(screen.queryByText('Library')).toBeNull();
  });

  it('`Unknown` zeigt gar keine Typ-Zeile (Polarität aus ADR-v9-149)', () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    db.repositories.set('@R1@', makeRepository('@R1@', { name: 'Archiv X', type: 'Unknown' }));
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('repository', '@R1@');

    render(RepositoryDetail, { props: { appState, viewState, onNavigateToSource: vi.fn() } });

    expect(screen.queryByText('Typ')).toBeNull();
    expect(screen.queryByText('Unknown')).toBeNull();
  });
});
