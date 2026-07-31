// app-orte/orte-doc.ts — Dokument-Lebenszyklus des Orte-Editors (Spec 22 §4, ADR-v9-162).
//
// INV-ORTE-3: Der Zustand des Editors ist die geladene Datei plus die Änderungen seit dem
// letzten Speichern. Es gibt KEINEN zweiten dauerhaften Speicher — kein IDB-Spiegel, kein
// stiller Sync. Der Absturz-Entwurf (orte-draft-store.ts) ist Wiederherstellung, nie
// Quelle: er bumpt keine Revision, nimmt an keinem Merge teil und verfällt beim Speichern.
//
// Framework-frei und ohne Plattform-Zugriff: alle Ein-/Ausgänge kommen als injizierte
// Adapter herein (derselbe Seam wie services/file, Spec 32 §5) — der Dokument-Rundlauf
// „laden → bearbeiten → speichern → erneut laden → identisch" (OE-8) ist damit headless
// testbar, ohne Browser und ohne echte Datei.

import type { HofObject, PlaceObject } from '../core/places';
import type { PickerAdapter } from '../services/file';
import type { FileService } from '../services/file/file-service';
import type { PlacesFileHandleStore, PlacesFileWrapper } from '../services/places';
import { PLACES_SCHEMA_VERSION, parsePlacesFileWrapper, serializePlacesFileWrapper } from '../services/places';

export const PLACES_FILENAME = 'orte.json';
const PLACES_MIME_TYPE = 'application/json';

/** Der Inhalt des Dokuments — genau die zwei Mengen, die `orte.json` trägt. */
export interface OrteContent {
  placeObjects: Map<string, PlaceObject>;
  hofObjects: Map<string, HofObject>;
}

export interface OrteDocumentState {
  /** Dateiname des geladenen Dokuments; leer, solange keins offen ist. */
  fileName: string;
  /** true, sobald ein Dokument offen ist (auch ein frisch angelegtes leeres). */
  open: boolean;
  /** Ungespeicherte Änderungen seit dem letzten Speichern/Laden. */
  dirty: boolean;
  /**
   * Nur-Lese-Schutz: die Datei trägt eine höhere `schemaVersion` als dieses Programm kennt
   * (Spec 11 §2, Spec 30 §4). Schreiben würde Felder verwerfen, die eine neuere Fassung
   * verstanden hätte — deshalb wird gar nicht erst gespeichert.
   */
  readOnly: boolean;
  /** Revision, auf der das geladene Dokument steht; beim Speichern +1. */
  rev: number;
}

export const emptyOrteState = (): OrteDocumentState => ({
  fileName: '',
  open: false,
  dirty: false,
  readOnly: false,
  rev: 0
});

const toMap = <T extends { id: string }>(list: readonly T[]): Map<string, T> =>
  new Map(list.map((item) => [item.id, item]));

/**
 * Baut den Wire-Wrapper aus Inhalt + Zustand. `rev + 1` und die eigene Gerätekennung
 * machen eine im Editor gespeicherte Datei für das Hauptprogramm zu einem „Stand von
 * einem anderen Gerät" — sie läuft dort durch den regulären Union-Merge (Spec 30 §4),
 * es entsteht kein zweiter Abgleichspfad.
 *
 * Die Objekt-Mengen werden nach Id sortiert geschrieben: zwei Speichervorgänge ohne
 * zwischenzeitliche Änderung sollen byte-gleiche Dateien ergeben, unabhängig von der
 * Einfügereihenfolge der Map. Ohne das wäre der Dokument-Rundlauf (OE-8) von einer
 * Implementierungsnebensache abhängig.
 */
export function buildWrapper(content: OrteContent, rev: number, device: string, ts: number): PlacesFileWrapper {
  const byId = <T extends { id: string }>(m: Map<string, T>): T[] =>
    [...m.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    schemaVersion: PLACES_SCHEMA_VERSION,
    rev,
    device,
    ts,
    placeObjects: byId(content.placeObjects),
    hofObjects: byId(content.hofObjects)
  };
}

/** Der Inhalt eines geparsten Wrappers als Maps — die Form, mit der der Kern arbeitet. */
export function contentOf(wrapper: PlacesFileWrapper): OrteContent {
  return { placeObjects: toMap(wrapper.placeObjects), hofObjects: toMap(wrapper.hofObjects) };
}

export interface OpenedDocument {
  content: OrteContent;
  state: OrteDocumentState;
}

