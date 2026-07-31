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
    kind: patch.kind ?? 'free',
    // Kopie wie bei evidence — ein übergebenes Array wird nicht geteilt.
    refs: patch.refs ? [...patch.refs] : [],
  };
}

/**
 * INV-H3 (Spec 12 §4, ADR-v9-174): Ist diese Hypothese ein gültiger Dublettenausschluss?
 *
 * Drei Bedingungen, jede aus einem eigenen Grund:
 *   - `kind === 'identity'` — die ART der Behauptung entscheidet, nicht der Status. Eine
 *     abgelehnte FREIE Hypothese über dieselben zwei Personen sagt etwas ganz anderes.
 *   - `status === 'rejected'` — `confirmed` ist die Merge-Begründung, `open` die laufende
 *     Prüfung; nur die Ablehnung blendet das Paar aus.
 *   - Bezug UND Begründung nicht leer — ein Ausschluss ohne Begründung ist eine
 *     Abweisung, kein Befund; ohne Bezug fehlt die halbe Aussage.
 */
export function isIdentityExclusion(h: Hypothesis): boolean {
  return (
    h.kind === 'identity' &&
    h.status === 'rejected' &&
    h.refs.length > 0 &&
    h.rationale.trim() !== ''
  );
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
