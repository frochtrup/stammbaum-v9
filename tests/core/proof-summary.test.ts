// tests/core/proof-summary.test.ts — Beweisführungsnotiz / GPS-Zusammenfassung
// (Spec 20 §1.11e, BL-61). Reine Kern-Aggregation aus Zitaten + Hypothesen.
import { describe, it, expect } from 'vitest';
import { makeCitation } from '../../core/model/index';
import { makeHypothesis, makeEvidenceEval, buildProofSummary } from '../../core/research/index';

describe('buildProofSummary — Reife-Indikator', () => {
  it('„% aufgelöst" = (bestätigt+verworfen) / alle, gerundet', () => {
    const hyps = [
      makeHypothesis('h1', { status: 'confirmed' }),
      makeHypothesis('h2', { status: 'confirmed' }),
      makeHypothesis('h3', { status: 'rejected' }),
      makeHypothesis('h4', { status: 'open' }),
    ];
    const s = buildProofSummary([], hyps);
    expect(s.maturityPct).toBe(75); // (2+1)/4
    expect(s.confirmed).toHaveLength(2);
    expect(s.rejected).toHaveLength(1);
    expect(s.open).toHaveLength(1);
  });

  it('rundet den Prozentsatz (1 von 3 aufgelöst → 33 %)', () => {
    const hyps = [
      makeHypothesis('h1', { status: 'confirmed' }),
      makeHypothesis('h2', { status: 'open' }),
      makeHypothesis('h3', { status: 'open' }),
    ];
    expect(buildProofSummary([], hyps).maturityPct).toBe(33);
  });

  it('keine Hypothesen → 0 % (Randfall; die UI zeigt die Notiz dann gar nicht)', () => {
    expect(buildProofSummary([], []).maturityPct).toBe(0);
  });
});

describe('buildProofSummary — Block ① Quellenlage & Evidenz', () => {
  it('zählt Zitate gesamt, davon evidenzbewertet, davon mit QUAY > 0', () => {
    const citations = [
      makeCitation('@S1@', { quay: 3, eval: makeEvidenceEval({ source: 'original', information: 'primary' }) }),
      makeCitation('@S2@', { quay: 2 }), // QUAY, aber keine Evidenzbewertung
      makeCitation('@S3@', { quay: 0, eval: makeEvidenceEval({ evidence: 'indirect' }) }), // bewertet, aber QUAY 0
      makeCitation('@S4@'), // weder noch (QUAY 0, kein eval)
    ];
    const s = buildProofSummary(citations, [makeHypothesis('h1')]);
    expect(s.sources.total).toBe(4);
    expect(s.sources.evaluated).toBe(2); // S1 + S3
    expect(s.sources.withQuay).toBe(2); // S1 + S2
  });

  it('ein leeres eval-Objekt zählt NICHT als bewertet', () => {
    const s = buildProofSummary([makeCitation('@S1@', { eval: makeEvidenceEval() })], []);
    expect(s.sources.evaluated).toBe(0);
  });
});
