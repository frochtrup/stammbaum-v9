// @vitest-environment happy-dom
// tests/ui/BottomNav.component.test.ts — mobile Bottom-Nav (Spec 21 §2): 5 feste
// Ziele, aktiver Zustand nie nur über Farbe (WCAG 1.4.1/LP-8) — aria-current +
// eine eigene Modifier-Klasse sind das strukturelle Signal. Klick auf ein
// nicht gebautes Ziel darf NIE einen Fehler werfen (Spec-Auftrag "kein Absturz").
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import BottomNav from '../../ui/shell/BottomNav.svelte';

describe('BottomNav — 5 feste Ziele, deutlicher Aktiv-Zustand', () => {
  it('rendert genau die 5 spezifizierten Ziele', () => {
    render(BottomNav, { props: { active: 'person', onNavigate: vi.fn() } });

    for (const label of ['Baum', 'Personen', 'Suche', 'Aufgaben', 'Mehr']) {
      expect(screen.getByText(new RegExp(label))).toBeTruthy();
    }
  });

  it('markiert das aktive Ziel strukturell (aria-current + Klasse), nicht nur farblich', () => {
    render(BottomNav, { props: { active: 'person', onNavigate: vi.fn() } });

    const personButton = screen.getByRole('button', { name: /Personen/ });
    expect(personButton.getAttribute('aria-current')).toBe('page');
    expect(personButton.className).toContain('bottom-nav__item--active');

    const treeButton = screen.getByRole('button', { name: /Baum/ });
    expect(treeButton.getAttribute('aria-current')).toBeNull();
    expect(treeButton.className).not.toContain('bottom-nav__item--active');
  });

  it('markiert nicht-implementierte Ziele sichtbar als "(folgt)"', () => {
    render(BottomNav, { props: { active: 'person', onNavigate: vi.fn() } });

    expect(screen.getByText(/Suche \(folgt\)/)).toBeTruthy();
    expect(screen.getByText(/Aufgaben \(folgt\)/)).toBeTruthy();
    expect(screen.getByText(/Mehr \(folgt\)/)).toBeTruthy();
    // Personen UND Baum (Sanduhr-Insel, Spec 20 §1.3 [K]) sind funktional, kein "(folgt)"-Hinweis.
    expect(screen.queryByText(/Personen \(folgt\)/)).toBeNull();
    expect(screen.queryByText(/Baum \(folgt\)/)).toBeNull();
  });

  it('ruft onNavigate mit dem Ziel auf, auch für noch nicht gebaute Ziele — kein Absturz beim Klick', async () => {
    const onNavigate = vi.fn();
    render(BottomNav, { props: { active: 'person', onNavigate } });

    await fireEvent.click(screen.getByRole('button', { name: /Suche/ }));

    expect(onNavigate).toHaveBeenCalledWith('search');
  });
});
