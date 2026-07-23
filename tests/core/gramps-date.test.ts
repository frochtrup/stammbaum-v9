// tests/core/gramps-date.test.ts — BL-140 Stufe 1a (ADR-v9-114 D2).
//
// GRAMPS-Datum (dateval/daterange/datespan/datestr) → Modell-`Event.date` (roher
// GEDCOM-Datumsstring) + `datePhrase`. Orakel ist NICHT die Beispieldatei, sondern
// GRAMPS' eigener GEDCOM-Export (`plugins/lib/libgedcom.py::make_gedcom_date` +
// `__build_date_string`, `plugins/export/exportgedcom.py::_date`):
//   - Modifier (ABT/BEF/AFT/FROM/TO) GEWINNT über Qualität (EST/CAL) — nie „EST ABT"
//     (im Export: `quality = None if mod else quality`).
//   - MOD_SPAN → „FROM x TO y", MOD_RANGE → „BET x AND y" (Qualität dort fallengelassen).
//   - Bare-Datum je nach bekannten Teilen: „16 FEB 1967" / „FEB 1967" / „1967" /
//     „(FEB)" / „(16 FEB)"; Tag ohne Monat → nur Jahr (Orakel `__build_date_string`).
//   - datestr → Freitext in datePhrase, kein `date`.

import { describe, it, expect } from 'vitest';
import type { XmlNode } from '../../core/interop/xml-tree';
import { grampsDateOf, grampsDateToGedcom, isoToGedcom } from '../../core/interop/gramps-date';

/** Minimaler XmlNode-Bauer für Datums-Elemente. */
function node(tag: string, attrs: Record<string, string> = {}): XmlNode {
  return { tag, attrs: Object.entries(attrs), children: [], text: '' };
}
/** Ein Eltern-Knoten (event) mit einem Datums-Kind. */
function parentWith(child: XmlNode | null): XmlNode {
  return { tag: 'event', attrs: [], children: child ? [node('type'), child] : [node('type')], text: '' };
}

describe('isoToGedcom — Bare-Datum (ohne Modifier/Qualität)', () => {
  it('vollständiges Datum', () => expect(isoToGedcom('1967-02-16')).toBe('16 FEB 1967'));
  it('Jahr + Monat', () => expect(isoToGedcom('1967-02')).toBe('FEB 1967'));
  it('nur Jahr', () => expect(isoToGedcom('1967')).toBe('1967'));
  it('Tag ohne Monat → nur Jahr (Orakel)', () => expect(isoToGedcom('1967-??-16')).toBe('1967'));
  it('Monat ohne Jahr → geklammert', () => expect(isoToGedcom('????-02')).toBe('(FEB)'));
  it('Tag+Monat ohne Jahr → geklammert', () => expect(isoToGedcom('????-02-16')).toBe('(16 FEB)'));
  it('leer bleibt leer', () => expect(isoToGedcom('')).toBe(''));
  it('führende Null im Tag', () => expect(isoToGedcom('1890-03-02')).toBe('2 MAR 1890'));
});

describe('grampsDateToGedcom — dateval', () => {
  it('exakt', () => expect(grampsDateToGedcom(node('dateval', { val: '1967-02-16' }))).toEqual({ date: '16 FEB 1967', datePhrase: '' }));
  it('about → ABT', () => expect(grampsDateToGedcom(node('dateval', { val: '1875', type: 'about' })).date).toBe('ABT 1875'));
  it('before → BEF', () => expect(grampsDateToGedcom(node('dateval', { val: '1875', type: 'before' })).date).toBe('BEF 1875'));
  it('after → AFT', () => expect(grampsDateToGedcom(node('dateval', { val: '1875', type: 'after' })).date).toBe('AFT 1875'));
  it('from → FROM', () => expect(grampsDateToGedcom(node('dateval', { val: '1985', type: 'from' })).date).toBe('FROM 1985'));
  it('to → TO', () => expect(grampsDateToGedcom(node('dateval', { val: '2005', type: 'to' })).date).toBe('TO 2005'));
  it('quality estimated → EST', () => expect(grampsDateToGedcom(node('dateval', { val: '1900', quality: 'estimated' })).date).toBe('EST 1900'));
  it('quality calculated → CAL', () => expect(grampsDateToGedcom(node('dateval', { val: '1900', quality: 'calculated' })).date).toBe('CAL 1900'));
  it('Modifier GEWINNT über Qualität — nie „EST ABT"', () =>
    expect(grampsDateToGedcom(node('dateval', { val: '1900', type: 'about', quality: 'estimated' })).date).toBe('ABT 1900'));
  it('Qualität + vollständiges Datum', () =>
    expect(grampsDateToGedcom(node('dateval', { val: '1900-06-01', quality: 'calculated' })).date).toBe('CAL 1 JUN 1900'));
});

describe('grampsDateToGedcom — Bereich/Spanne/Text', () => {
  it('daterange → BET … AND …', () =>
    expect(grampsDateToGedcom(node('daterange', { start: '1970', stop: '1974' })).date).toBe('BET 1970 AND 1974'));
  it('daterange mit vollen Datteln', () =>
    expect(grampsDateToGedcom(node('daterange', { start: '1970-03-02', stop: '1974-05' })).date).toBe('BET 2 MAR 1970 AND MAY 1974'));
  it('datespan → FROM … TO …', () =>
    expect(grampsDateToGedcom(node('datespan', { start: '1973', stop: '1977' })).date).toBe('FROM 1973 TO 1977'));
  it('Qualität an Bereich wird fallengelassen (Orakel)', () =>
    expect(grampsDateToGedcom(node('daterange', { start: '1970', stop: '1974', quality: 'estimated' })).date).toBe('BET 1970 AND 1974'));
  it('datestr → Freitext in datePhrase, kein date', () =>
    expect(grampsDateToGedcom(node('datestr', { val: 'Ostern 1945' }))).toEqual({ date: null, datePhrase: 'Ostern 1945' }));
  it('leerer datestr', () =>
    expect(grampsDateToGedcom(node('datestr', { val: '' }))).toEqual({ date: null, datePhrase: '' }));
});

describe('grampsDateOf — findet das Datums-Kind im Eltern-Knoten', () => {
  it('findet dateval', () => expect(grampsDateOf(parentWith(node('dateval', { val: '1967' }))).date).toBe('1967'));
  it('kein Datums-Kind → leer', () => expect(grampsDateOf(parentWith(null))).toEqual({ date: null, datePhrase: '' }));
});
