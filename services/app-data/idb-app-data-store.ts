// services/app-data/idb-app-data-store.ts — IndexedDB-Spiegel des B1-Bündels
// (Spec 30 §2.2/§2.3, BL-180). Plattform-API bewusst NUR hier, hinter dem
// AppDataStore-Vertrag; die Sync-Orchestrierung sieht nie `indexedDB` (Spec 02 §7).
//
// Ein Object-Store, ein fester Key — analog idb-places-store.ts. Öffnet die EINE
// geteilte stammbaum-v9-IndexedDB über services/idb-schema.ts (nie einen eigenen
// indexedDB.open(): sonst gewinnt beim ersten Anlegen nur der zuerst aufgerufene
// Upgrade-Handler und fremde Object-Stores fehlen, s. Kopf von idb-schema.ts).
import type { AppDataStore, AppDataWrapper } from './types';
import { openStammbaumDb, idbPut, STORE_APP_DATA as STORE_NAME } from '../idb-schema';

const KEY = 'current';

export class IdbAppDataStore implements AppDataStore {
  async load(): Promise<AppDataWrapper | null> {
    const db = await openStammbaumDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(KEY);
      req.onsuccess = () => resolve((req.result as AppDataWrapper | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async save(wrapper: AppDataWrapper): Promise<void> {
    return idbPut(STORE_NAME, wrapper, KEY);
  }
}
