// core/interop/ged7-adapter.ts — GED5→GED7 Baum-Adapter (Spec 13 §4, GEDCOM.md §2).
// Reiner Knotenbaum-Transform; HEAD-Deltas (CHAR/FORM/VERS/SCHMA) macht der Serializer.
//
// GED7-Deltas auf Record-Ebene:
//   0 NOTE @x@  → 0 SNOTE @x@          (geteilte Notiz)
//   1 REFN + 2 TYPE → 1 EXID + 2 TYPE  (externe ID)
//   1 NOTE Kein bekanntes Ereignis: X → 1 NO X   (bestätigtes Fehlen)
//   _TRAN → TRAN                       (Übersetzung)
//   ASSO/RELA → ASSO/ROLE              (Rolle)
// CONC-Auflösung (GED7 verbietet CONC) ist bei unserem Passthrough-Writer nicht nötig,
// solange die Quelle keine CONC enthält; enthält sie welche, faltet foldConc sie in CONT.

import type { GedNode } from './gedcom-tree';

const NO_EVENT_RE = /^Kein bekanntes Ereignis:\s*([A-Z]+)$/;

function cloneNode(n: GedNode): GedNode {
  return {
    level: n.level,
    xref: n.xref,
    tag: n.tag,
    value: n.value,
    children: n.children.map(cloneNode),
  };
}

/** Transformiert einen Record-Baum von GED5 nach GED7 (rein, neuer Baum). */
export function transformGed7(rec: GedNode): GedNode {
  const out = cloneNode(rec);
  // Record-Ebene: geteilte NOTE → SNOTE.
  if (out.tag === 'NOTE' && out.xref) out.tag = 'SNOTE';
  transformSubtree(out, out.tag === 'HEAD');
  return out;
}

function transformSubtree(node: GedNode, isHead: boolean): void {
  const kept: GedNode[] = [];
  for (const c of node.children) {
    // 1 NOTE "Kein bekanntes Ereignis: BIRT" → 1 NO BIRT
    if (!isHead && c.tag === 'NOTE') {
      const m = NO_EVENT_RE.exec(c.value);
      if (m) {
        kept.push({ level: c.level, xref: null, tag: 'NO', value: m[1], children: [] });
        continue;
      }
    }
    // Externe ID: REFN → EXID
    if (c.tag === 'REFN') c.tag = 'EXID';
    // Übersetzungen: _TRAN → TRAN
    if (c.tag === '_TRAN') c.tag = 'TRAN';
    // ASSO-Rolle: RELA → ROLE
    if (node.tag === 'ASSO' && c.tag === 'RELA') c.tag = 'ROLE';
    transformSubtree(c, false);
    kept.push(c);
  }
  node.children = kept;
}
