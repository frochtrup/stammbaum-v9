// @vitest-environment happy-dom
// tests/ui/PlaceList.component.test.ts — Orte-Tab-Liste als Component-Test (Spec 32 §6;
// Spec 20 §1.7 [K]). Deckt tatsächliches DOM-Rendering + Klick-Navigation ab.
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PlaceList from '../../ui/views/place/PlaceList.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { makeDatabase, makePerson } from '../../core/model';
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

  it('zeigt einen Leerzustand ohne Orte — korrekt (KEIN automatisches Sammeln), mit Handlungsanweisung (ADR-v9-27)', () => {
    const appState = createAppState();
    const viewState = createViewState();

    render(PlaceList, { props: { appState, viewState } });

    expect(screen.getByText(/Keine Orte erfasst/)).toBeTruthy();
    // Regression: der alte Text behauptete fälschlich automatisches Sammeln ("werden
    // beim Laden einer Datei automatisch gesammelt") — das ist falsch (ADR-v9-27).
    expect(screen.queryByText(/werden beim Laden einer Datei automatisch gesammelt/)).toBeNull();
    expect(screen.getByText('Orte vorschlagen')).toBeTruthy();
  });
});

describe('PlaceList — "Orte vorschlagen" (ADR-v9-27)', () => {
  it('öffnet den Sichtungsdialog aus dem Leerzustand und legt ausgewählte Orte an', async () => {
    const appState = createAppState();
    const person = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    person.birth.place = 'Ochtrup';
    const db = appState.db;
    db.individuals.set('@I1@', person);
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(PlaceList, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('Orte vorschlagen'));

    expect(screen.getByText('Ochtrup')).toBeTruthy();
    await fireEvent.click(screen.getByText('Ausgewählte anlegen'));
    await fireEvent.click(screen.getByText('✕ Schließen'));

    expect(screen.getByText('Ochtrup')).toBeTruthy();
    expect(Array.from(appState.db.placeObjects.values()).map((p) => p.title)).toEqual(['Ochtrup']);
  });

  it('bleibt in der befüllten Liste sichtbar, solange noch unaufgelöste Events existieren', () => {
    const appState = createAppState();
    const db = appState.db;
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Bestandsort' }));
    const person = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    person.birth.place = 'Ochtrup';
    db.individuals.set('@I1@', person);
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(PlaceList, { props: { appState, viewState } });

    expect(screen.getByText('Orte vorschlagen')).toBeTruthy();
  });

  it('bleibt in der Toolbar verborgen, wenn keine unaufgelösten Events mehr existieren', () => {
    const appState = createAppState();
    const db = appState.db;
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Bestandsort' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(PlaceList, { props: { appState, viewState } });

    expect(screen.queryByText('Orte vorschlagen')).toBeNull();
  });
});
