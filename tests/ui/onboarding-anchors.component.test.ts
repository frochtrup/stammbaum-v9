// @vitest-environment happy-dom
// tests/ui/onboarding-anchors.component.test.ts — DER Wächter des Erstnutzer-Rundgangs
// (BL-213, ADR-v9-190).
//
// WARUM ER EXISTIERT: v8s Rundgang zeigte auf vier fest verdrahtete Element-Ids
// (`ui-onboarding.js`). Zwei davon (`bnav-tree`, das ☰-Menü) gibt es in v9 nicht mehr —
// und nichts hätte das gemeldet: ein Spotlight auf ein fehlendes Element fällt still auf
// „kein Loch" zurück und sieht aus wie eine harmlose Karte. Genau diese Sorte stiller
// Drift benennt Altlast §10 („Doku und Code driften: bnav-search vs. bnav-tasks").
//
// Der Rundgang koppelt in v9 nur noch über `data-tour="…"`. Dieser Test hält fest, dass
// jeder Anker im ECHTEN, gemounteten UI vorkommt — wer eine Fläche umbaut und das
// Attribut mitnimmt, merkt es hier statt beim nächsten Erstnutzer.
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import App from '../../app/App.svelte';
import { FileService } from '../../services/file/file-service';
import { createMockAdapterSet } from '../services/mock-adapters';
import { PlacesSyncService } from '../../services/places';
import { createPlacesPersister } from '../../ui/shell/places-persister';
import { createMockPlacesStore, createMockDeviceId, createMockClock } from '../services/mock-places-store';
import { layoutEnvFor } from './layout-harness';
import { layout } from '../../ui/shell/layout.svelte';
import { tourSteps } from '../../ui/shell/onboarding-model';
import { DEMO_FILE_NAME } from '../../ui/shell/onboarding-state.svelte';
import type { TourStore } from '../../services/app-data';

function mockPersister() {
  return createPlacesPersister(
    new PlacesSyncService(createMockPlacesStore(null), createMockDeviceId('device-1'), createMockClock(1000)),
  );
}

const MINI_GED = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 5.5.1',
  '2 FORM LINEAGE-LINKED',
  '1 CHAR UTF-8',
  '0 @I1@ INDI',
  '1 NAME Max /Muster/',
  '0 TRLR',
  '',
].join('\n');

/** Merker-Attrappe: `done` steuert den Startzustand, `markDone` wird beobachtet. */
function mockTourStore(done = false) {
  const calls: string[] = [];
  const store: TourStore = {
    isDone: async () => done,
    markDone: async () => {
      calls.push('markDone');
    },
  };
  return { store, calls };
}

/** Mountet die App mobil mit GELADENEM Demo-Bestand — der Zustand, in dem der Rundgang
 *  laufen soll (ADR-v9-190: Auslöser ist der Zustand, nicht der Klick auf „Demo laden"). */
function renderMitDemo(opts: { tourDone?: boolean; desktop?: boolean } = {}) {
  const { adapters } = createMockAdapterSet({
    initialWorkingCopy: { text: MINI_GED, name: DEMO_FILE_NAME },
  });
  const tour = mockTourStore(opts.tourDone ?? false);
  render(App, {
    props: {
      fileService: new FileService(adapters),
      persister: mockPersister(),
      tourStore: tour.store,
      layoutEnv: layoutEnvFor(opts.desktop ?? false),
    },
  });
  return tour;
}

afterEach(() => layout.reset());

describe('Rundgang — jeder Anker existiert im echten UI', () => {
  it('findet zu JEDEM Schritt ein Element mit dem passenden data-tour', async () => {
    renderMitDemo();
    await waitFor(() => expect(screen.getByText('Schritt 1 von 4')).toBeTruthy());

    for (const step of tourSteps()) {
      const el = document.querySelector(`[data-tour="${step.anchor}"]`);
      expect(el, `kein Element mit data-tour="${step.anchor}" — Rundgang zeigt ins Leere`).toBeTruthy();
    }
  });
});

describe('Rundgang — Ablauf', () => {
  it('läuft in vier Schritten und meldet erst am Ende „gesehen"', async () => {
    const tour = renderMitDemo();
    await waitFor(() => expect(screen.getByText('Schritt 1 von 4')).toBeTruthy());

    await fireEvent.click(screen.getByRole('button', { name: 'Weiter →' }));
    expect(screen.getByText('Schritt 2 von 4')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Weiter →' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Weiter →' }));
    expect(screen.getByText('Schritt 4 von 4')).toBeTruthy();
    // Bis hierher darf nichts gespeichert sein — wer mittendrin die App schließt, soll
    // den Rundgang wiedersehen.
    expect(tour.calls).toEqual([]);

    await fireEvent.click(screen.getByRole('button', { name: 'Fertig ✓' }));
    await waitFor(() => expect(screen.queryByText(/Schritt \d von 4/)).toBeNull());
    expect(tour.calls).toEqual(['markDone']);
  });

  it('beendet über „Überspringen" — ein Abbruch ist kein halber Rundgang', async () => {
    const tour = renderMitDemo();
    await waitFor(() => expect(screen.getByText('Schritt 1 von 4')).toBeTruthy());

    await fireEvent.click(screen.getByRole('button', { name: 'Überspringen' }));
    await waitFor(() => expect(screen.queryByText(/Schritt \d von 4/)).toBeNull());
    expect(tour.calls).toEqual(['markDone']);
  });

  it('beendet über Escape (LP-8: ein Overlay, das nicht schließt, ist die Falle)', async () => {
    const tour = renderMitDemo();
    await waitFor(() => expect(screen.getByText('Schritt 1 von 4')).toBeTruthy());

    await fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText(/Schritt \d von 4/)).toBeNull());
    expect(tour.calls).toEqual(['markDone']);
  });
});

describe('Rundgang — wann er NICHT läuft', () => {
  it('nicht, wenn der Merker ihn als gesehen führt', async () => {
    renderMitDemo({ tourDone: true });
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Hauptnavigation' })).toBeTruthy());
    expect(screen.queryByText(/Schritt \d von 4/)).toBeNull();
  });

  it('nicht auf Desktop — dort beschriftet die Sidebar dieselben Ziele dauerhaft', async () => {
    renderMitDemo({ desktop: true });
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Hauptnavigation' })).toBeTruthy());
    expect(screen.queryByText(/Schritt \d von 4/)).toBeNull();
  });

  it('nicht ohne Demo-Bestand — eine echte Datei braucht keinen Demo-Rundgang', async () => {
    const { adapters } = createMockAdapterSet({
      initialWorkingCopy: { text: MINI_GED, name: 'meine-daten.ged' },
    });
    render(App, {
      props: {
        fileService: new FileService(adapters),
        persister: mockPersister(),
        tourStore: mockTourStore(false).store,
        layoutEnv: layoutEnvFor(false),
      },
    });
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Hauptnavigation' })).toBeTruthy());
    expect(screen.queryByText(/Schritt \d von 4/)).toBeNull();
  });
});
