// Spec 12 §3 — Evidenzmodell (3 Achsen, GPS / Evidence Explained).
// evalToQuay() leitet einen QUAY-*Vorschlag* ab (informativ, nie automatisch gesetzt):
//   original+primary → 3,  negative → 0,  authored|undetermined|indirect → 1,  sonst 2.
// Unabhängig von einem editierten QUAY (INV-C2, Spec 10 §5.3).
import { describe, it, expect } from 'vitest';
import { evalToQuay, makeEvidenceEval } from '../../core/research/index';

describe('Spec 12 §3: evalToQuay-Mapping', () => {
  it('original + primary → 3 (stärkstes Profil)', () => {
    expect(evalToQuay(makeEvidenceEval({ source: 'original', information: 'primary', evidence: 'direct' }))).toBe(3);
    // primary schlägt durch, auch bei indirekter Evidenz
    expect(evalToQuay(makeEvidenceEval({ source: 'original', information: 'primary', evidence: 'indirect' }))).toBe(3);
  });

  it('negative Evidenz → 0 (überschreibt alles andere)', () => {
    expect(evalToQuay(makeEvidenceEval({ source: 'original', information: 'primary', evidence: 'negative' }))).toBe(0);
    expect(evalToQuay(makeEvidenceEval({ evidence: 'negative' }))).toBe(0);
  });

  it('authored | undetermined(=indeterminate) | indirect → 1', () => {
    expect(evalToQuay(makeEvidenceEval({ source: 'authored', information: 'secondary', evidence: 'direct' }))).toBe(1);
    expect(evalToQuay(makeEvidenceEval({ source: 'derivative', information: 'indeterminate', evidence: 'direct' }))).toBe(1);
    expect(evalToQuay(makeEvidenceEval({ source: 'derivative', information: 'secondary', evidence: 'indirect' }))).toBe(1);
  });

  it('sonst → 2 (Mittelfeld, z. B. derivative + secondary + direct)', () => {
    expect(evalToQuay(makeEvidenceEval({ source: 'derivative', information: 'secondary', evidence: 'direct' }))).toBe(2);
  });

  it('Vorrang: negative vor original+primary vor der 1-Klasse vor 2', () => {
    // original+primary aber negative → 0 (negative gewinnt)
    expect(evalToQuay(makeEvidenceEval({ source: 'original', information: 'primary', evidence: 'negative' }))).toBe(0);
    // authored + primary + direct → primary würde 3 geben, aber authored zieht auf 1?
    // Spec: original+primary→3 verlangt beides original UND primary. authored ist nicht original.
    expect(evalToQuay(makeEvidenceEval({ source: 'authored', information: 'primary', evidence: 'direct' }))).toBe(1);
  });

  it('gibt einen gültigen QUAY (0..3) zurück', () => {
    const q = evalToQuay(makeEvidenceEval({ source: 'original', information: 'secondary', evidence: 'direct' }));
    expect([0, 1, 2, 3]).toContain(q);
  });
});
