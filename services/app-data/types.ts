// services/app-data/types.ts — Wire-Format und Verträge des B1-Bündels
// (`app-data.json`, Spec 30 §2.2/§2.3, ADR-v9-134/-173, BL-180).
//
// B1 = app-privater Zustand, der GERÄTE- UND DATEIÜBERGREIFEND gilt: er ist über
// Schema, Regelnamen, Flags oder URL identifiziert und zeigt in keinen Bestand
// (ADR-v9-173). Baumgebundener Zustand gehört ausdrücklich NICHT hierher — der
// Union-Merge kennt keinen Datei-Kontext und vereinigte sonst Ids aus verschiedenen
// Beständen.
//
// Bauart bewusst wie `orte.json` (services/places): derselbe `_rev`/`_device`/`_ts`-
// Wrapper, derselbe IDB-Spiegel als Laufzeit-Wahrheit, derselbe explizite Datei-Ein-/
// Ausgang über `FileService` — kein zweiter Sync-Mechanismus (INV-FILE-3).
import type { StoredValidationConfig } from '../../core/validate/index';

/** Erhöhen, sobald sich die SECTIONS-Struktur unverträglich ändert (s. `schema-too-new`). */
export const APP_DATA_SCHEMA_VERSION = 1;

/** Vorwahl der Ausgaben-Fläche (Spec 30 §2.2 „Export-Vorwahl"). */
export interface ExportPrefs {
  /** Id aus der Formatliste der Ausgaben-Fläche (`UiExportFormat`). */
  format: string;
  anonymize: boolean;
}

/**
 * Die B1-Abschnitte. Jeder Abschnitt ist eine EIGENE Merge-Einheit — das ist die
 * bewusste Grenze dieses Mechanismus (wie bei `orte.json` je Objekt, ADR-v9-116):
 * zwei Geräte, die denselben Abschnitt unterschiedlich ändern, bekommen einen
 * Konflikt-Hinweis, keine Feld-für-Feld-Verschmelzung.
 *
 * Fehlt ein Abschnitt, hat ihn dieses Gerät nie gesetzt — das ist etwas anderes als
 * ein leerer Abschnitt und der Grund, warum die Felder optional sind: nur so kann der
 * Merge „hat sich nicht geändert" von „wurde geleert" unterscheiden.
 */
export interface AppDataSections {
  valConfig?: StoredValidationConfig;
  exportPrefs?: ExportPrefs;
  // Später (eigene Backlog-Zeilen, kein Platzhalter-Code):
  //   quickTemplates (BL-232) · mapLayer (BL-230)
}

/** Der gespeicherte/exportierte Wrapper — Feldnamen wie bei `orte.json`. */
export interface AppDataWrapper {
  schemaVersion: number;
  rev: number;
  device: string;
  ts: number;
  sections: AppDataSections;
}

/** Speicher-Vertrag des IDB-Spiegels — in Tests durch eine Attrappe ersetzbar (TST-3). */
export interface AppDataStore {
  load(): Promise<AppDataWrapper | null>;
  save(wrapper: AppDataWrapper): Promise<void>;
}

/** Warnung aus einem Abgleich — dieselbe Form wie bei `orte.json` (Spec 30 §4 LP-9). */
export type AppDataWarning =
  | { kind: 'schema-too-new'; foundSchemaVersion: number }
  | {
      /** Abschnitte, die von beiden Seiten unterschiedlich geändert wurden (lokal gewinnt). */
      kind: 'section-conflict';
      conflictSections: string[];
    };

export interface AppDataReconcileResult {
  sections: AppDataSections;
  warning: AppDataWarning | null;
  saved: boolean;
  rev: number;
}

export interface LoadedAppData {
  sections: AppDataSections;
  rev: number;
  ts: number;
  isEmpty: boolean;
}
