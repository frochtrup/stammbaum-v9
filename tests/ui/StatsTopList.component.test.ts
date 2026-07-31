// @vitest-environment happy-dom
// tests/ui/StatsTopList.component.test.ts — geteilte Balkenliste der vier
// Statistik-Top-Listen (Spec 20 §1.13, BL-219, ADR-v9-157). Extrahiert aus
// StatisticsView.svelte (BL-54-Ratsche) — eigener Component-Test, weil jetzt eine
// eigenständige, wiederverwendete Komponente.
import { describe, expect, it, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import StatsTopList from '../../ui/views/stats/StatsTopList.svelte';
import type { TopEntry } from '../../ui/views/stats/stats-model';

function tooltipText(): string | null {
  return document.querySelector('.stb-tooltip')?.textContent ?? null;
}

describe('StatsTopList', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('rendert eine Zeile je Eintrag mit Label + Zahl', () => {
    const entries: TopEntry[] = [
      { label: 'Bauer', count: 3, pct: 60, total: 5 },
      { label: 'Klein', count: 2, pct: 40, total: 5 },
    ];
    const { getByText } = render(StatsTopList, { props: { entries } });
    expect(getByText('Bauer')).toBeTruthy();
    expect(getByText('Klein')).toBeTruthy();
    expect(getByText('3')).toBeTruthy();
    expect(getByText('2')).toBeTruthy();
  });

  it('zeigt den Prozentanteil im Balken-Tooltip (BL-219)', async () => {
    const entries: TopEntry[] = [{ label: 'Bauer', count: 3, pct: 60, total: 5 }];
    const { container } = render(StatsTopList, { props: { entries } });
    const track = container.querySelector('.stats-bar-row__track')!;
    await fireEvent.mouseEnter(track);
    expect(tooltipText()).toBe('3 (60%)');
  });

  it('variant steuert die Balkenfarben-Klasse (Default "gold")', () => {
    const entries: TopEntry[] = [{ label: 'X', count: 1, pct: 100, total: 1 }];
    const { container: goldContainer } = render(StatsTopList, { props: { entries } });
    expect(goldContainer.querySelector('.stats-bar-row__fill--gold')).toBeTruthy();

    const { container: blueContainer } = render(StatsTopList, {
      props: { entries, variant: 'blue' },
    });
    expect(blueContainer.querySelector('.stats-bar-row__fill--blue')).toBeTruthy();
  });
});
