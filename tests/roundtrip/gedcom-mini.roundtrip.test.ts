// tests/roundtrip/gedcom-mini.roundtrip.test.ts
// RT-1/RT-2/RT-3 + INV-PT auf der handgeschriebenen Klein-Fixture (Spec 13 §1, §2).
// Muss VOR der großen Orakel-Fixture grün sein (Kern zuerst, 31 §7.4).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGedcom, serializeGedcom } from '../../core/interop';
import { assembleLines, calcNetDelta, firstDiff } from './roundtrip-helpers';

const MINI = readFileSync(join(__dirname, '../fixtures/mini.small.ged'), 'utf8');

describe('GEDCOM Mini-Roundtrip (RT-1/RT-2/RT-3)', () => {
  it('RT-1: out1 === out2 (Byte-Idempotenz)', () => {
    const out1 = serializeGedcom(parseGedcom(MINI));
    const out2 = serializeGedcom(parseGedcom(out1));
    expect(firstDiff(out1, out2)).toBeNull();
    expect(out1).toBe(out2);
  });

  it('RT-2: net_delta === 0 gegen die Ur-Quelle', () => {
    const out1 = serializeGedcom(parseGedcom(MINI));
    const d = calcNetDelta(MINI, out1);
    expect(d.normDelta).toBe(0);
  });

  it('RT-3: headless, build-frei — Parse liefert das erwartete Modell', () => {
    const { db } = parseGedcom(MINI);
    expect(db.individuals.get('@I1@')?.name).toBe('Max /Muster/');
    expect(db.individuals.get('@I1@')?.sex).toBe('M');
    expect(db.sources.get('@S1@')?.title).toBe('Kirchenbuch Ochtrup');
    expect(db.notes.get('@N1@')?.text).toBe('Eine geteilte Notiz');
  });
});

describe('INV-PT: unbekannter Tag überlebt verbatim', () => {
  it('_WEIRD samt tiefem Kind bleibt im Roundtrip erhalten', () => {
    const out1 = serializeGedcom(parseGedcom(MINI));
    const logical = assembleLines(out1);
    expect(logical).toContain('1 _WEIRD irgendein unbekannter passthrough tag');
    expect(logical).toContain('2 _SUB tiefes kind');
  });

  it('tiefe MAP/LATI/LONG-Kette (Level 3/4) bleibt erhalten', () => {
    const out1 = serializeGedcom(parseGedcom(MINI));
    const logical = assembleLines(out1);
    expect(logical).toContain('4 LATI N52.15');
    expect(logical).toContain('4 LONG E7.333333');
  });
});
