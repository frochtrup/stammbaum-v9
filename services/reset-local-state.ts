// services/reset-local-state.ts — die zwei Selbsthilfe-Aktionen aus Spec 14 §3.3
// („Ortsdaten zurücksetzen", „Alles zurücksetzen"), [ADR-v9-297].
//
// WAS HIER NICHT PASSIERT: keine Datei auf Betriebssystem-Ebene wird angefasst. Beide
// Aktionen betreffen ausschließlich lokal abgeleiteten oder zwischengespeicherten Zustand
// — die eigene GEDCOM-/GRAMPS-Datei und eine exportierte `orte.json` bleiben, wo sie sind.
//
// WARUM DIE AUFZÄHLUNG HIER LIEGT UND NICHT IN DER OBERFLÄCHE. Der Warnhinweis vor dem
// harten Reset muss benennen, was verschwindet — und diese Liste darf nicht neben der
// Store-Liste her existieren, sonst nennt sie nach dem nächsten neuen Store neun von zehn
// Dingen und wirkt trotzdem vollständig. Sie steht deshalb an derselben Stelle wie das
// Löschen selbst, und ein Test hält fest, dass JEDER Store aus `ALL_STORES` hier eine
// Zeile hat (`tests/services/reset-local-state.test.ts`).
import { ALL_STORES, idbClearStores, STORE_PLACES_MIRROR } from './idb-schema';

/** Wiederbeschaffbarkeit — die Achse, an der der Warnhinweis sortiert ist. */
export type Wiederbeschaffbar =
  /** Steht auch woanders: die eigene Datei, der Medien-Ordner, eine Neu-Auswahl. */
  | 'ja'
  /** Nur, wenn der Nutzer exportiert hat — sonst ist dies die einzige Kopie. */
  | 'nur-mit-export'
  /** Es gibt keine zweite Kopie. */
  | 'nein';

export interface LokalerDatenposten {
  store: string;
  /** Wie der Posten im Warnhinweis heißt — Nutzersprache, nicht der Store-Name. */
  label: string;
  woher: Wiederbeschaffbar;
}

/**
 * Was „Alles zurücksetzen" löscht, in der Reihenfolge, in der es der Nutzer lesen soll:
 * das Unwiederbringliche zuerst. Der Reset selbst geht über `ALL_STORES`, nicht über diese
 * Liste — sie ist die Beschriftung, nicht die Wahrheit.
 */
export const LOKALE_DATEN: readonly LokalerDatenposten[] = [
  { store: 'places-mirror', label: 'kuratierte Orte und Höfe', woher: 'nur-mit-export' },
  { store: 'research-projects', label: 'Forschungsprojekte', woher: 'nein' },
  { store: 'dedup-ignored', label: '„Kein Duplikat"-Entscheidungen', woher: 'nein' },
  { store: 'val-config', label: 'Regel-Konfiguration der Prüfung', woher: 'nein' },
  { store: 'app-data', label: 'App-Einstellungen (Export-Vorwahl, Vorlagen)', woher: 'nein' },
  { store: 'media-bytes', label: 'importierte Medien-Dateien', woher: 'nur-mit-export' },
  { store: 'working-copy', label: 'die Arbeitskopie des geladenen Stammbaums', woher: 'ja' },
  { store: 'orte-editor-draft', label: 'Zwischenstand des Orte-Editors', woher: 'ja' },
  { store: 'places-file-handle', label: 'gemerkter Zugriff auf die orte.json', woher: 'ja' },
  { store: 'media-folder-handle', label: 'gemerkter Zugriff auf den Medien-Ordner', woher: 'ja' },
  { store: 'backup-folder-handle', label: 'gemerkter Zugriff auf den Backup-Ordner', woher: 'ja' },
];

/**
 * Löscht NUR den `orte.json`-Browser-Spiegel (Spec 14 §3.3, Spec 11 §2). Die geladene
 * Genealogie-Datei bleibt unberührt; Orte und Höfe werden beim nächsten Laden neu
 * aufgelöst (Spec 11 §4). Für den Fall eines inkonsistenten Spiegels — nicht als
 * Aufräum-Geste: eine nie exportierte Kuration ist danach weg.
 */
export function resetPlacesMirror(): Promise<void> {
  return idbClearStores([STORE_PLACES_MIRROR]);
}

/**
 * Löscht ALLEN lokalen Zustand dieser App (Spec 14 §3.3). Über `ALL_STORES`, damit ein
 * künftiger Store nicht übersehen wird.
 *
 * Der NEUSTART gehört ausdrücklich NICHT hierher: dieser Dienst räumt den Speicher, die
 * Schale entscheidet, was danach passiert (INV-ARCH-1 — ein `location.reload()` in einem
 * Dienst wäre eine UI-Entscheidung an der falschen Schicht und in einem Test nicht
 * abschaltbar).
 */
export function resetAllLocalState(): Promise<void> {
  return idbClearStores(ALL_STORES);
}
