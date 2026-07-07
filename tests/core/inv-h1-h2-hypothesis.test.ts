// Spec 12 §4 — Hypothese (leichtes GPS-Modell).
// INV-H1: `weight` (Forscher-Konfidenz zur Hypothese) ist getrennt von
//         `citation.quay`/`eval` (Qualität der Quelle).
// INV-H2: Evidenz ist SID-Referenz {sourceId, page}, KEIN duplizierter Zitatkörper
//         (kein Dangling, keine Doppelung).
import { describe, it, expect } from 'vitest';
import {
  makeHypothesis,
  addHypothesisEvidence,
  type Hypothesis,
} from '../../core/research/index';
import { makeCitation, type Citation } from '../../core/model/index';

describe('INV-H1: weight ist getrennt von Quellqualität (quay/eval)', () => {
  it('Hypothese trägt weight als eigenes Feld, ohne quay/eval', () => {
    const h = makeHypothesis('h1', {
      text: 'X ist Vater von Y',
      weight: 'high',
      created: '2026-07-04',
    });
    expect(h.weight).toBe('high');
    // Der Hypothesen-Typ kennt kein quay/eval — Forscher-Konfidenz und
    // Quellqualität sind strukturell getrennt.
    expect('quay' in h).toBe(false);
    expect('eval' in h).toBe(false);
  });

  it('weight einer Hypothese und quay ihrer belegenden Zitate sind unabhängig', () => {
    // Starke Quelle (quay 3), aber der Forscher bleibt vorsichtig (weight low) —
    // beide Achsen dürfen frei auseinanderlaufen.
    const cit: Citation = makeCitation('@S1@', { page: '12', quay: 3 });
    const h = makeHypothesis('h2', { weight: 'low' });
    expect(h.weight).toBe('low');
    expect(cit.quay).toBe(3);
  });

  it('weight akzeptiert nur low/medium/high; Default = medium', () => {
    expect(makeHypothesis('h3').weight).toBe('medium');
    for (const w of ['low', 'medium', 'high'] as const) {
      expect(makeHypothesis('h', { weight: w }).weight).toBe(w);
    }
  });
});

describe('INV-H2: Evidenz ist reine SID-Referenz, kein Zitatkörper', () => {
  it('Evidenz-Einträge tragen nur {sourceId, page} — keine quay/note/media', () => {
    const h = makeHypothesis('h4', { evidence: [{ sourceId: '@S1@', page: '5' }] });
    const ev = h.evidence[0];
    expect(ev).toEqual({ sourceId: '@S1@', page: '5' });
    expect(Object.keys(ev).sort()).toEqual(['page', 'sourceId']);
  });

  it('addHypothesisEvidence hängt eine SID-Referenz an, ohne Zitatkörper zu duplizieren', () => {
    let h = makeHypothesis('h5');
    h = addHypothesisEvidence(h, '@S1@', '5');
    h = addHypothesisEvidence(h, '@S2@', '');
    expect(h.evidence).toEqual([
      { sourceId: '@S1@', page: '5' },
      { sourceId: '@S2@', page: '' },
    ]);
    // Keine Felder eines vollen Citation-Körpers eingesickert.
    for (const e of h.evidence) {
      expect('media' in e).toBe(false);
      expect('eval' in e).toBe(false);
    }
  });

  it('dieselbe SID+Page wird nicht doppelt referenziert (keine Doppelung)', () => {
    let h = makeHypothesis('h6');
    h = addHypothesisEvidence(h, '@S1@', '5');
    h = addHypothesisEvidence(h, '@S1@', '5');
    expect(h.evidence).toHaveLength(1);
  });

  it('addHypothesisEvidence mutiert das Original nicht (reine Funktion)', () => {
    const h0 = makeHypothesis('h7');
    const h1 = addHypothesisEvidence(h0, '@S1@', '1');
    expect(h0.evidence).toHaveLength(0);
    expect(h1.evidence).toHaveLength(1);
  });
});

describe('Spec 12 §4: Hypothese-Grundform', () => {
  it('trägt status open/confirmed/rejected mit Default open', () => {
    expect(makeHypothesis('h8').status).toBe('open');
    const h: Hypothesis = makeHypothesis('h9', { status: 'confirmed' });
    expect(h.status).toBe('confirmed');
  });

  it('created wird injiziert (TST-3)', () => {
    expect(makeHypothesis('h10', { created: '2000-01-01' }).created).toBe('2000-01-01');
  });
});
