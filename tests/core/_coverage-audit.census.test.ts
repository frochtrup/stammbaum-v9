// tests/core/_coverage-audit.census.test.ts — Mess-Skript für den BL-155 Coverage-Audit.
// KEIN Invarianten-Test, sondern ein reproduzierbarer Zähler: parst beide Realdaten-
// Fixturen und schreibt einen Tag-/Sektions-Zensus nach scratchpad. Skippt ohne Fixture.
// (Bewusst mit `_`-Prefix, damit klar ist: Diagnose-Werkzeug, nicht Teil der Suite-Semantik.)

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseGedcom } from '../../core/interop';
import { parseXml } from '../../core/interop';
import type { GedNode } from '../../core/interop';
import type { XmlNode } from '../../core/interop';
import { MODELED_GEDCOM_TAGS } from './spec-universe';

// Portabler Ausgabeort (os-tmp) — die JSON-Dumps sind reine Diagnose-Artefakte für den
// Coverage-Report (BL-155), nicht Teil der Suite-Semantik. In CI (ohne gitignored Fixture)
// skippt der ganze Block, es wird nichts geschrieben.
const OUT = tmpdir();
const FX = (n: string) => join(__dirname, '../fixtures', n);

// Vom GEDCOM-Parser erkannte (projizierte) Tags — alles andere überlebt nur passthrough.
// Einzige Wahrheitsquelle in spec-universe.ts (geteilt mit coverage-spec.test.ts, BL-162).
const GED_RECOGNIZED = MODELED_GEDCOM_TAGS;

function topRecordTag(rec: GedNode): string {
  return rec.tag;
}

function walkGed(node: GedNode, ctx: string, rec: string, census: Map<string, number>, unknown: Map<string, number>): void {
  for (const c of node.children) {
    const path = `${rec}>${c.tag}`;
    census.set(path, (census.get(path) ?? 0) + 1);
    if (!GED_RECOGNIZED.has(c.tag)) {
      const uk = `${ctx}>${c.tag}`;
      unknown.set(uk, (unknown.get(uk) ?? 0) + 1);
    }
    walkGed(c, `${ctx}>${c.tag}`, rec, census, unknown);
  }
}

describe.skipIf(!existsSync(FX('MeineDaten_ancestris.ged')))('GEDCOM Zensus', () => {
  it('zählt Tags in MeineDaten_ancestris.ged', () => {
    const { roots } = parseGedcom(readFileSync(FX('MeineDaten_ancestris.ged'), 'utf8'));
    const census = new Map<string, number>();
    const unknown = new Map<string, number>();
    const recordCounts = new Map<string, number>();
    for (const rec of roots) {
      recordCounts.set(rec.tag, (recordCounts.get(rec.tag) ?? 0) + 1);
      walkGed(rec, topRecordTag(rec), rec.tag, census, unknown);
    }
    const sortDesc = (m: Map<string, number>) =>
      [...m.entries()].sort((a, b) => b[1] - a[1]);
    writeFileSync(
      join(OUT, 'ged-census.json'),
      JSON.stringify(
        {
          records: [...recordCounts.entries()].sort((a, b) => b[1] - a[1]),
          unknownTags: sortDesc(unknown),
          allTagPaths: sortDesc(census),
        },
        null,
        2,
      ),
    );
    expect(census.size).toBeGreaterThan(0);
  });
});

// ── GRAMPS ────────────────────────────────────────────────────────────────────

function walkXml(node: XmlNode, ctx: string, census: Map<string, number>, attrs: Map<string, number>): void {
  for (const c of node.children) {
    const path = `${ctx}>${c.tag}`;
    census.set(path, (census.get(path) ?? 0) + 1);
    for (const [an] of c.attrs) {
      const ak = `${c.tag}@${an}`;
      attrs.set(ak, (attrs.get(ak) ?? 0) + 1);
    }
    walkXml(c, `${ctx}>${c.tag}`, census, attrs);
  }
}

describe.skipIf(!existsSync(FX('Unsere Familie.gramps')))('GRAMPS Zensus', () => {
  it('zählt Elemente in Unsere Familie.gramps', () => {
    const buf = readFileSync(FX('Unsere Familie.gramps'));
    const xml = buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf).toString('utf8') : buf.toString('utf8');
    const doc = parseXml(xml);
    const census = new Map<string, number>();
    const attrs = new Map<string, number>();
    walkXml(doc.root, doc.root.tag, census, attrs);
    const sortDesc = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);
    writeFileSync(
      join(OUT, 'gramps-census.json'),
      JSON.stringify({ elements: sortDesc(census), attrs: sortDesc(attrs) }, null, 2),
    );
    expect(census.size).toBeGreaterThan(0);
  });
});
