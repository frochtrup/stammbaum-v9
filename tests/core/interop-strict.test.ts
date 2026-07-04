// tests/core/interop-strict.test.ts — Strict-GEDCOM-5.5.1-Export (Spec 13 §5).
// Bewusst nicht verlustfrei, aber roundtrip-stabil (out1===out2). Alle _-Tags weg/gemappt.

import { describe, it, expect } from 'vitest';
import { parseGedcom, serializeGedcom } from '../../core/interop';

function logical(text: string): string[] {
  return text.split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean);
}

const SRC = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 5.5.1',
  '0 @I1@ INDI',
  '1 NAME A /B/',
  '1 _UID 4E6F-0001',
  '1 _RUFNAME Rufi',
  '1 FAMC @F1@',
  '2 _FREL adopted',
  '1 _EVAL original/primary/direct',
  '0 TRLR',
].join('\n');

describe('Strict-Export strippt proprietäre _-Tags (Spec 13 §5)', () => {
  const out = logical(serializeGedcom(parseGedcom(SRC), { format: 'strict' }));

  it('_UID → REFN + TYPE UID', () => {
    expect(out).toContain('1 REFN 4E6F-0001');
    expect(out).toContain('2 TYPE UID');
    expect(out).not.toContain('1 _UID 4E6F-0001');
  });

  it('_RUFNAME → NICK', () => {
    expect(out).toContain('1 NICK Rufi');
    expect(out).not.toContain('1 _RUFNAME Rufi');
  });

  it('_FREL adopted → PEDI adopted (unter FAMC)', () => {
    expect(out).toContain('2 PEDI adopted');
    expect(out).not.toContain('2 _FREL adopted');
  });

  it('_EVAL (Forschungs-Tag) wird weggelassen', () => {
    expect(out.some((l) => l.includes('_EVAL'))).toBe(false);
  });

  it('kein einziger _-Tag verbleibt in der Ausgabe', () => {
    expect(out.some((l) => /^\d+ _/.test(l))).toBe(false);
  });

  it('roundtrip-stabil: strict(parse(strict-out)) === strict-out', () => {
    const strict1 = serializeGedcom(parseGedcom(SRC), { format: 'strict' });
    const strict2 = serializeGedcom(parseGedcom(strict1), { format: 'strict' });
    expect(strict1).toBe(strict2);
  });
});
