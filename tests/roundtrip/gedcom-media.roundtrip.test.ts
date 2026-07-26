// tests/roundtrip/gedcom-media.roundtrip.test.ts
// Medien-Roundtrip (ADR-v9-124): OBJE mit FORM/NOTE/_PRIM/_SCBK + geteilte Datei über
// mehrere Referenzen. Bringt OBJE-Deckung in die committete CI-Fixture-Ebene (die
// bisherigen Klein-Fixtures + demo.ged haben 0 OBJE) — RT-1/RT-2 = LP-1-Kernversprechen.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGedcom, serializeGedcom } from '../../core/interop';
import { assembleLines, calcNetDelta, firstDiff } from './roundtrip-helpers';

const MEDIA = readFileSync(join(__dirname, '../fixtures/media.small.ged'), 'utf8');
const MEDIA_PTR = readFileSync(join(__dirname, '../fixtures/media-ptr.small.ged'), 'utf8');

describe('GEDCOM Medien-Roundtrip (RT-1/RT-2, ADR-v9-124)', () => {
  it('RT-1: out1 === out2 (Byte-Idempotenz)', () => {
    const out1 = serializeGedcom(parseGedcom(MEDIA));
    const out2 = serializeGedcom(parseGedcom(out1));
    expect(firstDiff(out1, out2)).toBeNull();
    expect(out1).toBe(out2);
  });

  it('RT-2: net_delta === 0 gegen die Ur-Quelle (kein Medien-Byte geht verloren)', () => {
    const out1 = serializeGedcom(parseGedcom(MEDIA));
    expect(calcNetDelta(MEDIA, out1).normDelta).toBe(0);
  });

  it('INV-PT: FORM/_PRIM/_SCBK-Ketten überleben verbatim', () => {
    const logical = assembleLines(serializeGedcom(parseGedcom(MEDIA)));
    expect(logical).toContain('3 FORM jpg');
    expect(logical).toContain('2 _SCBK Y');
    expect(logical).toContain('2 _PRIM Y');
    expect(logical).toContain('4 FORM pdf');
  });
});

describe('GEDCOM Medien-Roundtrip — Pointer-Form (@M@-Record, 5.5.1/7.0, ADR-v9-124)', () => {
  it('RT-1: out1 === out2 (Byte-Idempotenz, Pointer-Form)', () => {
    const out1 = serializeGedcom(parseGedcom(MEDIA_PTR));
    const out2 = serializeGedcom(parseGedcom(out1));
    expect(firstDiff(out1, out2)).toBeNull();
    expect(out1).toBe(out2);
  });

  it('RT-2: net_delta === 0 (Top-Level-OBJE-Record + Pointer bleiben erhalten)', () => {
    const out1 = serializeGedcom(parseGedcom(MEDIA_PTR));
    expect(calcNetDelta(MEDIA_PTR, out1).normDelta).toBe(0);
  });

  it('INV-PT: der @M1@-Record samt FILE/FORM/MEDI überlebt verbatim', () => {
    const logical = assembleLines(serializeGedcom(parseGedcom(MEDIA_PTR)));
    expect(logical).toContain('0 @M1@ OBJE');
    expect(logical).toContain('1 FILE fotos/gemeinsam.jpg');
    expect(logical).toContain('3 MEDI PHOTO');
    expect(logical).toContain('1 OBJE @M1@');
  });
});
