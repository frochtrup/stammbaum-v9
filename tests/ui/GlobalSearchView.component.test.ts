// @vitest-environment happy-dom
// tests/ui/GlobalSearchView.component.test.ts — globale Suche (Spec 20 §1.1 [K],
// Spec 21 §2 "Suche ist erstklassig"). Deckt Eingabe -> gruppierte Ergebnisse -> Klick
// navigiert (über die onNavigate*-Callbacks, analog TreeView.onOpenPersonDetail) ab.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import GlobalSearchView from '../../ui/views/search/GlobalSearchView.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { makeDatabase, makeFamily, makePerson, makeSource } from '../../core/model';
import { place, hof } from '../core/places-fixtures';

function seedDb() {
  const db = makeDatabase();
  const husband = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
  const wife = makePerson('@I2@', { given: 'Anna', surname: 'Klein' });
  husband.parentIn.push('@F1@');
  wife.parentIn.push('@F1@');
  db.individuals.set('@I1@', husband);
  db.individuals.set('@I2@', wife);
  db.families.set('@F1@', makeFamily('@F1@', { husband: '@I1@', wife: '@I2@' }));
  db.sources.set('@S1@', makeSource('@S1@', { abbr: 'KB Ochtrup', author: 'Pfarrer Meyer' }));
  db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup', type: 'Village' }));
  db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
  return db;
}

function renderView(db: ReturnType<typeof makeDatabase>) {
  const appState = createAppState();
  appState.loadDatabase(db, 'test.ged');
  const onNavigateToPerson = vi.fn();
  const onNavigateToFamily = vi.fn();
  const onNavigateToSource = vi.fn();
  const onNavigateToPlace = vi.fn();
  const onNavigateToHof = vi.fn();

  const utils = render(GlobalSearchView, {
    props: {
      appState,
      onNavigateToPerson,
      onNavigateToFamily,
      onNavigateToSource,
      onNavigateToPlace,
      onNavigateToHof,
    },
  });

  return { ...utils, onNavigateToPerson, onNavigateToFamily, onNavigateToSource, onNavigateToPlace, onNavigateToHof };
}

describe('GlobalSearchView — Eingabe, Mindestlänge, gruppierte Ergebnisse', () => {
  it('zeigt einen Hinweis statt Ergebnissen, solange keine Query eingegeben ist', () => {
    renderView(seedDb());
    expect(screen.getByText(/Mindestens 2 Zeichen/)).toBeTruthy();
  });

  it('zeigt weiterhin den Hinweis bei einem einzelnen Zeichen (keine Full-Scan-Suche)', async () => {
    renderView(seedDb());
    await fireEvent.input(screen.getByLabelText('Global suchen'), { target: { value: 'O' } });
    expect(screen.getByText(/Mindestens 2 Zeichen/)).toBeTruthy();
  });

  it('gruppiert Treffer nach Personen/Familien/Quellen/Orte/Höfe', async () => {
    renderView(seedDb());
    await fireEvent.input(screen.getByLabelText('Global suchen'), { target: { value: 'Ochtrup' } });

    expect(screen.getByText('Quellen')).toBeTruthy();
    expect(screen.getByText('Orte')).toBeTruthy();
    expect(screen.getByText('Höfe')).toBeTruthy();
    expect(screen.getByText('KB Ochtrup')).toBeTruthy();
    // "Ochtrup" trifft sowohl den Ort (primary) als auch den Hof (secondary: Dorf-Titel).
    expect(screen.getAllByText('Ochtrup').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Wall 33')).toBeTruthy();
  });

  it('zeigt einen Leerzustand ohne Treffer', async () => {
    renderView(seedDb());
    await fireEvent.input(screen.getByLabelText('Global suchen'), { target: { value: 'Zimmermann' } });

    expect(screen.getByText(/Keine Treffer/)).toBeTruthy();
  });

  it('✕ löscht die Suche und kehrt zum Hinweis-Zustand zurück', async () => {
    renderView(seedDb());
    await fireEvent.input(screen.getByLabelText('Global suchen'), { target: { value: 'Bauer' } });
    expect(screen.getByText('Otto Bauer')).toBeTruthy();

    await fireEvent.click(screen.getByLabelText('Suche löschen'));

    expect(screen.getByText(/Mindestens 2 Zeichen/)).toBeTruthy();
  });
});

describe('GlobalSearchView — Klick navigiert über die Navigations-Callbacks', () => {
  it('Klick auf eine Person ruft onNavigateToPerson mit der id auf', async () => {
    const { onNavigateToPerson } = renderView(seedDb());
    await fireEvent.input(screen.getByLabelText('Global suchen'), { target: { value: 'Bauer' } });

    await fireEvent.click(screen.getByText('Otto Bauer'));

    expect(onNavigateToPerson).toHaveBeenCalledWith('@I1@');
  });

  it('Klick auf eine Familie ruft onNavigateToFamily mit der id auf', async () => {
    const { onNavigateToFamily } = renderView(seedDb());
    await fireEvent.input(screen.getByLabelText('Global suchen'), { target: { value: 'Klein' } });

    await fireEvent.click(screen.getByText('Otto Bauer ⚭ Anna Klein'));

    expect(onNavigateToFamily).toHaveBeenCalledWith('@F1@');
  });

  it('Klick auf eine Quelle ruft onNavigateToSource mit der id auf', async () => {
    const { onNavigateToSource } = renderView(seedDb());
    await fireEvent.input(screen.getByLabelText('Global suchen'), { target: { value: 'Ochtrup' } });

    await fireEvent.click(screen.getByText('KB Ochtrup'));

    expect(onNavigateToSource).toHaveBeenCalledWith('@S1@');
  });

  it('Klick auf einen Ort ruft onNavigateToPlace mit der id auf', async () => {
    const { onNavigateToPlace } = renderView(seedDb());
    await fireEvent.input(screen.getByLabelText('Global suchen'), { target: { value: 'Ochtrup' } });

    // "Ochtrup" trifft auch den Hof (als Dorf-Titel-Sekundärinfo) — gezielt den
    // Ort-Primärtext (§ global-search__primary) statt eines beliebigen Texttreffers klicken.
    const placeHit = screen.getAllByText('Ochtrup').find((el) => el.className.includes('global-search__primary'))!;
    await fireEvent.click(placeHit);

    expect(onNavigateToPlace).toHaveBeenCalledWith('@P1@');
  });

  it('Klick auf einen Hof ruft onNavigateToHof mit der id auf (ADR-v9-24)', async () => {
    const { onNavigateToHof } = renderView(seedDb());
    await fireEvent.input(screen.getByLabelText('Global suchen'), { target: { value: 'Wall 33' } });

    await fireEvent.click(screen.getByText('Wall 33'));

    expect(onNavigateToHof).toHaveBeenCalledWith('@H1@');
  });
});
