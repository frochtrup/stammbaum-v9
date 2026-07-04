// @vitest-environment happy-dom
// tests/ui/MoreView.component.test.ts — "Mehr"-Hub (Spec 21 §2: "Mehr = Hub für die
// Lenses (Karte / Zeitleiste / Statistik / Story) + Ausgaben + Einstellungen").
// Fünf Einträge (Karte/Zeitleiste/Story/Ausgaben/Einstellungen) zeigen weiterhin
// ComingSoonPanel — eigene, spätere Bauabschnitte. "Statistik" ist jetzt echt verdrahtet
// (Spec 20 §4) und zeigt StatisticsView statt des Platzhalters.
import { describe, expect, it } from 'vitest';
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

  it('markiert die noch nicht gebauten Einträge sichtbar als "(folgt)" — Statistik NICHT mehr', () => {
    render(MoreView, { props: { appState: createAppState() } });

    for (const label of ['Karte', 'Zeitleiste', 'Story', 'Ausgaben', 'Einstellungen']) {
      expect(screen.getByText(new RegExp(`${label} \\(folgt\\)`))).toBeTruthy();
    }
    expect(screen.queryByText(/Statistik \(folgt\)/)).toBeNull();
  });

  it('Klick auf "Karte" zeigt ComingSoonPanel mit Label "Karte"', async () => {
    render(MoreView, { props: { appState: createAppState() } });

    await fireEvent.click(screen.getByRole('button', { name: /Karte/ }));

    expect(screen.getByText(/Karte/)).toBeTruthy();
    expect(screen.getByText('Dieser Bereich folgt in einem späteren Bau-Durchgang.')).toBeTruthy();
  });

  it('Klick auf "Story" zeigt ComingSoonPanel mit Label "Story"', async () => {
    render(MoreView, { props: { appState: createAppState() } });

    await fireEvent.click(screen.getByRole('button', { name: /Story/ }));

    expect(screen.getByText('Dieser Bereich folgt in einem späteren Bau-Durchgang.')).toBeTruthy();
    // Menü selbst ist nicht mehr sichtbar (Sub-Ansicht ersetzt das Menü)
    expect(screen.queryByRole('button', { name: /Karte/ })).toBeNull();
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
