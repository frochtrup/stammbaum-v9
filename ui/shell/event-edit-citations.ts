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

/** Einfügen aus der Quellreferenz-Ablage (BL-234): die abgelegte Zitation mit ALLEN
 *  Angaben (Quelle, Seite, QUAY, Notiz, Weblink, Evidenz-Achsen) — s. Kopfkommentar von
 *  `citation-clipboard.svelte.ts`. Die Ablage liefert bereits eine tiefe Kopie.
 *
 *  **`grampsId` bleibt erhalten.** Ein `<citation>` ist in GRAMPS ein GETEILTER Record;
 *  dieselbe Fundstelle an einem zweiten Ereignis ist dort EIN Record mit zwei
 *  `<citationref>`-Besitzern, nicht ein zweiter Record mit gleichem Inhalt. Eine frische
 *  id zu vergeben wäre also keine Vorsicht, sondern eine Dublette in der Datei — der
 *  Roundtrip wäre nicht mehr GRAMPS-konform (Nutzer-Vorgabe 2026-08-12).
 *
 *  Die Kehrseite trägt `abgeloest()`: sobald der Nutzer die eingefügte Zeile ÄNDERT, ist
 *  sie nicht mehr dieselbe Fundstelle und darf den geteilten Record nicht mehr für sich
 *  beanspruchen. */
export function addCitationFrom(citations: Citation[], cit: Citation): Citation[] {
  return [...citations, { ...cit }];
}

/** Löst eine eingefügte Zitation von dem GRAMPS-Record, aus dem sie stammt (s.
 *  `addCitationFrom`): `grampsId: null` heißt „neu", das Write-Back vergibt eine frische
 *  id. Ohne das schriebe ein Seiten-Edit an der EINGEFÜGTEN Zeile den geteilten Record um
 *  — und damit auch die Zeile, aus der kopiert wurde. */
export function abgeloest(c: Citation): Citation {
  return c.grampsId === null ? c : { ...c, grampsId: null };
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

export function setCitationQuayAt(citations: Citation[], index: number, quay: Quay | null): Citation[] {
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
