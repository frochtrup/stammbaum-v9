// @vitest-environment happy-dom
// tests/ui/ProjectBar.component.test.ts — Projekt-Chip-Selektor + Verwaltung (Spec 12
// §5, Spec 20 §1.11f, BL-58/BL-209, ADR-v9-158). Deckt die Farb-/Notiz-Lücke ab: Chip-
// Punkt nur bei gesetzter Farbe, Swatch-Auswahl (inkl. "Keine Farbe"), Notizfeld — alle
// drei über projects.add()/update() persistiert (TST-8-Geist: Rundlauf über den echten
// Halter, nicht nur "kein Fehler beim Speichern").
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ProjectBar from '../../ui/views/research-projects/ProjectBar.svelte';
import { createProjectsState } from '../../ui/shell/projects-state.svelte';
import { makeProject, type Project } from '../../core/research/index';
import type { ProjectsStore } from '../../services/research/index';

function memStore(initial: Project[] = []): ProjectsStore {
  return { load: async () => initial, save: async () => {} };
}

async function renderBar(initial: Project[] = []) {
  const projects = createProjectsState(memStore(initial));
  await projects.load();
  const utils = render(ProjectBar, { props: { projects } });
  return { ...utils, projects };
}

describe('ProjectBar — Chip-Punkt (BL-209)', () => {
  it('zeigt KEINEN Punkt bei einem Projekt ohne gesetzte Farbe (Bestandsdaten bleiben gültig)', async () => {
    const { container } = await renderBar([makeProject('p1', { name: 'Ohne Farbe' })]);
    expect(screen.getByText('Ohne Farbe')).toBeTruthy();
    expect(container.querySelector('.project-bar__dot')).toBeNull();
  });

  it('zeigt einen farbigen Punkt, wenn color gesetzt ist', async () => {
    const { container } = await renderBar([makeProject('p1', { name: 'Mit Farbe', color: '2' })]);
    const dot = container.querySelector('.project-bar__dot') as HTMLElement;
    expect(dot).toBeTruthy();
    expect(dot.style.backgroundColor).toContain('var(--stb-proj-2)');
  });
});

describe('ProjectBar — Swatch-Auswahl + Notiz (BL-209, ADR-v9-158)', () => {
  it('legt ein neues Projekt mit gewählter Farbe + Notiz an (Rundlauf über projects.add)', async () => {
    const { projects } = await renderBar();
    await fireEvent.click(screen.getByRole('button', { name: 'Neues Forschungsprojekt' }));
    await fireEvent.input(screen.getByPlaceholderText('z. B. Linie Decker'), { target: { value: 'Neues Projekt' } });

    await fireEvent.click(screen.getByRole('button', { name: 'Rot' }));
    await fireEvent.input(screen.getByPlaceholderText('Freie Notiz zu diesem Projekt'), {
      target: { value: 'Wichtige Randbemerkung' },
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(projects.projects).toHaveLength(1);
    expect(projects.projects[0]!.color).toBe('3');
    expect(projects.projects[0]!.note).toBe('Wichtige Randbemerkung');
  });

  it('"Keine Farbe" ist der Default und bleibt aria-pressed, solange keine Farbe gewählt wurde', async () => {
    await renderBar();
    await fireEvent.click(screen.getByRole('button', { name: 'Neues Forschungsprojekt' }));
    const noneBtn = screen.getByRole('button', { name: 'Keine Farbe' });
    expect(noneBtn.getAttribute('aria-pressed')).toBe('true');

    await fireEvent.click(screen.getByRole('button', { name: 'Blau' }));
    expect(noneBtn.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Blau' }).getAttribute('aria-pressed')).toBe('true');

    // Zurück auf "Keine Farbe" -> aktiver Zustand wandert zurück (Bedienbarkeit auch
    // ohne Farbwahrnehmung: der ✓-Glyph, nicht nur die Umrandung, zeigt das an).
    await fireEvent.click(noneBtn);
    expect(noneBtn.querySelector('.project-bar__swatch-check')).toBeTruthy();
  });

  it('bearbeitet ein bestehendes Projekt: Farbe/Notiz vorbelegt, Änderung persistiert über projects.update', async () => {
    const { projects, container } = await renderBar([
      makeProject('p1', { name: 'Bestand', color: '4', note: 'Alte Notiz' }),
    ]);
    const chip = screen.getByRole('tab', { name: /Bestand/ });
    await fireEvent.dblClick(chip);

    // Vorbelegung: die Blau-Swatch ist bereits aktiv, die alte Notiz steht im Feld.
    expect(screen.getByRole('button', { name: 'Blau' }).getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByPlaceholderText('Freie Notiz zu diesem Projekt') as HTMLTextAreaElement).value).toBe(
      'Alte Notiz',
    );

    await fireEvent.click(screen.getByRole('button', { name: 'Grün' }));
    await fireEvent.input(screen.getByPlaceholderText('Freie Notiz zu diesem Projekt'), {
      target: { value: 'Neue Notiz' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(projects.projects[0]!.color).toBe('2');
    expect(projects.projects[0]!.note).toBe('Neue Notiz');
    expect(container.querySelector('.project-bar__dot')).toBeTruthy();
  });
});
