// @vitest-environment happy-dom
// tests/ui/MoreView.component.test.ts — "Mehr"-Hub (Spec 21 §2: "Mehr = Hub für die
// Lenses (Karte / Zeitleiste / Statistik / Story) + Ausgaben + Einstellungen").
// "Statistik" ist echt verdrahtet (Spec 20 §4) und zeigt StatisticsView statt eines
// Platzhalters. "Karte" hat jetzt ebenfalls echten Inhalt (ADR-v9-25) — GENAU EIN
// kanonischer Weg dorthin (INV-UI-2): dieser Hub-Eintrag ist KEIN Menü-Sub-Eintrag
// mehr, sondern navigiert sofort über onNavigateLens('map') auf denselben
// App.svelte-Pfad, den auch der Lens-Umschalter nutzt. Zeitleiste/Story/Ausgaben/
// Einstellungen bleiben Platzhalter — eigene, spätere Bauabschnitte.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import MoreView from '../../ui/views/more/MoreView.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';

describe('MoreView — Hub für Lenses + Ausgaben + Einstellungen', () => {
  it('zeigt alle sechs Menüeinträge (vier Lenses + Ausgaben + Einstellungen)', () => {
    render(MoreView, { props: { appState: createAppState() } });

    for (const label of ['Karte', 'Zeitleiste', 'Statistik', 'Story', 'Ausgaben', 'Einstellungen']) {
      expect(screen.getByText(new RegExp(label))).toBeTruthy();
    }
  });

  it('markiert die noch nicht gebauten Einträge sichtbar als "(folgt)" — Statistik und Karte NICHT mehr', () => {
    render(MoreView, { props: { appState: createAppState() } });

    for (const label of ['Zeitleiste', 'Story', 'Ausgaben', 'Einstellungen']) {
      expect(screen.getByText(new RegExp(`${label} \\(folgt\\)`))).toBeTruthy();
    }
    expect(screen.queryByText(/Statistik \(folgt\)/)).toBeNull();
    expect(screen.queryByText(/Karte \(folgt\)/)).toBeNull();
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
