// tests/roundtrip/gedcom-media-datauri.roundtrip.test.ts
// Medien mit einer `data:`-URI im FILE (record-form OBJE, globaler TITL) — die self-
// enthaltene Form, mit der die App ein Bild direkt anzeigt (isDisplayableImage, BL-126-
// Nachtrag/ADR-v9-136). Sichert, dass eine lange, einzeilige `data:`-URI + `FORM svg`
// verlustfrei round-trippt (kein CONC-Split, MIME↔svg-Symmetrie in media-mime).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGedcom, serializeGedcom } from '../../core/interop';
import { assembleLines, calcNetDelta, firstDiff } from './roundtrip-helpers';

const SRC = readFileSync(join(__dirname, '../fixtures/media-datauri.small.ged'), 'utf8');

describe('GEDCOM Medien-Roundtrip — data:-URI im FILE (record-form, ADR-v9-136)', () => {
  it('RT-1: out1 === out2 (Byte-Idempotenz trotz langer data:-Zeile)', () => {
    const out1 = serializeGedcom(parseGedcom(SRC));
    const out2 = serializeGedcom(parseGedcom(out1));
    expect(firstDiff(out1, out2)).toBeNull();
    expect(out1).toBe(out2);
  });

  it('RT-2: net_delta === 0 (die data:-URI geht nicht verloren)', () => {
    const out1 = serializeGedcom(parseGedcom(SRC));
    expect(calcNetDelta(SRC, out1).normDelta).toBe(0);
  });

  it('INV-PT: data:-URI + FORM svg + globaler TITL überleben verbatim', () => {
    const logical = assembleLines(serializeGedcom(parseGedcom(SRC)));
    expect(logical.some((l) => l.startsWith('1 FILE data:image/svg+xml;base64,'))).toBe(true);
    expect(logical).toContain('2 FORM svg');
    expect(logical).toContain('1 TITL Studioporträt um 1900');
  });
});
