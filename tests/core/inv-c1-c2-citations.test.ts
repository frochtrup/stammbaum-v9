// INV-C1: Ein Zitat referenziert genau eine Quelle-ID; Mehrfachzitate derselben Quelle
//         mit unterschiedlicher Seite erlaubt, dedupliziert dargestellt.
// INV-C2: `quay` bleibt unabhängig editierbar; `eval` kann einen `quay`-Vorschlag
//         ableiten, überschreibt ihn nicht automatisch.
// Spec 10 §5.3.
import { describe, it, expect } from 'vitest';
import {
  makeCitation,
  dedupeCitations,
  setCitationQuay,
  suggestQuayFromEval,
  applyEvalToCitation,
  citationUrl,
  setCitationUrl,
  type EvidenceEval,
} from '../../core/model/index';

describe('INV-C1: Zitat-Identität', () => {
  it('ein Zitat referenziert genau eine sourceId', () => {
    const c = makeCitation('@S1@', { page: '12' });
    expect(c.sourceId).toBe('@S1@');
  });

  it('Mehrfachzitat derselben Quelle mit unterschiedlicher Seite bleibt erlaubt', () => {
    const cits = [
      makeCitation('@S1@', { page: '12' }),
      makeCitation('@S1@', { page: '13' }),
    ];
    const deduped = dedupeCitations(cits);
    // Unterschiedliche Seite → nicht zusammengelegt.
    expect(deduped).toHaveLength(2);
  });

  it('identische Zitate (Quelle + Seite) werden dedupliziert', () => {
    const cits = [
      makeCitation('@S1@', { page: '12' }),
      makeCitation('@S1@', { page: '12' }),
      makeCitation('@S2@', { page: '12' }),
    ];
    const deduped = dedupeCitations(cits);
    expect(deduped).toHaveLength(2);
    expect(deduped.map((c) => c.sourceId).sort()).toEqual(['@S1@', '@S2@']);
  });

  it('Dedup ist stabil in der Reihenfolge des ersten Auftretens', () => {
    const cits = [
      makeCitation('@S2@', { page: 'a' }),
      makeCitation('@S1@', { page: 'b' }),
      makeCitation('@S2@', { page: 'a' }),
    ];
    expect(dedupeCitations(cits).map((c) => c.sourceId)).toEqual(['@S2@', '@S1@']);
  });
});

describe('INV-C2: quay und eval unabhängig', () => {
  const strongEval: EvidenceEval = { source: 'original', information: 'primary', evidence: 'direct' };

  it('setCitationQuay ändert nur quay, nicht eval', () => {
    const c = makeCitation('@S1@', { quay: 1, eval: strongEval });
    const updated = setCitationQuay(c, 3);
    expect(updated.quay).toBe(3);
    expect(updated.eval).toEqual(strongEval);
  });

  it('suggestQuayFromEval leitet einen Vorschlag ab (0..3)', () => {
    const q = suggestQuayFromEval(strongEval);
    expect(q).toBeGreaterThanOrEqual(0);
    expect(q).toBeLessThanOrEqual(3);
    // starkes Evidenzprofil → hoher Vorschlag
    expect(q).toBe(3);
  });

  it('applyEvalToCitation setzt eval, überschreibt quay NICHT automatisch', () => {
    const c = makeCitation('@S1@', { quay: 0 });
    const updated = applyEvalToCitation(c, strongEval);
    expect(updated.eval).toEqual(strongEval);
    // quay bleibt unabhängig — kein stiller Auto-Overwrite.
    expect(updated.quay).toBe(0);
  });

  it('quay bleibt editierbar, nachdem ein eval gesetzt wurde', () => {
    let c = makeCitation('@S1@', { quay: 0 });
    c = applyEvalToCitation(c, strongEval);
    c = setCitationQuay(c, 2);
    expect(c.quay).toBe(2);
    expect(c.eval).toEqual(strongEval);
  });
});

describe('Weblink der Quellenreferenz (deepLinkUrl/OBJE-FILE, Spec 10 §5.3)', () => {
  it('citationUrl liefert die erste http(s)-Medien-Datei', () => {
    const c = makeCitation('@S1@', {
      media: [{ file: 'https://example.org/rec/42', title: '' }],
    });
    expect(citationUrl(c)).toBe('https://example.org/rec/42');
  });

  it('citationUrl ignoriert echte (nicht-URL) Medien und liefert dann ""', () => {
    const c = makeCitation('@S1@', { media: [{ file: 'scans/kb.jpg', title: 'Scan' }] });
    expect(citationUrl(c)).toBe('');
  });

  it('setCitationUrl legt ein OBJE/FILE-Medium an und hält deepLinkUrl konsistent', () => {
    const c = setCitationUrl(makeCitation('@S1@'), 'https://example.org/rec/42');
    expect(c.media).toEqual([{ file: 'https://example.org/rec/42', title: '' }]);
    expect(c.deepLinkUrl).toBe('https://example.org/rec/42');
    expect(citationUrl(c)).toBe('https://example.org/rec/42');
  });

  it('setCitationUrl trimmt und entfernt den Weblink bei leerer Eingabe', () => {
    let c = setCitationUrl(makeCitation('@S1@'), '  https://example.org/x  ');
    expect(citationUrl(c)).toBe('https://example.org/x');
    c = setCitationUrl(c, '   ');
    expect(c.media).toEqual([]);
    expect(c.deepLinkUrl).toBe('');
  });

  it('setCitationUrl lässt echte Medien unangetastet und ersetzt nur die URL', () => {
    const scan = { file: 'scans/kb.jpg', title: 'Scan' };
    let c = makeCitation('@S1@', { media: [scan] });
    c = setCitationUrl(c, 'https://example.org/a');
    expect(c.media).toEqual([scan, { file: 'https://example.org/a', title: '' }]);
    // echter Scan bleibt media[0] → deepLinkUrl bleibt der Scan, Weblink weiter auffindbar
    expect(c.deepLinkUrl).toBe('scans/kb.jpg');
    expect(citationUrl(c)).toBe('https://example.org/a');
    c = setCitationUrl(c, 'https://example.org/b');
    expect(c.media).toEqual([scan, { file: 'https://example.org/b', title: '' }]);
  });
});
