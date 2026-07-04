// @vitest-environment happy-dom
// tests/ui/PlaceDetail.component.test.ts — Orts-Steckbrief + Bearbeitung (Spec 32 §6;
// Spec 20 §1.7 [K]). Deckt Ereignis-Gruppierung, Bearbeitung, pnames/enclosedBy-Pflege,
// String→PlaceObject-Verknüpfung als tatsächliches DOM-Rendering ab.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PlaceDetail from '../../ui/views/place/PlaceDetail.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { makeDatabase, makePerson } from '../../core/model';
import { place } from '../core/places-fixtures';

describe('PlaceDetail — Steckbrief (read-only Teile)', () => {
  it('zeigt einen definierten Leerzustand, wenn kein Ort ausgewählt ist', () => {
    const appState = createAppState();
    const viewState = createViewState();

    render(PlaceDetail, { props: { appState, viewState } });

    expect(screen.getByText('Kein Ort ausgewählt.')).toBeTruthy();
  });

  it('zeigt einen definierten Leerzustand, wenn die id nicht (mehr) existiert', () => {
    const appState = createAppState();
    const viewState = createViewState();
    viewState.setCurrent('place', '@gone@');

    render(PlaceDetail, { props: { appState, viewState } });

    expect(screen.getByText(/nicht gefunden/)).toBeTruthy();
  });

  it('gruppiert Ereignisse nach Typ und verlinkt die referenzierende Person', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    const person = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    person.birth.placeId = '@P1@';
    db.individuals.set('@I1@', person);
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');
    const onNavigateToPerson = vi.fn();

    render(PlaceDetail, { props: { appState, viewState, onNavigateToPerson } });

    expect(screen.getByText('BIRT (1)')).toBeTruthy();
    await fireEvent.click(screen.getByText('Otto Bauer'));
    expect(onNavigateToPerson).toHaveBeenCalledWith('@I1@');
  });
});

describe('PlaceDetail — Bearbeitung (Name, Koordinaten, Typ)', () => {
  it('speichert Grunddaten über appState.savePlace', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup', type: 'Village' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Ochtrup (neu)' } });
    await fireEvent.input(screen.getByLabelText('Breitengrad'), { target: { value: '52.2' } });
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.placeObjects.get('@P1@')?.title).toBe('Ochtrup (neu)');
    expect(appState.db.placeObjects.get('@P1@')?.lat).toBe(52.2);
  });
});

describe('PlaceDetail — Namens-Varianten (pnames) Pflege', () => {
  it('fügt eine neue pnames-Variante hinzu', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Sassenberg' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });
    await fireEvent.input(screen.getByLabelText('Neue Namensvariante'), { target: { value: 'Sassenbergk' } });
    await fireEvent.click(screen.getByText('+ Hinzufügen'));

    expect(appState.db.placeObjects.get('@P1@')?.pnames.map((p) => p.value)).toEqual(['Sassenbergk']);
  });

  it('entfernt eine bestehende pnames-Variante', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set(
      '@P1@',
      place('@P1@', { title: 'Sassenberg', pnames: [{ value: 'Sassenbergk', from: null, to: null }] }),
    );
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByLabelText('Namensvariante entfernen'));

    expect(appState.db.placeObjects.get('@P1@')?.pnames).toEqual([]);
  });
});

describe('PlaceDetail — String→PlaceObject verknüpfen', () => {
  it('verknüpft ein Event per Klick auf "Verknüpfen" und aktualisiert die Ansicht', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    const person = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    person.death.place = 'Ochtrup';
    db.individuals.set('@I1@', person);
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });
    expect(screen.getByText(/Nicht verknüpfte Ereignisse/)).toBeTruthy();

    await fireEvent.click(screen.getByText('Verknüpfen'));

    expect(person.death.placeId).toBe('@P1@');
    expect(screen.queryByText(/Nicht verknüpfte Ereignisse/)).toBeNull();
  });
});
