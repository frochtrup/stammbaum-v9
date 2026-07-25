// services/research/idb-projects-store.ts — Persistenz der Forschungsprojekte
// (Spec 12 §5, Spec 30 §2.2, BL-58).
//
// App-LOKAL/geräteweit in IndexedDB, bewusst NICHT in der Genealogie-Datei: der GEDCOM-/
// GRAMPS-Writer wird nicht angefasst, damit die Roundtrip-Treue (LP-1) unberührt bleibt.
// Der Preis ist bekannt und akzeptiert — zwei Geräte führen je eigene Projekte. Exakt das
// Muster von services/validate/val-config-store.ts (ValConfigStore).
//
// Plattform-API (indexedDB) bewusst NUR hier, hinter dem ProjectsStore-Vertrag: die
// Aufrufer (UI/AppState) und der Kern sehen sie nie (Spec 02 §7, Spec 32 §5 TST-3).
import type { Project } from '../../core/research/index';
import { openStammbaumDb, STORE_PROJECTS as STORE_NAME } from '../idb-schema';

const KEY = 'all';

/** Speicher-Vertrag — in Tests durch eine In-Memory-Attrappe ersetzbar. */
export interface ProjectsStore {
  load(): Promise<Project[]>;
  save(projects: Project[]): Promise<void>;
}

export class IdbProjectsStore implements ProjectsStore {
  async load(): Promise<Project[]> {
    const db = await openStammbaumDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(KEY);
      req.onsuccess = () => resolve((req.result as Project[] | undefined) ?? []);
      req.onerror = () => reject(req.error);
    });
  }

  async save(projects: Project[]): Promise<void> {
    const db = await openStammbaumDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(projects, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

/**
 * Projekte laden — fällt bei jedem Speicherfehler auf die leere Liste zurück. Ein
 * defekter/gelöschter Store darf die App nicht blockieren: der Nutzer verliert dann seine
 * Projekt-Definitionen, nicht die Funktion (wie loadValConfig).
 */
export async function loadProjects(store: ProjectsStore): Promise<Project[]> {
  try {
    return await store.load();
  } catch {
    return [];
  }
}
