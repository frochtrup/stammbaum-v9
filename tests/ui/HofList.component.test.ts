// @vitest-environment happy-dom
// tests/ui/HofList.component.test.ts — Höfe-Tab-Liste als Component-Test (Spec 32 §6;
// Spec 20 §1.8 [K]). Seit ADR-v9-46 zeigt die Hauptliste (Segment "Höfe") NUR
// referenzierte HofObjects — Fixtures hängen darum ein referenzierendes Event an, wo ein
// Hof in der Hauptliste erwartet wird.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import HofList from '../../ui/views/hof/HofList.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { makeDatabase, makePerson } from '../../core/model';
import { place, hof } from '../core/places-fixtures';

function withReferencingPerson(db: ReturnType<typeof makeDatabase>, personId: string, hofId: string) {
  const p = makePerson(personId);
  p.events.push({ ...p.birth, type: 'RESI', eventType: 'RESI', hofId });
  db.individuals.set(personId, p);
}

describe('HofList — Sammlung, Dorf-Gruppierung, Klick-Navigation', () => {
  it('rendert eine Zeile je referenziertem Hof, gruppiert unter dem Dorf-Namen als Header', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    withReferencingPerson(db, '@I1@', '@H1@');
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(HofList, { props: { appState, viewState } });

    expect(screen.getByText('Wall 33')).toBeTruthy();
    // Dorf-Name steht als Gruppen-Header ("Ochtrup (1)"), nicht mehr redundant in
    // jeder Zeile (Nutzer-Vorgabe 2026-07-10, EventsByType.svelte, Spec 21 §10h).
    expect(screen.getByText('Ochtrup (1)')).toBeTruthy();
  });

  it('Klick auf eine Zeile setzt die ViewState-Auswahl "hof"', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@'));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    withReferencingPerson(db, '@I1@', '@H1@');
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

describe('HofList — Anreicherungs-Pille (ADR-v9-44, Spec 11 §9.1)', () => {
  it('plain HofObject zeigt die Pille "ohne Zusatzangaben"', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    withReferencingPerson(db, '@I1@', '@H1@');
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(HofList, { props: { appState, viewState } });

    expect(screen.getByText('ohne Zusatzangaben')).toBeTruthy();
  });

  it('angereicherter Hof (Notiz gesetzt) zeigt KEINE Pille', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set(
      '@H1@',
      hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }], note: 'Hof am Bach' }),
    );
    withReferencingPerson(db, '@I1@', '@H1@');
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(HofList, { props: { appState, viewState } });

    expect(screen.queryByText('ohne Zusatzangaben')).toBeNull();
  });
});

describe('HofList — Referenz-Filter (ADR-v9-46, Spec 11 §9.3)', () => {
  it('referenzloser Hof erscheint NICHT in der Hauptliste, aber im "Ohne Bezug"-Segment', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    db.hofObjects.set('@H2@', hof('@H2@', '@P1@', { addrs: [{ value: 'Verwaist 1', from: null, to: null }] }));
    withReferencingPerson(db, '@I1@', '@H1@');
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(HofList, { props: { appState, viewState } });

    expect(screen.getByText('Wall 33')).toBeTruthy();
    expect(screen.queryByText('Verwaist 1')).toBeNull();
    expect(screen.getByText('Ohne Bezug (1)')).toBeTruthy();

    await fireEvent.click(screen.getByText('Ohne Bezug (1)'));

    expect(screen.getByText('Verwaist 1')).toBeTruthy();
    expect(screen.queryByText('Wall 33')).toBeNull();
  });

  it('TST-7 Kapazitäts-Fall: viele referenzlose Höfe gleichzeitig — Segment-Zähler bleibt korrekt', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    for (let i = 0; i < 30; i++) {
      db.hofObjects.set(`@H${i}@`, hof(`@H${i}@`, '@P1@', { addrs: [{ value: `Wall ${i}`, from: null, to: null }] }));
    }
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(HofList, { props: { appState, viewState } });

    expect(screen.getByText('Ohne Bezug (30)')).toBeTruthy();
    expect(screen.getByText('Höfe (0)')).toBeTruthy();
  });
});

describe('HofList — CoordIndicator (ADR-v9-79 Punkt l, INV-UI-4)', () => {
  it('Klick auf den gefüllten Glyph setzt lensPlaceFocus und navigiert zur Karte-Lens', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set(
      '@H1@',
      hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }], lat: 52.1, long: 7.6 }),
    );
    withReferencingPerson(db, '@I1@', '@H1@');
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    const onNavigateLens = vi.fn();

    render(HofList, { props: { appState, viewState, onNavigateLens } });
    await fireEvent.click(screen.getByText('◎'));

    expect(viewState.getCurrent('lensPlaceFocus')).toBe('@H1@');
    expect(onNavigateLens).toHaveBeenCalledWith('map');
  });

  it('zeigt den leeren Glyph, wenn der Hof keine Koordinaten hat', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    withReferencingPerson(db, '@I1@', '@H1@');
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(HofList, { props: { appState, viewState } });

    expect(screen.getByText('◌')).toBeTruthy();
  });
});

describe('HofList — Toolbar-Ownership "Hof-Zuweisungen prüfen"/"Massen-Dedup" (Spec 21 §10c)', () => {
  it('rendert keinen der beiden Buttons ohne Callback-Props', () => {
    const appState = createAppState();
    const viewState = createViewState();

    render(HofList, { props: { appState, viewState } });

    expect(screen.queryByText('Hof-Zuweisungen prüfen')).toBeNull();
    expect(screen.queryByText('Massen-Dedup')).toBeNull();
  });

  it('rendert beide Buttons in der eigenen Toolbar und ruft die jeweiligen Callbacks bei Klick auf', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    withReferencingPerson(db, '@I1@', '@H1@');
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    const onOpenReview = vi.fn();
    const onOpenDedup = vi.fn();

    render(HofList, { props: { appState, viewState, onOpenReview, onOpenDedup } });
    await fireEvent.click(screen.getByText('Hof-Zuweisungen prüfen'));
    await fireEvent.click(screen.getByText('Massen-Dedup'));

    expect(onOpenReview).toHaveBeenCalledOnce();
    expect(onOpenDedup).toHaveBeenCalledOnce();
  });
});
