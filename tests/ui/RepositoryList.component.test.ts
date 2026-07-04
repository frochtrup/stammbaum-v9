// @vitest-environment happy-dom
// tests/ui/RepositoryList.component.test.ts — Archiv-Picker als Component-Test
// (Spec 32 §6; Spec 20 §1.6 [K]).
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import RepositoryList from '../../ui/views/repository/RepositoryList.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { makeDatabase, makeRepository, makeSource } from '../../core/model';

function seedAppState() {
  const appState = createAppState();
  const db = makeDatabase();
  db.repositories.set('@R1@', makeRepository('@R1@', { name: 'Bistumsarchiv Münster', type: 'Kirchenarchiv' }));
  db.sources.set('@S1@', makeSource('@S1@', { repo: '@R1@' }));
  appState.loadDatabase(db, 'test.ged');
  return appState;
}

describe('RepositoryList — Name/Typ/Quellenzähler (Component)', () => {
  it('rendert Name, Typ und Quellenzähler', () => {
    const appState = seedAppState();
    const viewState = createViewState();

    render(RepositoryList, { props: { appState, viewState } });

    expect(screen.getByText('Bistumsarchiv Münster')).toBeTruthy();
    expect(screen.getByText('Kirchenarchiv')).toBeTruthy();
    expect(screen.getByText('1 Quelle')).toBeTruthy();
  });

  it('zeigt einen Leerzustand, solange keine Archive geladen sind', () => {
    const appState = createAppState();
    const viewState = createViewState();

    render(RepositoryList, { props: { appState, viewState } });

    expect(screen.getByText(/Keine Archive geladen/)).toBeTruthy();
  });

  it('Klick auf eine Zeile setzt die Auswahl über den EINEN ViewState-Weg (setCurrent)', async () => {
    const appState = seedAppState();
    const viewState = createViewState();

    render(RepositoryList, { props: { appState, viewState } });

    await fireEvent.click(screen.getByText('Bistumsarchiv Münster'));

    expect(viewState.getCurrent('repository')).toBe('@R1@');
  });
});
