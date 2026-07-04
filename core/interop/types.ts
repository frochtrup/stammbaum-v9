// core/interop/types.ts — öffentliche Interop-Typen (Spec 13).
import type { Database } from '../model/types';
import type { GedNode } from './gedcom-tree';

/** GEDCOM-Ausgabemodus (Spec 13 §3–§5). */
export type GedFormat = '5.5.1' | '7.0' | 'strict';

/** Format-Wahl für serialize(): GEDCOM-Modi oder GRAMPS-XML. */
export type SerializeFormat = GedFormat | 'gramps';

/**
 * Ergebnis von parseGedcom(): das Domänenmodell PLUS die verbatim erhaltenen
 * Roh-Teilbäume (Passthrough-Backbone, INV-PT). `db` ist das editierbare Modell;
 * `roots` sind die parsierten Records in Original-Reihenfolge — die Quelle der
 * Roundtrip-Treue. Der Writer läuft primär über `roots` (Fidelity) und projiziert
 * modell-editierte Felder an ihre kanonische Position zurück.
 */
export interface ParsedGedcom {
  db: Database;
  /** Alle Level-0-Records in Datei-Reihenfolge (inkl. HEAD, TRLR, unbekannte Records). */
  roots: GedNode[];
}

/** Injizierbarer Takt (TST-3): CHAN/DATE ohne Wall-Clock. */
export interface Clock {
  /** ISO-artiger Zeitpunkt; genutzt für HEAD-DATE bei mutierendem Speichern. */
  now(): Date;
}
