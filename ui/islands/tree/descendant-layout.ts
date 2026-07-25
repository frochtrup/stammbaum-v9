// ui/islands/tree/descendant-layout.ts — reine Layout-Berechnung des Nachkommen-Baums
// (Spec 20 §1.3 [S], BL-122, ADR-v9-123). DOM-frei, framework-frei — liest ausschließlich
// Person/Family aus core/model. Orakel: legacy-v8 `ui-desc-tree.js` (`_descLayout` +
// `renderNode`), Konstanten aus `legacy-v8/UI-DESIGN.md` „Nachkommen-Ansicht".
//
// Top-down: Proband oben (Zentrum), Ehepartner-Gruppe rechts, Geschwister-Stapel links,
// Kinder/Enkel darunter (Gen 2–7). Bottom-up-Slot-Vergabe bestimmt die Breite je Teilbaum;
// ein zweiter Top-down-Pass verteilt X/Y und emittiert Karten + T-Linien. Halbkinder (andere
// Ehe als die Hauptfamilie) tragen `isHalf`; `hasMore` markiert am Generationen-Rand
// abgeschnittene Nachkommen (▼). Deterministisch (Kinder nach Geburtsjahr, dann ID).
import type { Database, FamilyId, PersonId } from '../../../core/model/types';
import { getParentIds } from './tree-model';
import type { DiagramNavTargets } from './tree-viewport';

export interface DescendantCard {
  id: PersonId | null;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Proband (Gold-Zentrum, Klick → Detail). */
  isCenter: boolean;
  /** Halbkind (andere Ehe als die Hauptfamilie des Elternteils). */
  isHalf: boolean;
  /** Steht im Geschwisterstapel links vom Probanden. */
  isSibling: boolean;
  /** Abgeschnittene Nachkommen unterhalb dieser Karte (▼, am Generationen-Rand). */
  hasMore: boolean;
  /** Stapel-z-index (Geschwisterstapel überlappt; spätere Karte oben). */
  zIndex?: number;
}

