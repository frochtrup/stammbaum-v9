// tests/core/interop-ged7.test.ts — GED7-Downgrade/Export (Spec 13 §4, GEDCOM.md §2).

import { describe, it, expect } from 'vitest';
import { parseGedcom, serializeGedcom } from '../../core/interop';

function logical(text: string): string[] {
  return text.split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean);
}

const SRC = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 5.5.1',
  '2 FORM LINEAGE-LINKED',
  '1 CHAR UTF-8',
  '0 @I1@ INDI',
  '1 NAME A /B/',
  '1 REFN 12345',
  '2 TYPE alt-id',
  '1 NOTE Kein bekanntes Ereignis: BIRT',
  '1 ASSO @I2@',
  '2 RELA Pate',
  '1 _TRAN Übersetzter Name',
  '0 @N1@ NOTE geteilte Notiz',
  '0 TRLR',
].join('\n');

describe('GED7-Export (opt-in, Spec 13 §4)', () => {
  const out = logical(serializeGedcom(parseGedcom(SRC), { format: '7.0' }));

  it('GEDC/VERS wird 7.0', () => {
    expect(out).toContain('2 VERS 7.0');
    expect(out).not.toContain('2 VERS 5.5.1');
  });

  it('CHAR UTF-8 und FORM LINEAGE-LINKED entfallen im HEAD', () => {
    expect(out).not.toContain('1 CHAR UTF-8');
    expect(out).not.toContain('2 FORM LINEAGE-LINKED');
  });

  it('REFN + TYPE → EXID + TYPE', () => {
    expect(out).toContain('1 EXID 12345');
    expect(out).toContain('2 TYPE alt-id');
    expect(out).not.toContain('1 REFN 12345');
  });

  it('NOTE "Kein bekanntes Ereignis: BIRT" → NO BIRT', () => {
    expect(out).toContain('1 NO BIRT');
    expect(out).not.toContain('1 NOTE Kein bekanntes Ereignis: BIRT');
  });

  it('ASSO/RELA → ASSO/ROLE', () => {
    expect(out).toContain('2 ROLE Pate');
    expect(out).not.toContain('2 RELA Pate');
  });

  it('_TRAN → TRAN', () => {
    expect(out).toContain('1 TRAN Übersetzter Name');
    expect(out).not.toContain('1 _TRAN Übersetzter Name');
  });

  it('geteilte 0-Level-NOTE → SNOTE', () => {
    expect(out).toContain('0 @N1@ SNOTE geteilte Notiz');
  });

  it('GED5-Standardausgabe bleibt unverändert (Regressions-Guard)', () => {
    const ged5 = logical(serializeGedcom(parseGedcom(SRC)));
    expect(ged5).toContain('2 VERS 5.5.1');
    expect(ged5).toContain('1 REFN 12345');
    expect(ged5).toContain('1 NOTE Kein bekanntes Ereignis: BIRT');
    expect(ged5).toContain('2 RELA Pate');
  });
});
