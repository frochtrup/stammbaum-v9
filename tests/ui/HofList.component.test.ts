// @vitest-environment happy-dom
// tests/ui/HofList.component.test.ts — Höfe-Tab-Liste als Component-Test (Spec 32 §6;
// Spec 20 §1.8 [K]).
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import HofList from '../../ui/views/hof/HofList.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { makeDatabase } from '../../core/model';
import { place, hof } from '../core/places-fixtures';

describe('HofList — Sammlung, Dorf-Anzeige, Klick-Navigation', () => {
  it('rendert eine Zeile je Hof mit zugehörigem Dorf', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(HofList, { props: { appState, viewState } });

    expect(screen.getByText('Wall 33')).toBeTruthy();
    expect(screen.getByText('Ochtrup')).toBeTruthy();
  });

  it('Klick auf eine Zeile setzt die ViewState-Auswahl "hof"', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@'));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(HofList, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('Wall 33'));

    expect(viewState.getCurrent('hof')).toBe('@H1@');
  });

  it('zeigt einen Leerzustand ohne Höfe', () => {
    const appState = createAppState();
    const viewState = createViewState();

    render(HofList, { props: { appState, viewState } });

    expect(screen.getByText(/Keine Höfe erfasst/)).toBeTruthy();
  });
});
