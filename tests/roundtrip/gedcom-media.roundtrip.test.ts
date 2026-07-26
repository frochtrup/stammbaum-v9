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
