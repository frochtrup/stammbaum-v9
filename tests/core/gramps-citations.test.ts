// tests/core/gramps-citations.test.ts — BL-140 Stufe 1c (ADR-v9-114 D4).
//
// GRAMPS-Zitate sind ZWEISTUFIG: ein Owner (Event/Person/Name) trägt `<citationref hlink>`
// → `<citation>` (mit `<confidence>`, `<page>`, `<sourceref hlink>`) → `<source>`.
// Modell-`Citation` bündelt das flach: `sourceId` (aus sourceref, Handle→id), `page`,
// `quay` = min(confidence, 3) (GRAMPS 0–4 → GEDCOM 0–3, D4). Datum/Notizen/Medien des
// GRAMPS-Zitats bleiben vorerst Passthrough (nicht projiziert).

import { describe, it, expect } from 'vitest';
import type { XmlNode } from '../../core/interop/xml-tree';
import { projectGrampsCitation, collectCitations } from '../../core/interop/gramps-citations';

function node(tag: string, attrs: Record<string, string> = {}, children: XmlNode[] = [], text = ''): XmlNode {
  return { tag, attrs: Object.entries(attrs), children, text };
}
function citation(handle: string, confidence: string, page: string, sourceHandle: string): XmlNode {
  return node('citation', { handle }, [
    ...(confidence !== '' ? [node('confidence', {}, [], confidence)] : []),
    ...(page !== '' ? [node('page', {}, [], page)] : []),
    node('sourceref', { hlink: sourceHandle }),
  ]);
}
const srcId = (h: string): string => (h === '_src1' ? 'S0001' : h === '_src2' ? 'S0042' : h);

describe('projectGrampsCitation — ein <citation> → Modell-Citation', () => {
  it('sourceId (Handle→id), page, quay', () => {
    const c = projectGrampsCitation(citation('_c1', '4', 'S. 520', '_src1'), srcId);
    expect(c.sourceId).toBe('S0001');
    expect(c.page).toBe('S. 520');
    expect(c.quay).toBe(3); // 4 → min(4,3)
  });
  it('confidence 0–4 → quay 0–3 (D4)', () => {
    const q = (conf: string): number => projectGrampsCitation(citation('_c', conf, '', '_src1'), srcId).quay;
    expect([q('0'), q('1'), q('2'), q('3'), q('4')]).toEqual([0, 1, 2, 3, 3]);
  });
  it('fehlende page → leer', () => {
    expect(projectGrampsCitation(citation('_c', '2', '', '_src1'), srcId).page).toBe('');
  });
  it('fehlende confidence → quay 0', () => {
    expect(projectGrampsCitation(citation('_c', '', '', '_src1'), srcId).quay).toBe(0);
  });
});

describe('collectCitations — <citationref>-Kette eines Owners', () => {
  const c1 = citation('_c1', '3', 'p1', '_src1');
  const c2 = citation('_c2', '1', 'p2', '_src2');
  const byHandle: Record<string, XmlNode> = { _c1: c1, _c2: c2 };
  const citationOf = (h: string): XmlNode | null => byHandle[h] ?? null;

  it('löst mehrere citationref in Reihenfolge auf', () => {
    const owner = node('event', {}, [node('citationref', { hlink: '_c1' }), node('citationref', { hlink: '_c2' })]);
    const cits = collectCitations(owner, citationOf, srcId);
    expect(cits.map((c) => [c.sourceId, c.page, c.quay])).toEqual([
      ['S0001', 'p1', 3],
      ['S0042', 'p2', 1],
    ]);
  });
  it('hängende citationref (unbekanntes Handle) wird übersprungen, nicht erfunden', () => {
    const owner = node('event', {}, [node('citationref', { hlink: '_c1' }), node('citationref', { hlink: '_weg' })]);
    expect(collectCitations(owner, citationOf, srcId).map((c) => c.sourceId)).toEqual(['S0001']);
  });
  it('keine citationref → leere Liste', () => {
    expect(collectCitations(node('event', {}, [node('type')]), citationOf, srcId)).toEqual([]);
  });
});
