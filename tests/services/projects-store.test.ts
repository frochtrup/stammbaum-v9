// tests/services/projects-store.test.ts — Persistenz-Rundlauf der Forschungsprojekte
// (Spec 12 §5, Spec 30 §2.2, BL-58). Gegen eine In-Memory-Attrappe des Speicher-Vertrags
// — kein echtes IndexedDB nötig (TST-3: Plattform-APIs hinter injizierbaren Adaptern).
import { describe, expect, it } from 'vitest';
import { loadProjects, type ProjectsStore } from '../../services/research/index';
import { makeProject, type Project } from '../../core/research/index';

class MemoryStore implements ProjectsStore {
  constructor(public value: Project[] = []) {}
  async load() { return this.value; }
  async save(projects: Project[]) { this.value = projects; }
}

class BrokenStore implements ProjectsStore {
  async load(): Promise<Project[]> { throw new Error('IDB weg'); }
  async save(): Promise<void> { throw new Error('IDB weg'); }
}

describe('ProjectsStore', () => {
  it('speichern → laden erhält die Projekte inkl. Scope', async () => {
    const store = new MemoryStore();
    await store.save([
      makeProject('p1', { name: 'Linie Decker', color: '#c33', created: '2026-07-25', scope: { surnames: ['Decker'], places: [], yearFrom: 1800, yearTo: 1900, personIds: [] } }),
    ]);
    const loaded = await loadProjects(store);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('Linie Decker');
    expect(loaded[0].scope.surnames).toEqual(['Decker']);
  });

  it('ein defekter Speicher blockiert die App nicht — er fällt auf die leere Liste zurück', async () => {
    expect(await loadProjects(new BrokenStore())).toEqual([]);
  });

  it('leerer Speicher liefert eine leere Projektliste', async () => {
    expect(await loadProjects(new MemoryStore())).toEqual([]);
  });
});
