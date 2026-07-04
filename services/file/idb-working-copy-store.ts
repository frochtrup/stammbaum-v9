// services/file/idb-working-copy-store.ts — echte IndexedDB-Implementierung des
// WorkingCopyStore (INV-FILE-1). Plattform-API bewusst NUR hier, hinter dem
// WorkingCopyStore-Interface (types.ts) — die Orchestrierung (FileService) sieht nie
// `indexedDB` direkt (Spec 02 §7, Spec 32 §5).
//
// Ein Object-Store, ein fester Key ("current") — das erzwingt strukturell, dass es
// höchstens eine gespeicherte Arbeitskopie geben kann (INV-FILE-1).

import type { WorkingCopy, WorkingCopyStore } from './types';

const DB_NAME = 'stammbaum-v9';
const DB_VERSION = 1;
const STORE_NAME = 'working-copy';
const KEY = 'current';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class IdbWorkingCopyStore implements WorkingCopyStore {
  async load(): Promise<WorkingCopy | null> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(KEY);
      req.onsuccess = () => resolve((req.result as WorkingCopy | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async save(copy: WorkingCopy): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(copy, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async clear(): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
