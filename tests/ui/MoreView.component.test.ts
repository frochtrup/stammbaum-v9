// @vitest-environment happy-dom
// tests/ui/MoreView.component.test.ts — "Mehr"-Hub (Spec 21 §2: "Mehr = Hub für die
// Lenses (Karte / Zeitleiste / Statistik / Story) + Ausgaben + Einstellungen").
// "Statistik" ist echt verdrahtet (Spec 20 §4) und zeigt StatisticsView statt eines
// Platzhalters. "Karte" UND "Zeitleiste" haben jetzt ebenfalls echten Inhalt
// (ADR-v9-25 / Spec 20 §1.10) — GENAU EIN kanonischer Weg dorthin je Lens (INV-UI-2):
// beide Hub-Einträge sind KEIN Menü-Sub-Eintrag mehr, sondern navigieren sofort über
// onNavigateLens('map'/'timeline') auf denselben App.svelte-Pfad, den auch der
// Lens-Umschalter nutzt. Story/Ausgaben/Einstellungen bleiben Platzhalter — eigene,
// spätere Bauabschnitte.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import MoreView from '../../ui/views/more/MoreView.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
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
    render(MoreView, { props: { appState: createAppState() } });

    for (const label of ['Karte', 'Zeitleiste', 'Statistik', 'Story', 'Ausgaben', 'Einstellungen']) {
      expect(screen.getByText(new RegExp(label))).toBeTruthy();
    }
  });

  it('markiert die noch nicht gebauten Einträge sichtbar als "(folgt)" — Statistik/Karte/Zeitleiste NICHT mehr', () => {
    render(MoreView, { props: { appState: createAppState() } });

    for (const label of ['Story', 'Ausgaben', 'Einstellungen']) {
      expect(screen.getByText(new RegExp(`${label} \\(folgt\\)`))).toBeTruthy();
    }
    expect(screen.queryByText(/Statistik \(folgt\)/)).toBeNull();
    expect(screen.queryByText(/Karte \(folgt\)/)).toBeNull();
    expect(screen.queryByText(/Zeitleiste \(folgt\)/)).toBeNull();
  });

  it('Klick auf "Karte" ruft onNavigateLens mit "map" auf, OHNE den Hub zu verlassen (App.svelte wechselt activeTarget)', async () => {
    const onNavigateLens = vi.fn();
    render(MoreView, { props: { appState: createAppState(), onNavigateLens } });

    await fireEvent.click(screen.getByRole('button', { name: /Karte/ }));

    expect(onNavigateLens).toHaveBeenCalledWith('map');
    // Kein ComingSoonPanel/Sub-Ansicht für "Karte" — der Hub selbst öffnet keine
    // eigene zweite Karten-Implementierung (INV-UI-2).
    expect(screen.queryByText('Dieser Bereich folgt in einem späteren Bau-Durchgang.')).toBeNull();
  });

  it('Klick auf "Zeitleiste" ruft onNavigateLens mit "timeline" auf, OHNE den Hub zu verlassen', async () => {
    const onNavigateLens = vi.fn();
    render(MoreView, { props: { appState: createAppState(), onNavigateLens } });

    await fireEvent.click(screen.getByRole('button', { name: /Zeitleiste/ }));

    expect(onNavigateLens).toHaveBeenCalledWith('timeline');
    // Kein ComingSoonPanel/Sub-Ansicht für "Zeitleiste" — der Hub selbst öffnet keine
    // eigene zweite Zeitleiste-Implementierung (INV-UI-2).
    expect(screen.queryByText('Dieser Bereich folgt in einem späteren Bau-Durchgang.')).toBeNull();
  });

  it('Klick auf "Karte" ohne onNavigateLens-Prop crasht nicht (optionaler Callback)', async () => {
    render(MoreView, { props: { appState: createAppState() } });

    await fireEvent.click(screen.getByRole('button', { name: /Karte/ }));

    // Menü bleibt sichtbar (kein Absturz, kein stiller Sub-Ansicht-Wechsel).
    expect(screen.getByRole('button', { name: /Statistik/ })).toBeTruthy();
  });

  it('Klick auf "Story" zeigt ComingSoonPanel mit Label "Story"', async () => {
    render(MoreView, { props: { appState: createAppState() } });

    await fireEvent.click(screen.getByRole('button', { name: /Story/ }));

    expect(screen.getByText('Dieser Bereich folgt in einem späteren Bau-Durchgang.')).toBeTruthy();
    // Menü selbst ist nicht mehr sichtbar (Sub-Ansicht ersetzt das Menü)
    expect(screen.queryByRole('button', { name: /Statistik/ })).toBeNull();
  });

  it('Klick auf "Einstellungen" zeigt ComingSoonPanel mit Label "Einstellungen"', async () => {
    render(MoreView, { props: { appState: createAppState() } });

    await fireEvent.click(screen.getByRole('button', { name: /Einstellungen/ }));

    expect(screen.getByText('Dieser Bereich folgt in einem späteren Bau-Durchgang.')).toBeTruthy();
  });

  it('Klick auf "Statistik" zeigt die echte StatisticsView (kein ComingSoonPanel mehr)', async () => {
    render(MoreView, { props: { appState: createAppState() } });

    await fireEvent.click(screen.getByRole('button', { name: /Statistik/ }));

    expect(screen.queryByText('Dieser Bereich folgt in einem späteren Bau-Durchgang.')).toBeNull();
    expect(screen.getByText(/Keine Daten geladen/)).toBeTruthy(); // StatisticsView-Empty-State (leere AppState)
  });

  it('"Datei"-Sub-Ansicht zeigt KEINE Orte-Buttons, wenn kein placesFileIO übergeben wird (Rückwärtskompatibilität)', async () => {
    const fileService = new FileService(createMockAdapterSet().adapters);
    const persister = createPlacesPersister(
      new PlacesSyncService(createMockPlacesStore(null), createMockDeviceId('dev-A'), createMockClock(1000)),
    );
    render(MoreView, { props: { appState: createAppState(), fileService, persister } });

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
      },
    });

    await fireEvent.click(screen.getByRole('button', { name: /Datei/ }));

    expect(screen.getByRole('button', { name: /Orte exportieren/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Orte importieren/ })).toBeTruthy();
    // Bestehende Genealogie-Datei-Aktionen bleiben unverändert vorhanden (kein Verdrängen).
    expect(screen.getByRole('button', { name: /Datei öffnen/ })).toBeTruthy();
  });

  it('"Zurück zum Menü" aus der Sub-Ansicht bringt wieder alle sechs Einträge', async () => {
    render(MoreView, { props: { appState: createAppState() } });

    await fireEvent.click(screen.getByRole('button', { name: /Statistik/ }));
    expect(screen.queryByRole('button', { name: /Karte/ })).toBeNull();

    await fireEvent.click(screen.getByRole('button', { name: /Zurück zum Menü/ }));

    for (const label of ['Karte', 'Zeitleiste', 'Statistik', 'Story', 'Ausgaben', 'Einstellungen']) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeTruthy();
    }
  });
});
