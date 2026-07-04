// tests/roundtrip/gramps-mini.roundtrip.test.ts
// GRAMPS-Roundtrip auf Klein-Fixture (Spec 13 §6). Test-Seam: parseXMLText/buildXMLText
// synchron, ohne gzip/Blob (Spec 32 §5). Ziel: xml1===xml2 (Idempotenz) + INV-PT.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseXMLText, buildXMLText } from '../../core/interop';

const MINI = readFileSync(join(__dirname, '../fixtures/mini.small.gramps'), 'utf8');

describe('GRAMPS Mini-Roundtrip (RT-1/RT-3, INV-PT)', () => {
  it('RT-1: xml1 === xml2 (Writer-Idempotenz)', () => {
    const xml1 = buildXMLText(parseXMLText(MINI));
    const xml2 = buildXMLText(parseXMLText(xml1));
    expect(xml1).toBe(xml2);
  });

  it('RT-3: headless Projektion liefert Modell', () => {
    const { db } = parseXMLText(MINI);
    expect(db.individuals.get('I0001')?.given).toBe('Max');
    expect(db.individuals.get('I0001')?.surname).toBe('Muster');
    expect(db.sources.get('S0001')?.title).toBe('Kirchenbuch & Register > 1900');
    expect(db.notes.get('N0000')?.text).toContain('Zeile zwei mit "Quote"');
  });

  it('INV-PT: unbekanntes <_customtag> überlebt', () => {
    const xml1 = buildXMLText(parseXMLText(MINI));
    expect(xml1).toContain('<_customtag foo="bar"/>');
  });

  it('INV-PT: Entities (&amp; &gt; &quot;) roundtrippen korrekt', () => {
    const xml1 = buildXMLText(parseXMLText(MINI));
    expect(xml1).toContain('Kirchenbuch &amp; Register &gt; 1900');
    // Textinhalt escaped NICHT das Anführungszeichen (nur Attributwerte) — GRAMPS-Konvention.
    expect(xml1).toContain('mit "Quote"');
  });

  it('INV-PT: mehrzeiliger Notiztext + <style>-Geschwister erhalten', () => {
    const xml1 = buildXMLText(parseXMLText(MINI));
    expect(xml1).toContain('<style name="fontface" value="Monospace">');
    expect(xml1).toContain('<range start="0" end="10"/>');
  });
});
