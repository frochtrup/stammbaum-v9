// @vitest-environment happy-dom
// tests/ui/MapLensView.component.test.ts — Karten-Lens (Spec 21 §4, Spec 20 §1.9 [S],
// ADR-v9-25). Deckt: Lens-/Fokus-Verdrahtung (Precedent aus dem vorherigen Bau-Durchgang),
// Modus-Umschalter, Personen-Picker-Default = lensFocus, Offline-Fallback-Anzeige.
// Die Layout-/Marker-Berechnung selbst ist in tests/islands/map-model.test.ts abgedeckt
// (Spec 32 §2: Inseln werden über ihre Layout-Berechnung getestet, nicht über Pixel).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import MapLensView from '../../ui/views/map/MapLensView.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { makeDatabase, makeEvent, makePerson } from '../../core/model';
import { savePlaceObject } from '../../core/places';

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

function dbWithPlace(): ReturnType<typeof makeDatabase> {
  const db = makeDatabase();
  savePlaceObject(db.placeObjects, {
    id: 'P1',
    title: 'Musterdorf',
    type: 'Village',
    pnames: [],
    enclosedBy: [],
    lat: 51.5,
    long: 10.0,
    note: '',
    existsFrom: null,
    existsTo: null,
    govId: null,
    govTypes: null,
  });
  db.individuals.set(
    '@I1@',
    makePerson('@I1@', {
      given: 'Anna',
      surname: 'Bauer',
      birth: makeEvent('BIRT', { placeId: 'P1', date: '1 JAN 1850' }),
    }),
  );
  return db;
}

describe('MapLensView — Lens-/Fokus-Verdrahtung (INV-UI-3, Spec 21 §4)', () => {
  afterEach(() => setOnline(true));

  it('bindet den EINEN Lens-Umschalter mit "Karte" als aktiver Lens ein', () => {
    render(MapLensView, { props: { appState: createAppState(), viewState: createViewState() } });

    const mapTab = screen.getByRole('tab', { name: /Karte/ });
    expect(mapTab.getAttribute('aria-current')).toBe('page');
  });

  it('Klick auf "Baum" im eingebetteten Umschalter ruft onNavigateLens mit "tree" auf', async () => {
    const onNavigateLens = vi.fn();
    render(MapLensView, {
      props: { appState: createAppState(), viewState: createViewState(), onNavigateLens },
    });

    await fireEvent.click(screen.getByRole('tab', { name: /Baum/ }));

    expect(onNavigateLens).toHaveBeenCalledWith('tree');
  });

  it('zeigt KEINE redundante Titel-Zeile über dem Umschalter (Befund: doppeltes "Karte")', () => {
    const { container } = render(MapLensView, {
      props: { appState: createAppState(), viewState: createViewState() },
    });

    // "Karte" darf nur einmal im DOM stehen (als aktives Tab im Lens-Umschalter) —
    // keine zusätzliche `__topbar`-Titel-Zeile mehr darüber.
    expect(container.querySelectorAll('.lens-switcher__item--active')).toHaveLength(1);
    expect(container.textContent?.match(/Karte/g)).toHaveLength(1);
  });
});

