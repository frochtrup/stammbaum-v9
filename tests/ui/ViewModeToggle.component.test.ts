// @vitest-environment happy-dom
// tests/ui/ViewModeToggle.component.test.ts — DER EINE "Alternativansicht-Umschalter"-
// Mechanismus (Spec 21 §6h INV-UI-11, Spec 21 §10b "Wählbare Gruppierungslogik").
// Kein Aufrufer existiert zum Zeitpunkt dieses Tests (folgt mit den Ortszeitgenossen,
// ADR-v9-78 Punkt 5/6) — Komponenten-Test verriegelt den Kontrakt eigenständig.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ViewModeToggle from '../../ui/shell/ViewModeToggle.svelte';

const MODES = [
  { id: 'decade', label: 'Nach Jahrzehnt' },
  { id: 'hof', label: 'Nach Hof' },
  { id: 'none', label: 'Ungruppiert' },
];

describe('ViewModeToggle — Grundverhalten', () => {
  it('rendert einen Button je Modus mit dessen Label', () => {
    render(ViewModeToggle, { props: { modes: MODES, value: 'decade', onChange: vi.fn() } });

    expect(screen.getByText('Nach Jahrzehnt')).toBeTruthy();
    expect(screen.getByText('Nach Hof')).toBeTruthy();
    expect(screen.getByText('Ungruppiert')).toBeTruthy();
  });

  it('markiert den aktiven Modus über aria-selected + stb-segment-btn--active, nicht nur per Farbe', () => {
    render(ViewModeToggle, { props: { modes: MODES, value: 'hof', onChange: vi.fn() } });

    const active = screen.getByText('Nach Hof');
    const inactive = screen.getByText('Nach Jahrzehnt');
    expect(active.getAttribute('aria-selected')).toBe('true');
    expect(active.classList.contains('stb-segment-btn--active')).toBe(true);
    expect(inactive.getAttribute('aria-selected')).toBe('false');
    expect(inactive.classList.contains('stb-segment-btn--active')).toBe(false);
  });

  it('Klick auf einen inaktiven Modus ruft onChange mit dessen id auf', async () => {
    const onChange = vi.fn();
    render(ViewModeToggle, { props: { modes: MODES, value: 'decade', onChange } });

    await fireEvent.click(screen.getByText('Ungruppiert'));

    expect(onChange).toHaveBeenCalledWith('none');
  });

  it('trägt role="tablist"/"tab" für Screenreader (LP-8, INV-UI-4-Referenzimplementierung)', () => {
    const { container } = render(ViewModeToggle, { props: { modes: MODES, value: 'decade', onChange: vi.fn() } });

    expect(container.querySelector('[role="tablist"]')).toBeTruthy();
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(3);
  });

  it('aria-label des tablist ist konfigurierbar (Default: "Ansicht wählen")', () => {
    const { container, rerender } = render(ViewModeToggle, {
      props: { modes: MODES, value: 'decade', onChange: vi.fn() },
    });

    expect(container.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe('Ansicht wählen');

    rerender({ modes: MODES, value: 'decade', onChange: vi.fn(), ariaLabel: 'Gruppierung wählen' });
    expect(container.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe('Gruppierung wählen');
  });
});

describe('EventsByType — TST-7 Kapazitäts-Fall an ViewModeToggle: viele Modi bleiben klickbar/umbruchfrei', () => {
  it('rendert auch bei überdurchschnittlich vielen Modi jeden einzelnen Button korrekt anklickbar', async () => {
    const manyModes = Array.from({ length: 8 }, (_, i) => ({ id: `mode-${i}`, label: `Modus ${i}` }));
    const onChange = vi.fn();
    render(ViewModeToggle, { props: { modes: manyModes, value: 'mode-0', onChange } });

    await fireEvent.click(screen.getByText('Modus 7'));

    expect(onChange).toHaveBeenCalledWith('mode-7');
    expect(screen.getAllByRole('tab')).toHaveLength(8);
  });
});
