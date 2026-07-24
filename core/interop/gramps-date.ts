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

// ── Rückrichtung: GEDCOM-Datumsstring → GRAMPS-Datumselement (BL-142-Vorbereitung) ────────
//
// Spiegelbild des Lesewegs. Genutzt wird der bestehende `parseDateValue` (core/model,
// derselbe Parser wie das Formular — kein zweiter) für die Zerlegung; die ISO-Bildung
// spiegelt GRAMPS' `get_iso_date` (unbekannte Teile → `????`/`-??`/weggelassen). Nur für
// EDITIERTE Daten aufgerufen — unveränderte behalten ihren Original-Knoten (D5).

import { parseDateValue } from '../model/gedcom-date';

/** Das zu schreibende GRAMPS-Datumselement: Tag + Attribute in DTD-Reihenfolge. */
export interface GrampsDateElement {
  tag: 'dateval' | 'daterange' | 'datespan' | 'datestr';
  attrs: Array<[string, string]>;
}

const MONTH_NUM: Record<string, number> = Object.fromEntries(
  MONTH.map((m, i) => [m, i]).filter(([m]) => m !== ''),
) as Record<string, number>;

const pad = (n: number, width: number): string => String(n).padStart(width, '0');

/** (Tag, Monatscode, Jahr) → GRAMPS-ISO (`get_iso_date`-Form). Unbekanntes → `????`/`-??`/„". */
function isoFromParts(day: number | null, month: string | null, year: number | null): string {
  const y = year == null ? 0 : Math.abs(year);
  const mo = month == null ? 0 : (MONTH_NUM[month] ?? 0);
  const d = day == null ? 0 : day;
  const ys = y === 0 ? '????' : pad(y, 4);
  const ms = mo === 0 ? (d === 0 ? '' : '-??') : '-' + pad(mo, 2);
  const ds = d === 0 ? '' : '-' + pad(d, 2);
  const ret = ys + ms + ds;
  return ret.replace(/[-?]/g, '') === '' ? '' : ret;
}

/** GEDCOM-Datumsstring (mit Qualifier) → GRAMPS-Datumselement. */
function convertDateString(raw: string): GrampsDateElement {
  const s = raw.trim();
  // `parseDateValue` kennt kein offenes „TO x" (nur BET/FROM als Bereichsköpfe) — direkt.
  if (/^TO\b/i.test(s)) {
    const p = parseDateValue(s.replace(/^TO\b/i, '').trim());
    return { tag: 'dateval', attrs: [['val', isoFromParts(p.day, p.month, p.year)], ['type', 'to']] };
  }
  const p = parseDateValue(s);
  const iso = isoFromParts(p.day, p.month, p.year);
  switch (p.qualifier) {
    case 'ABT':
      return { tag: 'dateval', attrs: [['val', iso], ['type', 'about']] };
    case 'BEF':
      return { tag: 'dateval', attrs: [['val', iso], ['type', 'before']] };
    case 'AFT':
      return { tag: 'dateval', attrs: [['val', iso], ['type', 'after']] };
    case 'CAL':
      return { tag: 'dateval', attrs: [['val', iso], ['quality', 'calculated']] };
    case 'EST':
      return { tag: 'dateval', attrs: [['val', iso], ['quality', 'estimated']] };
    case 'BET':
      return { tag: 'daterange', attrs: [['start', iso], ['stop', isoFromParts(p.day2, p.month2, p.year2)]] };
    case 'FROM':
      // Offenes „FROM x" → dateval type=from; „FROM x TO y" (rechte Grenze da) → datespan.
      return p.year2 != null || p.month2 != null || p.day2 != null
        ? { tag: 'datespan', attrs: [['start', iso], ['stop', isoFromParts(p.day2, p.month2, p.year2)]] }
        : { tag: 'dateval', attrs: [['val', iso], ['type', 'from']] };
    default:
      return { tag: 'dateval', attrs: [['val', iso]] };
  }
}

/**
 * Modell-`Event.date` (+ `datePhrase`) → GRAMPS-Datumselement, oder `null` wenn kein Datum.
 * `date` gewinnt über `datePhrase`; ein reiner Freitext (date leer) wird `datestr`.
 */
export function gedcomToGramps(date: string | null, datePhrase: string): GrampsDateElement | null {
  if (date && date.trim() !== '') return convertDateString(date);
  if (datePhrase && datePhrase.trim() !== '') return { tag: 'datestr', attrs: [['val', datePhrase]] };
  return null;
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
