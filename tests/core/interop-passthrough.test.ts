// tests/core/interop-passthrough.test.ts — INV-PT + modellierte _-Tags ohne Doppelschreibung
// (Spec 13 §2, §2.3). Verriegelt die _REPO_MODELLED-Lehre: ein modellierter _-Tag wird
// genau einmal geschrieben, nicht doppelt pro Roundtrip.

import { describe, it, expect } from 'vitest';
import { parseGedcom, serializeGedcom, parseTree, writeTree } from '../../core/interop';

function logical(text: string): string[] {
  return text.split(/\r\n|\r|\n/).map((l) => l.replace(/@@/g, '@').trim()).filter(Boolean);
}
function roundtrip(src: string): string {
  return serializeGedcom(parseGedcom(src));
}

describe('INV-PT: Passthrough-Baum (ein Mechanismus, Spec 13 §2.1)', () => {
  it('unbekannter Tag auf jeder Tiefe überlebt in Reihenfolge und Tiefe', () => {
    const src = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 5.5.1',
      '0 @I1@ INDI',
      '1 NAME A /B/',
      '1 _FOO wert',
      '2 _BAR tiefer',
      '3 _BAZ noch tiefer',
      '1 SEX M',
      '0 TRLR',
    ].join('\n');
    const out = logical(roundtrip(src));
    // Reihenfolge: _FOO steht zwischen NAME und SEX; Tiefe erhalten.
    const iName = out.indexOf('1 NAME A /B/');
    const iFoo = out.indexOf('1 _FOO wert');
    const iSex = out.indexOf('1 SEX M');
    expect(iName).toBeLessThan(iFoo);
    expect(iFoo).toBeLessThan(iSex);
    expect(out).toContain('2 _BAR tiefer');
    expect(out).toContain('3 _BAZ noch tiefer');
  });

  it('Baum-Rundlauf ist exakt idempotent (parseTree→writeTree)', () => {
    const src = ['0 @I1@ INDI', '1 NAME X /Y/', '2 _NICK Rufi', '1 _UID ABC-123'].join('\r\n');
    const once = writeTree(parseTree(src));
    const twice = writeTree(parseTree(once));
    expect(once).toBe(twice);
  });
});

describe('modellierte _-Tags ohne Doppelschreibung (Spec 13 §2.3, _REPO_MODELLED-Lehre)', () => {
  it('_UID wird genau einmal geschrieben, nicht dupliziert', () => {
    const src = ['0 @I1@ INDI', '1 NAME X /Y/', '1 _UID 4E6F-1234', '0 TRLR'].join('\n');
    const out = logical(roundtrip(src));
    const count = out.filter((l) => l.startsWith('1 _UID')).length;
    expect(count).toBe(1);
    // Und das Modell hat es projiziert (editierbar).
    const { db } = parseGedcom(src);
    expect(db.individuals.get('@I1@')?.uid).toBe('4E6F-1234');
  });

  it('_FREL unter FAMC wird nicht dupliziert', () => {
    const src = [
      '0 @I1@ INDI',
      '1 NAME X /Y/',
      '1 FAMC @F1@',
      '2 _FREL adopted',
      '0 TRLR',
    ].join('\n');
    const out = logical(roundtrip(src));
    expect(out.filter((l) => l === '2 _FREL adopted').length).toBe(1);
  });
});
