// @vitest-environment happy-dom
// tests/ui/Sidebar.component.test.ts — Desktop-Sidebar (Spec 21 §3, BL-06).
//
// Der zentrale Test ist NICHT "zeigt Personen, Familien, …" (eine Liste, die im Test
// wiederholt wird, driftet mit dem Register auseinander und wäre ein Meilenstein statt
// eines Wächters), sondern: die Sidebar zeigt VOLLSTÄNDIG, was das Register führt, und
// gruppiert es nach den Rollen. Ein künftig ergänztes Ziel muss hier ohne Zutun
// erscheinen — genau das ist die Zusage von INV-UI-15.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/svelte';
import Sidebar from '../../ui/shell/Sidebar.svelte';
import { NAV_TARGETS, targetsByRole } from '../../ui/shell/nav-model';

describe('Sidebar — Projektion des Ziel-Registers (INV-UI-15)', () => {
  it('zeigt jedes Ziel des Registers genau einmal, mit seiner Beschriftung', () => {
    render(Sidebar, { props: { active: 'person', onNavigate: vi.fn() } });

    for (const target of NAV_TARGETS) {
      const matches = screen.getAllByRole('button', { name: new RegExp(target.label) });
      expect(matches.length, `Ziel "${target.id}" (${target.label})`).toBeGreaterThan(0);
    }
    // Vollzähligkeit in die andere Richtung: keine Zeile, die im Register fehlt.
    expect(screen.getAllByRole('button').length).toBe(NAV_TARGETS.length);
  });

  it('gruppiert nach den vier Rollen aus Spec 21 §1, in der Spec-Reihenfolge', () => {
    render(Sidebar, { props: { active: 'person', onNavigate: vi.fn() } });

    const groups = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(groups).toEqual(['Entitäten', 'Ansichten', 'Forschung', 'Arbeit']);
  });

  it('führt in jeder Gruppe genau die Ziele dieser Rolle', () => {
    render(Sidebar, { props: { active: 'person', onNavigate: vi.fn() } });

    for (const [role, label] of [
      ['entity', 'Entitäten'],
      ['lens', 'Ansichten'],
      ['research', 'Forschung'],
      ['work', 'Arbeit'],
    ] as const) {
      const list = screen.getByRole('list', { name: label });
      const items = within(list).getAllByRole('button');
      expect(items.length, label).toBe(targetsByRole(role).length);
    }
  });

  it('markiert das aktive Ziel strukturell (aria-current + Klasse), nicht nur farblich', () => {
    render(Sidebar, { props: { active: 'place', onNavigate: vi.fn() } });

    const orte = screen.getByRole('button', { name: /Orte/ });
    expect(orte.getAttribute('aria-current')).toBe('page');
    expect(orte.className).toContain('sidebar__item--active');

    const personen = screen.getByRole('button', { name: /Personen/ });
    expect(personen.getAttribute('aria-current')).toBeNull();
    expect(personen.className).not.toContain('sidebar__item--active');
  });

  it('markiert direkt, nicht über die Bottom-Nav-Bündelung', () => {
    // Auf Mobil hängt die Karte am Baum-Slot (bottomNavSlotFor). Die Sidebar hat für
    // jedes Ziel eine eigene Zeile — hier MUSS "Karte" leuchten und "Baum" nicht,
    // sonst wäre die Bündelung fälschlich mitgeschleppt worden.
    render(Sidebar, { props: { active: 'map', onNavigate: vi.fn() } });

    expect(screen.getByRole('button', { name: /Karte/ }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: /Baum/ }).getAttribute('aria-current')).toBeNull();
  });

  it('meldet den Klick mit der Ziel-Id', async () => {
    const onNavigate = vi.fn();
    render(Sidebar, { props: { active: 'person', onNavigate } });

    await fireEvent.click(screen.getByRole('button', { name: /Höfe/ }));
    expect(onNavigate).toHaveBeenCalledWith('hof');

    await fireEvent.click(screen.getByRole('button', { name: /Statistik/ }));
    expect(onNavigate).toHaveBeenCalledWith('stats');
  });

  it('verriegelt ungebaute Ziele und weist sie als "(folgt)" aus', async () => {
    const onNavigate = vi.fn();
    render(Sidebar, { props: { active: 'person', onNavigate } });

    for (const target of NAV_TARGETS.filter((t) => !t.implemented)) {
      const button = screen.getByRole('button', { name: new RegExp(`${target.label} \\(folgt\\)`) });
      expect((button as HTMLButtonElement).disabled, target.id).toBe(true);
      await fireEvent.click(button);
    }
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('zeigt das Aufgaben-Badge an derselben Stelle wie die Bottom-Nav', () => {
    render(Sidebar, { props: { active: 'person', onNavigate: vi.fn(), openTaskBadge: '99+' } });

    const tasks = screen.getByRole('button', { name: /Aufgaben/ });
    expect(within(tasks).getByText('99+')).toBeTruthy();
  });

  it('trägt einen zugänglichen Namen für die Navigation selbst (LP-8)', () => {
    render(Sidebar, { props: { active: 'person', onNavigate: vi.fn() } });
    expect(screen.getByRole('navigation', { name: 'Hauptnavigation' })).toBeTruthy();
  });
});
