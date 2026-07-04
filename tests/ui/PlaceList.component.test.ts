// @vitest-environment happy-dom
// tests/ui/PlaceList.component.test.ts — Orte-Tab-Liste als Component-Test (Spec 32 §6;
// Spec 20 §1.7 [K]). Deckt tatsächliches DOM-Rendering + Klick-Navigation ab.
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PlaceList from '../../ui/views/place/PlaceList.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { makeDatabase } from '../../core/model';
import { place } from '../core/places-fixtures';

describe('PlaceList — Sammlung, Typ-Badge, Koordinaten-Indikator, Klick-Navigation', () => {
  it('rendert eine Zeile je PlaceObject mit Typ-Badge', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup', type: 'Village' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(PlaceList, { props: { appState, viewState } });

    expect(screen.getByText('Ochtrup')).toBeTruthy();
    expect(screen.getByText('Village')).toBeTruthy();
  });

  it('Klick auf eine Zeile setzt die ViewState-Auswahl "place"', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(PlaceList, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('Ochtrup'));

    expect(viewState.getCurrent('place')).toBe('@P1@');
  });

  it('Gruppen-Modus zeigt pnames-Varianten unter dem Titel', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set(
      '@P1@',
      place('@P1@', { title: 'Sassenberg', pnames: [{ value: 'Sassenbergk', from: null, to: null }] }),
    );
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(PlaceList, { props: { appState, viewState } });
    await fireEvent.click(screen.getByLabelText('Varianten gruppiert'));

    expect(screen.getByText('Sassenbergk')).toBeTruthy();
  });

  it('Admin-Filter blendet Verwaltungseinheiten aus', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Kreis Steinfurt', type: 'County' }));
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Ochtrup', type: 'Village' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(PlaceList, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('Filter'));
    await fireEvent.click(screen.getByLabelText('Verwaltungseinheiten ausblenden'));

    expect(screen.queryByText('Kreis Steinfurt')).toBeNull();
    expect(screen.getByText('Ochtrup')).toBeTruthy();
  });

  it('zeigt einen Leerzustand ohne Orte', () => {
    const appState = createAppState();
    const viewState = createViewState();

    render(PlaceList, { props: { appState, viewState } });

    expect(screen.getByText(/Keine Orte erfasst/)).toBeTruthy();
  });
});
