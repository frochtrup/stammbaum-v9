// core/interop/gramps-date.ts — GRAMPS-Datum → Modell-`Event.date` (roher GEDCOM-
// Datumsstring) + `datePhrase` (BL-140 Stufe 1a, ADR-v9-114 D2).
//
// Reine Funktionen, DOM-/Plattform-frei (INV-ARCH-1), build-frei testbar (INV-ARCH-2).
//
// Das Orakel ist NICHT die Beispieldatei, sondern GRAMPS' eigener GEDCOM-Export — er ist
// die kanonische GRAMPS-Datum→GEDCOM-Datum-Abbildung, die hier nachgebaut wird:
//   - `plugins/lib/libgedcom.py::__build_date_string` — das Bare-Datum aus (Tag,Monat,Jahr).
//   - `plugins/lib/libgedcom.py::make_gedcom_date` — Modifier-/Qualitäts-Präfix.
//   - `plugins/export/exportgedcom.py::_date` — `quality = None if mod else quality`
//     (Modifier gewinnt), Span→„FROM x TO y", Range→„BET x AND y".
//   - `plugins/export/exportxml.py::get_iso_date` — das ISO-Format in `val`/`start`/`stop`
//     (`????` = Jahr unbekannt, `-??` = Monat unbekannt, fehlende Teile = 0).
//
// Die Rückrichtung (GEDCOM-String → GRAMPS-Datum) gehört zum Write-Back (BL-142) und wird
// dort gebaut — hier nur der Lese-Weg für die Projektion.

import type { XmlNode } from './xml-tree';
import { attr } from './xml-tree';

/** Ergebnis: `date` = roher GEDCOM-Datumsstring (oder null), `datePhrase` = Freitext (datestr). */
export interface GrampsDate {
  date: string | null;
  datePhrase: string;
}

/** 1-indizierte GEDCOM-Monatscodes (Index 0 leer), wie GRAMPS `MONTH` in libgedcom. */
const MONTH = ['', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const MODIFIER: Record<string, string> = { about: 'ABT', before: 'BEF', after: 'AFT', from: 'FROM', to: 'TO' };
const QUALITY: Record<string, string> = { estimated: 'EST', calculated: 'CAL' };

interface Parts {
  day: number;
  mon: number;
  year: number;
}

/**
 * Zerlegt einen GRAMPS-ISO-Datumsstring (`get_iso_date`-Form) in (Tag, Monat, Jahr).
 * Unbekannte Teile (`????`, `??`, fehlend) werden 0; führendes `-` = Jahr v. Chr.
 */
function parseIso(iso: string): Parts {
  const neg = iso.startsWith('-');
  const [yy = '', mm = '', dd = ''] = (neg ? iso.slice(1) : iso).split('-');
  const num = (x: string): number => (x === '' || x.includes('?') ? 0 : parseInt(x, 10) || 0);
  const year = num(yy);
  return { day: num(dd), mon: num(mm), year: neg ? -year : year };
}

/**
 * Baut das Bare-Datum (ohne Modifier/Qualität) aus (Tag, Monat, Jahr) — 1:1 nach GRAMPS'
 * `__build_date_string`. Unbekannter Monat verwirft den Tag (nur Jahr); fehlendes Jahr
 * klammert die Ausgabe (interpretierte Form). Ungültiger Monat → nur Jahr (IndexError-Fall).
 */
function buildBare(p: Parts): string {
  const { day, mon } = p;
  const negYear = p.year < 0;
  const year = Math.abs(p.year);
  const bce = negYear ? ' B.C.' : '';
  if (day === 0 && mon === 0 && year === 0) return '';
  if (mon < 0 || mon > 12 || (mon !== 0 && MONTH[mon] === undefined)) return `${year}${bce}`;
  const m = MONTH[mon];
  if (day === 0) {
    if (mon === 0) return `${year}${bce}`;
    if (year === 0) return `(${m})`;
    return `${m} ${year}${bce}`;
  }
  if (mon === 0) return `${year}${bce}`; // Tag ohne Monat → nur Jahr
  if (year === 0) return `(${day} ${m})`;
  return `${day} ${m} ${year}${bce}`;
}

/** GRAMPS-ISO-String → GEDCOM-Bare-Datum (`1967-02-16` → `16 FEB 1967`). Leer bleibt leer. */
export function isoToGedcom(iso: string): string {
  return buildBare(parseIso(iso));
}

/**
 * Ein GRAMPS-Datums-Element (`dateval`/`daterange`/`datespan`/`datestr`) → GEDCOM-Datum.
 * Übergeben wird das Datums-Element selbst (nicht der Eltern-Knoten).
 */
export function grampsDateToGedcom(dateNode: XmlNode): GrampsDate {
  switch (dateNode.tag) {
    case 'datestr':
      return { date: null, datePhrase: attr(dateNode, 'val') };
    case 'daterange': {
      const a = isoToGedcom(attr(dateNode, 'start'));
      const b = isoToGedcom(attr(dateNode, 'stop'));
      return { date: a === '' && b === '' ? null : `BET ${a} AND ${b}`, datePhrase: '' };
    }
    case 'datespan': {
      const a = isoToGedcom(attr(dateNode, 'start'));
      const b = isoToGedcom(attr(dateNode, 'stop'));
      return { date: a === '' && b === '' ? null : `FROM ${a} TO ${b}`, datePhrase: '' };
    }
    case 'dateval': {
      const bare = isoToGedcom(attr(dateNode, 'val'));
      if (bare === '') return { date: null, datePhrase: '' };
      const mod = MODIFIER[attr(dateNode, 'type')];
      if (mod) return { date: `${mod} ${bare}`, datePhrase: '' };
      // Qualität greift NUR ohne Modifier (Orakel exportgedcom.py::_date).
      const qual = QUALITY[attr(dateNode, 'quality')];
      return { date: qual ? `${qual} ${bare}` : bare, datePhrase: '' };
    }
    default:
      return { date: null, datePhrase: '' };
  }
}

const DATE_TAGS = new Set(['dateval', 'daterange', 'datespan', 'datestr']);

/** Findet das erste GRAMPS-Datums-Kind eines Eltern-Knotens (event/citation/name). */
export function dateNodeOf(parent: XmlNode): XmlNode | null {
  return parent.children.find((c) => DATE_TAGS.has(c.tag)) ?? null;
}

/** Bequemlichkeit: findet das Datums-Kind und konvertiert es (leer, wenn keins da ist). */
export function grampsDateOf(parent: XmlNode): GrampsDate {
  const n = dateNodeOf(parent);
  return n ? grampsDateToGedcom(n) : { date: null, datePhrase: '' };
}
