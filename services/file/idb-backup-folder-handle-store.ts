// services/file/idb-backup-folder-handle-store.ts — das Verzeichnis-Handle des
// Backup-Ordners in IndexedDB (Kategorie A, Spec 30 §2.2, Spec 14 §4.1).
//
// Eigener Object-Store, fester Key — exakt wie idb-media-folder-handle-store.ts und
// idb-places-file-handle-store.ts: das Handle des einen Ziels darf nie das eines anderen
// überschreiben. Geöffnet wird die EINE geteilte Datenbank über services/idb-schema.ts.
import type { BackupFolderHandleStore } from './types';
import { openStammbaumDb, idbPut, STORE_BACKUP_FOLDER_HANDLE as STORE_NAME } from '../idb-schema';

const KEY = 'current';

export class IdbBackupFolderHandleStore implements BackupFolderHandleStore {
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
    return idbPut(STORE_NAME, handle, KEY);
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
