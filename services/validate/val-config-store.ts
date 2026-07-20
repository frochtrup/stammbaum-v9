// services/validate/val-config-store.ts — Persistenz der Regel-Konfiguration
// (Spec 20 §3, ADR-v9-96).
//
// App-LOKAL in IndexedDB, bewusst NICHT in der Genealogie-Datei: der GEDCOM-/GRAMPS-
// Writer wird nicht angefasst, damit die Roundtrip-Treue (LP-1) unberührt bleibt. Der
// Preis ist bekannt und akzeptiert — zwei Geräte führen je eine eigene Konfiguration.
//
// Plattform-API (indexedDB) bewusst NUR hier, hinter dem ValConfigStore-Vertrag: die
// Aufrufer (UI) und die Kern-Engine sehen sie nie (Spec 02 §7, Spec 32 §5 TST-3).
import type { StoredValidationConfig } from '../../core/validate/index';
import { openStammbaumDb, STORE_VAL_CONFIG as STORE_NAME } from '../idb-schema';

const KEY = 'current';

/** Speicher-Vertrag — in Tests durch eine In-Memory-Attrappe ersetzbar. */
export interface ValConfigStore {
  load(): Promise<StoredValidationConfig | null>;
  save(cfg: StoredValidationConfig): Promise<void>;
  clear(): Promise<void>;
}

export class IdbValConfigStore implements ValConfigStore {
  async load(): Promise<StoredValidationConfig | null> {
    const db = await openStammbaumDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(KEY);
      req.onsuccess = () => resolve((req.result as StoredValidationConfig | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async save(cfg: StoredValidationConfig): Promise<void> {
    const db = await openStammbaumDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(cfg, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async clear(): Promise<void> {
    const db = await openStammbaumDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

/**
 * Konfiguration laden — fällt bei jedem Speicherfehler auf den Auslieferungszustand
 * zurück. Ein defekter/gelöschter Store darf die Datenprüfung nicht blockieren: der
 * Nutzer verliert dann seine Schwellen, nicht die Funktion.
 */
export async function loadValConfig(store: ValConfigStore): Promise<StoredValidationConfig | null> {
  try {
    return await store.load();
  } catch {
    return null;
  }
}
