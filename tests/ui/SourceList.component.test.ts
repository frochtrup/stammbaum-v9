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
    const refCount = screen.getByText('2× zitiert');
    expect(refCount).toBeTruthy();
    // Geteilter Zahlen-Fakt-Stil (Spec 21 §10l Punkt 1, ADR-v9-79) statt lokalem CSS.
    expect(refCount.className).toContain('stb-list-stat');
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

describe('SourceList — Notizen-Badge (ADR-v9-79 Punkt 3/4)', () => {
  it('zeigt die "Notizen"-Pille nur, wenn text nicht leer ist', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.sources.set('@S1@', makeSource('@S1@', { abbr: 'Mit Text', text: 'Zitierter Urtext' }));
    db.sources.set('@S2@', makeSource('@S2@', { abbr: 'Ohne Text' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(SourceList, { props: { appState, viewState } });

    const row1 = screen.getByText('Mit Text').closest('.source-list__row') as HTMLElement;
    const row2 = screen.getByText('Ohne Text').closest('.source-list__row') as HTMLElement;
    expect(Array.from(row1.querySelectorAll('.stb-pill')).some((el) => el.textContent === 'Notizen')).toBe(true);
    expect(Array.from(row2.querySelectorAll('.stb-pill')).some((el) => el.textContent === 'Notizen')).toBe(false);
  });
});
