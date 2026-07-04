// ui/islands/tree/tree-layout.ts — reine Layout-Berechnung des Sanduhr-Baums
// (Modell -> Positionen, Spec 32 §2 "Imperative Inseln werden über ihre
// Layout-Berechnung unit-getestet, reine Funktion Modell -> Positionen"). DOM-frei,
// deterministisch, unit-testbar OHNE Browser (TST-2). Der SVG-Aufbau (hourglass-tree.ts)
// konsumiert nur das Ergebnis dieser Funktion — das ist die testbare Naht.
//
// Algorithmus-Herkunft: legacy-v8/ui-views-tree.js `showTree()` (Orakel, Spec 21 §8) —
// Konstanten/Kekule-Vergabe/ancSpan-Slots 1:1 wiederverwendet, Code neu geschrieben
// (framework-frei, kein AppState/UIState, reine Parameter statt globaler DOM-Reads).
// Bewusst NICHT übernommen: Geschwister-Reihe (kein [K]-Punkt in Spec 20 §1.3 für diese
// Slice) — Folge-Schritt, falls gewünscht.
import type { Database, PersonId } from '../../../core/model/types';
import { ancestorLevel, ancestorLevelHasAny, computeKekuleNumbers, getSpouseFamilies } from './tree-model';

export interface TreeLayoutOptions {
  /** Hochformat/Mobile (Spec 20 §1.3: 2 Ebenen) vs. Desktop (bis 4 Ebenen). */
  portrait: boolean;
  /** Maximal gewünschte Vorfahren-Ebenen (1..4); wird durch tatsächliche Belegung gekappt. */
  maxAncestorLevels?: number;
  /** Index der aktiven Ehe/Familie bei Mehrfach-Ehen (Spec: `⚭N`, aktive Familie bestimmt Hauptkinder). */
  activeSpouseIndex?: number;
}

export interface CardBox {
  id: PersonId | null;
  x: number;
  y: number;
  width: number;
  height: number;
  isCenter: boolean;
  isHalfSibling: boolean;
  kekule: number | null;
}

export interface Connector {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  dashed: boolean;
}

