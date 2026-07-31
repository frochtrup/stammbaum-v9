// ui/shell/event-line-row.ts — Zeilen-Form für `EventLine.svelte` (ADR-v9-80).
// EIGENE .ts-Datei statt eines benannten Exports aus der .svelte-Komponente selbst:
// plain `tsc` (im Gegensatz zu Svelte's eigenem Compiler/svelte-check) sieht `.svelte`-
// Module nur über die generische Ambient-Deklaration `declare module '*.svelte'`
// (Default-Export only) — ein `export interface` INNERHALB einer .svelte-Datei ist für
// svelte-interne Importe (andere .svelte-Dateien) sichtbar, aber nicht für `tsc`, wenn
// eine PLAIN .ts-Datei (z. B. ein Vitest-Test) den Typ importieren will (TS2614).
// Strukturell kompatibel mit `EventRow` (person-detail-model.ts) UND `FamilyEventRow`
// (family-detail-model.ts), seit beide auf `dateLabel`/`placeLabel` umgestellt sind.
import type { Citation } from '../../core/model/types';
import type { Coords } from '../../core/places';

export interface EventLineRow {
  key: string;
  label: string;
  dateLabel: string;
  /** Menschenlesbarer Datums-Freitext (GEDCOM `PHRASE`, `Event.datePhrase`) — z. B.
   *  „vor der Hochzeit". BL-197: Modell-Feld, das die Ereigniszeile bisher verschwieg;
   *  wird kursiv neben dem formatierten Datum gezeigt. Leer = nichts anzeigen. */
  datePhrase: string;
  /** Alter der Person bei diesem Ereignis (BL-196, `ageAtEvent`) — nur in Personen-Kontext
   *  gesetzt (Familien-/Orts-/Hof-Zeilen haben kein Einzel-Subjekt → leer). */
  age: string;
  placeLabel: string;
  value: string;
  addr: string;
  note: string;
  citations: Citation[];
  coords: Coords | null;
  placeId: string | null;
  hofId: string | null;
  empty: boolean;
}

/**
 * §10k / ADR-v9-53 Punkt 12 (BL-71): der Notiz-Absatz einer Ereigniszeile, der zeichen-
 * gleich zu `addr` oder `value` derselben Zeile ist (beide stehen bereits in der Kopfzeile,
 * s. EventLine.svelte), erscheint sonst DOPPELT — die auslösende Beobachtung war Franz
 * Ransmanns GRAD-Ereignis mit identischem ADDR/NOTE-Text.
 *
 * Die Untersuchung (BL-71, §10k „kein feststehender Fix") ergab: KEIN Parser-Muster.
 * Der GEDCOM-Parser liest `addr`/`note` aus GETRENNTEN Knoten (`1 ADDR`/`1 NOTE`,
 * gedcom-parse.ts), der GRAMPS-Parser projiziert `<description>` NUR nach `addr` ODER
 * `value` (gramps-events.ts, BL-143), `note` kommt dort aus `<noteref>`. Ein zeichen-
 * gleicher addr==note ist also Eigenschaft der Quelldatei (Einzelfall), keine Import-
 * Zuordnung — der Parser bleibt unangetastet (LP-1: Quelldaten byte-treu). Die Dedup ist
 * deshalb rein ANZEIGE-seitig: der redundante Absatz entfällt, die Rohwerte nicht.
 *
 * Gibt den anzuzeigenden Notiz-Text zurück (`''` = nichts Neues, Absatz weglassen).
 * Vergleich getrimmt (führendes/nachlaufendes Whitespace ist kein Bedeutungsunterschied),
 * die Rückgabe aber der ungetrimmte Originalwert (keine stille Wert-Änderung an dem, was
 * überhaupt gezeigt wird).
 *
 * WICHTIG — auch die ERSTE Adresszeile zählt: der reale auslösende Fall (Franz Ransmanns
 * GRAD-Ereignis) hat unter `2 ADDR` eine `3 CONT`-Fortsetzung („Münster"), die der Parser
 * (collectText) mit `\n` in `addr` faltet — `addr` ist dort „…Bauwesen\nMünster", `note`
 * nur „…Bauwesen". Der Notiz-Absatz ist trotzdem voll redundant (er wiederholt die erste,
 * inhaltstragende Adresszeile, die in der Kopfzeile ohnehin steht). Deshalb Vergleich gegen
 * `addr` GANZ und gegen dessen erste Zeile — bewusst ZEILENWEISE Gleichheit, KEIN
 * Teilstring-Enthaltensein (das würde „Bauer" fälschlich gegen „Bauernhof" schlucken).
 */
export function dedupeAddrNote(row: Pick<EventLineRow, 'note' | 'addr' | 'value'>): string {
  const n = row.note.trim();
  if (n === '') return row.note;
  const addr = row.addr.trim();
  const addrFirstLine = addr.split('\n')[0].trim();
  if (n === row.value.trim() || n === addr || n === addrFirstLine) return '';
  return row.note;
}

/**
 * GEDCOM-Ereigniswert `Y` ist ein STRUKTUR-Flag ("das Ereignis fand statt, sonst keine
 * Angaben" — GEDCOM 5.5.1 `EVENT_DETAIL`/`<<FAMILY_EVENT_STRUCTURE>>`, z. B. `1 MARR Y`),
 * KEIN anzuzeigender Inhalt. Ungefiltert erscheint er als nacktes „Y" in der Kopfzeile —
 * am sichtbarsten als „Heirat Y" im Familien-Detail.
 *
 * Die Todes-Projektion kennt diese Regel längst (`value='Y'` zählt dort NICHT als „echte
 * Daten" — person-detail-model.ts / core/model/event.ts §48), aber die GETEILTE
 * Ereigniszeile zog die strukturgleiche Geschwister-Stelle (MARR/ENGA u. a.) nicht mit.
 * Deshalb hier ZENTRAL an der einen Render-Stelle (EventLine.svelte), die JEDER Konsument
 * durchläuft (Person/Familie/Hof/Ort) — statt den Filter in jedem *-detail-model einzeln
 * zu wiederholen (INV-UI-4, „ALLE Geschwister-Stellen mitziehen").
 *
 * Rein ANZEIGE-seitig (wie dedupeAddrNote): der Rohwert im Modell/Export bleibt
 * unangetastet (LP-1). Vergleich getrimmt; `Y` ist ein GEDCOM-Großbuchstaben-Token.
 *
 * Gibt den anzuzeigenden Wert zurück (`''` = nichts zeigen).
 */
export function displayEventValue(value: string): string {
  return value.trim() === 'Y' ? '' : value;
}
