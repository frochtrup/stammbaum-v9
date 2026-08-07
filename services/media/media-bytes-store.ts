// services/media/media-bytes-store.ts — importierte Medien-Bytes in IndexedDB
// (Spec 14 §7 `img:<relPath>`, Spec 30 §2.2 Kategorie A, BL-259).
//
// DER ZWEITE ZUGANGSWEG zum selben Ziel: auf Plattformen ohne File-System-Access-API
// (iOS/Safari — laut Spec 01 die primäre Feldarbeits-Plattform) gibt es keinen
// Verzeichnis-Handle. Dort wählt der Nutzer Dateien EINZELN aus; ihre Bytes landen hier
// und werden von derselben Auflösung gefunden wie Dateien aus einem verbundenen Ordner.
//
// WAS DER BROWSER NICHT HERGIBT: den Ordner, aus dem eine gewählte Datei stammt. Ein
// `<input type="file">` liefert nur den Basisnamen (`webkitRelativePath` ist leer, wenn
// nicht ein ganzes Verzeichnis gewählt wurde — was iOS/Safari nicht anbietet). Importierte
// Medien werden deshalb über den DATEINAMEN zugeordnet, und dieser Treffer trägt dieselbe
// Markierung wie jeder andere Basisnamen-Treffer (ADR-v9-187 Punkt 5) — die Unschärfe wird
// angezeigt, nicht verschwiegen.
import { openStammbaumDb, idbPut, STORE_MEDIA_BYTES as STORE_NAME } from '../idb-schema';
import { normalizePath } from './media-index';

/** Schlüssel-Präfix aus Spec 14 §7 — wörtlich übernommen, damit Spec und Code dieselbe
 *  Sprache sprechen (der eigene Store macht ihn technisch entbehrlich). */
export const KEY_PREFIX = 'img:';

export function bytesKey(path: string): string {
  return KEY_PREFIX + normalizePath(path);
}

/** Speicher-Vertrag — in Tests durch eine Attrappe ersetzbar (TST-3). */
export interface MediaBytesStore {
  put(path: string, blob: Blob): Promise<void>;
  get(path: string): Promise<Blob | null>;
  /** Alle bekannten Pfade (normalisiert, ohne Präfix) — für Zählung und Zuordnung. */
  keys(): Promise<string[]>;
  clear(): Promise<void>;
}

export class IdbMediaBytesStore implements MediaBytesStore {
  async put(path: string, blob: Blob): Promise<void> {
    return idbPut(STORE_NAME, blob, bytesKey(path));
  }

  async get(path: string): Promise<Blob | null> {
    const db = await openStammbaumDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(bytesKey(path));
      req.onsuccess = () => resolve((req.result as Blob) ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async keys(): Promise<string[]> {
    const db = await openStammbaumDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAllKeys();
      req.onsuccess = () =>
        resolve((req.result as string[]).map((k) => k.slice(KEY_PREFIX.length)));
      req.onerror = () => reject(req.error);
    });
  }

  async clear(): Promise<void> {
    const db = await openStammbaumDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