export interface MarriageBadge {
  /** Bereich zwischen Proband- und aktiver Ehepartner-Karte, klickbar -> Familien-Detail. */
  familyId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TreeLayoutResult {
  width: number;
  height: number;
  cards: CardBox[];
  connectors: Connector[];
  marriageBadge: MarriageBadge | null;
  /** Gesamtzahl der Ehen des Probanden (für `⚭N`-Badge, Spec 20 §1.3). */
  marriageCount: number;
  /** Tastaturnavigationsziele (Spec: Pfeiltasten zwischen Fokuspersonen). */
  navTargets: {
    up: PersonId | null;
    up2: PersonId | null;
    down: PersonId | null;
    right: PersonId | null;
  };
  /** X-Zentrum + Y der Proband-Karte (für Auto-Fit/Scroll-Zentrierung). */
  centerX: number;
  centerY: number;
}

// Layout-Konstanten (Orakel: legacy-v8/UI-DESIGN.md "Sanduhr-Ansicht: Layout-Algorithmus").
const DIMS = {
  landscape: { W: 96, H: 64, CW: 160, CH: 80, HGAP: 10, VGAP: 44, MGAP: 20, PAD: 20 },
  portrait: { W: 80, H: 54, CW: 124, CH: 72, HGAP: 8, VGAP: 34, MGAP: 16, PAD: 14 },
};

const MAX_CHILD_COLS = 4;

export function computeTreeLayout(
  db: Database,
  probandId: PersonId,
  options: TreeLayoutOptions,
): TreeLayoutResult | null {
  const proband = db.individuals.get(probandId);
  if (!proband) return null;

  const d = options.portrait ? DIMS.portrait : DIMS.landscape;
  const { W, H, CW, CH, HGAP, VGAP, MGAP, PAD } = d;
  const SLOT = W + HGAP;
  const ROW = H + VGAP;

  const requestedLevels = Math.max(1, Math.min(4, options.maxAncestorLevels ?? (options.portrait ? 2 : 4)));

  // ── Kekule-Nummern (Proband=1, relativ zum Probanden — Spec 20 §1.3 [K]) ──
  const kekule = computeKekuleNumbers(db, probandId);
  const kNum = (id: PersonId | null): number | null => (id ? kekule.get(id) ?? null : null);

  // ── Vorfahren-Ebenen 1..requestedLevels, gekappt auf die tiefste belegte Ebene ──
  const levels: (PersonId | null)[][] = [];
  for (let depth = 1; depth <= requestedLevels; depth++) {
    levels.push(ancestorLevel(db, probandId, depth));
  }
  let ancLevels = 0;
  for (let i = levels.length - 1; i >= 0; i--) {
    if (i === 0 || ancestorLevelHasAny(levels[i])) {
      ancLevels = i + 1;
      break;
    }
  }
  const usedLevels = levels.slice(0, ancLevels);
  const ancSlots = ancLevels > 0 ? 2 ** ancLevels : 0;
  const ancSpan = ancSlots * SLOT;

  const par0 = usedLevels[0] ? { father: usedLevels[0][0], mother: usedLevels[0][1] } : { father: null, mother: null };

  // ── Ehen/Familien (Mehrfach-Ehen, Spec: `⚭N`) ──
  const spouseFamilies = getSpouseFamilies(db, probandId).filter((f) => f.spouseId != null);
  const activeIdx = spouseFamilies.length > 0 ? (options.activeSpouseIndex ?? 0) % spouseFamilies.length : 0;
  const activeFam = spouseFamilies[activeIdx] ?? null;
  const mainKidSet = new Set(activeFam ? activeFam.children : (getSpouseFamilies(db, probandId)[0]?.children ?? []));

  const seenKids = new Set<PersonId>();
  const allFamilies = getSpouseFamilies(db, probandId);
  const allKids: PersonId[] = [];
  for (const fam of allFamilies) {
    for (const kid of fam.children) {
      if (!seenKids.has(kid)) {
        seenKids.add(kid);
        allKids.push(kid);
      }
    }
  }
  const halfKidSet = new Set(allKids.filter((id) => !mainKidSet.has(id)));

  const childRows: PersonId[][] = [];
  for (let i = 0; i < allKids.length; i += MAX_CHILD_COLS) childRows.push(allKids.slice(i, i + MAX_CHILD_COLS));

  // ── Layout-Breite ──
  const nSp = spouseFamilies.length;
  const personCX = Math.max(PAD + CW / 2, PAD + ancSpan / 2);
  const personX = personCX - CW / 2;
  const spousesW = nSp > 0 ? nSp * (W + MGAP) : 0;
  const rightEdge = personCX + CW / 2 + spousesW + PAD;
  const childMaxCols = childRows.length > 0 ? Math.max(...childRows.map((r) => r.length)) : 0;
  const totalW = Math.max(personCX + ancSpan / 2 + PAD, rightEdge, personCX + (childMaxCols * SLOT) / 2 + PAD);

  // ── Y-Positionen ──
  const baseY = PAD + ancLevels * ROW;
  function ry(lv: number): number {
    return lv <= 0 ? baseY + lv * ROW : baseY + CH + VGAP + (lv - 1) * ROW;
  }
  const row0Bottom = ry(0) + CH;
  const childStartY = row0Bottom + VGAP;
  const totalH = childRows.length > 0 ? childStartY + childRows.length * ROW - VGAP + PAD : row0Bottom + PAD;

  // ── X: Vorfahren — Slot-Zentren pro Ebene (tiefste Ebene = ancSlots Slots) ──
  const ancLeft = personCX - ancSpan / 2;
  const levelCenterX: ((i: number) => number)[] = [];
  levelCenterX[0] = (i: number) => ancLeft + (i + 0.5) * SLOT;
  for (let k = 1; k < ancLevels; k++) {
    const prevFn = levelCenterX[k - 1];
    levelCenterX[k] = (i: number) => (prevFn(i * 2) + prevFn(i * 2 + 1)) / 2;
  }
  function ancCenterX(depth: number, i: number): number {
    return levelCenterX[ancLevels - depth](i);
  }

  const cards: CardBox[] = [];
  const connectors: Connector[] = [];

  // ── Ahnen-Karten (tiefste zuerst, damit Verbindungslinien zur Elternebene existieren) ──
  for (let depthIdx = ancLevels; depthIdx >= 2; depthIdx--) {
    const level = usedLevels[depthIdx - 1];
    level.forEach((id, i) => {
      if (!id && depthIdx >= 3) return; // tiefe Ebenen: leere Slots überspringen (Orakel-Verhalten)
      const cx = ancCenterX(depthIdx, i);
      cards.push({
        id,
        x: cx - W / 2,
        y: ry(-depthIdx),
        width: W,
        height: H,
        isCenter: false,
        isHalfSibling: false,
        kekule: kNum(id),
      });
      if (id) {
        connectors.push({
          x1: cx,
          y1: ry(-depthIdx) + H,
          x2: ancCenterX(depthIdx - 1, Math.floor(i / 2)),
          y2: ry(-(depthIdx - 1)),
          dashed: false,
        });
      }
    });
  }

  // ── Eltern (Ebene 1) ──
  if (ancLevels >= 1) {
    usedLevels[0].forEach((id, i) => {
      cards.push({
        id,
        x: ancCenterX(1, i) - W / 2,
        y: ry(-1),
        width: W,
        height: H,
        isCenter: false,
        isHalfSibling: false,
        kekule: kNum(id),
      });
    });
    if (par0.father || par0.mother) {
      const juncX = personCX;
      const juncY = ry(-1) + H + Math.round(VGAP * 0.4);
      if (par0.father) connectors.push({ x1: ancCenterX(1, 0), y1: ry(-1) + H, x2: juncX, y2: juncY, dashed: false });
      if (par0.mother) connectors.push({ x1: ancCenterX(1, 1), y1: ry(-1) + H, x2: juncX, y2: juncY, dashed: false });
      connectors.push({ x1: juncX, y1: juncY, x2: personCX, y2: ry(0), dashed: false });
    }
  }

  // ── Zentrumsperson ──
  cards.push({
    id: probandId,
    x: personX,
    y: ry(0),
    width: CW,
    height: CH,
    isCenter: true,
    isHalfSibling: false,
    kekule: kNum(probandId),
  });

  // ── Ehepartner (aktiver zuerst, horizontal rechts) ──
  const orderedSpouses =
    spouseFamilies.length > 0
      ? [spouseFamilies[activeIdx], ...spouseFamilies.filter((_, i) => i !== activeIdx)]
      : [];
  const spColX = personX + CW + MGAP;
  const spouseBaseY = ry(0) + Math.round((CH - H) / 2);
  let marriageBadge: MarriageBadge | null = null;
  orderedSpouses.forEach((fam, displayIdx) => {
    const isActive = displayIdx === 0;
    const spX = spColX + displayIdx * (W + MGAP);
    cards.push({
      id: fam.spouseId,
      x: spX,
      y: spouseBaseY,
      width: W,
      height: H,
      isCenter: false,
      isHalfSibling: false,
      kekule: kNum(fam.spouseId),
    });
    if (isActive) {
      connectors.push({ x1: personX + CW, y1: ry(0) + CH / 2, x2: spX, y2: spouseBaseY + H / 2, dashed: true });
      marriageBadge = {
        familyId: fam.familyId,
        x: personX + CW,
        y: ry(0) + CH / 2 - 12,
        width: spX - personX - CW,
        height: 24,
      };
    }
  });

  // ── Kinder ──
  function childRowCX(row: PersonId[], i: number): number {
    return personCX - (row.length * SLOT) / 2 + (i + 0.5) * SLOT;
  }
  childRows.forEach((row, rowIdx) => {
    const rowY = childStartY + rowIdx * ROW;
    row.forEach((id, i) => {
      const cx = childRowCX(row, i);
      const isHalf = halfKidSet.has(id);
      cards.push({
        id,
        x: cx - W / 2,
        y: rowY,
        width: W,
        height: H,
        isCenter: false,
        isHalfSibling: isHalf,
        kekule: kNum(id),
      });
      connectors.push({ x1: personCX, y1: row0Bottom, x2: cx, y2: rowY, dashed: isHalf });
    });
  });

  return {
    width: totalW,
    height: totalH,
    cards,
    connectors,
    marriageBadge,
    marriageCount: spouseFamilies.length,
    navTargets: {
      up: par0.father,
      up2: par0.mother,
      down: allKids[0] ?? null,
      right: orderedSpouses[0]?.spouseId ?? null,
    },
    centerX: personCX,
    centerY: ry(0),
  };
}
