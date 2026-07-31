// core/research/eval.ts — Evidenzmodell (Spec 12 §3), 3 Achsen (GPS / Evidence Explained).
// evalToQuay ist die AUTORITATIVE QUAY-Vorschlagsregel des Kerns; sie ist rein
// informativ und setzt QUAY nie automatisch (INV-C2, Spec 10 §5.3 — Trennung
// bleibt beim Aufrufer). EvidenceEval selbst ist in core/model/types.ts definiert
// (dort von Citation.eval genutzt); die Semantik/Regel lebt hier.
import type { EvidenceEval, Quay } from '../model/types';

/** Konstruktor mit leeren Defaults für die drei Achsen (Test-/Aufrufer-Bequemlichkeit). */
export function makeEvidenceEval(patch: Partial<EvidenceEval> = {}): EvidenceEval {
  const ev: EvidenceEval = {
    source: patch.source ?? '',
    information: patch.information ?? '',
    evidence: patch.evidence ?? '',
  };
  if (patch.informant !== undefined) ev.informant = patch.informant;
  return ev;
}

/**
 * Trägt diese Bewertung keine einzige gesetzte Achse? Die EINE Fundstelle dieser Frage
 * (INV-UI-4 auf Kern-Ebene): der Writer darf einen leeren `_EVAL`-Subtree nicht schreiben
 * (er entstünde sonst bei jedem Roundtrip aus einem `eval`-Objekt ohne Inhalt und bräche
 * `out1===out2`), und die UI zeigt an der Zitat-Zeile nur dann ein Bewertungs-Signal.
 * v8-Vorbild: `evalIsEmpty` in `gedcom-writer.js`.
 */
export function isEvidenceEvalEmpty(ev: EvidenceEval | null | undefined): boolean {
  if (!ev) return true;
  return !ev.source && !ev.information && !ev.evidence && !ev.informant;
}

/**
 * Spec 12 §3 — geordnete Regel (erste Übereinstimmung gewinnt):
 *   1. evidence === 'negative'               → 0
 *   2. source === 'original' && info==='primary' → 3
 *   3. source==='authored' | info==='undetermined' | evidence==='indirect' → 1
 *   4. sonst                                 → 2
 */
export function evalToQuay(ev: EvidenceEval): Quay {
  if (ev.evidence === 'negative') return 0;
  if (ev.source === 'original' && ev.information === 'primary') return 3;
  if (ev.source === 'authored' || ev.information === 'undetermined' || ev.evidence === 'indirect') {
    return 1;
  }
  return 2;
}
