// @vitest-environment happy-dom
// tests/ui/SourceList.component.test.ts — Quellen-Tab-Liste als Component-Test
// (Spec 32 §6; Spec 20 §1.6 [K]). Deckt Referenzzähler-Anzeige + Klick-Navigation ab.
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import SourceList from '../../ui/views/source/SourceList.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { makeCitation, makeDatabase, makePerson, makeSource } from '../../core/model';

function seedAppState() {
  const appState = createAppState();
  const db = makeDatabase();
  const p = makePerson('@I1@');
  p.birth.citations.push(makeCitation('@S1@'));
  p.death.citations.push(makeCitation('@S1@'));
  db.individuals.set('@I1@', p);
  db.sources.set('@S1@', makeSource('@S1@', { abbr: 'KB Ochtrup', author: 'Pfarramt' }));
  appState.loadDatabase(db, 'test.ged');
  return appState;
}

describe('SourceList — Kurzname/Autor/Referenzzähler (Component)', () => {
  it('rendert Kurzname, Autor und Referenzzähler', () => {
    const appState = seedAppState();
    const viewState = createViewState();

    render(SourceList, { props: { appState, viewState } });

    expect(screen.getByText('KB Ochtrup')).toBeTruthy();
    expect(screen.getByText('Pfarramt')).toBeTruthy();
    expect(screen.getByText('2× zitiert')).toBeTruthy();
  });

  it('zeigt einen Leerzustand, solange keine Quellen geladen sind', () => {
    const appState = createAppState();
    const viewState = createViewState();

    render(SourceList, { props: { appState, viewState } });

    expect(screen.getByText(/Keine Quellen geladen/)).toBeTruthy();
  });

  it('Klick auf eine Zeile setzt die Auswahl über den EINEN ViewState-Weg (setCurrent)', async () => {
    const appState = seedAppState();
    const viewState = createViewState();

    render(SourceList, { props: { appState, viewState } });

    await fireEvent.click(screen.getByText('KB Ochtrup'));

    expect(viewState.getCurrent('source')).toBe('@S1@');
  });
});
