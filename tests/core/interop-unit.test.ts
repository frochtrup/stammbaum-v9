// tests/core/interop-unit.test.ts — Interop-Bausteine: Geo-Parsing, Tag-Projektion,
// Escaping, HEAD-Behandlung (Spec 13 §3). Reine Unit-Tests.

import { describe, it, expect } from 'vitest';
import { parseGedcom, serializeGedcom, parseCoord, unescapeAt } from '../../core/interop';

describe('Geo-Koordinaten-Parsing (Spec 13 §3, GEDCOM.md §3)', () => {
  it('N/E → positiv', () => {
    expect(parseCoord('N52.216667')).toBeCloseTo(52.216667);
    expect(parseCoord('E7.183333')).toBeCloseTo(7.183333);
  });
  it('S/W → negativ', () => {
    expect(parseCoord('S10.5')).toBeCloseTo(-10.5);
    expect(parseCoord('W3.48632')).toBeCloseTo(-3.48632);
  });
  it('leerer Wert → null', () => {
    expect(parseCoord('')).toBeNull();
  });
});

describe('MAP-Toleranz Level 2 UND 3 (Spec 13 §3)', () => {
  it('MAP direkt unter Event (Level 2) wird gefunden', () => {
    const src = ['0 @I1@ INDI', '1 BIRT', '2 PLAC Ort', '2 MAP', '3 LATI N50.0', '3 LONG E8.0', '0 TRLR'].join('\n');
    const { db } = parseGedcom(src);
    expect(db.individuals.get('@I1@')?.birth.lati).toBeCloseTo(50.0);
  });
  it('MAP unter PLAC (Level 3) wird ebenfalls gefunden', () => {
    const src = ['0 @I1@ INDI', '1 BIRT', '2 PLAC Ort', '3 MAP', '4 LATI N51.0', '4 LONG E9.0', '0 TRLR'].join('\n');
    const { db } = parseGedcom(src);
    expect(db.individuals.get('@I1@')?.birth.lati).toBeCloseTo(51.0);
    expect(db.individuals.get('@I1@')?.birth.long).toBeCloseTo(9.0);
  });
});

describe('Pointer-Escaping @@…@@ → @…@', () => {
  it('unescapeAt entkommt verdoppelte @', () => {
    expect(unescapeAt('@@S2@@')).toBe('@S2@');
    expect(unescapeAt('@S2@')).toBe('@S2@');
  });
  it('Zitat-SID wird beim Parsen normalisiert', () => {
    const src = ['0 @I1@ INDI', '1 SOUR @@S2@@', '2 PAGE 5', '0 TRLR'].join('\n');
    const { db } = parseGedcom(src);
    expect(db.individuals.get('@I1@')?.topLevelCitations[0].sourceId).toBe('@S2@');
  });
});

describe('Tag-Projektion ins Modell', () => {
  const src = [
    '0 @I1@ INDI',
    '1 NAME Dr. Franz /Decker/',
    '2 GIVN Franz',
    '2 SURN Decker',
    '2 NPFX Dr.',
    '1 SEX M',
    '1 RELI röm.-kath.',
    '1 BIRT',
    '2 DATE 16 FEB 1967',
    '2 PLAC Burgsteinfurt',
    '1 DEAT',
    '2 DATE 2020',
    '2 CAUS Alter',
    '1 OCCU Ingenieur',
    '2 DATE FROM 1990 TO 2010',
    '0 TRLR',
  ].join('\n');
  const { db } = parseGedcom(src);
  const p = db.individuals.get('@I1@')!;

  it('Name-Sub-Tags projiziert', () => {
    expect(p.given).toBe('Franz');
    expect(p.surname).toBe('Decker');
    expect(p.prefix).toBe('Dr.');
  });
  it('Sonder-Ereignisse (BIRT/DEAT) + CAUS', () => {
    expect(p.birth.date).toBe('16 FEB 1967');
    expect(p.birth.place).toBe('Burgsteinfurt');
    expect(p.death.date).toBe('2020');
    expect(p.cause).toBe('Alter');
  });
  it('generisches Ereignis (OCCU) landet in events[]', () => {
    expect(p.events.length).toBe(1);
    expect(p.events[0].type).toBe('OCCU');
    expect(p.events[0].date).toBe('FROM 1990 TO 2010');
  });
  it('seen-Flag (INV-P5) für vorhandene Ereignisse', () => {
    expect(p.birth.seen).toBe(true);
    expect(p.chr.seen).toBe(false);
  });
});

describe('HEAD-Behandlung (Spec 13 §2.2, verbatim + net_delta=0)', () => {
  it('HEAD-Zeilen bleiben verbatim erhalten (kein Verlust von SOUR ANCESTRIS)', () => {
    const src = ['0 HEAD', '1 SOUR ANCESTRIS', '2 VERS 14', '1 GEDC', '2 VERS 5.5.1', '0 TRLR'].join('\n');
    const out = serializeGedcom(parseGedcom(src)).split(/\r\n/);
    expect(out).toContain('1 SOUR ANCESTRIS');
    expect(out).toContain('2 VERS 14');
  });
  it('Ausgabe verwendet \\r\\n als Zeilenende (GEDCOM.md §3)', () => {
    const src = ['0 HEAD', '1 GEDC', '2 VERS 5.5.1', '0 TRLR'].join('\n');
    const out = serializeGedcom(parseGedcom(src));
    expect(out.includes('\r\n')).toBe(true);
  });
});
