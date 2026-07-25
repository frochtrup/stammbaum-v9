// tests/ui/projects-state.test.ts — reaktiver Halter der Forschungsprojekte (BL-58).
// Kein DOM nötig (createProjectsState ist wie createRoute build-frei testbar).
import { describe, expect, it, vi } from 'vitest';
import { createProjectsState } from '../../ui/shell/projects-state.svelte';
import { makeProject, type Project } from '../../core/research/index';
import type { ProjectsStore } from '../../services/research/index';

function memStore(initial: Project[] = []): ProjectsStore & { saved: Project[][] } {
  const saved: Project[][] = [];
  return { saved, load: async () => initial, save: async (p) => { saved.push(p); } };
}

describe('createProjectsState', () => {
  it('add/remove pflegen die Liste und die aktive Auswahl', async () => {
    const ps = createProjectsState(memStore());
    ps.add(makeProject('p1', { name: 'A' }));
    ps.setActive('p1');
    expect(ps.projects.map((p) => p.name)).toEqual(['A']);
    expect(ps.activeProjectId).toBe('p1');
    expect(ps.activeScope).not.toBeNull();

    ps.remove('p1');
    expect(ps.projects).toHaveLength(0);
    expect(ps.activeProjectId).toBeNull(); // Auswahl fällt auf „Alle" zurück
    expect(ps.activeScope).toBeNull();
  });

  it('load verwirft eine aktive Auswahl, deren Projekt es nicht mehr gibt', async () => {
    const ps = createProjectsState(memStore([makeProject('p1', { name: 'A' })]));
    ps.setActive('geloescht');
    await ps.load();
    expect(ps.projects.map((p) => p.name)).toEqual(['A']);
    expect(ps.activeProjectId).toBeNull();
  });

  it('persistiert einen $state.snapshot, NICHT den Live-Proxy — Regression Browser-Fund 2026-07-25', () => {
    // Ohne $state.snapshot bekäme store.save den tief-reaktiven Svelte-Proxy; IndexedDBs
    // structured clone kann den NICHT klonen (DataCloneError), der Save scheitert still.
    // node's structuredClone toleriert den Proxy — deshalb prüfen wir hier die eigentliche
    // Ursache: der persistierte Wert muss ein eigenständiger Klon sein, nicht die
    // Live-Referenz (`ps.projects`), sonst ist es der Proxy.
    const store = memStore();
    const ps = createProjectsState(store);
    ps.add(makeProject('p1', { name: 'X' }));
    const persisted = store.saved.at(-1)!;
    expect(persisted).not.toBe(ps.projects); // Snapshot = eigener Klon, nicht der Proxy
    expect(persisted.map((p) => p.name)).toEqual(['X']);
  });

  it('ein Save-Fehler bricht die Mutation nicht ab (fire and forget)', () => {
    const store: ProjectsStore = { load: async () => [], save: vi.fn(async () => { throw new Error('IDB weg'); }) };
    const ps = createProjectsState(store);
    expect(() => ps.add(makeProject('p1', { name: 'X' }))).not.toThrow();
    expect(ps.projects).toHaveLength(1);
  });
});
