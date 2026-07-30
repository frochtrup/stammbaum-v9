// services/idb-schema.ts — EIN gemeinsames IndexedDB-Schema für alle services/*-Stores
// (Spec 14 §3.1 Arbeitskopie, Spec 14 §6/Spec 11 §2 orte.json-Browser-Spiegel).
//
// Warum das nötig ist: `indexedDB.open(name, version)` liefert bei gleichzeitiger
// Nutzung durch mehrere unabhängige Module GENAU EINE Datenbank-Instanz; nur der
// `onupgradeneeded`-Handler, der beim tatsächlichen Anlegen/Hochversionieren läuft, darf
// Object-Stores erzeugen. Hätten `idb-working-copy-store.ts` und `idb-places-store.ts`
// (wie ursprünglich gebaut) je einen EIGENEN `indexedDB.open('stammbaum-v9', 1)`-Aufruf
// mit je einem eigenen Upgrade-Handler, der nur den eigenen Store anlegt, gewinnt beim
// allerersten Öffnen NUR der zuerst aufgerufene Handler — der zweite Store existiert nie
// (IndexedDB feuert `onupgradeneeded` nur einmal pro Versionssprung, unabhängig davon,
// wie viele Module `open()` aufrufen). Browser-Verifikation dieser Slice deckte genau das
// auf: "Failed to execute 'transaction' on 'IDBDatabase': One of the specified object
// stores was not found" beim Import, weil services/file zuerst geöffnet hatte und
// services/places' Store fehlte.
//
// EIN Ort definiert ALLE Stores + die aktuelle Version — jedes künftige Store muss hier
// ergänzt werden (Analog zum "ein Export-Rohr"-Prinzip, INV-FILE-2, nur für Storage-Setup).

const DB_NAME = 'stammbaum-v9';
const DB_VERSION = 7;

export const STORE_WORKING_COPY = 'working-copy';
export const STORE_PLACES_MIRROR = 'places-mirror';
/** Eigenes FS-Handle für den orte.json-Datei-Ein-/Ausgang (ADR-v9-70) — GETRENNT von der
 * Genealogie-Arbeitskopie (STORE_WORKING_COPY): eigener Store, eigener Key, eigenes Handle. */
export const STORE_PLACES_FILE_HANDLE = 'places-file-handle';
/** Regel-Konfiguration der Validierung (Spec 20 §3, ADR-v9-96) — app-lokal, reist NICHT
 * mit der Genealogie-Datei; der GEDCOM-Writer bleibt damit unberührt (LP-1). */
export const STORE_VAL_CONFIG = 'val-config';
/** „Kein Duplikat"-Paare der Duplikat-Erkennung (BL-105, Spec 20 §1.12, ADR-v9-104) —
 * app-lokal wie die Regel-Konfiguration: eine Nutzer-Einschätzung über den eigenen
 * Bestand, keine genealogische Aussage, die mit der Datei reisen müsste (LP-1). */
export const STORE_DEDUP_IGNORED = 'dedup-ignored';
/** Forschungsprojekte (Spec 12 §5, Spec 30 §2.2, BL-58) — app-lokal/geräteweit, reisen
 * NICHT mit der Genealogie-Datei; der GEDCOM-Writer bleibt unberührt (LP-1). */
export const STORE_PROJECTS = 'research-projects';
/** Absturz-Entwurf des Standalone-Orte-Editors (Spec 22 §4, ADR-v9-162, INV-ORTE-3).
 * KEIN Spiegel und keine zweite Wahrheit: ein entprellter Zwischenstand, der beim Start
 * zur Wiederherstellung angeboten und beim erfolgreichen Speichern verworfen wird. Er
 * traegt bewusst KEINE Revision — waere er eine, wuerde er am Sync teilnehmen. */
export const STORE_ORTE_DRAFT = 'orte-editor-draft';

let dbPromise: Promise<IDBDatabase> | null = null;

/** Öffnet (und cacht) die EINE stammbaum-v9-IndexedDB mit allen bekannten Object-Stores. */
export function openStammbaumDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_WORKING_COPY)) {
          db.createObjectStore(STORE_WORKING_COPY);
        }
        if (!db.objectStoreNames.contains(STORE_PLACES_MIRROR)) {
          db.createObjectStore(STORE_PLACES_MIRROR);
        }
        if (!db.objectStoreNames.contains(STORE_PLACES_FILE_HANDLE)) {
          db.createObjectStore(STORE_PLACES_FILE_HANDLE);
        }
        if (!db.objectStoreNames.contains(STORE_VAL_CONFIG)) {
          db.createObjectStore(STORE_VAL_CONFIG);
        }
        if (!db.objectStoreNames.contains(STORE_DEDUP_IGNORED)) {
          db.createObjectStore(STORE_DEDUP_IGNORED);
        }
        if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
          db.createObjectStore(STORE_PROJECTS);
        }
        if (!db.objectStoreNames.contains(STORE_ORTE_DRAFT)) {
          db.createObjectStore(STORE_ORTE_DRAFT);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}
