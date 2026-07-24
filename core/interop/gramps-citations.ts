// core/interop/gramps-citations.ts — GRAMPS-Zitat-Projektion (BL-140 Stufe 1c, ADR-v9-114 D4).
//
// GRAMPS-Zitate sind ZWEISTUFIG (DTD 1.7.2):
//   Owner (Event/Person/Name) → `<citationref hlink>` → `<citation>` → `<sourceref hlink>` → `<source>`.
// Das Modell bündelt das flach in `Citation{sourceId, page, quay}`:
//   - `sourceId`: aus `<sourceref hlink>`, Datei-Handle → Modell-`id` (BL-136-Muster).
//   - `page`:     aus `<page>`.
//   - `quay`:     aus `<confidence>` (GRAMPS 0–4) → GEDCOM QUAY 0–3 via `min(·,3)` (D4).
// Datum/Notizen/Medien/`srcattribute` des GRAMPS-Zitats bleiben vorerst Passthrough im Baum
// (nicht ins Modell projiziert) — der Datenerhalt ist über INV-PT gesichert.
//
// Reine Funktionen, DOM-/Plattform-frei (INV-ARCH-1).

import { makeCitation } from '../model/factory';
import type { Citation, Quay } from '../model/types';
import type { XmlNode } from './xml-tree';
import { attr, childrenByTag, firstChild } from './xml-tree';

/** GRAMPS-`<confidence>` (0–4) → GEDCOM-QUAY (0–3). 4 (Very High) und 3 (High) → 3. */
function confidenceToQuay(text: string): Quay {
  const n = parseInt(text, 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return (n >= 3 ? 3 : n) as Quay;
}

/**
 * Ein GRAMPS-`<citation>`-Knoten → Modell-`Citation`. `resolveSourceId` übersetzt das
 * `<sourceref hlink>`-Handle in die Quellen-Modell-`id` (Aufrufer stellt den Handle→id-Index).
 */
export function projectGrampsCitation(citationNode: XmlNode, resolveSourceId: (handle: string) => string): Citation {
  const sourceref = firstChild(citationNode, 'sourceref');
  const sourceId = sourceref ? resolveSourceId(attr(sourceref, 'hlink')) : '';
  return makeCitation(sourceId, {
    page: firstChild(citationNode, 'page')?.text ?? '',
    quay: confidenceToQuay(firstChild(citationNode, 'confidence')?.text ?? ''),
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
): Citation[] {
  const out: Citation[] = [];
  for (const ref of childrenByTag(owner, 'citationref')) {
    const cit = citationOf(attr(ref, 'hlink'));
    if (cit) out.push(projectGrampsCitation(cit, resolveSourceId));
  }
  return out;
}
