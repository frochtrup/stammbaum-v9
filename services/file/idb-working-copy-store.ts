// services/file/idb-working-copy-store.ts — echte IndexedDB-Implementierung des
// WorkingCopyStore (INV-FILE-1). Plattform-API bewusst NUR hier, hinter dem
// WorkingCopyStore-Interface (types.ts) — die Orchestrierung (FileService) sieht nie
// `indexedDB` direkt (Spec 02 §7, Spec 32 §5).
//
// Ein Object-Store, ein fester Key ("current") — das erzwingt strukturell, dass es
// höchstens eine gespeicherte Arbeitskopie geben kann (INV-FILE-1).
//
// Öffnet die EINE geteilte stammbaum-v9-IndexedDB über services/idb-schema.ts (nicht
// einen eigenen indexedDB.open() mit eigenem Upgrade-Handler) — sonst gewinnt bei
// gleichzeitiger Nutzung durch mehrere Stores nur der zuerst geöffnete Handler und
// Object-Stores anderer Module fehlen (s. Kommentarkopf idb-schema.ts).

import type { WorkingCopy, WorkingCopyStore } from './types';
import { openStammbaumDb, STORE_WORKING_COPY as STORE_NAME } from '../idb-schema';

const KEY = 'current';

export class IdbWorkingCopyStore implements WorkingCopyStore {
  async load(): Promise<WorkingCopy | null> {
    const db = await openStammbaumDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(KEY);
      req.onsuccess = () => resolve((req.result as WorkingCopy | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async save(copy: WorkingCopy): Promise<void> {
    const db = await openStammbaumDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(copy, KEY);
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
