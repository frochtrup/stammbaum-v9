// @vitest-environment happy-dom
// tests/ui/PlaceList.component.test.ts — Orte-Tab-Liste als Component-Test (Spec 32 §6;
// Spec 20 §1.7 [K]). Deckt tatsächliches DOM-Rendering + Klick-Navigation ab. Seit
// ADR-v9-46 zeigt die Hauptliste (Segment "Orte") NUR referenzierte PlaceObjects — die
// Fixtures hängen darum ein referenzierendes Event an, wo ein Ort in der Hauptliste
// erwartet wird (analog einem echten, aus einem Import geseedeten Ort).
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PlaceList from '../../ui/views/place/PlaceList.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { makeDatabase, makePerson } from '../../core/model';
import { place } from '../core/places-fixtures';

/** Hängt ein referenzierendes BIRT-Event (ev.placeId) an eine frische Person — macht das
 *  PlaceObject `hasReference === true` (Spec 11 §9.3), damit es in der Hauptliste erscheint. */
function withReferencingPerson(db: ReturnType<typeof makeDatabase>, personId: string, placeId: string) {
  const p = makePerson(personId);
  p.birth.placeId = placeId;
  db.individuals.set(personId, p);
}

describe('PlaceList — Sammlung, Typ-Badge, Koordinaten-Indikator, Klick-Navigation', () => {
  it('rendert eine Zeile je referenziertem PlaceObject mit Typ-Badge', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup', type: 'Village' }));
    withReferencingPerson(db, '@I1@', '@P1@');
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
    withReferencingPerson(db, '@I1@', '@P1@');
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
    withReferencingPerson(db, '@I1@', '@P1@');
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
    withReferencingPerson(db, '@I1@', '@P1@');
    withReferencingPerson(db, '@I2@', '@P2@');
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(PlaceList, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('Filter'));
    await fireEvent.click(screen.getByLabelText('Verwaltungseinheiten ausblenden'));

    expect(screen.queryByText('Kreis Steinfurt')).toBeNull();
    expect(screen.getByText('Ochtrup')).toBeTruthy();
  });

  it('Typ-Filter reduziert die Liste auf den gewählten Typ (value/onchange-Muster, kein bind:value)', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Kreis Steinfurt', type: 'County' }));
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Ochtrup', type: 'Village' }));
    withReferencingPerson(db, '@I1@', '@P1@');
    withReferencingPerson(db, '@I2@', '@P2@');
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(PlaceList, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('Filter'));
    const select = screen.getByLabelText('Typ') as HTMLSelectElement;
    await fireEvent.change(select, { target: { value: 'Village' } });

    expect(select.value).toBe('Village');
    expect(screen.queryByText('Kreis Steinfurt')).toBeNull();
    expect(screen.getByText('Ochtrup')).toBeTruthy();
  });

  it('zeigt einen Leerzustand ohne Orte — verweist auf den automatischen Import-Seed (ADR-v9-28), kein Opt-in-Dialog mehr', () => {
    const appState = createAppState();
    const viewState = createViewState();

    render(PlaceList, { props: { appState, viewState } });

    expect(screen.getByText(/automatisch aus den/)).toBeTruthy();
    // Regression: der frühere Opt-in-Dialog ("Orte vorschlagen") ist mit ADR-v9-28
    // (automatischer Seed beim Import) entfallen — er darf nicht mehr auftauchen.
    expect(screen.queryByText('Orte vorschlagen')).toBeNull();
  });
});

describe('PlaceList — Anreicherungs-Pille (ADR-v9-44, Spec 11 §9.1)', () => {
  it('plain PlaceObject zeigt die Pille "ohne Zusatzangaben"', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    withReferencingPerson(db, '@I1@', '@P1@');
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(PlaceList, { props: { appState, viewState } });

    expect(screen.getByText('ohne Zusatzangaben')).toBeTruthy();
  });

  it('angereichertes PlaceObject (gesetzter Typ) zeigt KEINE Pille', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup', type: 'Village' }));
    withReferencingPerson(db, '@I1@', '@P1@');
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(PlaceList, { props: { appState, viewState } });

    expect(screen.queryByText('ohne Zusatzangaben')).toBeNull();
  });
});

describe('PlaceList — Referenz-Filter (ADR-v9-46, Spec 11 §9.3)', () => {
  it('referenzloser Ort erscheint NICHT in der Hauptliste, aber im "Ohne Bezug"-Segment', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Referenziert' }));
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Verwaist' }));
    withReferencingPerson(db, '@I1@', '@P1@');
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(PlaceList, { props: { appState, viewState } });

    expect(screen.getByText('Referenziert')).toBeTruthy();
    expect(screen.queryByText('Verwaist')).toBeNull();
    expect(screen.getByText('Ohne Bezug (1)')).toBeTruthy();

    await fireEvent.click(screen.getByText('Ohne Bezug (1)'));

    expect(screen.getByText('Verwaist')).toBeTruthy();
    expect(screen.queryByText('Referenziert')).toBeNull();
  });

  it('referenzloser Ort bleibt über das "Ohne Bezug"-Segment anklickbar (voll editierbar/löschbar in PlaceDetail)', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Verwaist' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(PlaceList, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('Ohne Bezug (1)'));
    await fireEvent.click(screen.getByText('Verwaist'));

    expect(viewState.getCurrent('place')).toBe('@P1@');
  });

  it('TST-7 Kapazitäts-Fall: viele referenzlose Orte gleichzeitig — Segment-Zähler bleibt korrekt', () => {
    const appState = createAppState();
    const db = makeDatabase();
    for (let i = 0; i < 30; i++) {
      db.placeObjects.set(`@P${i}@`, place(`@P${i}@`, { title: `Ort ${i}` }));
    }
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(PlaceList, { props: { appState, viewState } });

    expect(screen.getByText('Ohne Bezug (30)')).toBeTruthy();
    expect(screen.getByText('Orte (0)')).toBeTruthy();
  });
});

describe('PlaceList — Toolbar-Ownership "Massen-Dedup" (Spec 21 §10c)', () => {
  it('rendert den Button NICHT, wenn kein onOpenDedup übergeben wird', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    withReferencingPerson(db, '@I1@', '@P1@');
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(PlaceList, { props: { appState, viewState } });

    expect(screen.queryByText('Massen-Dedup')).toBeNull();
  });

  it('rendert "Massen-Dedup" in der eigenen Toolbar und ruft onOpenDedup bei Klick auf', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    withReferencingPerson(db, '@I1@', '@P1@');
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    const onOpenDedup = vi.fn();

    render(PlaceList, { props: { appState, viewState, onOpenDedup } });
    await fireEvent.click(screen.getByText('Massen-Dedup'));

    expect(onOpenDedup).toHaveBeenCalledOnce();
  });
});
