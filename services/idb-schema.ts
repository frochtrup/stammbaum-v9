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

import { klonFehlerText } from '../core/clone-diagnose';

const DB_NAME = 'stammbaum-v9';
const DB_VERSION = 10;

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
/** B1-Bündel: dateiübergreifender app-privater Zustand (Spec 30 §2.2/§2.3, ADR-v9-173,
 * BL-180) — Regel-Konfiguration, Export-Vorwahl, später Templates/Kartenebene. Trägt den
 * `_rev`/`_device`/`_ts`-Wrapper wie orte.json und ist damit der EINZIGE app-private
 * Zustand mit geräteübergreifendem Mitnahme-Weg. Baumgebundenes gehört ausdrücklich
 * NICHT hierher (Projekte, Ausschluss-Paare). */
export const STORE_APP_DATA = 'app-data';
/** Verzeichnis-Handle des Medien-Ordners (Spec 14 §7, Spec 30 §2.2, ADR-v9-187, BL-257) —
 * Kategorie A: ein `FileSystemDirectoryHandle` ist nicht serialisierbar und auf einem
 * zweiten Gerät bedeutungslos, er bleibt gerätelokal. Eigener Store neben den anderen
 * FS-Handles, damit keiner den anderen überschreibt. */
export const STORE_MEDIA_FOLDER_HANDLE = 'media-folder-handle';
/** Importierte Medien-Bytes (Spec 14 §7 `img:<relPath>`, BL-259) — der zweite Zugangsweg
 * neben dem Verzeichnis-Handle, für Plattformen ohne File-System-Access-API. Kategorie A:
 * gerätelokal, reist nicht mit. Anders als die übrigen Stores trägt dieser VIELE
 * Schlüssel (einen je Datei), nicht einen festen. */
export const STORE_MEDIA_BYTES = 'media-bytes';

/**
 * ALLE Object-Stores dieser Datenbank — die EINE Liste ([ADR-v9-297]).
 *
 * Sie speist das Anlegen (`onupgradeneeded`) UND das Zurücksetzen
 * (`services/reset-local-state.ts`). Vorher stand die Aufzählung nur im Upgrade-Handler
 * als zehn `if`-Blöcke; ein Reset daneben wäre eine ZWEITE Liste geworden, und der
 * Kopfkommentar oben („jedes künftige Store muss hier ergänzt werden") wäre damit auf
 * zwei Stellen angewiesen, von denen man die zweite vergisst. Wer hier einen Store
 * einträgt, hat ihn angelegt und zurücksetzbar gemacht — der Zwang statt der Erinnerung.
 */
export const ALL_STORES: readonly string[] = [
  STORE_WORKING_COPY,
  STORE_PLACES_MIRROR,
  STORE_PLACES_FILE_HANDLE,
  STORE_VAL_CONFIG,
  STORE_DEDUP_IGNORED,
  STORE_PROJECTS,
  STORE_ORTE_DRAFT,
  STORE_APP_DATA,
  STORE_MEDIA_FOLDER_HANDLE,
  STORE_MEDIA_BYTES,
];

let dbPromise: Promise<IDBDatabase> | null = null;

/** Öffnet (und cacht) die EINE stammbaum-v9-IndexedDB mit allen bekannten Object-Stores. */
export function openStammbaumDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        // Über die EINE Liste, nicht über zehn `if`-Blöcke: ein neuer Store wird damit
        // angelegt UND zurücksetzbar, ohne dass jemand an die zweite Stelle denken muss.
        for (const name of ALL_STORES) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

/**
 * Schreibt EINEN Wert unter EINEM Schlüssel — die Boilerplate, die vorher in jedem der
 * neun Stores wortgleich stand (Transaktion öffnen, `put`, `oncomplete`/`onerror` in ein
 * Promise wickeln).
 *
 * DER EIGENTLICHE GRUND FÜR DIE EXTRAKTION ist der `catch`-Zweig: `put()` wirft einen
 * `DataCloneError` SYNCHRON, wenn der Wert nicht strukturiert klonbar ist, und die
 * Browser-Meldung nennt das schuldige Feld nicht — Chromium liefert bestenfalls
 * „#<Object> could not be cloned", WebKit nur „The object can not be cloned." (Fund
 * 2026-08-07, Safari: ein Ortsdatei-Import scheiterte, und die Meldung sagte weder
 * welchen Speicher noch welches Feld sie meint). Die Nachmessung findet den Pfad; sie
 * läuft NUR im Fehlerfall und kostet im Normalbetrieb nichts.
 *
 * Wäre der Zweig in jedem Store einzeln gebaut worden, hätte er in genau dem Store
 * gefehlt, der als nächstes kippt — dieselbe Geschwister-Lücke, die die Stores schon
 * einmal auseinanderlaufen ließ (s. Kopfkommentar oben zum eigenen `open()` je Modul).
 */
export async function idbPut(storeName: string, wert: unknown, key: IDBValidKey): Promise<void> {
  const db = await openStammbaumDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    try {
      tx.objectStore(storeName).put(wert, key);
    } catch (err) {
      if (err instanceof Error && err.name === 'DataCloneError') {
        reject(new Error(klonFehlerText(wert, `Speicher „${storeName}"`), { cause: err }));
        return;
      }
      reject(err);
      return;
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Leert die genannten Object-Stores ([ADR-v9-297]) — EINE Transaktion über alle, damit
 * kein halb geleerter Zwischenstand entsteht, wenn ein Store fehlschlägt.
 *
 * Löscht die Stores NICHT, nur ihren Inhalt: die Datenbank behält ihre Version, und der
 * nächste Zugriff findet dieselbe Struktur vor. Ein `deleteDatabase` müsste warten, bis
 * jede offene Verbindung geschlossen ist (`onblocked`) — die App hält ihre über
 * `dbPromise` bewusst offen.
 */
export function idbClearStores(names: readonly string[]): Promise<void> {
  if (names.length === 0) return Promise.resolve();
  return openStammbaumDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction([...names], 'readwrite');
        for (const name of names) tx.objectStore(name).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}
