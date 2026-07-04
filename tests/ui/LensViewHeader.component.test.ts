// @vitest-environment happy-dom
// tests/ui/LensViewHeader.component.test.ts — die EINE Kopfzeile für jede Lens-
// Ansicht (Spec 21 §4, INV-UI-3). Konsolidiert die vormals pro View duplizierten
// `__topbar`-Zeilen (Baum/Karte hatten je einen eigenen Titel-Text ÜBER dem
// Lens-Umschalter — redundant, weil der Umschalter die aktive Lens bereits über
// das hervorgehobene Tab zeigt). Diese Komponente ist jetzt die einzige Quelle für
// Höhe/Padding/Ausrichtung der Lens-Kopfzeile.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import LensViewHeader from '../../ui/shell/LensViewHeader.svelte';
import LensViewHeaderActionsHarness from './fixtures/LensViewHeaderActionsHarness.svelte';

describe('LensViewHeader — die eine Kopfzeile für Lens-Ansichten (Spec 21 §4, INV-UI-3)', () => {
  it('rendert NUR den Lens-Umschalter, keinen separaten Titel-Text', () => {
    const { container } = render(LensViewHeader, { props: { active: 'tree', onNavigate: vi.fn() } });

    expect(container.querySelector('.lens-switcher')).toBeTruthy();
    // Es darf keinen zusätzlichen reinen Titel-Text-Knoten geben (der Befund: die
    // alte `__topbar`-Zeile duplizierte, was das aktive Tab bereits zeigt) — "Baum"
    // darf NUR EINMAL vorkommen (als Umschalter-Tab-Label), nicht ein zweites Mal
    // als separater Titel darüber.
    expect(container.querySelector('.lens-view-header__title')).toBeNull();
    expect(screen.getAllByText(/Baum/)).toHaveLength(1);
  });

  it('markiert die aktive Lens über den eingebetteten Umschalter (aria-current)', () => {
    render(LensViewHeader, { props: { active: 'map', onNavigate: vi.fn() } });

    const mapTab = screen.getByRole('tab', { name: /Karte/ });
    expect(mapTab.getAttribute('aria-current')).toBe('page');
  });

  it('Klick auf eine andere implementierte Lens ruft onNavigate mit deren id auf', async () => {
    const onNavigate = vi.fn();
    render(LensViewHeader, { props: { active: 'tree', onNavigate } });

    await fireEvent.click(screen.getByRole('tab', { name: /Karte/ }));

    expect(onNavigate).toHaveBeenCalledWith('map');
  });

  it('ohne actions-Snippet gibt es keinen Aktionen-Bereich im DOM', () => {
    const { container } = render(LensViewHeader, { props: { active: 'tree', onNavigate: vi.fn() } });

    expect(container.querySelector('.lens-view-header__actions')).toBeNull();
  });

  it('mit actions-Snippet erscheint der Kontext-Aktionen-Bereich rechts neben dem Umschalter', () => {
    const { container, getByRole } = render(LensViewHeaderActionsHarness, {
      props: { active: 'tree', onNavigate: vi.fn() },
    });

    const actions = container.querySelector('.lens-view-header__actions');
    expect(actions).toBeTruthy();
    expect(getByRole('button', { name: /Vollbild/ })).toBeTruthy();
  });
});
