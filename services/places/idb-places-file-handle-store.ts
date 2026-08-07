// services/places/idb-places-file-handle-store.ts — echte IndexedDB-Implementierung des
// FS-Access-Handles für den orte.json-Datei-Ein-/Ausgang (ADR-v9-70, Spec 14 §6).
// Plattform-API bewusst NUR hier, hinter dem PlacesFileHandleStore-Interface (types.ts).
//
// Ein Object-Store, ein fester Key ("current") — analog idb-working-copy-store.ts /
// idb-places-store.ts. GETRENNT vom orte.json-IDB-Spiegel (places-mirror, idb-places-
// store.ts) UND von der Genealogie-Arbeitskopie (working-copy, services/file) — ein
// eigener Store, damit das Handle der einen Datei nie das der anderen überschreibt.
//
// Öffnet die EINE geteilte stammbaum-v9-IndexedDB über services/idb-schema.ts (nicht
// einen eigenen indexedDB.open() mit eigenem Upgrade-Handler) — sonst gewinnt bei
// gleichzeitiger Nutzung durch mehrere Stores nur der zuerst geöffnete Handler und
// Object-Stores anderer Module fehlen (s. Kommentarkopf idb-schema.ts, ADR-v9-22).

import type { PlacesFileHandleStore } from './types';
import { openStammbaumDb, idbPut, STORE_PLACES_FILE_HANDLE as STORE_NAME } from '../idb-schema';

const KEY = 'current';

export class IdbPlacesFileHandleStore implements PlacesFileHandleStore {
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
