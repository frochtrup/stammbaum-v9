// @vitest-environment happy-dom
// tests/ui/MoreView.component.test.ts — "Mehr"-Hub (Spec 21 §2: "Mehr = Hub für die
// Lenses (Karte / Zeitleiste / Statistik / Story) + Ausgaben + Einstellungen").
// "Statistik" ist echt verdrahtet (Spec 20 §4) und zeigt StatisticsView statt eines
// Platzhalters. "Karte" UND "Zeitleiste" haben jetzt ebenfalls echten Inhalt
// (ADR-v9-25 / Spec 20 §1.10) — GENAU EIN kanonischer Weg dorthin je Lens (INV-UI-2):
// beide Hub-Einträge sind KEIN Menü-Sub-Eintrag mehr, sondern setzen sofort das
// Routen-Ziel, das auch der Lens-Umschalter setzt. Story/Ausgaben/Einstellungen bleiben
// Platzhalter — eigene, spätere Bauabschnitte.
//
// Seit BL-90 hält der Hub KEINEN eigenen Unter-Zustand mehr (vormals `openEntry`):
// welcher Eintrag offen ist, steht in der einen Routen-Quelle (INV-UI-15, ADR-v9-101).
// Deshalb bekommt jeder Render hier eine echte Route-Instanz statt eines Callback-Spions
// — dieselbe Instanz, die in der App auch die Bottom-Nav-Markierung speist.
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import MoreView from '../../ui/views/more/MoreView.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createRoute } from '../../ui/shell/route.svelte';
import { createPlacesPersister } from '../../ui/shell/places-persister';
import { FileService } from '../../services/file/file-service';
import { PlacesSyncService } from '../../services/places';
import { createMockAdapterSet } from '../services/mock-adapters';
import {
  createMockClock,
  createMockDeviceId,
  createMockPlacesFileHandleStore,
  createMockPlacesStore,
} from '../services/mock-places-store';

