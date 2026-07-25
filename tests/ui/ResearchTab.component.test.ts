// @vitest-environment happy-dom
// tests/ui/ResearchTab.component.test.ts — Forschungs-Tab-Umbrella (Spec 20 §1.11,
// Spec 12). Seit ADR-v9-116 sind die vier Flächen erstklassige Nav-Ziele der Rolle
// 'research'; mobil trägt sie eine Segment-Reihe (Dashboard an erster Stelle, Default
// bleibt "Aufgaben"), auf Desktop die Sidebar — die Reihe entfällt dort (wie die
// Entitäts-Segmentreihe, INV-UI-2). Deshalb pinnt jeder Segment-Reihen-Test den
// Formfaktor explizit (happy-dom ist 1024px = Desktop, s. layout-harness.ts).
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/svelte';
import ResearchTab from '../../ui/views/ResearchTab.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createRoute } from '../../ui/shell/route.svelte';
import { createProjectsState } from '../../ui/shell/projects-state.svelte';
import { pinLayout } from './layout-harness';
import { layout } from '../../ui/shell/layout.svelte';

/** Leerer Projekt-Halter (BL-58) — kein aktives Projekt, keine Scope-Einschränkung. */
function mkProjects() {
  return createProjectsState({ load: async () => [], save: async () => {} });
}

describe('ResearchTab — mobile Segment-Reihe (Dashboard/Aufgaben/Protokoll/Hypothesen)', () => {
  let unpin: () => void;
  afterEach(() => {
    unpin?.();
    layout.reset();
  });
  const mobile = () => (unpin = pinLayout(false));

  it('zeigt alle vier Segment-Buttons; Dashboard steht an erster Stelle, "Aufgaben" ist beim Mount aktiv', () => {
    mobile();
    render(ResearchTab, { props: { appState: createAppState(), route: createRoute(), projects: mkProjects() } });

    // Reihenfolge im DOM: Dashboard zuerst (ADR-v9-116), aber die Default-Auswahl bleibt
    // "Aufgaben" — Reihenfolge ≠ Default-Landung. Scope auf die Segment-Reihe, weil
    // TasksView darunter eine eigene tab-Reihe (Liste/Board) rendert.
    const row = screen.getByRole('tablist', { name: 'Forschungsansicht wählen' });
    const tabs = within(row)
      .getAllByRole('tab')
      .map((t) => t.textContent?.trim());
    expect(tabs).toEqual(['Dashboard', 'Aufgaben', 'Protokoll', 'Hypothesen']);

    expect(screen.getByRole('tab', { name: 'Aufgaben' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Dashboard' }).getAttribute('aria-selected')).toBe('false');
  });

  it('zeigt standardmäßig den Aufgaben-Inhalt (TasksView, "+ Aufgabe"-Button sichtbar)', () => {
    mobile();
    render(ResearchTab, { props: { appState: createAppState(), route: createRoute(), projects: mkProjects() } });
    expect(screen.getByText('+ Aufgabe')).toBeTruthy();
  });

  it('Klick auf "Protokoll" wechselt zu LogView ("+ Eintrag"-Button sichtbar, TasksView-Button weg)', async () => {
    mobile();
    render(ResearchTab, { props: { appState: createAppState(), route: createRoute(), projects: mkProjects() } });

    await fireEvent.click(screen.getByRole('tab', { name: 'Protokoll' }));

    expect(screen.getByText('+ Eintrag')).toBeTruthy();
    expect(screen.queryByText('+ Aufgabe')).toBeNull();
  });

  it('Klick auf "Hypothesen" wechselt zu HypothesesView ("+ Hypothese"-Button sichtbar), andere Inhalte weg', async () => {
    mobile();
    render(ResearchTab, { props: { appState: createAppState(), route: createRoute(), projects: mkProjects() } });

    await fireEvent.click(screen.getByRole('tab', { name: 'Hypothesen' }));

    expect(screen.getByText('+ Hypothese')).toBeTruthy();
    expect(screen.queryByText('+ Eintrag')).toBeNull();
    expect(screen.queryByText('+ Aufgabe')).toBeNull();
  });

  it('ein Segment-Klick setzt das Ziel über die EINE Routen-Quelle (route.setTarget, ADR-v9-116)', async () => {
    mobile();
    const route = createRoute();
    render(ResearchTab, { props: { appState: createAppState(), route, projects: mkProjects() } });

    await fireEvent.click(screen.getByRole('tab', { name: 'Hypothesen' }));

    // setTarget pflegt sowohl das aktive Ziel als auch den researchTarget-Merker.
    expect(route.target).toBe('hypotheses');
    expect(route.researchTarget).toBe('hypotheses');
  });
});

describe('ResearchTab — auf Desktop entfällt die Segment-Reihe (Spec 21 §3, INV-UI-2)', () => {
  let unpin: () => void;
  afterEach(() => {
    unpin?.();
    layout.reset();
  });

  it('rendert keine Segment-Reihe; die Sidebar trägt die Ziele — der Inhalt folgt route.researchTarget', () => {
    unpin = pinLayout(true);
    const route = createRoute({ researchTarget: 'hypotheses' });
    render(ResearchTab, { props: { appState: createAppState(), route, projects: mkProjects() } });

    // Die Forschungs-Segmentreihe rendert nicht mehr (die Sidebar navigiert) — auf ihren
    // accessible name geprüft, da Unter-Views eigene tab-Reihen haben können. Der Inhalt
    // des zuletzt gewählten Ziels rendert weiterhin.
    expect(screen.queryByRole('tablist', { name: 'Forschungsansicht wählen' })).toBeNull();
    expect(screen.getByText('+ Hypothese')).toBeTruthy();
  });
});

describe('ResearchTab — das offene Ziel überlebt das Wegnavigieren (ADR-v9-102)', () => {
  let unpin: () => void;
  afterEach(() => {
    unpin?.();
    layout.reset();
  });

  it('kommt auf dem zuletzt offenen Ziel zurück, nicht auf "Aufgaben"', async () => {
    unpin = pinLayout(false);
    const appState = createAppState();
    const route = createRoute();

    const first = render(ResearchTab, { props: { appState, route, projects: mkProjects() } });
    await fireEvent.click(screen.getByRole('tab', { name: 'Hypothesen' }));
    // Wegnavigieren = Unmount (App.svelte rendert die Ziele über `{:else if}`).
    first.unmount();

    render(ResearchTab, { props: { appState, route, projects: mkProjects() } });

    expect(screen.getByRole('tab', { name: 'Hypothesen' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Aufgaben' }).getAttribute('aria-selected')).toBe('false');
  });
});
