// core/research/proof-summary.ts — Beweisführungsnotiz / GPS-Zusammenfassung
// (Spec 20 §1.11e, BL-61). Reine Kern-Aggregation, KEIN neuer Speicher: eine rein
// lesende Projektion aus dem Evidenzmodell (§3) + den Hypothesen (§4), analog zu
// evalToQuay test-first baubar. DOM-/framework-frei (INV-ARCH-1).
//
// Citations werden als Parameter INJIZIERT (der Aufrufer sammelt sie via
// core/validate/facts.ts::personCitations) — so bleibt diese Funktion frei von einer
// lateralen core/validate-Abhängigkeit und für beide Trägerarten (Person/Familie)
// nutzbar.
import type { Citation } from '../model/types';
import type { Hypothesis } from './types';

/** „Bewertet" = QUAY > 0 (0 ist der Parser-Default für ein fehlendes Tag, nicht
 *  unterscheidbar von „ausdrücklich 0" — dieselbe Konvention wie facts.ts::hasAnyQuay). */
function hasQuay(c: Citation): boolean {
  return c.quay > 0;
}

/** „Evidenzbewertet" = mindestens eine der drei Achsen (oder Informant) gesetzt —
 *  dieselbe Prädikatsform wie facts.ts::hasAnyEval. */
function isEvaluated(c: Citation): boolean {
  const e = c.eval;
  return !!e && !!(e.source || e.information || e.evidence || e.informant);
}

export interface ProofSources {
  /** Gesamtzahl der Zitatstellen der Person/Familie. */
  total: number;
  /** davon mit gesetzter Evidenzbewertung (§3). */
  evaluated: number;
  /** davon mit QUAY > 0. */
  withQuay: number;
}

export interface ProofSummary {
  /** Reife-Indikator „X % aufgelöst": Anteil bestätigt+verworfen an ALLEN Hypothesen
   *  (0–100, gerundet). 0, wenn keine Hypothesen existieren. */
  maturityPct: number;
  sources: ProofSources;
  /** ② bestätigte Schlüsse. */
  confirmed: Hypothesis[];
  /** ③ offene Fragen. */
  open: Hypothesis[];
  /** ④ verworfene Annahmen. */
  rejected: Hypothesis[];
}

/**
 * Baut die Beweisführungs-Zusammenfassung aus den Zitaten und Hypothesen einer Person
 * (Spec 20 §1.11e). Reine Funktion; die UI (PersonDetail-Disclosure) zeigt sie nur, wenn
 * mindestens eine Hypothese existiert.
 */
export function buildProofSummary(citations: Citation[], hypotheses: Hypothesis[]): ProofSummary {
  const confirmed = hypotheses.filter((h) => h.status === 'confirmed');
  const rejected = hypotheses.filter((h) => h.status === 'rejected');
  const open = hypotheses.filter((h) => h.status === 'open');
  const total = hypotheses.length;
  const resolved = confirmed.length + rejected.length;
  return {
    maturityPct: total === 0 ? 0 : Math.round((resolved / total) * 100),
    sources: {
      total: citations.length,
      evaluated: citations.filter(isEvaluated).length,
      withQuay: citations.filter(hasQuay).length,
    },
    confirmed,
    open,
    rejected,
  };
}
