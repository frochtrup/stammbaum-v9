// @vitest-environment happy-dom
// tests/ui/ResearchTab.component.test.ts — Forschungs-Tab-Umbrella (Spec 20 §1.11,
// Spec 12). Segment-Umschalter Aufgaben/Protokoll/Hypothesen, analog EntityTab.svelte
// (INV-UI-2 "genau ein kanonischer Weg"). Aufgaben bleibt Default-Segment beim Mount.
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ResearchTab from '../../ui/views/ResearchTab.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createRoute } from '../../ui/shell/route.svelte';

describe('ResearchTab — Segment-Umschalter Aufgaben/Protokoll/Hypothesen', () => {
  it('zeigt alle drei Segment-Buttons, "Aufgaben" ist beim Mount aktiv', () => {
    render(ResearchTab, { props: { appState: createAppState(), route: createRoute() } });

    const tasksTab = screen.getByRole('tab', { name: 'Aufgaben' });
    const logTab = screen.getByRole('tab', { name: 'Protokoll' });
    const hypoTab = screen.getByRole('tab', { name: 'Hypothesen' });

    expect(tasksTab.getAttribute('aria-selected')).toBe('true');
    expect(logTab.getAttribute('aria-selected')).toBe('false');
    expect(hypoTab.getAttribute('aria-selected')).toBe('false');
  });

  it('zeigt standardmäßig den Aufgaben-Inhalt (TasksView, "+ Aufgabe"-Button sichtbar)', () => {
    render(ResearchTab, { props: { appState: createAppState(), route: createRoute() } });
    expect(screen.getByText('+ Aufgabe')).toBeTruthy();
  });

  it('Klick auf "Protokoll" wechselt zu LogView ("+ Eintrag"-Button sichtbar, TasksView-Button weg)', async () => {
    render(ResearchTab, { props: { appState: createAppState(), route: createRoute() } });

    await fireEvent.click(screen.getByRole('tab', { name: 'Protokoll' }));

    expect(screen.getByText('+ Eintrag')).toBeTruthy();
    expect(screen.queryByText('+ Aufgabe')).toBeNull();
  });

  it('Klick auf "Hypothesen" wechselt zu HypothesesView ("+ Hypothese"-Button sichtbar), andere Inhalte weg', async () => {
    render(ResearchTab, { props: { appState: createAppState(), route: createRoute() } });

    await fireEvent.click(screen.getByRole('tab', { name: 'Hypothesen' }));

    expect(screen.getByText('+ Hypothese')).toBeTruthy();
    expect(screen.queryByText('+ Eintrag')).toBeNull();
    expect(screen.queryByText('+ Aufgabe')).toBeNull();
  });
});

describe('ResearchTab — das offene Segment überlebt das Wegnavigieren (ADR-v9-102)', () => {
  it('kommt auf dem zuletzt offenen Segment zurück, nicht auf "Aufgaben"', async () => {
    const appState = createAppState();
    const route = createRoute();

    const first = render(ResearchTab, { props: { appState, route } });
    await fireEvent.click(screen.getByRole('tab', { name: 'Hypothesen' }));
    // Wegnavigieren = Unmount (App.svelte rendert die Ziele über `{:else if}`).
    first.unmount();

    render(ResearchTab, { props: { appState, route } });

    expect(screen.getByRole('tab', { name: 'Hypothesen' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Aufgaben' }).getAttribute('aria-selected')).toBe('false');
  });
});
