// @vitest-environment happy-dom
// tests/ui/MapLensView.component.test.ts — Karten-Lens (Spec 21 §4, Spec 20 §1.9 [S],
// ADR-v9-25). Deckt: Lens-/Fokus-Verdrahtung (Precedent aus dem vorherigen Bau-Durchgang),
// Modus-Umschalter, Personen-Picker-Default = lensFocus, Offline-Fallback-Anzeige.
// Die Layout-/Marker-Berechnung selbst ist in tests/islands/map-model.test.ts abgedeckt
// (Spec 32 §2: Inseln werden über ihre Layout-Berechnung getestet, nicht über Pixel).
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import MapLensView from '../../ui/views/map/MapLensView.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { createRoute } from '../../ui/shell/route.svelte';
import { makeDatabase, makeEvent, makePerson } from '../../core/model';
import { savePlaceObject } from '../../core/places';
// Geteilte Datenfabrik statt Inline-Literal (TST-REUSE, s. app-state.test.ts).
import { place } from '../core/places-fixtures';
import { pinLayout } from './layout-harness';
import { layout } from '../../ui/shell/layout.svelte';

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

function dbWithPlace(): ReturnType<typeof makeDatabase> {
  const db = makeDatabase();
  savePlaceObject(db.placeObjects, place('P1', { title: 'Musterdorf', type: 'Village', lat: 51.5, long: 10.0 }));
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

// Formfaktor explizit auf MOBIL: diese Datei prüft den Lens-Umschalter bzw. das
// Hub-Menü — beides ist laut Spec 21 §4/§2 das mobile Gegenstück zur Sidebar und
// entfällt oberhalb der Layout-Grenze (INV-UI-2/3). Ohne Festlegung liefe die Datei im
// happy-dom-Standard von 1024px, also im Desktop-Modell. S. layout-harness.ts.
let unpin: () => void;
beforeEach(() => {
  unpin = pinLayout(false);
});
afterEach(() => {
  unpin();
  layout.reset();
});

describe('MapLensView — Lens-/Fokus-Verdrahtung (INV-UI-3, Spec 21 §4)', () => {
  afterEach(() => setOnline(true));

  it('bindet den EINEN Lens-Umschalter mit "Karte" als aktiver Lens ein', () => {
    render(MapLensView, { props: { appState: createAppState(), viewState: createViewState(), route: createRoute() } });

    const mapTab = screen.getByRole('tab', { name: /Karte/ });
    expect(mapTab.getAttribute('aria-current')).toBe('page');
  });

  it('Klick auf "Baum" im eingebetteten Umschalter ruft onNavigateLens mit "tree" auf', async () => {
    const onNavigateLens = vi.fn();
    render(MapLensView, {
      props: { appState: createAppState(), viewState: createViewState(), route: createRoute(), onNavigateLens },
    });

    await fireEvent.click(screen.getByRole('tab', { name: /Baum/ }));

    expect(onNavigateLens).toHaveBeenCalledWith('tree');
  });

  it('zeigt KEINE redundante Titel-Zeile über dem Umschalter (Befund: doppeltes "Karte")', () => {
    const { container } = render(MapLensView, {
      props: { appState: createAppState(), viewState: createViewState(), route: createRoute() },
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
      props: { appState: createAppState(), viewState: createViewState(), route: createRoute() },
    });

    const orteTab = screen.getByRole('tab', { name: 'Orte' });
    expect(orteTab.getAttribute('aria-current')).toBe('page');
    expect(container.querySelector('.map-lens-view__host')).toBeTruthy();
  });

  it('Klick auf "Personen" wechselt den Modus und zeigt den Personen-Picker-Button', async () => {
    render(MapLensView, { props: { appState: createAppState(), viewState: createViewState(), route: createRoute() } });

    await fireEvent.click(screen.getByRole('tab', { name: 'Personen' }));

    expect(screen.getByRole('tab', { name: 'Personen' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByPlaceholderText(/Person wählen/)).toBeTruthy();
  });

  it('Klick auf "Migrationen" wechselt den Modus und zeigt die Epochen-Legende', async () => {
    render(MapLensView, { props: { appState: createAppState(), viewState: createViewState(), route: createRoute() } });

    await fireEvent.click(screen.getByRole('tab', { name: 'Migrationen' }));

    expect(screen.getByRole('tab', { name: 'Migrationen' }).getAttribute('aria-current')).toBe('page');
    for (const label of ['vor 1700', '1950+']) {
      expect(screen.getByText(new RegExp(label))).toBeTruthy();
    }
  });

  it('zeigt Animations-Regler (Geschwindigkeit/Loop) nur im Personen-/Migrations-Modus', async () => {
    render(MapLensView, { props: { appState: createAppState(), viewState: createViewState(), route: createRoute() } });

    expect(screen.queryByText(/Loop/)).toBeNull();

    await fireEvent.click(screen.getByRole('tab', { name: 'Migrationen' }));
    expect(screen.getByText(/Loop/)).toBeTruthy();
  });

  it('Geschwindigkeits-Select reagiert auf Auswahl (value/onchange-Muster, kein bind:value; numerische Option)', async () => {
    render(MapLensView, { props: { appState: createAppState(), viewState: createViewState(), route: createRoute() } });
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

    render(MapLensView, { props: { appState, viewState, route: createRoute() } });
    await fireEvent.click(screen.getByRole('tab', { name: 'Personen' }));

    expect((screen.getByRole('combobox', { name: 'Person für Karte wählen' }) as HTMLInputElement).value).toMatch(/Anna Bauer/);
  });

  it('öffnet den Personen-Picker und wählt eine andere Person aus, ohne den geteilten Fokus zu verändern', async () => {
    const appState = createAppState();
    const db = dbWithPlace();
    db.individuals.set('@I2@', makePerson('@I2@', { given: 'Otto', surname: 'Müller' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('lensFocus', '@I1@');

    render(MapLensView, { props: { appState, viewState, route: createRoute() } });
    await fireEvent.click(screen.getByRole('tab', { name: 'Personen' }));
    await fireEvent.click(screen.getByRole('combobox', { name: 'Person für Karte wählen' }));

    await fireEvent.click(screen.getByRole('option', { name: /Otto Müller/ }));

    expect((screen.getByRole('combobox', { name: 'Person für Karte wählen' }) as HTMLInputElement).value).toMatch(/Otto Müller/);
    // Der geteilte Baum-/Lens-Fokus bleibt unverändert — der Picker ist ein rein
    // lokaler Auswahlzustand dieser Ansicht (Orakel: _mapPersonId getrennt von
    // AppState.currentPersonId).
    expect(viewState.getCurrent('lensFocus')).toBe('@I1@');
  });
});

describe('MapLensView — eigene, navigationsfeste Personenauswahl (ADR-v9-102)', () => {
  afterEach(() => setOnline(true));

  it('belegt aus "lensFocus" nur vor, solange die Karte noch KEINE eigene Auswahl hat', async () => {
    const appState = createAppState();
    const db = dbWithPlace();
    db.individuals.set('@I2@', makePerson('@I2@', { given: 'Otto', surname: 'Müller' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    // Eigene Auswahl aus einem früheren Besuch — ein abweichender Baum-Fokus darf sie
    // NICHT überschreiben (Nutzer-Entscheidung 2026-07-19).
    viewState.setCurrent('mapPerson', '@I2@');
    viewState.setCurrent('lensFocus', '@I1@');

    render(MapLensView, { props: { appState, viewState, route: createRoute() } });
    await fireEvent.click(screen.getByRole('tab', { name: 'Personen' }));

    expect((screen.getByRole('combobox', { name: 'Person für Karte wählen' }) as HTMLInputElement).value).toMatch(/Otto Müller/);
    expect((screen.getByRole('combobox', { name: 'Person für Karte wählen' }) as HTMLInputElement).value).not.toMatch(/Anna Bauer/);
  });

  it('überlebt das Wegnavigieren: die Auswahl liegt im ViewState, nicht in der Komponente', async () => {
    const appState = createAppState();
    const db = dbWithPlace();
    db.individuals.set('@I2@', makePerson('@I2@', { given: 'Otto', surname: 'Müller' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('lensFocus', '@I1@');

    const first = render(MapLensView, { props: { appState, viewState, route: createRoute() } });
    await fireEvent.click(screen.getByRole('tab', { name: 'Personen' }));
    await fireEvent.click(screen.getByRole('combobox', { name: 'Person für Karte wählen' }));
    await fireEvent.click(screen.getByRole('option', { name: /Otto Müller/ }));
    // Wegnavigieren = Unmount (App.svelte rendert die Ziele über `{:else if}`).
    first.unmount();

    render(MapLensView, { props: { appState, viewState, route: createRoute() } });
    await fireEvent.click(screen.getByRole('tab', { name: 'Personen' }));

    expect((screen.getByRole('combobox', { name: 'Person für Karte wählen' }) as HTMLInputElement).value).toMatch(/Otto Müller/);
  });
});

describe('MapLensView — der Anzeige-Modus überlebt das Wegnavigieren (ADR-v9-102)', () => {
  afterEach(() => setOnline(true));

  it('kommt im zuletzt gewählten Modus zurück, nicht auf "Orte"', async () => {
    const appState = createAppState();
    appState.loadDatabase(dbWithPlace(), 'test.ged');
    const viewState = createViewState();
    const route = createRoute();

    const first = render(MapLensView, { props: { appState, viewState, route } });
    await fireEvent.click(screen.getByRole('tab', { name: 'Migrationen' }));
    // Wegnavigieren = Unmount (App.svelte rendert die Ziele über `{:else if}`).
    first.unmount();

    render(MapLensView, { props: { appState, viewState, route } });

    expect(screen.getByRole('tab', { name: 'Migrationen' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('tab', { name: 'Orte' }).getAttribute('aria-current')).toBeNull();
  });
});

describe('MapLensView — Orte-Modus-Fokus (ADR-v9-78 Punkt 4, Spec 20 §1.9 "Lücke 2")', () => {
  afterEach(() => setOnline(true));

  it('konsumiert den geteilten ViewState-Slot "lensPlaceFocus" beim Mount im Orte-Modus (mountet ohne Crash)', () => {
    const appState = createAppState();
    appState.loadDatabase(dbWithPlace(), 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('lensPlaceFocus', 'P1');

    const { container } = render(MapLensView, { props: { appState, viewState, route: createRoute() } });

    expect(screen.getByRole('tab', { name: 'Orte' }).getAttribute('aria-current')).toBe('page');
    expect(container.querySelector('.map-lens-view__host')).toBeTruthy();
  });

  it('setzt "lensPlaceFocus" nach dem Lesen sofort auf null zurück (kein Dauerzustand wie lensFocus)', () => {
    const appState = createAppState();
    appState.loadDatabase(dbWithPlace(), 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('lensPlaceFocus', 'P1');

    render(MapLensView, { props: { appState, viewState, route: createRoute() } });

    expect(viewState.getCurrent('lensPlaceFocus')).toBeNull();
  });

  it('lässt "lensFocus" (Personen-Fokus) unverändert, wenn nur "lensPlaceFocus" gesetzt ist (zwei unabhängige Slots)', () => {
    const appState = createAppState();
    appState.loadDatabase(dbWithPlace(), 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('lensFocus', '@I1@');
    viewState.setCurrent('lensPlaceFocus', 'P1');

    render(MapLensView, { props: { appState, viewState, route: createRoute() } });

    expect(viewState.getCurrent('lensFocus')).toBe('@I1@');
    expect(viewState.getCurrent('lensPlaceFocus')).toBeNull();
  });

  it('ohne gesetzten "lensPlaceFocus" mountet der Orte-Modus wie bisher, ohne Crash', () => {
    const appState = createAppState();
    appState.loadDatabase(dbWithPlace(), 'test.ged');
    const viewState = createViewState();

    const { container } = render(MapLensView, { props: { appState, viewState, route: createRoute() } });

    expect(container.querySelector('.map-lens-view__host')).toBeTruthy();
    expect(viewState.getCurrent('lensPlaceFocus')).toBeNull();
  });

  it('eine unbekannte "lensPlaceFocus"-ID (kein passender Ort/Hof) crasht nicht und wird trotzdem konsumiert', () => {
    const appState = createAppState();
    appState.loadDatabase(dbWithPlace(), 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('lensPlaceFocus', 'UNBEKANNTE-ID');

    const { container } = render(MapLensView, { props: { appState, viewState, route: createRoute() } });

    expect(container.querySelector('.map-lens-view__host')).toBeTruthy();
    expect(viewState.getCurrent('lensPlaceFocus')).toBeNull();
  });

  it('TST-7: mountet ohne Crash, wenn viele dicht beieinanderliegende Orte/Höfe UND ein Fokus gleichzeitig vorliegen', () => {
    const appState = createAppState();
    const db = dbWithPlace();
    for (let i = 0; i < 40; i++) {
      savePlaceObject(
        db.placeObjects,
        place(`PX${i}`, {
          title: `Dorf ${i}`,
          type: 'Village',
          lat: 51.0 + i * 0.001,
          long: 10.0 + i * 0.001,
        }),
      );
    }
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('lensPlaceFocus', 'PX23');

    const { container } = render(MapLensView, { props: { appState, viewState, route: createRoute() } });

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

    const { container } = render(MapLensView, { props: { appState, viewState, route: createRoute() } });

    expect(container.querySelector('.map-lens-view__host')).toBeTruthy();
  });

  it('setzt "mapCoordFocus" nach dem Lesen sofort auf null zurück (gleiches Einmal-Konsum-Muster wie lensPlaceFocus)', () => {
    const appState = createAppState();
    appState.loadDatabase(dbWithPlace(), 'test.ged');
    const viewState = createViewState();
    viewState.setMapCoordFocus({ lat: 52.28, long: 7.43 });

    render(MapLensView, { props: { appState, viewState, route: createRoute() } });

    expect(viewState.getMapCoordFocus()).toBeNull();
  });

  it('"mapCoordFocus" UND "lensPlaceFocus" können gleichzeitig gesetzt sein (CoordIndicator setzt beide, wenn ein kuratierter Marker existiert) — beide werden konsumiert', () => {
    const appState = createAppState();
    appState.loadDatabase(dbWithPlace(), 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('lensPlaceFocus', 'P1');
    viewState.setMapCoordFocus({ lat: 52.28, long: 7.43 });

    const { container } = render(MapLensView, { props: { appState, viewState, route: createRoute() } });

    expect(container.querySelector('.map-lens-view__host')).toBeTruthy();
    expect(viewState.getCurrent('lensPlaceFocus')).toBeNull();
    expect(viewState.getMapCoordFocus()).toBeNull();
  });

  it('ohne gesetztes "mapCoordFocus" mountet der Orte-Modus wie bisher, ohne Crash', () => {
    const appState = createAppState();
    appState.loadDatabase(dbWithPlace(), 'test.ged');
    const viewState = createViewState();

    const { container } = render(MapLensView, { props: { appState, viewState, route: createRoute() } });

    expect(container.querySelector('.map-lens-view__host')).toBeTruthy();
    expect(viewState.getMapCoordFocus()).toBeNull();
  });
});

describe('MapLensView — Offline-Fallback (ADR-v9-25)', () => {
  afterEach(() => setOnline(true));

  it('zeigt den Offline-Hinweis-Banner, wenn navigator.onLine=false beim Mount ist', () => {
    setOnline(false);

    render(MapLensView, { props: { appState: createAppState(), viewState: createViewState(), route: createRoute() } });

    expect(screen.getByRole('status').textContent).toMatch(/Offline/);
  });

  it('zeigt KEINEN Offline-Banner, wenn online', () => {
    setOnline(true);

    render(MapLensView, { props: { appState: createAppState(), viewState: createViewState(), route: createRoute() } });

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('mountet trotz Offline-Fallback den Karten-Host, ohne zu crashen (SVG-Weltumriss)', () => {
    setOnline(false);
    const appState = createAppState();
    appState.loadDatabase(dbWithPlace(), 'test.ged');

    const { container } = render(MapLensView, { props: { appState, viewState: createViewState(), route: createRoute() } });

    expect(container.querySelector('.map-fallback')).toBeTruthy();
    expect(container.querySelector('.map-fallback__svg')).toBeTruthy();
  });
});

// BL-210: `onSelectPlace` war in BEIDEN Rendering-Pfaden als `() => {}` verdrahtet — der
// Callback existierte, tat aber nichts. Geprüft wird hier der SVG-Fallback-Pfad, weil
// Leaflet unter happy-dom nicht sinnvoll rendert; die Offline-Parität ist damit zugleich
// belegt (dieselbe Anforderung wie beim Fokus-Sprung, ADR-v9-78).
describe('MapLensView — Marker-Klick öffnet das Explorationspanel (BL-210)', () => {
  afterEach(() => setOnline(true));

  it('Klick auf einen Ortsmarker zeigt die Personen an diesem Ort', async () => {
    setOnline(false);
    const appState = createAppState();
    appState.loadDatabase(dbWithPlace(), 'test.ged');

    const { container } = render(MapLensView, {
      props: { appState, viewState: createViewState(), route: createRoute() },
    });

    expect(container.querySelector('.map-explore')).toBeNull();
    const marker = container.querySelector('.map-fallback__marker');
    expect(marker).toBeTruthy();
    await fireEvent.click(marker!);

    expect(container.querySelector('.map-explore')).toBeTruthy();
    expect(screen.getByText('Anna Bauer')).toBeTruthy();
  });

  it('ein Moduswechsel schließt das Panel (es gehört zum Orte-Modus)', async () => {
    setOnline(false);
    const appState = createAppState();
    appState.loadDatabase(dbWithPlace(), 'test.ged');

    const { container } = render(MapLensView, {
      props: { appState, viewState: createViewState(), route: createRoute() },
    });
    await fireEvent.click(container.querySelector('.map-fallback__marker')!);
    expect(container.querySelector('.map-explore')).toBeTruthy();

    await fireEvent.click(screen.getByRole('tab', { name: 'Personen' }));
    expect(container.querySelector('.map-explore')).toBeNull();
  });
});

describe('MapLensView — der Leerzustand benennt seinen Grund (BL-310)', () => {
  afterEach(() => setOnline(true));

  /** Bestand MIT Orten, aber OHNE Koordinaten — der Zustand direkt nach dem Import
   *  (Village-Seed, ADR-v9-28). Genau die Lage, in der die Karte bis BL-310 schwieg:
   *  eine leere Weltkarte, 0 Marker, 0 erklärende Zeichen. TST-16 in Reinform — nicht
   *  das naheliegende kuratierte Beispiel, sondern das unangereicherte. */
  function dbUnangereichert(): ReturnType<typeof makeDatabase> {
    const db = makeDatabase();
    savePlaceObject(db.placeObjects, place('P1', { title: 'Ochtrup', type: 'Village' }));
    savePlaceObject(db.placeObjects, place('P2', { title: 'Vreden', type: 'Village' }));
    return db;
  }

  it('sagt nichts, solange Marker da sind', () => {
    setOnline(false);
    const appState = createAppState();
    appState.loadDatabase(dbWithPlace(), 'test.ged');

    const { container } = render(MapLensView, {
      props: { appState, viewState: createViewState(), route: createRoute() },
    });

    expect(container.querySelector('.map-lens-view__empty')).toBeNull();
  });

  it('nennt bei unangereicherten Orten die Zahl statt nur „leer"', () => {
    setOnline(false);
    const appState = createAppState();
    appState.loadDatabase(dbUnangereichert(), 'test.ged');

    const { container } = render(MapLensView, {
      props: { appState, viewState: createViewState(), route: createRoute() },
    });

    // Zwei Vorbedingungen, ohne die der Test die falsche Lage prüfte: es rendert
    // wirklich der SVG-FALLBACK (nicht Leaflet), und er hat wirklich keinen Marker.
    // Damit belegt diese Datei den zweiten Rendering-Pfad — der Leaflet-Pfad ist am
    // laufenden Programm verifiziert. Beide, wie die Backlog-Zeile es verlangt.
    expect(container.querySelector('.map-fallback')).toBeTruthy();
    expect(container.querySelectorAll('.map-fallback__marker').length).toBe(0);
    expect(screen.getByText(/2 Orte erfasst, keiner davon mit Koordinaten\./)).toBeTruthy();
  });

  it('führt auf den vorhandenen Batch-Geocoder statt einen zweiten zu bauen', async () => {
    setOnline(false);
    const onOpenPlaceList = vi.fn();
    const appState = createAppState();
    appState.loadDatabase(dbUnangereichert(), 'test.ged');

    render(MapLensView, {
      props: { appState, viewState: createViewState(), route: createRoute(), onOpenPlaceList },
    });

    await fireEvent.click(screen.getByRole('button', { name: /Orte-Tab/ }));
    expect(onOpenPlaceList).toHaveBeenCalledTimes(1);
  });

  it('bietet ohne einen einzigen Ort KEINEN Geocoding-Weg an — er führte ins Leere', () => {
    setOnline(false);
    const appState = createAppState();
    appState.loadDatabase(makeDatabase(), 'test.ged');

    const { container } = render(MapLensView, {
      props: { appState, viewState: createViewState(), route: createRoute(), onOpenPlaceList: vi.fn() },
    });

    expect(container.querySelector('.map-lens-view__empty')).toBeTruthy();
    expect(screen.getByText(/Noch keine Orte im Bestand\./)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Orte-Tab/ })).toBeNull();
  });

  it('gilt im Migrations-Modus genauso — der Nachbar, der vorher mitschwieg', async () => {
    setOnline(false);
    const appState = createAppState();
    appState.loadDatabase(dbUnangereichert(), 'test.ged');

    render(MapLensView, {
      props: { appState, viewState: createViewState(), route: createRoute() },
    });
    await fireEvent.click(screen.getByRole('tab', { name: 'Migrationen' }));

    expect(screen.getByText(/Keine Wanderungen darstellbar\./)).toBeTruthy();
  });

  it('der Personen-Satz kommt aus demselben Mechanismus, nicht mehr aus der Zeile im Picker', async () => {
    setOnline(false);
    const appState = createAppState();
    appState.loadDatabase(dbUnangereichert(), 'test.ged');
    const viewState = createViewState();

    const { container } = render(MapLensView, {
      props: { appState, viewState, route: createRoute() },
    });
    await fireEvent.click(screen.getByRole('tab', { name: 'Personen' }));
    viewState.setCurrent('mapPerson', '@I1@');
    await Promise.resolve();

    // Der Satz steht jetzt auf der Kartenfläche, nicht mehr in der Picker-Zeile.
    const zeile = container.querySelector('.map-lens-view__person-row');
    expect(zeile?.textContent).not.toMatch(/Keine Koordinaten/);
  });
});
