// @vitest-environment happy-dom
// tests/ui/HofDetail.component.test.ts — Hof-Steckbrief + Bearbeitung (Spec 32 §6;
// Spec 20 §1.8 [K]).
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import HofDetail from '../../ui/views/hof/HofDetail.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { makeDatabase, makePerson } from '../../core/model';
import { place, hof } from '../core/places-fixtures';

describe('HofDetail — Steckbrief (read-only Teile)', () => {
  it('zeigt einen definierten Leerzustand ohne Auswahl', () => {
    const appState = createAppState();
    const viewState = createViewState();

    render(HofDetail, { props: { appState, viewState } });

    expect(screen.getByText('Kein Hof ausgewählt.')).toBeTruthy();
  });

  it('zeigt einen definierten Leerzustand, wenn die id nicht (mehr) existiert', () => {
    const appState = createAppState();
    const viewState = createViewState();
    viewState.setCurrent('hof', '@gone@');

    render(HofDetail, { props: { appState, viewState } });

    expect(screen.getByText(/nicht gefunden/)).toBeTruthy();
  });

  it('zeigt Bewohner chronologisch + verlinkt zur Person', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    const person = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    person.birth.hofId = '@H1@';
    person.birth.date = '1 JAN 1900';
    db.individuals.set('@I1@', person);
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('hof', '@H1@');
    const onNavigateToPerson = vi.fn();

    render(HofDetail, { props: { appState, viewState, onNavigateToPerson } });

    expect(screen.getAllByText('Wall 33').length).toBeGreaterThan(0);
    expect(screen.getByText('Ochtrup')).toBeTruthy();
    await fireEvent.click(screen.getByText('Otto Bauer'));
    expect(onNavigateToPerson).toHaveBeenCalledWith('@I1@');
  });
});

describe('HofDetail — Bearbeitung (Adressvarianten, Koordinaten, Notiz, Lebenszyklus)', () => {
  it('speichert Grunddaten über appState.saveHof', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('hof', '@H1@');

    render(HofDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    await fireEvent.input(screen.getByLabelText('Breitengrad'), { target: { value: '52.2' } });
    await fireEvent.input(screen.getByLabelText('Notiz'), { target: { value: 'Alter Bauernhof' } });
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.hofObjects.get('@H1@')?.lat).toBe(52.2);
    expect(appState.db.hofObjects.get('@H1@')?.note).toBe('Alter Bauernhof');
  });

  it('fügt eine neue Adressvariante hinzu (nur im Bearbeiten-Modus sichtbar)', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@'));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('hof', '@H1@');

    render(HofDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    await fireEvent.input(screen.getByLabelText('Neue Adressvariante'), { target: { value: 'Wallstraße 33' } });
    await fireEvent.click(screen.getByText('+ Hinzufügen'));

    expect(appState.db.hofObjects.get('@H1@')?.addrs.map((a) => a.value)).toEqual(['Wall 33', 'Wallstraße 33']);
  });

  it('setzt Vorgänger-/Nachfolger-Hof über die Lebenszyklus-Selects (value/onchange-Muster, kein bind:value)', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@'));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    db.hofObjects.set('@H2@', hof('@H2@', '@P1@', { addrs: [{ value: 'Oster 5', from: null, to: null }] }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('hof', '@H1@');

    render(HofDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    const predecessorSelect = screen.getByLabelText('Vorgänger-Hof') as HTMLSelectElement;
    await fireEvent.change(predecessorSelect, { target: { value: '@H2@' } });
    expect(predecessorSelect.value).toBe('@H2@');
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.hofObjects.get('@H1@')?.predecessor).toBe('@H2@');
  });
});

describe('HofDetail — Anzeige/Bearbeitung strukturell getrennt (ADR-v9-30 Punkt 5)', () => {
  it('zeigt Adressvarianten als reine Lese-Darstellung ohne Mutations-Controls außerhalb des Bearbeiten-Modus', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set(
      '@H1@',
      hof('@H1@', '@P1@', {
        addrs: [
          { value: 'Wall 33', from: null, to: null },
          { value: 'Wallstraße 33', from: null, to: null },
        ],
      }),
    );
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('hof', '@H1@');

    const { container } = render(HofDetail, { props: { appState, viewState } });

    // Lese-Darstellung bleibt sichtbar.
    expect(screen.getByText('Wallstraße 33')).toBeTruthy();
    // Aber keine Mutations-Controls außerhalb des Bearbeiten-Modus.
    expect(container.querySelector('.hof-detail__remove-btn')).toBeNull();
    expect(container.querySelector('.hof-detail__add-row')).toBeNull();
    expect(screen.queryByLabelText('Neue Adressvariante')).toBeNull();
    expect(container.querySelector('.hof-detail__form')).toBeNull();
  });

  it('blendet die Mutations-Controls nach Klick auf "✎ Bearbeiten" wieder ein', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('hof', '@H1@');

    const { container } = render(HofDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));

    expect(container.querySelector('.hof-detail__remove-btn')).toBeTruthy();
    expect(screen.getByLabelText('Neue Adressvariante')).toBeTruthy();
  });
});

describe('HofDetail — gemeinsame Detail-Kopfzeile (Spec 21 §6b, INV-UI-4)', () => {
  it('"← Zur Liste" und "✎ Bearbeiten" stehen in derselben Kopfzeile, Titel in eigener Zeile darunter', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('hof', '@H1@');
    const onBack = vi.fn();

    const { container } = render(HofDetail, { props: { appState, viewState, onBack } });

    const row = container.querySelector('.detail-header__row');
    const title = container.querySelector('.detail-header__title');
    expect(row?.contains(screen.getByText('← Zur Liste'))).toBe(true);
    expect(row?.contains(screen.getByText('✎ Bearbeiten'))).toBe(true);
    expect(title?.textContent).toBe('Wall 33');
    expect(row?.contains(title)).toBe(false);

    await fireEvent.click(screen.getByText('← Zur Liste'));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
