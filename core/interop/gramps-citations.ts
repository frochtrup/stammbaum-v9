// core/interop/gramps-citations.ts — GRAMPS-Zitat-Projektion (BL-140 Stufe 1c, ADR-v9-114 D4).
//
// GRAMPS-Zitate sind ZWEISTUFIG (DTD 1.7.2):
//   Owner (Event/Person/Name) → `<citationref hlink>` → `<citation>` → `<sourceref hlink>` → `<source>`.
// Das Modell bündelt das flach in `Citation{sourceId, page, quay}`:
//   - `sourceId`: aus `<sourceref hlink>`, Datei-Handle → Modell-`id` (BL-136-Muster).
//   - `page`:     aus `<page>`.
//   - `quay`:     aus `<confidence>` (GRAMPS 0–4) → GEDCOM QUAY 0–3 via `min(·,3)` (D4).
//   - `eval`:     aus den vier Evidenz-`<srcattribute>` (BL-83, s. projectGrampsEval).
// Datum/Notizen/Medien und die ÜBRIGEN `srcattribute` des GRAMPS-Zitats bleiben Passthrough
// im Baum (nicht ins Modell projiziert) — der Datenerhalt ist über INV-PT gesichert.
//
// Reine Funktionen, DOM-/Plattform-frei (INV-ARCH-1).

import { makeCitation } from '../model/factory';
import { makeEvidenceEval } from '../research/eval';
import type { Citation, EvidenceEval } from '../model/types';
import type { XmlNode } from './xml-tree';
import { attr, childrenByTag, firstChild } from './xml-tree';
import { grampsMediaRefs } from './gramps-media';

// QUAY↔<confidence> lebt seit BL-156 kanonisch in enum-maps.ts (gebündelt); hier importiert
// (interner Gebrauch) + re-exportiert, damit bestehende Importe unverändert bleiben.
import { applyEvalAxis, confidenceToQuay, isEvalTag } from './enum-maps';
export { confidenceToQuay };

/**
 * Evidenz-Bewertung eines `<citation>` (Spec 12 §3, BL-83). Die vier Achsen werden
 * MODELLIERT herausgelöst (Spec 13 §2.3) — alle übrigen Zitat-Attribute (`EVEN`, fremde)
 * bleiben Passthrough im Baum (INV-PT).
 *
 * ZWEI Lese-Formen, eine Schreib-Form (Register DEV-07):
 *  - `<srcattribute type="_STYP" value="…"/>` — DTD-konform (grampsxml.dtd 1.7.2:
 *    `citation (… srcattribute*, sourceref, tagref*)`; `<attribute>` ist dort NICHT
 *    erlaubt). So schreibt auch das echte GRAMPS 6.x (`<srcattribute type="EVEN" …>`).
 *  - `<attribute type="_STYP" value="…"/>` — die v8-Altform, DTD-widrig. Wird GELESEN,
 *    damit von v8 geschriebene Dateien ihre Bewertung nicht verlieren; geschrieben wird
 *    ausschließlich die konforme Form.
 */
function projectGrampsEval(citationNode: XmlNode): EvidenceEval | null {
  let ev: EvidenceEval | null = null;
  for (const a of citationNode.children) {
    if (a.tag !== 'srcattribute' && a.tag !== 'attribute') continue;
    const type = attr(a, 'type');
    if (!isEvalTag(type)) continue;
    if (!ev) ev = makeEvidenceEval();
    applyEvalAxis(ev, type, attr(a, 'value'));
  }
  return ev;
}

/**
 * Ein GRAMPS-`<citation>`-Knoten → Modell-`Citation`. `resolveSourceId` übersetzt das
 * `<sourceref hlink>`-Handle in die Quellen-Modell-`id` (Aufrufer stellt den Handle→id-Index).
 * `handleToId` (ADR-v9-125, BL-126): löst die Zitat-Ebene-`<objref hlink>` in `Citation.media`
 * auf — vorher Passthrough-only, damit verloren bei Cross-Family-Emission. Ohne den Index
 * (Aufrufer ohne Handle→id-Zuordnung) bleiben die Medien-Refs leer.
 */
export function projectGrampsCitation(
  citationNode: XmlNode,
  resolveSourceId: (handle: string) => string,
  handleToId?: Map<string, string>,
): Citation {
  const sourceref = firstChild(citationNode, 'sourceref');
  const sourceId = sourceref ? resolveSourceId(attr(sourceref, 'hlink')) : '';
  return makeCitation(sourceId, {
    page: firstChild(citationNode, 'page')?.text ?? '',
    quay: confidenceToQuay(firstChild(citationNode, 'confidence')?.text ?? ''),
    eval: projectGrampsEval(citationNode),
    media: handleToId ? grampsMediaRefs(citationNode, handleToId) : [],
    // Fidelity-id des geteilten <citation>-Records (C0000, ersatzweise Handle): ordnet das
    // Zitat beim Write-Back über seine stabile id wieder seinem Record zu (BL-142/144,
    // id-basiert wie alle GRAMPS-Refs — BL-136). Dieselbe Quelle round-trippt byte-treu,
    // egal wer sie referenziert.
    grampsId: attr(citationNode, 'id') || attr(citationNode, 'handle') || null,
  });
}

/**
 * Löst die `<citationref>`-Kette eines Owner-Knotens (Event/Person/Name) zu Modell-Zitaten
 * auf. `citationOf` liefert den `<citation>`-Knoten zu einem Handle; ein unauflösbares
 * (hängendes) Handle wird ÜBERSPRUNGEN, nicht erfunden.
 */
export function collectCitations(
  owner: XmlNode,
  citationOf: (handle: string) => XmlNode | null,
  resolveSourceId: (handle: string) => string,
  handleToId?: Map<string, string>,
): Citation[] {
  const out: Citation[] = [];
  for (const ref of childrenByTag(owner, 'citationref')) {
    const cit = citationOf(attr(ref, 'hlink'));
    if (cit) out.push(projectGrampsCitation(cit, resolveSourceId, handleToId));
  }
  return out;
}
