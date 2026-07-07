// @vitest-environment happy-dom
// tests/ui/LensSwitcher.component.test.ts — DER EINE Lens-Umschalter (Spec 21 §4,
// INV-UI-3). Segment-Control mit 4 Einträgen (Baum/Karte/Zeitleiste/Story), aktive
// Lens strukturell hervorgehoben (nicht nur Farbe), Klick auf Platzhalter tut nichts.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import LensSwitcher from '../../ui/shell/LensSwitcher.svelte';

describe('LensSwitcher — der eine Lens-Umschalter (INV-UI-3)', () => {
  it('zeigt genau die vier Kontext-Fokus-Lenses in Spec-Reihenfolge', () => {
    render(LensSwitcher, { props: { active: 'tree', onNavigate: vi.fn() } });

    for (const label of ['Baum', 'Karte', 'Zeitleiste', 'Story']) {
      expect(screen.getByText(new RegExp(label))).toBeTruthy();
    }
  });

  it('enthält KEINE Statistik-Lens (globales Dashboard, keine Kontext-Fokus-Lens)', () => {
    render(LensSwitcher, { props: { active: 'tree', onNavigate: vi.fn() } });

    expect(screen.queryByText(/Statistik/)).toBeNull();
  });

  it('markiert die aktive Lens strukturell (aria-current + Klasse), nicht nur farblich', () => {
    render(LensSwitcher, { props: { active: 'tree', onNavigate: vi.fn() } });

    const treeTab = screen.getByRole('tab', { name: /Baum/ });
    expect(treeTab.getAttribute('aria-current')).toBe('page');
    expect(treeTab.className).toContain('lens-switcher__item--active');

    const storyTab = screen.getByRole('tab', { name: /Story/ });
    expect(storyTab.getAttribute('aria-current')).toBeNull();
    expect(storyTab.className).not.toContain('lens-switcher__item--active');
  });

  it('markiert nicht implementierte Lenses als "(folgt)" und deaktiviert (disabled)', () => {
    render(LensSwitcher, { props: { active: 'tree', onNavigate: vi.fn() } });

    const storyTab = screen.getByRole('tab', { name: /Story \(folgt\)/ }) as HTMLButtonElement;
    expect(storyTab.disabled).toBe(true);
  });

  it('Klick auf eine implementierte Lens ruft onNavigate mit deren id auf', async () => {
    const onNavigate = vi.fn();
    render(LensSwitcher, { props: { active: 'map', onNavigate } });

    await fireEvent.click(screen.getByRole('tab', { name: /Baum/ }));

    expect(onNavigate).toHaveBeenCalledWith('tree');
  });

  it('Klick auf eine implementierte Lens (Karte) ruft onNavigate ebenfalls auf', async () => {
    const onNavigate = vi.fn();
    render(LensSwitcher, { props: { active: 'tree', onNavigate } });

    await fireEvent.click(screen.getByRole('tab', { name: /Karte/ }));

    expect(onNavigate).toHaveBeenCalledWith('map');
  });

  it('Klick auf eine nicht implementierte Lens ruft onNavigate NICHT auf — kein Crash', async () => {
    const onNavigate = vi.fn();
    render(LensSwitcher, { props: { active: 'tree', onNavigate } });

    await fireEvent.click(screen.getByRole('tab', { name: /Story/ }));

    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('Klick auf die implementierte Zeitleiste-Lens ruft onNavigate auf', async () => {
    const onNavigate = vi.fn();
    render(LensSwitcher, { props: { active: 'tree', onNavigate } });

    await fireEvent.click(screen.getByRole('tab', { name: /Zeitleiste/ }));

    expect(onNavigate).toHaveBeenCalledWith('timeline');
  });
});
