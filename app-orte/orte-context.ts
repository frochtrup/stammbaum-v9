// app-orte/orte-context.ts — Kontextdatei NUR LESEND (OE-7, Spec 22 §5, ADR-v9-163).
//
// > INV-ORTE-2: Das Laden einer Kontextdatei verändert das Dokument nicht.
//
// Das ist keine Selbstverständlichkeit, sondern eine Anforderung an den Ladepfad. Zwei
// Stellen würden sonst still in das Dokument des Nutzers schreiben:
//
//   1. Der Village-Seed-Vorpass (Spec 11 §4.2 Schritt 0) legt aus unbekannten PLAC-Angaben
//      neue Orte an. Dagegen steht `seed: false` (BL-223).
//   2. Der Hof-Bootstrap (Pfade C/B′) legt Höfe an — er steckt IN `resolveEvents` und
//      lässt sich nicht abschalten. Dagegen steht die Kopie: die Auflösung bekommt
//      Duplikate der Orts-/Hofmengen zu sehen, und was sie dort anlegt, wird verworfen.
//
// Übernommen werden ausschließlich die Ereignis-Verknüpfungen, und davon nur die, die auf
// ein im Dokument VORHANDENES Objekt zeigen — ein Link auf einen weggeworfenen
// Bootstrap-Hof wäre eine hängende Referenz und würde die Referenz-Sichtbarkeit (D1)
// verfälschen.

import type { Database } from '../core/model/types';
import { parseGedcom } from '../core/interop';
import { parseXMLText } from '../core/interop/gramps';
import { applyPlaceResolution } from '../services/places';
import type { PickerAdapter } from '../services/file';
import { mapAllEvents } from '../core/model/draft';
import type { OrteContent } from './orte-doc';

export interface LoadedContext {
  /** Personen/Familien der Kontextdatei — Grundlage der ereignisabhängigen Flächen. */
  db: Database;
  fileName: string;
}

/**
 * Löst die Ereignisse einer Kontext-Datenbank gegen das Dokument auf, ohne es zu
 * verändern. Exportiert (nicht nur intern), weil genau das die Invariante ist, die ein
 * Test prüft: Dokument serialisieren, diese Funktion aufrufen, erneut serialisieren.
 */
export function resolveAgainstDocument(contextDb: Database, doc: OrteContent): Database {
  // Kopien: was der Hof-Bootstrap hier anlegt, stirbt mit dieser Funktion.
  const scratch: Database = {
    ...contextDb,
    placeObjects: new Map(doc.placeObjects),
    hofObjects: new Map(doc.hofObjects)
  };
  applyPlaceResolution(scratch, { seed: false });

  // Nur Verknüpfungen auf Objekte übernehmen, die es im Dokument WIRKLICH gibt.
  const cleaned = mapAllEvents(scratch, (ev) => {
    const placeGone = ev.placeId != null && !doc.placeObjects.has(ev.placeId);
    const hofGone = ev.hofId != null && !doc.hofObjects.has(ev.hofId);
    if (!placeGone && !hofGone) return null;
    return { ...ev, placeId: placeGone ? null : ev.placeId, hofId: hofGone ? null : ev.hofId };
  });

  // Das Dokument selbst reisst nicht mit zurück — der Aufrufer nimmt nur individuals/families.
  return cleaned;
}

/** Öffnet eine Genealogie-Datei über den Picker und liest sie gegen das Dokument aus. */
export async function loadContextDocument(
  picker: PickerAdapter,
  doc: OrteContent
): Promise<LoadedContext | null> {
  const picked = await picker.pick();
  if (!picked) return null;
  const parsed = picked.format === 'gramps' ? parseXMLText(picked.text) : parseGedcom(picked.text);
  return { db: resolveAgainstDocument(parsed.db, doc), fileName: picked.name };
}
