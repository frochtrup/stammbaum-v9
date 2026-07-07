// services/places/idb-places-store.ts — echte IndexedDB-Implementierung des
// `orte.json`-Browser-Spiegels (Spec 14 §6, Spec 11 §2). Plattform-API bewusst NUR hier,
// hinter dem PlacesStore-Interface (types.ts) — die Sync-Orchestrierung
// (places-sync-service.ts) sieht nie `indexedDB` direkt (Spec 02 §7, Spec 32 §5).
//
// Ein Object-Store, ein fester Key ("current") — analog idb-working-copy-store.ts.
// Öffnet die EINE geteilte stammbaum-v9-IndexedDB über services/idb-schema.ts (nicht
// einen eigenen indexedDB.open() mit eigenem Upgrade-Handler) — sonst gewinnt bei
// gleichzeitiger Nutzung durch mehrere Stores nur der zuerst geöffnete Handler und
// Object-Stores anderer Module fehlen (s. Kommentarkopf idb-schema.ts — genau dieser
// Fehler wurde bei der Browser-Verifikation dieser Slice aufgedeckt und hier behoben).
//
// AUSGEKLAMMERT (bewusst, diese Slice): der Sync-Ordner-Dateipfad von orte.json (liegt
// laut Spec 14 §6/Spec 30 §2.1 NEBEN der Genealogie-Datei, vom OS gesynct). Das ist eine
// spätere Erweiterung über denselben PlacesStore-Vertrag (z. B. ein FsHandle-basierter
// Adapter analog services/file/fs-access-adapter.ts) — kein Graph-API/OAuth nötig. Der
// Browser-Spiegel hier ist der geräteweite, cross-Stammbaum-Cache (Spec 11 §2 Zeile 1).

import type { PlacesFileWrapper, PlacesStore } from './types';
import { openStammbaumDb, STORE_PLACES_MIRROR as STORE_NAME } from '../idb-schema';

const KEY = 'current';

export class IdbPlacesStore implements PlacesStore {
  async load(): Promise<PlacesFileWrapper | null> {
    const db = await openStammbaumDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(KEY);
      req.onsuccess = () => resolve((req.result as PlacesFileWrapper | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async save(wrapper: PlacesFileWrapper): Promise<void> {
    const db = await openStammbaumDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(wrapper, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
