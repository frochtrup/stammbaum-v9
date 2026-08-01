// tests/services/app-data-projects-store.test.ts — die Forschungsprojekte im B1-Bündel
// (Spec 30 §2.2/§2.3, Spec 12 §5, ADR-v9-176, BL-239).
//
// Geprüft wird der Adapter, nicht IndexedDB: der Bündel-Speicher ist eine In-Memory-
// Attrappe (TST-3). Drei Fragen — kommt an, was gespeichert wurde; wird der gerätelokale
// Altbestand einmalig übernommen; hebt der Ladeweg den alten Scope auf die geprüfte Form.
import { describe, expect, it } from 'vitest';
import {
  AppDataProjectsStore,
  AppDataSyncService,
  APP_DATA_SCHEMA_VERSION,
  type AppDataStore,
  type AppDataWrapper,
} from '../../services/app-data/index';
import type { ProjectsStore } from '../../services/research/index';
import { makeProject, type Project } from '../../core/research/index';

class MemoryAppDataStore implements AppDataStore {
  constructor(public wrapper: AppDataWrapper | null = null) {}
  async load(): Promise<AppDataWrapper | null> {
    return this.wrapper;
  }
  async save(w: AppDataWrapper): Promise<void> {
    this.wrapper = w;
  }
}

class MemoryProjectsStore implements ProjectsStore {
  constructor(public value: Project[] = []) {}
  async load(): Promise<Project[]> {
    return this.value;
  }
  async save(projects: Project[]): Promise<void> {
    this.value = projects;
  }
}

function svcOf(store: AppDataStore): AppDataSyncService {
  return new AppDataSyncService(store, { deviceId: () => 'geraet-A' }, { now: () => 1_700_000_000 });
}

const P1 = makeProject('p1', { name: 'Linie Decker', created: '2026-08-01' });

describe('AppDataProjectsStore (BL-239)', () => {
  it('speichern → laden über das Bündel', async () => {
    const bundle = new MemoryAppDataStore();
    const store = new AppDataProjectsStore(svcOf(bundle));

    await store.save([P1]);
    expect((await store.load())[0].name).toBe('Linie Decker');
    // Und zwar als Abschnitt DERSELBEN Datei, nicht in einem eigenen Speicher:
    expect(bundle.wrapper?.sections.projects?.[0].id).toBe('p1');
    expect(bundle.wrapper?.schemaVersion).toBe(APP_DATA_SCHEMA_VERSION);
  });

  it('übernimmt den gerätelokalen Altbestand EINMALIG ins Bündel', async () => {
    const bundle = new MemoryAppDataStore();
    const alt = new MemoryProjectsStore([P1]);
    const store = new AppDataProjectsStore(svcOf(bundle), alt);

    expect((await store.load())[0].id).toBe('p1');
    expect(bundle.wrapper?.sections.projects).toHaveLength(1); // ab jetzt ist das Bündel die Wahrheit
    // Der Altspeicher wird nie beschrieben — er bleibt unangetastet stehen.
    expect(alt.value).toHaveLength(1);
  });

  it('hebt einen Altbestands-Scope (`personIds`) auf die geprüfte Ref-Form (BL-238)', async () => {
    const bundle = new MemoryAppDataStore();
    const alt = {
      async load() {
        return [
          {
            id: 'p9',
            name: 'Alt',
            color: '',
            note: '',
            created: '2026-01-01',
            scope: { surnames: [], places: [], yearFrom: null, yearTo: null, personIds: ['@I1@'] },
          },
        ] as unknown as Project[];
      },
      async save() {},
    };
    const store = new AppDataProjectsStore(svcOf(bundle), alt);

    const geladen = await store.load();
    expect(geladen[0].scope.personRefs).toEqual([{ id: '@I1@', name: '', year: null }]);
    // Eine blanke Id reist NICHT mit — das war der Defekt aus BL-238.
    expect(JSON.stringify(bundle.wrapper?.sections.projects)).not.toContain('personIds');
  });

  it('leerer Altbestand schreibt nichts ins Bündel', async () => {
    const bundle = new MemoryAppDataStore();
    const store = new AppDataProjectsStore(svcOf(bundle), new MemoryProjectsStore([]));

    expect(await store.load()).toEqual([]);
    expect(bundle.wrapper).toBeNull();
  });
});
