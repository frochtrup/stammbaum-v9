// core/interop/gedcom-serialize.ts — GEDCOM-Writer (Spec 13 §3–§5).
//
// Roundtrip-Strategie (INV-PT, RT-1/RT-2): der Writer serialisiert primär den
// verbatim erhaltenen Zeilenbaum (roots). Bei einem nicht-mutierenden Speichern gibt
// er also exakt die geparste Struktur wieder → strukturell `out1===out2`, `net_delta=0`.
// Der HEAD wird als EINZIGE Ausnahme kontrolliert behandelt (verbatim aus header.raw,
// optional DATE-Rewrite über die injizierte Clock — TST-3). Das ist die v8-Orakel-Parität:
// v8 hält den HEAD ebenfalls verbatim (GED5, updateHeadDate=false) → net_delta=0.
//
// GED7/Strict transformieren den Baum über reine Adapter (transformGed7/stripStrict).
//
// Reine Funktion (serialize(model, format) → string), DOM-/Plattform-frei (INV-ARCH-1).

import { writeNode, ZEILEN_MAX_BYTES } from './gedcom-tree';
import type { GedNode } from './gedcom-tree';
import type { ParsedGedcom, GedFormat, Clock } from './types';
import { transformGed7, g7Schma } from './ged7-adapter';
import { stripStrict } from './strict-adapter';

const EOL = '\r\n';

export interface SerializeOptions {
  format?: GedFormat;
  /** Bei true: HEAD-DATE/TIME auf clock.now() setzen (mutierendes Speichern). */
  updateHeadDate?: boolean;
  clock?: Clock;
}

function gedcomDate(d: Date): string {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
function gedcomTime(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

/**
 * Serialisiert das Dokument. Für die Roundtrip-Garantie werden die Records verbatim
 * aus roots geschrieben; nur der HEAD-Record wird kontrolliert (DATE-Rewrite optional).
 */
export function serializeGedcom(doc: ParsedGedcom, opts: SerializeOptions = {}): string {
  const format = opts.format ?? '5.5.1';
  let roots = doc.roots;

  if (format === '7.0') {
    roots = roots.map(transformGed7);
    roots = withSchma(roots);
  } else if (format === 'strict') {
    roots = roots.map(stripStrict).filter((n): n is GedNode => n != null);
  }

  // Zeilenlänge ist eine FORMAT-Frage (BL-305, ADR-v9-211): 5.5.1 (und der daraus
  // abgeleitete Strict-Modus) begrenzt eine Zeile auf 255 Bytes und setzt den Rest per
  // `CONC` fort; GEDCOM 7 hat weder Grenze noch `CONC` (dort faltet `transformGed7` ein
  // vorhandenes `CONC` in seinen Elternwert). Deshalb steht die Politik hier und nicht im
  // format-agnostischen Baum-Writer.
  const maxBytes = format === '7.0' ? Infinity : ZEILEN_MAX_BYTES;

  const lines: string[] = [];
  for (const rec of roots) {
    if (rec.tag === 'HEAD') {
      writeHead(rec, lines, format, opts);
    } else {
      writeNode(rec, 0, lines, maxBytes);
    }
  }
  return lines.join(EOL);
}

/**
 * Hängt den GED7-`SCHMA`-Block in den HEAD (BL-242). Ein bereits vorhandener wird
 * ERSETZT, nicht ergänzt — sonst wüchse bei jedem GED7→GED7-Durchlauf einer nach
 * (dieselbe Doppelschreibungs-Falle wie bei modellierten `_`-Tags, Spec 13 §2.3).
 *
 * Angehängt statt einsortiert: die öffentliche Spec schreibt für die HEAD-Unterstrukturen
 * keine Reihenfolge vor und empfiehlt lediglich, dass `GEDC` zuerst steht — das bleibt so.
 */
function withSchma(roots: GedNode[]): GedNode[] {
  const schma = g7Schma(roots);
  return roots.map((rec) => {
    if (rec.tag !== 'HEAD') return rec;
    const ohneAlt = rec.children.filter((c) => c.tag !== 'SCHMA');
    return { ...rec, children: schma ? [...ohneAlt, schma] : ohneAlt };
  });
}

/**
 * HEAD verbatim mit optionalem DATE/TIME-Rewrite (die einzige by-design-Abweichung,
 * Register DEV-02 / GEDCOM.md §4). Ohne updateHeadDate ist der HEAD byte-identisch.
 */
function writeHead(head: GedNode, out: string[], format: GedFormat, opts: SerializeOptions): void {
  const now = opts.updateHeadDate && opts.clock ? opts.clock.now() : null;
  emitHead(head, 0, out, format, now);
}

function emitHead(
  node: GedNode,
  depth: number,
  out: string[],
  format: GedFormat,
  now: Date | null,
): void {
  // GED7: CHAR-Zeile und FORM LINEAGE-LINKED entfernen (GEDCOM.md §2).
  if (format === '7.0') {
    if (depth === 1 && node.tag === 'CHAR') return;
    if (depth === 2 && node.tag === 'FORM' && node.value === 'LINEAGE-LINKED') return;
  }

  let line = String(depth);
  if (depth === 0 && node.xref) line += ' ' + node.xref;
  line += ' ' + node.tag;

  // GED7: GEDC/VERS 5.5.1 → 7.0.
  let value = node.value;
  if (format === '7.0' && depth === 2 && node.tag === 'VERS' && /^5\.5/.test(value)) {
    value = '7.0';
  }
  if (now && depth === 1 && node.tag === 'DATE') value = gedcomDate(now);
  if (now && depth === 2 && node.tag === 'TIME') value = gedcomTime(now);

  if (value !== '') line += ' ' + value;
  out.push(line);
  for (const c of node.children) emitHead(c, depth + 1, out, format, now);
}
