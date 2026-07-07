// tests/roundtrip/gedcom-ancestris.roundtrip.test.ts
// Große Orakel-Fixture (Spec 32 §4): MeineDaten_ancestris.ged (2811 Pers., 83k Z.).
// net_delta=0 + out1===out2 ist das Kernversprechen (LP-1). Fixture ist .gitignore't
// (echte Personendaten) — Test skippt sauber, wenn sie fehlt (CI ohne Fixture bleibt grün).

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseGedcom, serializeGedcom } from '../../core/interop';
import { calcNetDelta, firstDiff } from './roundtrip-helpers';

const FIXTURE = join(__dirname, '../fixtures/MeineDaten_ancestris.ged');
const present = existsSync(FIXTURE);

describe.skipIf(!present)('GEDCOM Orakel-Roundtrip: MeineDaten_ancestris.ged', () => {
  const src = present ? readFileSync(FIXTURE, 'utf8') : '';

  it('parst alle INDI-Records (2795 = tatsächliche 0-Level-INDI-Zeilen der Datei)', () => {
    // Anm.: die Spec nennt „2811 Pers." (Ancestris-Zählung inkl. eigener Metrik);
    // die Datei enthält exakt 2795 distinkte `0 @Ixx@ INDI`-Records — kein Datenverlust,
    // der byte-treue Roundtrip (RT-1/RT-2 unten) beweist Vollständigkeit.
    const rawIndi = (src.match(/^0 @[^@]+@ INDI\s*$/gm) || []).length;
    const { db } = parseGedcom(src);
    expect(db.individuals.size).toBe(rawIndi);
    expect(db.individuals.size).toBe(2795);
  });

  it('RT-1: out1 === out2 (Idempotenz)', () => {
    const out1 = serializeGedcom(parseGedcom(src));
    const out2 = serializeGedcom(parseGedcom(out1));
    expect(firstDiff(out1, out2)).toBeNull();
    expect(out1).toBe(out2);
  });

  it('RT-2: net_delta === 0 gegen die Ur-Quelle', () => {
    const out1 = serializeGedcom(parseGedcom(src));
    const d = calcNetDelta(src, out1);
    expect(d.normDelta).toBe(0);
  });
});