export interface DescendantConnector {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface DescendantMarriageBadge {
  familyId: FamilyId;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DescendantLayoutResult {
  width: number;
  height: number;
  /** X-Zentrum + Y der Proband-Karte (für Auto-Fit/Scroll-Zentrierung). */
  centerX: number;
  centerY: number;
  cards: DescendantCard[];
  connectors: DescendantConnector[];
  /** ⚭-Bereich zwischen Proband und erstem Ehepartner (null ohne Ehepartner). */
  marriageBadge: DescendantMarriageBadge | null;
  navTargets: DiagramNavTargets;
}

export interface DescendantLayoutOptions {
  /** Hochformat/Mobile (kleinere Karten/Abstände) vs. Desktop. */
  portrait: boolean;
  /** Anzahl dargestellter Generationen inkl. Proband (2–7, Spec 20 §1.3). Default 4. */
  generations?: number;
}

// Layout-Konstanten (Orakel: legacy-v8/UI-DESIGN.md „Nachkommen-Ansicht: Layout-Algorithmus").
const DIMS = {
  landscape: { W: 96, H: 64, CW: 160, CH: 80, HGAP: 10, VGAP: 48, PAD: 20, MGAP: 10, SIB_GAP: 10 },
  portrait: { W: 80, H: 54, CW: 124, CH: 72, HGAP: 8, VGAP: 38, PAD: 14, MGAP: 8, SIB_GAP: 8 },
};

/** Interner Baumknoten mit bottom-up berechneter Slot-Breite. */
interface DescNode {
  id: PersonId;
  isHalf: boolean;
  hasMore: boolean;
  slots: number;
  children: DescNode[];
}

/** Geburtsjahr (4 Ziffern) oder null. */
function birthYear(db: Database, id: PersonId): number | null {
  const y = (db.individuals.get(id)?.birth.date || '').match(/\d{4}/)?.[0];
  return y ? Number(y) : null;
}

/** Deterministische Kinder-Reihenfolge: Geburtsjahr aufsteigend, fehlendes ans Ende, dann ID. */
function sortedChildren(db: Database, ids: readonly PersonId[]): PersonId[] {
  return [...ids].sort((a, b) => {
    const ya = birthYear(db, a);
    const yb = birthYear(db, b);
    if (ya !== yb) return (ya ?? Infinity) - (yb ?? Infinity);
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

/** Erste existierende Familie, in der `pid` Elternteil ist (Hauptfamilie, Orakel: `fams`-Reihenfolge). */
function mainFamilyId(db: Database, pid: PersonId): FamilyId | null {
  return db.individuals.get(pid)?.parentIn.find((fid) => db.families.has(fid)) ?? null;
}

/** Alle Ehepartner von `pid` über alle Familien (in Familien-Reihenfolge). */
function spouseIds(db: Database, pid: PersonId): PersonId[] {
  const out: PersonId[] = [];
  for (const fid of db.individuals.get(pid)?.parentIn ?? []) {
    const fam = db.families.get(fid);
    if (!fam) continue;
    const sp = fam.husband === pid ? fam.wife : fam.wife === pid ? fam.husband : null;
    if (sp) out.push(sp);
  }
  return out;
}

/** Familien-ID des Paares (pid, spouseId), falls vorhanden. */
function spouseFamilyId(db: Database, pid: PersonId, spouseId: PersonId): FamilyId | null {
  for (const fid of db.individuals.get(pid)?.parentIn ?? []) {
    const f = db.families.get(fid);
    if (f && ((f.husband === pid && f.wife === spouseId) || (f.wife === pid && f.husband === spouseId))) return fid;
  }
  return null;
}

/** Bottom-up: Teilbaum aufbauen und Slot-Breiten summieren (Orakel: `_descLayout`). */
function buildNode(db: Database, pid: PersonId, depth: number, isHalf: boolean): DescNode {
  const person = db.individuals.get(pid);
  if (!person) return { id: pid, isHalf, hasMore: false, slots: 1, children: [] };

  const mainFam = mainFamilyId(db, pid);
  const mainKidSet = new Set(mainFam ? db.families.get(mainFam)?.children ?? [] : []);

  const seen = new Set<PersonId>();
  const childEntries: { id: PersonId; isHalf: boolean }[] = [];
  for (const fid of person.parentIn) {
    const fam = db.families.get(fid);
    if (!fam) continue;
    for (const cid of sortedChildren(db, fam.children)) {
      if (seen.has(cid)) continue;
      seen.add(cid);
      childEntries.push({ id: cid, isHalf: !mainKidSet.has(cid) });
    }
  }

  if (depth <= 0 || childEntries.length === 0) {
    return { id: pid, isHalf, hasMore: depth <= 0 && childEntries.length > 0, slots: 1, children: [] };
  }

  const children = childEntries.map((e) => buildNode(db, e.id, depth - 1, e.isHalf));
  const totalSlots = children.reduce((s, c) => s + c.slots, 0);
  return { id: pid, isHalf, hasMore: false, slots: Math.max(1, totalSlots), children };
}

function nodeDepth(node: DescNode): number {
  if (node.children.length === 0) return 1;
  return 1 + Math.max(...node.children.map(nodeDepth));
}

export function computeDescendantLayout(
  db: Database,
  probandId: PersonId,
  options: DescendantLayoutOptions,
): DescendantLayoutResult | null {
  const proband = db.individuals.get(probandId);
  if (!proband) return null;

  const d = options.portrait ? DIMS.portrait : DIMS.landscape;
  const { W, H, CW, CH, HGAP, VGAP, PAD, MGAP, SIB_GAP } = d;
  const SLOT = W + HGAP;
  const generations = Math.max(2, Math.min(7, options.generations ?? 4));

  const rootSpouseIds = spouseIds(db, probandId);
  const nSpouses = rootSpouseIds.length;

  // Geschwister aus der ersten Herkunftsfamilie (Orakel: `famc[0]`), ohne den Probanden.
  const sibFamId = proband.childOf[0]?.familyId ?? null;
  const siblings = sibFamId
    ? sortedChildren(db, db.families.get(sibFamId)?.children ?? []).filter((id) => id !== probandId)
    : [];
  const nSibs = siblings.length;
  const sibsW = nSibs > 0 ? W + SIB_GAP : 0;

  const root = buildNode(db, probandId, generations - 1, false);
  const actualDepth = nodeDepth(root);
  const treeSpan = root.slots * SLOT;

  // rootCX: weit genug rechts für Geschwisterstapel links + halbe Baumbreite.
  const rootCX = Math.max(PAD + sibsW + CW / 2, PAD + sibsW + treeSpan / 2);

  // Ehepartner-Gruppe: variable Überlappung analog Geschwister, max Schritt = W+HGAP.
  const spouseAvailW = nSpouses <= 1 ? W : Math.min(nSpouses * (MGAP + W), Math.max(MGAP + W, treeSpan));
  const spouseStep = nSpouses <= 1 ? 0 : Math.max(Math.round(W * 0.3), Math.min(W + HGAP, Math.floor((spouseAvailW - W) / (nSpouses - 1))));
  const rootSpouseW = nSpouses > 0 ? MGAP + spouseStep * (nSpouses - 1) + W : 0;

  const width = Math.max(CW + 2 * PAD, rootCX + CW / 2 + rootSpouseW + PAD, rootCX + treeSpan / 2 + PAD);
  const height = PAD + CH + (actualDepth > 1 ? (actualDepth - 1) * (H + VGAP) : 0) + PAD;

  const cards: DescendantCard[] = [];
  const connectors: DescendantConnector[] = [];

  // ── Top-down: Karten + T-Linien ──
  function renderNode(node: DescNode, cx: number, y: number, isRoot: boolean, isHalf: boolean): void {
    const cardW = isRoot ? CW : W;
    const cardH = isRoot ? CH : H;
    cards.push({
      id: node.id,
      x: cx - cardW / 2,
      y,
      width: cardW,
      height: cardH,
      isCenter: isRoot,
      isHalf,
      isSibling: false,
      hasMore: node.hasMore,
    });
    if (node.children.length === 0) return;

    const nextY = y + cardH + VGAP;
    const childrenSpan = node.children.reduce((s, c) => s + c.slots, 0) * SLOT;
    const connY = y + cardH;
    const juncY = connY + Math.round(VGAP * 0.4);

    const childCXs: number[] = [];
    let xCur = cx - childrenSpan / 2;
    for (const child of node.children) {
      childCXs.push(xCur + (child.slots * SLOT) / 2);
      xCur += child.slots * SLOT;
    }

    connectors.push({ x1: cx, y1: connY, x2: cx, y2: juncY });
    if (childCXs.length > 1) connectors.push({ x1: childCXs[0], y1: juncY, x2: childCXs[childCXs.length - 1], y2: juncY });
    for (const childCX of childCXs) connectors.push({ x1: childCX, y1: juncY, x2: childCX, y2: nextY });

    xCur = cx - childrenSpan / 2;
    for (const child of node.children) {
      renderNode(child, xCur + (child.slots * SLOT) / 2, nextY, false, child.isHalf);
      xCur += child.slots * SLOT;
    }
  }
  renderNode(root, rootCX, PAD, true, false);

  // ── Ehepartner-Gruppe rechts + ⚭-Bereich zum ersten Ehepartner ──
  let marriageBadge: DescendantMarriageBadge | null = null;
  if (nSpouses > 0) {
    const spStart = rootCX + CW / 2 + MGAP;
    const firstFam = spouseFamilyId(db, probandId, rootSpouseIds[0]);
    if (firstFam) {
      marriageBadge = { familyId: firstFam, x: rootCX + CW / 2, y: PAD + CH / 2 - 12, width: MGAP, height: 24 };
    }
    rootSpouseIds.forEach((spId, i) => {
      cards.push({
        id: spId,
        x: spStart + i * spouseStep,
        y: PAD + (CH - H) / 2,
        width: W,
        height: H,
        isCenter: false,
        isHalf: false,
        isSibling: false,
        hasMore: false,
      });
    });
  }

  // ── Geschwister-Stapel links (horizontal, variable Überlappung, rechteste oben) ──
  if (nSibs > 0) {
    const sibY = PAD + (CH - H) / 2;
    const midY = PAD + CH / 2;
    const stackRightX = rootCX - CW / 2 - SIB_GAP;
    const availW = stackRightX - PAD;
    const sibStep = nSibs === 1 ? 0 : Math.max(16, Math.min(W + HGAP, Math.floor((availW - W) / (nSibs - 1))));
    const stackW = nSibs === 1 ? W : sibStep * (nSibs - 1) + W;
    const stackLeftX = stackRightX - stackW;

    connectors.push({ x1: stackRightX, y1: midY, x2: rootCX - CW / 2, y2: midY });

    siblings.forEach((sid, i) => {
      cards.push({
        id: sid,
        x: stackLeftX + i * sibStep,
        y: sibY,
        width: W,
        height: H,
        isCenter: false,
        isHalf: false,
        isSibling: true,
        hasMore: false,
        zIndex: i + 1,
      });
    });
  }

  // ── Tastatur-Navigationsziele (Orakel: desc `_treeNavTargets`) ──
  const par0 = getParentIds(db, probandId);
  const navTargets: DiagramNavTargets = {
    up: par0.father || par0.mother || null,
    up2: par0.father ? par0.mother : null,
    down: root.children[0]?.id ?? null,
    right: rootSpouseIds[0] ?? root.children[1]?.id ?? null,
  };

  return { width, height, centerX: rootCX, centerY: PAD + CH / 2, cards, connectors, marriageBadge, navTargets };
}
