// services/media/idb-media-folder-handle-store.ts — der Verzeichnis-Handle des
// Medien-Ordners in IndexedDB (Kategorie A, Spec 30 §2.2, ADR-v9-187 Punkt 3).
//
// Eigener Object-Store, fester Key — exakt wie idb-places-file-handle-store.ts: das
// Handle der einen Datei darf nie das der anderen überschreiben. Geöffnet wird die EINE
// geteilte Datenbank über services/idb-schema.ts (nicht ein eigener indexedDB.open()
// mit eigenem Upgrade-Handler, s. Kommentarkopf dort).
import type { MediaFolderHandleStore } from './types';
import { openStammbaumDb, STORE_MEDIA_FOLDER_HANDLE as STORE_NAME } from '../idb-schema';

const KEY = 'current';

export class IdbMediaFolderHandleStore implements MediaFolderHandleStore {
  async load(): Promise<unknown | null> {
    const db = await openStammbaumDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async save(handle: unknown): Promise<void> {
    const db = await openStammbaumDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(handle, KEY);
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
