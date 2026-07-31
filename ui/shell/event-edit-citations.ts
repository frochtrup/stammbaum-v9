// ui/shell/event-edit-citations.ts — reine Array-Editier-Funktionen für `Citation[]` an
// EINEM Ereignis (Aufrufer: EventEditModal.svelte). Extrahiert aus EventEditModal.svelte
// (max-lines-Gate; „Datei-Teilung großzügig statt knapp" — eine kohäsive Einheit statt
// Trimmen). Jede Funktion: (citations, index, ...) → NEUES Array, kein Seiteneffekt —
// analog dem Muster in core/model/citation.ts (dorthin delegiert, wo eine Kern-Regel
// gilt, z. B. INV-C2 für quay/eval).
import type { Citation, Quay, EvidenceEval } from '../../core/model/types';
import { makeCitation } from '../../core/model/factory';
import { setCitationQuay, setCitationUrl, applyEvalToCitation } from '../../core/model/citation';

export function addCitationFor(citations: Citation[], sourceId: string): Citation[] {
  return [...citations, makeCitation(sourceId)];
}

export function removeCitationAt(citations: Citation[], index: number): Citation[] {
  return citations.filter((_, i) => i !== index);
}

export function setCitationSourceAt(citations: Citation[], index: number, sourceId: string): Citation[] {
  return citations.map((c, i) => (i === index ? { ...c, sourceId } : c));
}

export function setCitationPageAt(citations: Citation[], index: number, page: string): Citation[] {
  return citations.map((c, i) => (i === index ? { ...c, page } : c));
}

export function setCitationNoteAt(citations: Citation[], index: number, note: string): Citation[] {
  return citations.map((c, i) => (i === index ? { ...c, note } : c));
}

export function setCitationQuayAt(citations: Citation[], index: number, quay: Quay): Citation[] {
  return citations.map((c, i) => (i === index ? setCitationQuay(c, quay) : c));
}

export function setCitationUrlAt(citations: Citation[], index: number, url: string): Citation[] {
  return citations.map((c, i) => (i === index ? setCitationUrl(c, url) : c));
}

/** INV-C2: `eval` unabhängig von `quay` setzen — `null` löscht die Bewertung (der Row
 *  meldet bereits das normalisierte Ergebnis, s. `isEvidenceEvalEmpty` in core/research). */
export function setCitationEvalAt(citations: Citation[], index: number, ev: EvidenceEval | null): Citation[] {
  return citations.map((c, i) => (i === index ? (ev ? applyEvalToCitation(c, ev) : { ...c, eval: null }) : c));
}
