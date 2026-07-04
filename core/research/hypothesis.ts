// core/research/hypothesis.ts — Hypothese (Spec 12 §4, leichtes GPS-Modell).
// INV-H1: `weight` (Forscher-Konfidenz) getrennt von Quellqualität (quay/eval) —
//         der Typ trägt bewusst kein quay/eval.
// INV-H2: `evidence` ist reine SID-Referenz {sourceId, page}, kein Zitatkörper
//         (kein Dangling, keine Doppelung).
import type { Hypothesis } from './types';
import type { SourceId } from '../model/types';

/** Konstruktor. `created` injiziert (TST-3); status-Default open, weight-Default medium. */
export function makeHypothesis(id: string, patch: Partial<Omit<Hypothesis, 'id'>> = {}): Hypothesis {
  return {
    id,
    created: patch.created ?? '',
    text: patch.text ?? '',
    status: patch.status ?? 'open',
    weight: patch.weight ?? 'medium',
    // Kopie, damit ein übergebenes Array nicht geteilt wird (reine Konstruktion).
    evidence: patch.evidence ? patch.evidence.map((e) => ({ ...e })) : [],
    rationale: patch.rationale ?? '',
    conclusion: patch.conclusion ?? '',
  };
}

/**
 * Hängt eine SID-Referenz an (INV-H2). Doppelte (sourceId+page) werden nicht
 * erneut aufgenommen — keine Doppelung. Reine Funktion (neues Objekt).
 */
export function addHypothesisEvidence(h: Hypothesis, sourceId: SourceId, page: string): Hypothesis {
  const exists = h.evidence.some((e) => e.sourceId === sourceId && e.page === page);
  if (exists) return { ...h, evidence: h.evidence.map((e) => ({ ...e })) };
  return { ...h, evidence: [...h.evidence.map((e) => ({ ...e })), { sourceId, page }] };
}
