// app-orte/orte-draft-store.ts — Absturz-Wiederherstellung des Orte-Editors
// (OE-4, Spec 22 §4, ADR-v9-162).
//
// WAS DAS IST UND WAS NICHT: Der Editor führt keinen Spiegel (INV-ORTE-3) — die Datei ist
// die einzige Wahrheit. Ein geschlossener Tab würde damit aber ungespeicherte Arbeit
// verlieren. Dagegen steht dieser Entwurf: ein entprellter Zwischenstand, der beim Start
// zur Wiederherstellung ANGEBOTEN und beim erfolgreichen Speichern VERWORFEN wird.
//
// Er ist die einzige Stelle, an der ein zweiter Speicher durch die Hintertür entstehen
// könnte. Drei Eigenschaften halten ihn davon ab, und sie sind der Grund für den Typ
// unten: er trägt KEINE Revision (sonst nähme er am Sync teil), er wird nie exportiert,
// und nichts liest ihn außer der Wiederherstellungs-Abfrage beim Start.

import type { HofObject, PlaceObject } from '../core/places';
import { openStammbaumDb, idbPut, STORE_ORTE_DRAFT as STORE_NAME } from '../services/idb-schema';

const KEY = 'current';

export interface OrteDraft {
  fileName: string;
  /** Revision der Datei, aus der der Entwurf hervorging — nur zur Anzeige/Plausibilität,
   *  NICHT zum Weiterzählen: gespeichert wird immer aus dem Dokumentzustand. */
  baseRev: number;
  savedAt: number;
  placeObjects: PlaceObject[];
  hofObjects: HofObject[];
}

export interface OrteDraftStore {
  load(): Promise<OrteDraft | null>;
  save(draft: OrteDraft): Promise<void>;
  clear(): Promise<void>;
}

/** Echte IndexedDB-Fassung (nur `app-orte/`); Tests nutzen einen In-Memory-Doppelgänger. */
export class IdbOrteDraftStore implements OrteDraftStore {
  async load(): Promise<OrteDraft | null> {
    const db = await openStammbaumDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(KEY);
      req.onsuccess = () => resolve((req.result as OrteDraft | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async save(draft: OrteDraft): Promise<void> {
    return idbPut(STORE_NAME, draft, KEY);
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
 * Entprellt das Schreiben. Ohne das schriebe jeder Tastendruck in einem Notizfeld eine
 * volle Kopie des Bestands — bei 400 Orten unnötig, bei 20.000 schädlich.
 */
export function debounceDraft(
  store: OrteDraftStore,
  delayMs = 1500,
  schedule: (fn: () => void, ms: number) => unknown = setTimeout,
  cancel: (h: unknown) => void = (h) => clearTimeout(h as ReturnType<typeof setTimeout>)
): { write(draft: OrteDraft): void; flushCancel(): void } {
  let handle: unknown = null;
  return {
    write(draft) {
      if (handle !== null) cancel(handle);
      handle = schedule(() => {
        handle = null;
        void store.save(draft);
      }, delayMs);
    },
    flushCancel() {
      if (handle !== null) cancel(handle);
      handle = null;
    }
  };
}
