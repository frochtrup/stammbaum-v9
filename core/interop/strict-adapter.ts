// core/interop/strict-adapter.ts — Strict-GEDCOM-5.5.1-Adapter (Spec 13 §5).
// Maximale Fremdkompatibilität: ALLE proprietären `_`-Tags weglassen oder auf
// Standard-Tags mappen. Bewusst NICHT verlustfrei; roundtrip-stabil (out1===out2).
//
// Mapping (Spec 13 §5):
//   _UID    → REFN + (2 TYPE UID)
//   _RUFNAME→ NICK
//   _FREL/_MREL → PEDI  (nur wenn kein PEDI vorhanden)
//   _TASK/_RLOG/_EVAL/_HYPO (+ Sub-`_`-Tags) → weglassen
//   sonstige `_`-Tags → weglassen
//
// Reiner Knotenbaum-Transform.

import type { GedNode } from './gedcom-tree';

function cloneNode(n: GedNode): GedNode {
  return {
    level: n.level,
    xref: n.xref,
    tag: n.tag,
    value: n.value,
    children: n.children.map(cloneNode),
  };
}

/** _FREL/_MREL-Werte (auch deutsch) → GEDCOM-PEDI-Enum. */
function relToPedi(v: string): string | null {
  const s = v.trim().toLowerCase();
  if (/^(adopt|adoptiv|adopted)/.test(s)) return 'adopted';
  if (/^(foster|pflege)/.test(s)) return 'foster';
  if (/^(seal|siegel)/.test(s)) return 'sealing';
  if (/^(birth|geburt|leiblich|natural)/.test(s)) return 'birth';
  return null;
}

/**
 * Strippt einen Record-Baum für Strict-Export. Gibt null zurück, wenn der ganze
 * Record ein proprietärer `_`-Record wäre (praktisch nie auf Level 0).
 */
export function stripStrict(rec: GedNode): GedNode | null {
  if (rec.tag.startsWith('_') && !rec.xref) return null;
  const out = cloneNode(rec);
  out.children = stripChildren(out);
  return out;
}

function stripChildren(node: GedNode): GedNode[] {
  const out: GedNode[] = [];
  const hasPedi = node.children.some((c) => c.tag === 'PEDI');
  for (const c of node.children) {
    if (c.tag === '_UID') {
      out.push({ level: c.level, xref: null, tag: 'REFN', value: c.value, children: [
        { level: c.level + 1, xref: null, tag: 'TYPE', value: 'UID', children: [] },
      ] });
      continue;
    }
    if (c.tag === '_RUFNAME') {
      out.push({ level: c.level, xref: null, tag: 'NICK', value: c.value, children: [] });
      continue;
    }
    if ((c.tag === '_FREL' || c.tag === '_MREL') && !hasPedi) {
      const pedi = relToPedi(c.value);
      if (pedi && !out.some((o) => o.tag === 'PEDI')) {
        out.push({ level: c.level, xref: null, tag: 'PEDI', value: pedi, children: [] });
      }
      continue;
    }
    // Alle übrigen proprietären `_`-Tags: weglassen (samt Sub-Bäumen).
    if (c.tag.startsWith('_')) continue;
    const clone = cloneNode(c);
    clone.children = stripChildren(c);
    out.push(clone);
  }
  return out;
}
