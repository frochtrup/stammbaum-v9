// tests/roundtrip/gramps-familie.roundtrip.test.ts
// Große GRAMPS-Orakel-Fixture (Spec 32 §4): Unsere Familie.gramps (2894 Pers., 5.7 MB XML).
// Die Datei ist gzip-komprimiert; der Test entpackt sie mit node:zlib (Plattform-Randschicht,
// NICHT im Kern) und ruft dann die synchrone Test-Seam parseXMLText/buildXMLText auf.
// Ziel: xml1===xml2 (Spec 13 §6). Fixture ist .gitignore't → Test skippt sauber ohne sie.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { parseXMLText, buildXMLText } from '../../core/interop';

const FIXTURE = join(__dirname, '../fixtures/Unsere Familie.gramps');
const present = existsSync(FIXTURE);

function readXml(): string {
  const buf = readFileSync(FIXTURE);
  // gzip-Magic 1f 8b → entpacken; sonst als Klartext lesen.
  if (buf[0] === 0x1f && buf[1] === 0x8b) return gunzipSync(buf).toString('utf8');
  return buf.toString('utf8');
}

describe.skipIf(!present)('GRAMPS Orakel-Roundtrip: Unsere Familie.gramps', () => {
  const xml = present ? readXml() : '';

  it('parst Personen (>0)', () => {
    const { db } = parseXMLText(xml);
    expect(db.individuals.size).toBeGreaterThan(2000);
  });

  it('RT-1: xml1 === xml2 (Writer-Idempotenz)', () => {
    const xml1 = buildXMLText(parseXMLText(xml));
    const xml2 = buildXMLText(parseXMLText(xml1));
    expect(xml1.length).toBe(xml2.length);
    expect(xml1).toBe(xml2);
  });
});
