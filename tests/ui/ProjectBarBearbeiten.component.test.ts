// @vitest-environment happy-dom
// tests/ui/ProjectBarBearbeiten.component.test.ts — ein Forschungsprojekt lässt sich
// ÄNDERN und LÖSCHEN (BL-376, Spec 20 §1.11f).
//
// WARUM ES DIESEN TEST GIBT: Der Löschknopf war gebaut — im Bearbeiten-Formular —, und
// das Formular öffnete ausschließlich ein `ondblclick` auf dem Projekt-Chip, angekündigt
// nur im `title`. Beides existiert auf der primären Zielplattform nicht (Touch kennt
// keine Doppelklick-Geste, ein Tooltip ist dort kein Kanal, ADR-v9-183). Kein Test
// berührte diesen Weg; gemeldet hat es der Nutzer („Projekte sind nicht löschbar").
// Geprüft wird deshalb der WEG, nicht die Kommando-Funktion: dass `projects.remove`
// funktioniert, war nie das Problem.
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ProjectBar from '../../ui/views/research-projects/ProjectBar.svelte';
import { createProjectsState } from '../../ui/shell/projects-state.svelte';
import { makeProject } from '../../core/research/index';

function mitProjekt() {
  const projects = createProjectsState({ load: async () => [], save: async () => {} });
  projects.add(makeProject('p1', { name: 'Ochtrup 18. Jh.', created: '2026-01-01' }));
  projects.setActive('p1');
  return projects;
}

describe('Forschungsprojekt bearbeiten und löschen (BL-376)', () => {
  it('bietet einen SICHTBAREN Öffner — nicht nur eine Doppelklick-Geste', () => {
    render(ProjectBar, { props: { projects: mitProjekt() } });

    expect(screen.getByRole('button', { name: /Projekt Ochtrup 18\. Jh\. bearbeiten/ })).toBeTruthy();
  });

  it('zeigt ihn NICHT, solange kein Projekt gewählt ist — er hätte nichts zu bearbeiten', async () => {
    const projects = mitProjekt();
    render(ProjectBar, { props: { projects } });

    await fireEvent.click(screen.getByRole('tab', { name: 'Alle' }));

    expect(screen.queryByRole('button', { name: /bearbeiten/ })).toBeNull();
  });

  it('öffnet über ihn das Formular MIT den Werten des Projekts', async () => {
    render(ProjectBar, { props: { projects: mitProjekt() } });

    await fireEvent.click(screen.getByRole('button', { name: /bearbeiten/ }));

    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Ochtrup 18. Jh.');
  });

  it('löscht das Projekt über den Knopf im Formular — der Weg, der vorher unerreichbar war', async () => {
    const projects = mitProjekt();
    render(ProjectBar, { props: { projects } });

    await fireEvent.click(screen.getByRole('button', { name: /bearbeiten/ }));
    await fireEvent.click(screen.getByRole('button', { name: 'Löschen' }));

    expect(projects.projects).toHaveLength(0);
    expect(screen.queryByRole('tab', { name: /Ochtrup/ })).toBeNull();
  });

  it('behält die Änderung nach dem Speichern', async () => {
    const projects = mitProjekt();
    render(ProjectBar, { props: { projects } });

    await fireEvent.click(screen.getByRole('button', { name: /bearbeiten/ }));
    await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Ochtrup 19. Jh.' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(projects.projects[0].name).toBe('Ochtrup 19. Jh.');
  });
});
