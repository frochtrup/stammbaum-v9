// @vitest-environment happy-dom
// tests/ui/HofList.component.test.ts — Höfe-Tab-Liste als Component-Test (Spec 32 §6;
// Spec 20 §1.8 [K]). Seit ADR-v9-46 zeigt die Hauptliste (Segment "Höfe") NUR
// referenzierte HofObjects — Fixtures hängen darum ein referenzierendes Event an, wo ein
// Hof in der Hauptliste erwartet wird.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import HofList from '../../ui/views/hof/HofList.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createHofListState } from '../../ui/views/list-view-state.svelte';
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
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null , fromDate: null, toDate: null }] }));
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
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null , fromDate: null, toDate: null }] }));
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

describe('HofList — Anreicherung als Filter statt Zeilen-Pille (ADR-v9-149)', () => {
  it('ein plain HofObject trägt KEINE "ohne Zusatzangaben"-Pille mehr', () => {
    // Geschwister-Stelle zu PlaceList: derselbe Fix, nicht nur dort, wo er aufgefallen ist.
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null , fromDate: null, toDate: null }] }));
    withReferencingPerson(db, '@I1@', '@H1@');
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(HofList, { props: { appState, viewState } });

    expect(screen.getByText('Wall 33')).toBeTruthy();
    expect(screen.queryByText('ohne Zusatzangaben')).toBeNull();
  });

  it('die Anreicherungs-Stufe blendet die anderen Stufen aus (ADR-v9-191)', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null , fromDate: null, toDate: null }] }));
    db.hofObjects.set(
      '@H2@',
      hof('@H2@', '@P1@', { addrs: [{ value: 'Bachweg 7', from: null, to: null , fromDate: null, toDate: null }], note: 'Hof am Bach' }),
    );
    withReferencingPerson(db, '@I1@', '@H1@');
    withReferencingPerson(db, '@I2@', '@H2@');
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(HofList, { props: { appState, viewState } });

    expect(screen.getByText('Wall 33')).toBeTruthy();
    expect(screen.getByText('Bachweg 7')).toBeTruthy();

    await fireEvent.click(screen.getByText('Filter'));
    const wahl = screen.getByLabelText('Anreicherung') as HTMLSelectElement;
    await fireEvent.change(wahl, { target: { value: 'none' } });

    expect(screen.getByText('Wall 33')).toBeTruthy();
    expect(screen.queryByText('Bachweg 7')).toBeNull();

    // „Bachweg 7" trägt genau EINE Angabe (Notiz) → „wenig ergänzt". Erst ab zwei
    // Facetten gilt ein Hof als ausführlich (gemessene Hof-Schwelle, ADR-v9-191) — die
    // Stufe hängt an der Zahl der Angaben, nicht daran, dass überhaupt eine da ist.
    await fireEvent.change(wahl, { target: { value: 'sparse' } });

    expect(screen.getByText('Bachweg 7')).toBeTruthy();
    expect(screen.queryByText('Wall 33')).toBeNull();
  });
});

describe('HofList — Referenz-Filter (ADR-v9-46, Spec 11 §9.3)', () => {
  it('referenzloser Hof erscheint NICHT in der Hauptliste, aber im "Ohne Bezug"-Segment', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null , fromDate: null, toDate: null }] }));
    db.hofObjects.set('@H2@', hof('@H2@', '@P1@', { addrs: [{ value: 'Verwaist 1', from: null, to: null , fromDate: null, toDate: null }] }));
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
      hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null , fromDate: null, toDate: null }], lat: 52.1, long: 7.6 }),
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
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null , fromDate: null, toDate: null }] }));
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
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null , fromDate: null, toDate: null }] }));
    withReferencingPerson(db, '@I1@', '@H1@');
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    const onOpenReview = vi.fn();
    const onOpenDedup = vi.fn();

    render(HofList, { props: { appState, viewState, onOpenReview, onOpenDedup } });
    // Seit BL-96 liegen die Kuratierungs-Werkzeuge hinter EINEM "Werkzeuge"-Einstieg
    // (Spec 21 §6h) — die Toolbar-Ownership aus §10c bleibt unberührt, die Liste besitzt
    // den Einstieg weiterhin selbst. Nur ein Klick mehr, und die Panel-Inhalte liegen
    // portaliert am <body> (deshalb `screen`, nicht `container`).
    await fireEvent.click(screen.getByRole('button', { name: 'Werkzeuge' }));
    await fireEvent.click(screen.getByText('Hof-Zuweisungen prüfen'));
    await fireEvent.click(screen.getByText('Massen-Dedup'));

    expect(onOpenReview).toHaveBeenCalledOnce();
    expect(onOpenDedup).toHaveBeenCalledOnce();
  });
});

describe('HofList — Kurations-Achtungs-Punkt am Werkzeuge-Trigger (BL-206, ADR-v9-148)', () => {
  it('ohne offene Fälle trägt der Trigger keinen Punkt (Name bleibt schlicht "Werkzeuge")', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null , fromDate: null, toDate: null }] }));
    withReferencingPerson(db, '@I1@', '@H1@');
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    const { container } = render(HofList, { props: { appState, viewState, onOpenDedup: () => {} } });

    expect(screen.getByRole('button', { name: 'Werkzeuge' })).toBeTruthy();
    expect(container.querySelector('.stb-filterbar__dot')).toBeNull();
  });

  it('Dedup-Gruppe > 0 setzt den Achtungs-Punkt; aufgeklappt steht der beschriftete Zähler', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    // Zwei gleichadressige Höfe im selben Dorf → EINE Dedup-Gruppe (findHofDuplicates).
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null , fromDate: null, toDate: null }] }));
    db.hofObjects.set('@H2@', hof('@H2@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null , fromDate: null, toDate: null }] }));
    withReferencingPerson(db, '@I1@', '@H1@');
    withReferencingPerson(db, '@I2@', '@H2@');
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    const { container } = render(HofList, { props: { appState, viewState, onOpenDedup: () => {} } });

    expect(container.querySelector('.stb-filterbar__dot')).not.toBeNull();
    const trigger = screen.getByRole('button', { name: /Werkzeuge.*Handlungsbedarf/ });

    await fireEvent.click(trigger);
    expect(screen.getByText('Massen-Dedup · 1 Gruppe')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------------------
// BL-320: Suche und Abschnitt überleben das Wegnavigieren (Spec 21 §5). Der Abschnitt ist
// hier der interessantere Teil: er entscheidet, WELCHE Menge die Liste zeigt — kommt er
// nicht zurück, sieht der Nutzer nach dem Blick auf einen Hof eine andere Liste.
describe('HofList — Suche und Abschnitt überleben das Wegnavigieren (BL-320)', () => {
  it('kommt mit derselben Suche zurück', async () => {
    const list = createHofListState();
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null , fromDate: null, toDate: null }] }));
    withReferencingPerson(db, '@I1@', '@H1@');
    appState.loadDatabase(db, 'test.ged');
    const props = { appState, viewState: createViewState(), list };

    const first = render(HofList, { props });
    await fireEvent.input(screen.getByLabelText('Höfe durchsuchen'), { target: { value: 'Wall' } });
    first.unmount();

    render(HofList, { props: { appState, viewState: createViewState(), list } });

    expect((screen.getByLabelText('Höfe durchsuchen') as HTMLInputElement).value).toBe('Wall');
  });
});