/**
 * Parst einen Dateitext zum Dokument. Wirft bei fremdem/kaputtem JSON mit klarer Meldung
 * (parsePlacesFileWrapper) — der Aufrufer zeigt sie an, statt still abzustürzen.
 */
export function openFromText(text: string, fileName: string): OpenedDocument {
  const wrapper = parsePlacesFileWrapper(text);
  return {
    content: contentOf(wrapper),
    state: {
      fileName: fileName || PLACES_FILENAME,
      open: true,
      dirty: false,
      readOnly: wrapper.schemaVersion > PLACES_SCHEMA_VERSION,
      rev: wrapper.rev
    }
  };
}

/** Ein frisches, leeres Dokument — der Editor ist ohne Datei startbar (Spec 22 §4). */
export function newDocument(): OpenedDocument {
  return {
    content: { placeObjects: new Map(), hofObjects: new Map() },
    state: { fileName: PLACES_FILENAME, open: true, dirty: false, readOnly: false, rev: 0 }
  };
}

export interface OrteDocIO {
  /** EIGENE Picker-Instanz (ADR-v9-70): berührt nie den Genealogie-Datei-Zustand. */
  picker: PickerAdapter;
  /** Dasselbe Export-Rohr wie jede andere Ausgabe (INV-FILE-2/-3). */
  fileService: FileService;
  /** Gemerktes FS-Handle für Tier-1-Speichern in dieselbe Datei. */
  handleStore: PlacesFileHandleStore;
  now(): number;
  deviceId(): string;
}

/** Ergebnis des Öffnens: `null` = der Nutzer hat den Picker abgebrochen (kein Fehler). */
export async function pickAndOpen(io: OrteDocIO): Promise<OpenedDocument | null> {
  const picked = await io.picker.pick();
  if (!picked) return null;
  const doc = openFromText(picked.text, picked.name);
  // Handle nur merken, wenn die Plattform eins liefert — sonst bleibt Tier 2
  // (Teilen/Download) der Speicherweg, ohne dass hier etwas zu entscheiden wäre.
  if (picked.handle !== undefined) await io.handleStore.save(picked.handle);
  return doc;
}

export interface SaveOutcome {
  saved: boolean;
  /** Nutzer-Meldung, falls nicht gespeichert wurde (Nur-Lese-Schutz, Abbruch). */
  notice: string;
  /** Neuer Dokumentzustand nach erfolgreichem Speichern. */
  state: OrteDocumentState;
}

/**
 * Speichert das Dokument. Tier 1 (zurück in dieselbe Datei) nur, wenn ein Handle bekannt
 * ist; sonst Teilen/Download — die Tier-Wahl bleibt vollständig Sache des FileService
 * (INV-FILE-3), hier wird nicht nach Plattform verzweigt.
 */
export async function saveDocument(
  io: OrteDocIO,
  content: OrteContent,
  state: OrteDocumentState
): Promise<SaveOutcome> {
  if (state.readOnly)
    return {
      saved: false,
      notice:
        'Diese Ortsdatei stammt aus einer neueren Programmfassung — sie wird nur gelesen, damit nichts verlorengeht.',
      state
    };

  const nextRev = state.rev + 1;
  const text = serializePlacesFileWrapper(buildWrapper(content, nextRev, io.deviceId(), io.now()));
  const handle = (await io.handleStore.load()) ?? undefined;
  const result = await io.fileService.exportToFile(text, state.fileName || PLACES_FILENAME, PLACES_MIME_TYPE, {
    handle
  });

  if (!result.ok) return { saved: false, notice: 'Nicht gespeichert (abgebrochen).', state };
  return { saved: true, notice: '', state: { ...state, dirty: false, rev: nextRev } };
}

/**
 * Der INHALT des Dokuments als vergleichbarer Text — Grundlage von INV-ORTE-2 (Spec 22 §5):
 * ein Kontext-Ladevorgang darf ihn nicht verändern.
 *
 * Revision, Gerät und Zeitstempel sind bewusst neutralisiert: sie ändern sich bei jedem
 * Speichern ohnehin und sind keine Aussage über den Bestand. Ein Vergleich, der an ihnen
 * scheitert, prüfte nicht die Invariante, sondern die Uhr.
 */
export function serializeForCompare(content: OrteContent): string {
  return serializePlacesFileWrapper(buildWrapper(content, 0, '', 0));
}
