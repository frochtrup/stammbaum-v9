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

  it('markiert keines der 5 Ziele als "(folgt)" — alle Bottom-Nav-Slots sind gebaut', () => {
    render(BottomNav, { props: { active: 'person', onNavigate: vi.fn() } });

    // Personen, Baum (Sanduhr-Insel, Spec 20 §1.3 [K]), Suche (Spec 20 §1.1 [K]),
    // Aufgaben (Spec 20 §1.11 [K]) UND Mehr (Hub-Gerüst, s. MoreView.svelte) sind
    // funktional, kein "(folgt)"-Hinweis mehr auf Bottom-Nav-Ebene (die einzelnen
    // Lenses/Ausgaben/Einstellungen HINTER "Mehr" bleiben Platzhalter, s. MoreView).
    expect(screen.queryByText(/Personen \(folgt\)/)).toBeNull();
    expect(screen.queryByText(/Baum \(folgt\)/)).toBeNull();
    expect(screen.queryByText(/Suche \(folgt\)/)).toBeNull();
    expect(screen.queryByText(/Aufgaben \(folgt\)/)).toBeNull();
    expect(screen.queryByText(/Mehr \(folgt\)/)).toBeNull();
  });

  it('zeigt einen Badge mit der Anzahl offener Aufgaben am Aufgaben-Ziel (Orakel "99+" ab >99)', () => {
    render(BottomNav, { props: { active: 'person', onNavigate: vi.fn(), openTaskBadge: '3' } });
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('zeigt kein Badge, wenn keine Aufgaben offen sind (openTaskBadge leer/undefiniert)', () => {
    render(BottomNav, { props: { active: 'person', onNavigate: vi.fn() } });
    expect(screen.queryByText(/^\d+\+?$/)).toBeNull();
  });

  it('zeigt "99+" bei mehr als 99 offenen Aufgaben', () => {
    render(BottomNav, { props: { active: 'person', onNavigate: vi.fn(), openTaskBadge: '99+' } });
    expect(screen.getByText('99+')).toBeTruthy();
  });

  it('ruft onNavigate mit dem Ziel auf, auch für noch nicht gebaute Ziele — kein Absturz beim Klick', async () => {
    const onNavigate = vi.fn();
    render(BottomNav, { props: { active: 'person', onNavigate } });

    await fireEvent.click(screen.getByRole('button', { name: /Suche/ }));

    expect(onNavigate).toHaveBeenCalledWith('search');
  });
});