describe('MoreView — Hub für Lenses + Ausgaben + Einstellungen', () => {
  it('zeigt alle sechs Menüeinträge (vier Lenses + Ausgaben + Einstellungen)', () => {
    const route = createRoute({ target: 'more' });
    render(MoreView, { props: { appState: createAppState(), route } });

    for (const label of ['Karte', 'Zeitleiste', 'Statistik', 'Story', 'Ausgaben', 'Einstellungen']) {
      expect(screen.getByText(new RegExp(label))).toBeTruthy();
    }
  });

  it('markiert die noch nicht gebauten Einträge sichtbar als "(folgt)" — Statistik/Karte/Zeitleiste NICHT mehr', () => {
    const route = createRoute({ target: 'more' });
    render(MoreView, { props: { appState: createAppState(), route } });

    for (const label of ['Story', 'Ausgaben', 'Einstellungen']) {
      expect(screen.getByText(new RegExp(`${label} \\(folgt\\)`))).toBeTruthy();
    }
    expect(screen.queryByText(/Statistik \(folgt\)/)).toBeNull();
    expect(screen.queryByText(/Karte \(folgt\)/)).toBeNull();
    expect(screen.queryByText(/Zeitleiste \(folgt\)/)).toBeNull();
  });

  it('Klick auf "Karte" setzt das Routen-Ziel "map" und öffnet KEINE zweite Karte im Hub', async () => {
    const route = createRoute({ target: 'more' });
    render(MoreView, { props: { appState: createAppState(), route } });

    await fireEvent.click(screen.getByRole('button', { name: /Karte/ }));

    expect(route.target).toBe('map');
    // Kein ComingSoonPanel/Sub-Ansicht für "Karte" — der Hub selbst öffnet keine
    // eigene zweite Karten-Implementierung (INV-UI-2). Die Karten-Fläche rendert die
    // App-Wurzel anhand desselben Routen-Ziels.
    expect(screen.queryByText('Dieser Bereich folgt in einem späteren Bau-Durchgang.')).toBeNull();
    expect(screen.getByRole('button', { name: /Statistik/ })).toBeTruthy();
  });

  it('Klick auf "Zeitleiste" setzt das Routen-Ziel "timeline", ohne den Hub-Inhalt zu tauschen', async () => {
    const route = createRoute({ target: 'more' });
    render(MoreView, { props: { appState: createAppState(), route } });

    await fireEvent.click(screen.getByRole('button', { name: /Zeitleiste/ }));

    expect(route.target).toBe('timeline');
    expect(screen.queryByText('Dieser Bereich folgt in einem späteren Bau-Durchgang.')).toBeNull();
  });

  it('Klick auf "Story" zeigt ComingSoonPanel mit Label "Story"', async () => {
    const route = createRoute({ target: 'more' });
    render(MoreView, { props: { appState: createAppState(), route } });

    await fireEvent.click(screen.getByRole('button', { name: /Story/ }));

    expect(screen.getByText('Dieser Bereich folgt in einem späteren Bau-Durchgang.')).toBeTruthy();
    // Menü selbst ist nicht mehr sichtbar (Sub-Ansicht ersetzt das Menü)
    expect(screen.queryByRole('button', { name: /Statistik/ })).toBeNull();
  });

  it('Klick auf "Einstellungen" zeigt ComingSoonPanel mit Label "Einstellungen"', async () => {
    const route = createRoute({ target: 'more' });
    render(MoreView, { props: { appState: createAppState(), route } });

    await fireEvent.click(screen.getByRole('button', { name: /Einstellungen/ }));

    expect(screen.getByText('Dieser Bereich folgt in einem späteren Bau-Durchgang.')).toBeTruthy();
  });

  it('Klick auf "Statistik" zeigt die echte StatisticsView (kein ComingSoonPanel mehr)', async () => {
    const route = createRoute({ target: 'more' });
    render(MoreView, { props: { appState: createAppState(), route } });

    await fireEvent.click(screen.getByRole('button', { name: /Statistik/ }));

    expect(screen.queryByText('Dieser Bereich folgt in einem späteren Bau-Durchgang.')).toBeNull();
    expect(screen.getByText(/Keine Daten geladen/)).toBeTruthy(); // StatisticsView-Empty-State (leere AppState)
  });

  it('"Datei"-Sub-Ansicht zeigt KEINE Orte-Buttons, wenn kein placesFileIO übergeben wird (Rückwärtskompatibilität)', async () => {
    const fileService = new FileService(createMockAdapterSet().adapters);
    const persister = createPlacesPersister(
      new PlacesSyncService(createMockPlacesStore(null), createMockDeviceId('dev-A'), createMockClock(1000)),
    );
    const route = createRoute({ target: 'more' });
    render(MoreView, { props: { appState: createAppState(), fileService, persister, route } });

    await fireEvent.click(screen.getByRole('button', { name: /Datei/ }));

    expect(screen.queryByRole('button', { name: /Orte exportieren/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Orte importieren/ })).toBeNull();
  });

  it('"Datei"-Sub-Ansicht zeigt die Orte-Buttons zusätzlich zu Import/Speichern, wenn placesFileIO übergeben wird (ADR-v9-70)', async () => {
    const fileService = new FileService(createMockAdapterSet().adapters);
    const placesStore = createMockPlacesStore(null);
    const handleStore = createMockPlacesFileHandleStore(null);
    const persister = createPlacesPersister(
      new PlacesSyncService(placesStore, createMockDeviceId('dev-A'), createMockClock(1000)),
    );
    render(MoreView, {
      props: {
        appState: createAppState(),
        fileService,
        persister,
        placesFileIO: { placesStore, handleStore, picker: { pick: async () => null } },
        route: createRoute({ target: 'more' }),
      },
    });

    await fireEvent.click(screen.getByRole('button', { name: /Datei/ }));

    expect(screen.getByRole('button', { name: /Orte exportieren/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Orte importieren/ })).toBeTruthy();
    // Bestehende Genealogie-Datei-Aktionen bleiben unverändert vorhanden (kein Verdrängen).
    expect(screen.getByRole('button', { name: /Datei öffnen/ })).toBeTruthy();
  });

  it('"Zurück zum Menü" aus der Sub-Ansicht bringt wieder alle sechs Einträge — über die Route', async () => {
    const route = createRoute({ target: 'more' });
    render(MoreView, { props: { appState: createAppState(), route } });

    await fireEvent.click(screen.getByRole('button', { name: /Statistik/ }));
    expect(route.target).toBe('stats');
    expect(screen.queryByRole('button', { name: /Karte/ })).toBeNull();

    await fireEvent.click(screen.getByRole('button', { name: /Zurück zum Menü/ }));
    expect(route.target).toBe('more');

    for (const label of ['Karte', 'Zeitleiste', 'Statistik', 'Story', 'Ausgaben', 'Einstellungen']) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeTruthy();
    }
  });
});