describe('MapLensView — Modus-Umschalter (Spec 20 §1.9 [S]: Orte/Personen/Migrationen)', () => {
  afterEach(() => setOnline(true));

  it('startet im Orte-Modus und zeigt den Karten-Host', () => {
    const { container } = render(MapLensView, {
      props: { appState: createAppState(), viewState: createViewState() },
    });

    const orteTab = screen.getByRole('tab', { name: 'Orte' });
    expect(orteTab.getAttribute('aria-current')).toBe('page');
    expect(container.querySelector('.map-lens-view__host')).toBeTruthy();
  });

  it('Klick auf "Personen" wechselt den Modus und zeigt den Personen-Picker-Button', async () => {
    render(MapLensView, { props: { appState: createAppState(), viewState: createViewState() } });

    await fireEvent.click(screen.getByRole('tab', { name: 'Personen' }));

    expect(screen.getByRole('tab', { name: 'Personen' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByText(/Person wählen/)).toBeTruthy();
  });

  it('Klick auf "Migrationen" wechselt den Modus und zeigt die Epochen-Legende', async () => {
    render(MapLensView, { props: { appState: createAppState(), viewState: createViewState() } });

    await fireEvent.click(screen.getByRole('tab', { name: 'Migrationen' }));

    expect(screen.getByRole('tab', { name: 'Migrationen' }).getAttribute('aria-current')).toBe('page');
    for (const label of ['vor 1700', '1950+']) {
      expect(screen.getByText(new RegExp(label))).toBeTruthy();
    }
  });

  it('zeigt Animations-Regler (Geschwindigkeit/Loop) nur im Personen-/Migrations-Modus', async () => {
    render(MapLensView, { props: { appState: createAppState(), viewState: createViewState() } });

    expect(screen.queryByText(/Loop/)).toBeNull();

    await fireEvent.click(screen.getByRole('tab', { name: 'Migrationen' }));
    expect(screen.getByText(/Loop/)).toBeTruthy();
  });

  it('Geschwindigkeits-Select reagiert auf Auswahl (value/onchange-Muster, kein bind:value; numerische Option)', async () => {
    render(MapLensView, { props: { appState: createAppState(), viewState: createViewState() } });
    await fireEvent.click(screen.getByRole('tab', { name: 'Migrationen' }));

    const select = screen.getByLabelText('Geschwindigkeit') as HTMLSelectElement;
    expect(select.value).toBe('600'); // Default (normal)
    await fireEvent.change(select, { target: { value: '250' } });

    expect(select.value).toBe('250');
  });
});

describe('MapLensView — Personen-Picker-Default (Spec 21 §4 "Fokus bleibt erhalten")', () => {
  afterEach(() => setOnline(true));

  it('Personen-Modus übernimmt den geteilten ViewState-Fokus "lensFocus" als Default', async () => {
    const appState = createAppState();
    appState.loadDatabase(dbWithPlace(), 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('lensFocus', '@I1@');

    render(MapLensView, { props: { appState, viewState } });
    await fireEvent.click(screen.getByRole('tab', { name: 'Personen' }));

    expect(screen.getByText(/Anna Bauer/)).toBeTruthy();
  });

  it('öffnet den Personen-Picker und wählt eine andere Person aus, ohne den geteilten Fokus zu verändern', async () => {
    const appState = createAppState();
    const db = dbWithPlace();
    db.individuals.set('@I2@', makePerson('@I2@', { given: 'Otto', surname: 'Müller' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('lensFocus', '@I1@');

    render(MapLensView, { props: { appState, viewState } });
    await fireEvent.click(screen.getByRole('tab', { name: 'Personen' }));
    await fireEvent.click(screen.getByText(/Anna Bauer/));

    await fireEvent.click(screen.getByRole('button', { name: /Otto Müller/ }));

    expect(screen.getByText(/Otto Müller/)).toBeTruthy();
    // Der geteilte Baum-/Lens-Fokus bleibt unverändert — der Picker ist ein rein
    // lokaler Auswahlzustand dieser Ansicht (Orakel: _mapPersonId getrennt von
    // AppState.currentPersonId).
    expect(viewState.getCurrent('lensFocus')).toBe('@I1@');
  });
});

describe('MapLensView — Orte-Modus-Fokus (ADR-v9-78 Punkt 4, Spec 20 §1.9 "Lücke 2")', () => {
  afterEach(() => setOnline(true));

  it('konsumiert den geteilten ViewState-Slot "lensPlaceFocus" beim Mount im Orte-Modus (mountet ohne Crash)', () => {
    const appState = createAppState();
    appState.loadDatabase(dbWithPlace(), 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('lensPlaceFocus', 'P1');

    const { container } = render(MapLensView, { props: { appState, viewState } });

    expect(screen.getByRole('tab', { name: 'Orte' }).getAttribute('aria-current')).toBe('page');
    expect(container.querySelector('.map-lens-view__host')).toBeTruthy();
  });

  it('setzt "lensPlaceFocus" nach dem Lesen sofort auf null zurück (kein Dauerzustand wie lensFocus)', () => {
    const appState = createAppState();
    appState.loadDatabase(dbWithPlace(), 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('lensPlaceFocus', 'P1');

    render(MapLensView, { props: { appState, viewState } });

    expect(viewState.getCurrent('lensPlaceFocus')).toBeNull();
  });

  it('lässt "lensFocus" (Personen-Fokus) unverändert, wenn nur "lensPlaceFocus" gesetzt ist (zwei unabhängige Slots)', () => {
    const appState = createAppState();
    appState.loadDatabase(dbWithPlace(), 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('lensFocus', '@I1@');
    viewState.setCurrent('lensPlaceFocus', 'P1');

    render(MapLensView, { props: { appState, viewState } });

    expect(viewState.getCurrent('lensFocus')).toBe('@I1@');
    expect(viewState.getCurrent('lensPlaceFocus')).toBeNull();
  });

  it('ohne gesetzten "lensPlaceFocus" mountet der Orte-Modus wie bisher, ohne Crash', () => {
    const appState = createAppState();
    appState.loadDatabase(dbWithPlace(), 'test.ged');
    const viewState = createViewState();

    const { container } = render(MapLensView, { props: { appState, viewState } });

    expect(container.querySelector('.map-lens-view__host')).toBeTruthy();
    expect(viewState.getCurrent('lensPlaceFocus')).toBeNull();
  });

  it('eine unbekannte "lensPlaceFocus"-ID (kein passender Ort/Hof) crasht nicht und wird trotzdem konsumiert', () => {
    const appState = createAppState();
    appState.loadDatabase(dbWithPlace(), 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('lensPlaceFocus', 'UNBEKANNTE-ID');

    const { container } = render(MapLensView, { props: { appState, viewState } });

    expect(container.querySelector('.map-lens-view__host')).toBeTruthy();
    expect(viewState.getCurrent('lensPlaceFocus')).toBeNull();
  });

  it('TST-7: mountet ohne Crash, wenn viele dicht beieinanderliegende Orte/Höfe UND ein Fokus gleichzeitig vorliegen', () => {
    const appState = createAppState();
    const db = dbWithPlace();
    for (let i = 0; i < 40; i++) {
      savePlaceObject(db.placeObjects, {
        id: `PX${i}`,
        title: `Dorf ${i}`,
        type: 'Village',
        pnames: [],
        enclosedBy: [],
        lat: 51.0 + i * 0.001,
        long: 10.0 + i * 0.001,
        note: '',
        existsFrom: null,
        existsTo: null,
        govId: null,
        govTypes: null,
      });
    }
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('lensPlaceFocus', 'PX23');

    const { container } = render(MapLensView, { props: { appState, viewState } });

    expect(container.querySelector('.map-lens-view__host')).toBeTruthy();
    expect(viewState.getCurrent('lensPlaceFocus')).toBeNull();
  });
});

describe('MapLensView — Roh-Koordinaten-Fokus (ADR-v9-78-Nachtrag: Event-Koordinaten sind oft präziser als Orts-Koordinaten)', () => {
  afterEach(() => setOnline(true));

  it('konsumiert "mapCoordFocus" beim Mount im Orte-Modus, auch OHNE passenden Ort/Hof (Ad-hoc-Marker statt kuratiertem Marker)', () => {
    const appState = createAppState();
    appState.loadDatabase(dbWithPlace(), 'test.ged');
    const viewState = createViewState();
    viewState.setMapCoordFocus({ lat: 52.28, long: 7.43 });

    const { container } = render(MapLensView, { props: { appState, viewState } });

    expect(container.querySelector('.map-lens-view__host')).toBeTruthy();
  });

  it('setzt "mapCoordFocus" nach dem Lesen sofort auf null zurück (gleiches Einmal-Konsum-Muster wie lensPlaceFocus)', () => {
    const appState = createAppState();
    appState.loadDatabase(dbWithPlace(), 'test.ged');
    const viewState = createViewState();
    viewState.setMapCoordFocus({ lat: 52.28, long: 7.43 });

    render(MapLensView, { props: { appState, viewState } });

    expect(viewState.getMapCoordFocus()).toBeNull();
  });

  it('"mapCoordFocus" UND "lensPlaceFocus" können gleichzeitig gesetzt sein (CoordIndicator setzt beide, wenn ein kuratierter Marker existiert) — beide werden konsumiert', () => {
    const appState = createAppState();
    appState.loadDatabase(dbWithPlace(), 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('lensPlaceFocus', 'P1');
    viewState.setMapCoordFocus({ lat: 52.28, long: 7.43 });

    const { container } = render(MapLensView, { props: { appState, viewState } });

    expect(container.querySelector('.map-lens-view__host')).toBeTruthy();
    expect(viewState.getCurrent('lensPlaceFocus')).toBeNull();
    expect(viewState.getMapCoordFocus()).toBeNull();
  });

  it('ohne gesetztes "mapCoordFocus" mountet der Orte-Modus wie bisher, ohne Crash', () => {
    const appState = createAppState();
    appState.loadDatabase(dbWithPlace(), 'test.ged');
    const viewState = createViewState();

    const { container } = render(MapLensView, { props: { appState, viewState } });

    expect(container.querySelector('.map-lens-view__host')).toBeTruthy();
    expect(viewState.getMapCoordFocus()).toBeNull();
  });
});

describe('MapLensView — Offline-Fallback (ADR-v9-25)', () => {
  afterEach(() => setOnline(true));

  it('zeigt den Offline-Hinweis-Banner, wenn navigator.onLine=false beim Mount ist', () => {
    setOnline(false);

    render(MapLensView, { props: { appState: createAppState(), viewState: createViewState() } });

    expect(screen.getByRole('status').textContent).toMatch(/Offline/);
  });

  it('zeigt KEINEN Offline-Banner, wenn online', () => {
    setOnline(true);

    render(MapLensView, { props: { appState: createAppState(), viewState: createViewState() } });

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('mountet trotz Offline-Fallback den Karten-Host, ohne zu crashen (SVG-Weltumriss)', () => {
    setOnline(false);
    const appState = createAppState();
    appState.loadDatabase(dbWithPlace(), 'test.ged');

    const { container } = render(MapLensView, { props: { appState, viewState: createViewState() } });

    expect(container.querySelector('.map-fallback')).toBeTruthy();
    expect(container.querySelector('.map-fallback__svg')).toBeTruthy();
  });
});
