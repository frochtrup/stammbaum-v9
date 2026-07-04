// @vitest-environment happy-dom
// tests/ui/MoreView.component.test.ts — "Mehr"-Hub (Spec 21 §2: "Mehr = Hub für die
// Lenses (Karte / Zeitleiste / Statistik / Story) + Ausgaben + Einstellungen").
// Diese Scheibe liefert NUR das Menü-Gerüst: sechs sichtbare, klickbare Einträge, die
// beim Klick ComingSoonPanel mit ihrem Label zeigen (kein Absturz) — die Lenses/Reports
// selbst sind eigene, spätere Bauabschnitte (s. Auftrag "NUR das Hub-Gerüst").
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import MoreView from '../../ui/views/more/MoreView.svelte';

describe('MoreView — Hub für Lenses + Ausgaben + Einstellungen', () => {
  it('zeigt alle sechs Menüeinträge (vier Lenses + Ausgaben + Einstellungen)', () => {
    render(MoreView);

    for (const label of ['Karte', 'Zeitleiste', 'Statistik', 'Story', 'Ausgaben', 'Einstellungen']) {
      expect(screen.getByText(new RegExp(label))).toBeTruthy();
    }
  });

  it('markiert alle Einträge sichtbar als "(folgt)" — noch keiner ist gebaut', () => {
    render(MoreView);

    for (const label of ['Karte', 'Zeitleiste', 'Statistik', 'Story', 'Ausgaben', 'Einstellungen']) {
      expect(screen.getByText(new RegExp(`${label} \\(folgt\\)`))).toBeTruthy();
    }
  });

  it('Klick auf "Karte" zeigt ComingSoonPanel mit Label "Karte"', async () => {
    render(MoreView);

    await fireEvent.click(screen.getByRole('button', { name: /Karte/ }));

    expect(screen.getByText(/Karte/)).toBeTruthy();
    expect(screen.getByText('Dieser Bereich folgt in einem späteren Bau-Durchgang.')).toBeTruthy();
  });

  it('Klick auf "Story" zeigt ComingSoonPanel mit Label "Story"', async () => {
    render(MoreView);

    await fireEvent.click(screen.getByRole('button', { name: /Story/ }));

    expect(screen.getByText('Dieser Bereich folgt in einem späteren Bau-Durchgang.')).toBeTruthy();
    // Menü selbst ist nicht mehr sichtbar (Sub-Ansicht ersetzt das Menü)
    expect(screen.queryByRole('button', { name: /Karte/ })).toBeNull();
  });

  it('Klick auf "Einstellungen" zeigt ComingSoonPanel mit Label "Einstellungen"', async () => {
    render(MoreView);

    await fireEvent.click(screen.getByRole('button', { name: /Einstellungen/ }));

    expect(screen.getByText('Dieser Bereich folgt in einem späteren Bau-Durchgang.')).toBeTruthy();
  });

  it('"Zurück zum Menü" aus der Sub-Ansicht bringt wieder alle sechs Einträge', async () => {
    render(MoreView);

    await fireEvent.click(screen.getByRole('button', { name: /Statistik/ }));
    expect(screen.queryByRole('button', { name: /Karte/ })).toBeNull();

    await fireEvent.click(screen.getByRole('button', { name: /Zurück zum Menü/ }));

    for (const label of ['Karte', 'Zeitleiste', 'Statistik', 'Story', 'Ausgaben', 'Einstellungen']) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeTruthy();
    }
  });
});
