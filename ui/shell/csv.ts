// ui/shell/csv.ts — DIE EINE CSV-Serialisierungsfunktion (BL-125, ADR-v9-159) für die
// Personen- UND Familienliste (INV-UI-4, kein zweiter Rechenweg). Reine Funktion
// (Spalten-Definition + Zeilen -> String), DOM-frei — der Datei-Sink ist der bereits
// vorhandene `AnchorDownloadAdapter` (services/file/download-adapter.ts), nicht hier.
//
// Dialekt (ADR-v9-159 Punkt 5): `;` als Feldtrennzeichen + UTF-8-BOM, weil Excel-DE
// ohne BOM UTF-8-Umlaute kaputt anzeigt und mit Komma-Trennzeichen deutsche
// Dezimalzahlen/CSV-Konventionen kollidieren.

export interface CsvColumn<T> {
  /** Kopfzeilen-Beschriftung dieser Spalte. */
  header: string;
  /** Liefert den Zellenwert für eine Zeile; `null`/`undefined` wird zu einer leeren Zelle. */
  value: (row: T) => string | number | null | undefined;
}

const DELIMITER = ';';
/** UTF-8-BOM — Excel-DE erkennt die Kodierung sonst nicht und zeigt Umlaute kaputt an. */
const BOM = '\uFEFF';

/** RFC-4180-Quotierung: ein Feld, das das Trennzeichen, Anführungszeichen oder einen
 *  Zeilenumbruch enthält, wird in Anführungszeichen gesetzt; enthaltene Anführungszeichen
 *  werden verdoppelt. */
function escapeCsvField(raw: string): string {
  const needsQuoting = raw.includes(DELIMITER) || raw.includes('"') || raw.includes('\n') || raw.includes('\r');
  if (!needsQuoting) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

/**
 * Baut einen CSV-String aus einer Spaltendefinition + einer bereits gefilterten/
 * sortierten Zeilenmenge (BL-125: „exportiert wird die gefilterte und sortierte
 * Zeilenmenge, wie sie die Liste gerade zeigt — nicht die Datenbank"). Zeilenende `\r\n`
 * (RFC 4180); die BOM steht vor der ersten Kopfzeile.
 */
export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const lines: string[] = [columns.map((c) => escapeCsvField(c.header)).join(DELIMITER)];
  for (const row of rows) {
    lines.push(
      columns
        .map((c) => {
          const v = c.value(row);
          return escapeCsvField(v == null ? '' : String(v));
        })
        .join(DELIMITER),
    );
  }
  return BOM + lines.join('\r\n');
}
