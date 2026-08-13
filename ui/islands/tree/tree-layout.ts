// ui/islands/tree/tree-layout.ts — reine Layout-Berechnung des Sanduhr-Baums
// (Modell -> Positionen, Spec 32 §2 "Imperative Inseln werden über ihre
// Layout-Berechnung unit-getestet, reine Funktion Modell -> Positionen"). DOM-frei,
// deterministisch, unit-testbar OHNE Browser (TST-2). Der SVG-Aufbau (hourglass-tree.ts)
// konsumiert nur das Ergebnis dieser Funktion — das ist die testbare Naht.
//
// Algorithmus-Herkunft: legacy-v8/ui-views-tree.js `showTree()` (Orakel, Spec 21 §8) —
// Konstanten/Kekule-Vergabe/ancSpan-Slots 1:1 wiederverwendet, Code neu geschrieben
// (framework-frei, kein AppState/UIState, reine Parameter statt globaler DOM-Reads).
// Geschwisterzeile (ADR-v9-23, Spec 20 §1.3 [K]): horizontale Reihe links vom Probanden,
// vertikal auf die Proband-Zeile zentriert (Orakel: `useHorizSibs`-Zweig in `showTree()`).
//
// Kappung + Peek-Stapel-Fallback (Nachtrag, Orakel: legacy-v8 Zeilen 476-524/667-700):
// - `useHorizSibs = nSibs > 0 && ancLevels >= 3` — horizontale Zeile NUR ab 3 sichtbaren
//   Ahnen-Ebenen, sonst Peek-Stapel-Fallback (alle Geschwister sichtbar, kein Cutoff).
// - v8-Zirkelbezug Kartenbreite<->personX aufgelöst wie im Orakel selbst: `personX`
//   hängt NIE von der Geschwisterzeile ab (v8 Zeile 473 berechnet `personCX` rein aus
//   `ancSpan`, ohne Sib-Reserve-Term). Die Geschwisterzeile bekommt nur, was links von
//   `personX` noch frei ist (`availSibW = personX - PAD - SIB_GAP`) und schrumpft/kappt
//   sich hinein — sie verbreitert das Gesamtlayout nie über den Ahnen-Fächer hinaus.
//   Das ist kein Kompromiss ggü. v8, sondern exakt dessen Lösung: der scheinbare
//   Zirkelbezug existiert in v8 nicht, weil die Breitenberechnung einseitig ist
//   (Ahnen-Fächer bestimmt `personX`, Geschwister ordnen sich unter).
// - Horizontal-Modus: Kartenbreite schrumpft bis `MIN_SIB_W` (52 portrait/60 landscape),
//   danach kappt `nFit` die Anzahl; „…“-Indikator zeigt `nHidden` (Tooltip s. `_buildSiblingRow`).
// - Peek-Modus: alle Geschwister gestapelt, vertikal versetzt um `PEEK` (10 portrait/12
//   landscape) px pro Karte, reserviert nur eine Kartenbreite (Höhe wächst statt Breite);
//   Zähler-Badge (`siblingCountBadge`) am Proband-Kartenrand, nur wenn `nSibs > 1`.
import type { Database, PersonId } from '../../../core/model/types';
import {
  ancestorLevel,
  ancestorLevelHasAny,
  computeKekuleNumbers,
  getSiblingIds,
  getSpouseFamilies,
} from './tree-model';

export interface TreeLayoutOptions {
  /** Hochformat/Mobile (Spec 20 §1.3: 2 Ebenen) vs. Desktop (bis 4 Ebenen). */
  portrait: boolean;
  /** Maximal gewünschte Vorfahren-Ebenen (1..4); wird durch tatsächliche Belegung gekappt. */
  maxAncestorLevels?: number;
  /** Index der aktiven Ehe/Familie bei Mehrfach-Ehen (Spec: `⚭N`, aktive Familie bestimmt Hauptkinder). */
  activeSpouseIndex?: number;
  /**
   * Der PROBAND der Sitzung — die Wurzel der Kekule-Zählung, NICHT das Zentrum des Baums
   * (das ist `centerId`). Die beiden fielen bis dahin zusammen, weil der Parameter selbst
   * `probandId` hieß: jedes Rezentrieren auf eine Karte nummerierte den ganzen Baum neu, und
   * das Tooltip „Proband = 1" behauptete etwas, das nur zufällig stimmte (Nutzer-Befund).
   *
   * Fehlt er, gibt es GAR KEINE Nummern — dieselbe Regel wie in der Personenliste
   * (`person-list-model.ts`: `probandId ? computeKekuleNumbers(...) : null`, INV-UI-4). Eine
   * Nummer ohne bekannten Bezugspunkt wäre eine Aussage über eine Ahnentafel, die es nicht
   * gibt; die Aufrufer der UI lösen den Probanden ohnehin über `resolveProband` auf.
   */
  probandId?: PersonId | null;
}

export interface CardBox {
  id: PersonId | null;
  x: number;
  y: number;
  width: number;
  height: number;
  isCenter: boolean;
  isHalfSibling: boolean;
  /** Karte steht in der Geschwisterzeile des Probanden (ADR-v9-23), nicht in der Kinderzeile. */
  isSibling: boolean;
  /** Peek-Stapel-Fallback (<3 Ahnen-Ebenen, Orakel `tree-card-peek`): Karte liegt versetzt
   * hinter den vorherigen Geschwister-Karten, statt in eigener horizontaler Zeile. */
  isPeek: boolean;
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

/** „…"-Kappungs-Indikator der horizontalen Geschwisterzeile (Orakel: `tree-sib-more`,
 * legacy-v8 Zeile 672-687) — erscheint nur wenn `useHorizSibs` UND `nHidden > 0`. */
export interface SiblingOverflow {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Anzahl nicht dargestellter Geschwister (`nHidden`). */
  count: number;
  /** Tooltip-Text (Orakel: `+${nHidden} Geschwister nicht dargestellt`). */
  title: string;
}

export interface TreeLayoutResult {
  width: number;
  height: number;
  cards: CardBox[];
  connectors: Connector[];
  marriageBadge: MarriageBadge | null;
  /** Gesamtzahl der Ehen des Probanden (für `⚭N`-Badge, Spec 20 §1.3). */
  marriageCount: number;
  /** „…"-Kappungs-Indikator, nur im Horizontal-Modus bei `nHidden > 0` (sonst `null`). */
  siblingOverflow: SiblingOverflow | null;
  /** Geschwisterzähler-Badge am Proband-Kartenrand, nur im Peek-Stapel-Fallback bei
   * `nSibs > 1` (sonst `null`) — Orakel: `tree-half-badge--sib-count`. */
  siblingCountBadge: number | null;
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
  landscape: { W: 96, H: 64, CW: 160, CH: 80, HGAP: 10, VGAP: 44, MGAP: 20, PAD: 20, SIB_GAP: 14, PEEK: 12, MIN_SIB_W: 60, MORE_W: 26 },
  portrait: { W: 80, H: 54, CW: 124, CH: 72, HGAP: 8, VGAP: 34, MGAP: 16, PAD: 14, SIB_GAP: 12, PEEK: 10, MIN_SIB_W: 52, MORE_W: 22 },
};

const MAX_CHILD_COLS = 4;

export function computeTreeLayout(
  db: Database,
  centerId: PersonId,
  options: TreeLayoutOptions,
): TreeLayoutResult | null {
  const proband = db.individuals.get(centerId);
  if (!proband) return null;

  const d = options.portrait ? DIMS.portrait : DIMS.landscape;
  const { W, H, CW, CH, HGAP, VGAP, MGAP, PAD, SIB_GAP, PEEK, MIN_SIB_W, MORE_W } = d;
  const SLOT = W + HGAP;
  const ROW = H + VGAP;

  // ── Geschwister des Probanden (ADR-v9-23, Spec 20 §1.3 [K]): eigene Zeile links vom
  // Probanden, Voll- und Halbgeschwister aus person.childOf. ──
  const siblings = getSiblingIds(db, centerId);
  const nSibs = siblings.length;

  const requestedLevels = Math.max(1, Math.min(4, options.maxAncestorLevels ?? (options.portrait ? 2 : 4)));

  // ── Kekule-Nummern (Proband=1, relativ zum PROBANDEN — Spec 20 §1.3 [K]) ──
  // NICHT `centerId`: der Baum zentriert auf die Fokusperson, gezählt wird trotzdem ab dem
  // Probanden der Sitzung (s. `TreeLayoutOptions.probandId`). Ohne Probanden keine Nummern.
  const kekule = options.probandId ? computeKekuleNumbers(db, options.probandId) : null;
  const kNum = (id: PersonId | null): number | null => (id && kekule ? kekule.get(id) ?? null : null);

  // ── Vorfahren-Ebenen 1..requestedLevels, gekappt auf die tiefste belegte Ebene ──
  const levels: (PersonId | null)[][] = [];
  for (let depth = 1; depth <= requestedLevels; depth++) {
    levels.push(ancestorLevel(db, centerId, depth));
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
  const spouseFamilies = getSpouseFamilies(db, centerId).filter((f) => f.spouseId != null);
  const activeIdx = spouseFamilies.length > 0 ? (options.activeSpouseIndex ?? 0) % spouseFamilies.length : 0;
  const activeFam = spouseFamilies[activeIdx] ?? null;
  const mainKidSet = new Set(activeFam ? activeFam.children : (getSpouseFamilies(db, centerId)[0]?.children ?? []));

  const seenKids = new Set<PersonId>();
  const allFamilies = getSpouseFamilies(db, centerId);
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
  // personCX hängt NUR vom Ahnen-Fächer ab, NIE von der Geschwisterzeile (Orakel: v8
  // Zeile 473 — `Math.max(PAD + CW/2, PAD + ancSpan/2)`, kein Sib-Reserve-Term). Das löst
  // den scheinbaren Zirkelbezug Kartenbreite<->personX auf: die Geschwisterzeile ordnet
  // sich dem bereits feststehenden `personX` unter (schrumpft/kappt sich hinein), statt
  // ihn zu verschieben — genau wie im Orakel.
  const personCX = Math.max(PAD + CW / 2, PAD + ancSpan / 2);
  const personX = personCX - CW / 2;

  // ── Geschwister: horizontale Zeile ab 3 Ahnen-Ebenen, sonst Peek-Stapel-Fallback
  // (Orakel: legacy-v8 Zeilen 476-524, `useHorizSibs`/`sibCardW`/`nFit`/`nHidden`). ──
  const useHorizSibs = nSibs > 0 && ancLevels >= 3;
  const availSibW = personX - PAD - SIB_GAP;
  const sibCardW =
    useHorizSibs && availSibW > 0
      ? Math.max(MIN_SIB_W, Math.min(W, Math.floor((availSibW - Math.max(0, nSibs - 1) * SIB_GAP) / nSibs)))
      : W;
  const nFit = useHorizSibs
    ? Math.min(nSibs, Math.max(0, Math.floor((availSibW + SIB_GAP) / (sibCardW + SIB_GAP))))
    : nSibs;
  const nHidden = nSibs - nFit;
  const sibRowW = nFit > 0 ? nFit * sibCardW + Math.max(0, nFit - 1) * SIB_GAP : 0;

  const spousesW = nSp > 0 ? nSp * (W + MGAP) : 0;
  const rightEdge = personCX + CW / 2 + spousesW + PAD;
  const childMaxCols = childRows.length > 0 ? Math.max(...childRows.map((r) => r.length)) : 0;
  const totalW = Math.max(personCX + ancSpan / 2 + PAD, rightEdge, personCX + (childMaxCols * SLOT) / 2 + PAD);

  // ── Y-Positionen ──
  const baseY = PAD + ancLevels * ROW;
  function ry(lv: number): number {
    return lv <= 0 ? baseY + lv * ROW : baseY + CH + VGAP + (lv - 1) * ROW;
  }
  // Peek-Stapel wächst nach unten (eine Kartenbreite reserviert, dafür mehr Höhe);
  // horizontale Zeile bleibt in der Proband-Zeile (kein zusätzlicher Höhenbedarf).
  const sibStackH = useHorizSibs ? 0 : nSibs > 0 ? H + (nSibs - 1) * PEEK : 0;
  const row0Bottom = Math.max(ry(0) + CH, ry(0) + sibStackH);
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
        isSibling: false,
        isPeek: false,
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
        isSibling: false,
        isPeek: false,
        kekule: kNum(id),
      });
    });
  }

  // ── X/Y der Geschwisterzeile bzw. -stapel (vor der Junktions-/Kartenberechnung, da
  // beide Zweige dieselben Positionsfunktionen brauchen — Orakel: v8 `sibX`/`sibCX`
  // (Zeile 519-522) vs. `sibColX`/`sibColCX`/`sibMidY` (Zeile 524-526)). ──
  const sibY = ry(0) + Math.round((CH - H) / 2);
  const sibRowStartX = personX - SIB_GAP - sibRowW;
  const sibX = (i: number): number => sibRowStartX + i * (sibCardW + SIB_GAP);
  const sibCX = (i: number): number => sibX(i) + sibCardW / 2;
  const sibColX = personX - SIB_GAP - W;
  const sibColCX = sibColX + W / 2;
  const sibMidY = (i: number): number => ry(0) + i * PEEK + H / 2;

  // ── Eltern → Proband-Verzweigungspunkt (Orakel: v8 zeichnet den Junktions-Punkt sowohl
  // für Eltern-Linien als auch für die Geschwister-T-Linie, unabhängig davon ob Eltern-
  // Karten überhaupt dargestellt werden — Auslöser ist "Eltern bekannt ODER Geschwister
  // vorhanden") ──
  if (ancLevels >= 1 && (par0.father || par0.mother || nSibs > 0)) {
    const juncX = personCX;
    const juncY = ry(-1) + H + Math.round(VGAP * 0.4);
    if (par0.father) connectors.push({ x1: ancCenterX(1, 0), y1: ry(-1) + H, x2: juncX, y2: juncY, dashed: false });
    if (par0.mother) connectors.push({ x1: ancCenterX(1, 1), y1: ry(-1) + H, x2: juncX, y2: juncY, dashed: false });
    connectors.push({ x1: juncX, y1: juncY, x2: personCX, y2: ry(0), dashed: false });
    if (nSibs > 0) {
      if (useHorizSibs && nFit > 0) {
        // Horizontaler T-Balken von der linkesten sichtbaren Geschwister-Mitte bis zur
        // Mittelachse + je eine kurze Vertikale zur Oberkante jeder sichtbaren Karte.
        connectors.push({ x1: sibCX(0), y1: juncY, x2: juncX, y2: juncY, dashed: false });
        for (let i = 0; i < nFit; i++) {
          connectors.push({ x1: sibCX(i), y1: juncY, x2: sibCX(i), y2: sibY, dashed: siblings[i].isHalf });
        }
      } else if (!useHorizSibs) {
        // Peek-Stapel-Fallback: eine T-Linie zur Peek-Spalte, eine Vertikale durch den
        // gesamten Stapel (Orakel: `sib-h`/`sib-v`, Zeile 661-662).
        connectors.push({ x1: juncX, y1: juncY, x2: sibColCX, y2: juncY, dashed: false });
        connectors.push({ x1: sibColCX, y1: juncY, x2: sibColCX, y2: sibMidY(nSibs - 1), dashed: false });
      }
    }
  } else if (nSibs > 0) {
    // Keine Ahnen-Ebene dargestellt (ancLevels=0 kommt praktisch nicht vor, da Ebene 1
    // immer mind. als Ghost-Slots gerendert wird) — Fallback: T-Linie direkt aus der
    // Proband-Oberkante, falls doch einmal ancLevels=0 anliegt.
    const juncY = ry(0) - Math.round(VGAP * 0.4);
    if (useHorizSibs && nFit > 0) {
      connectors.push({ x1: sibCX(0), y1: juncY, x2: personCX, y2: juncY, dashed: false });
      connectors.push({ x1: personCX, y1: juncY, x2: personCX, y2: ry(0), dashed: false });
      for (let i = 0; i < nFit; i++) {
        connectors.push({ x1: sibCX(i), y1: juncY, x2: sibCX(i), y2: sibY, dashed: siblings[i].isHalf });
      }
    } else if (!useHorizSibs) {
      connectors.push({ x1: personCX, y1: juncY, x2: sibColCX, y2: juncY, dashed: false });
      connectors.push({ x1: sibColCX, y1: juncY, x2: sibColCX, y2: sibMidY(nSibs - 1), dashed: false });
      connectors.push({ x1: personCX, y1: juncY, x2: personCX, y2: ry(0), dashed: false });
    }
  }

  // ── Geschwister: horizontale Zeile (ADR-v9-23, mit Kappung) ODER Peek-Stapel-Fallback
  // (Orakel: legacy-v8 Zeilen 667-695). ──
  let siblingOverflow: SiblingOverflow | null = null;
  let siblingCountBadge: number | null = null;
  if (useHorizSibs) {
    siblings.slice(0, nFit).forEach((sib, i) => {
      cards.push({
        id: sib.id,
        x: sibX(i),
        y: sibY,
        width: sibCardW,
        height: H,
        isCenter: false,
        isHalfSibling: sib.isHalf,
        isSibling: true,
        isPeek: false,
        kekule: kNum(sib.id),
      });
    });
    if (nHidden > 0) {
      const morX = nFit > 0 ? Math.max(PAD, sibRowStartX - 4 - MORE_W) : personX - SIB_GAP - MORE_W;
      siblingOverflow = {
        x: morX,
        y: sibY,
        width: MORE_W,
        height: H,
        count: nHidden,
        title: `+${nHidden} Geschwister nicht dargestellt`,
      };
    }
  } else if (nSibs > 0) {
    // Peek-Stapel: ALLE Geschwister sichtbar, vertikal versetzt, keine Kappung.
    siblings.forEach((sib, i) => {
      cards.push({
        id: sib.id,
        x: sibColX,
        y: ry(0) + i * PEEK,
        width: W,
        height: H,
        isCenter: false,
        isHalfSibling: sib.isHalf,
        isSibling: true,
        isPeek: i > 0,
        kekule: kNum(sib.id),
      });
    });
    if (nSibs > 1) siblingCountBadge = nSibs;
  }

  // ── Zentrumsperson ──
  cards.push({
    id: centerId,
    x: personX,
    y: ry(0),
    width: CW,
    height: CH,
    isCenter: true,
    isHalfSibling: false,
    isSibling: false,
    isPeek: false,
    kekule: kNum(centerId),
  });

  // ── Ehepartner (aktiver zuerst, horizontal rechts) ──
  const orderedSpouses =
    spouseFamilies.length > 0
      ? [spouseFamilies[activeIdx], ...spouseFamilies.filter((_, i) => i !== activeIdx)]
      : [];
  const spColX = personX + CW + MGAP;
  const spouseBaseY = ry(0) + Math.round((CH - H) / 2);
  // Der ⚭-Badge hängt allein an der AKTIVEN Ehe — die steht nach `orderedSpouses` an
  // Position 0, ihre Karte also fest bei `spColX`. Deshalb hier deklarativ statt als
  // `let`, das im Callback unten gesetzt wird: eine im Callback zugewiesene Variable
  // hält die Kontrollfluss-Analyse danach für `never`, was jeden Zugriff auf das Feld
  // (etwa in der Umriss-Berechnung am Ende) zu einem Cast zwingt.
  const activeFamForBadge = orderedSpouses[0] ?? null;
  const marriageBadge: MarriageBadge | null = activeFamForBadge
    ? {
        familyId: activeFamForBadge.familyId,
        x: personX + CW,
        y: ry(0) + CH / 2 - 12,
        width: spColX - personX - CW,
        height: 24,
      }
    : null;
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
      isSibling: false,
      isPeek: false,
      kekule: kNum(fam.spouseId),
    });
    if (isActive) {
      connectors.push({ x1: personX + CW, y1: ry(0) + CH / 2, x2: spX, y2: spouseBaseY + H / 2, dashed: true });
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
        isSibling: false,
        isPeek: false,
        kekule: kNum(id),
      });
      connectors.push({ x1: personCX, y1: row0Bottom, x2: cx, y2: rowY, dashed: isHalf });
    });
  });

  // ── Die Fläche muss umschließen, was gezeichnet wird ────────────────────────────────
  // `personCX` bemisst sich allein am Ahnen-Fächer (Orakel, s. Kopfkommentar) — die
  // Kinderzeile und der Peek-Geschwisterstapel richten sich aber ebenfalls an ihm aus und
  // sind bei WENIGEN Ahnen-Ebenen breiter als er: eine volle Kinderzeile misst
  // 4·SLOT, ein Ein-Ebenen-Fächer nur 2·SLOT. Die Differenz lag links von x=0 — und was
  // dort liegt, kann kein Scroll-Container erreichen (`scrollLeft` wird nie negativ), es
  // war schlicht abgeschnitten (Nutzer-Befund „Baum wird nicht vollständig angezeigt";
  // gemessen: Kinderkarte bei x=-81, Peek-Stapel bei x=-64, Linien bei x=-33).
  //
  // Korrigiert wird am ENDE über den tatsächlichen Umriss, nicht in `personCX`: die
  // einseitige Breitenberechnung des Orakels (Fächer bestimmt personCX, alles andere ordnet
  // sich unter) bleibt damit unangetastet — es verschiebt sich nur der Ursprung. Ein
  // Reserve-Term in `personCX` hätte dagegen den Zirkelbezug zurückgeholt, den der
  // Kopfkommentar auflöst (die Geschwister-Kartenbreite hängt selbst von `personX` ab).
  // Als Umriss zählt alles Gezeichnete: Karten, Linien, ⚭-Badge, „…"-Indikator.
  const alleX: number[] = [];
  for (const c of cards) alleX.push(c.x, c.x + c.width);
  for (const c of connectors) alleX.push(c.x1, c.x2);
  if (marriageBadge) alleX.push(marriageBadge.x, marriageBadge.x + marriageBadge.width);
  if (siblingOverflow) alleX.push(siblingOverflow.x, siblingOverflow.x + siblingOverflow.width);
  const minX = alleX.length > 0 ? Math.min(...alleX) : 0;
  const shift = minX < PAD ? PAD - minX : 0;
  if (shift > 0) {
    for (const c of cards) c.x += shift;
    for (const c of connectors) {
      c.x1 += shift;
      c.x2 += shift;
    }
    if (marriageBadge) marriageBadge.x += shift;
    if (siblingOverflow) siblingOverflow.x += shift;
  }
  const maxX = alleX.length > 0 ? Math.max(...alleX) + shift : 0;
  const width = Math.max(totalW + shift, maxX + PAD);

  return {
    width,
    height: totalH,
    cards,
    connectors,
    marriageBadge,
    marriageCount: spouseFamilies.length,
    siblingOverflow,
    siblingCountBadge,
    navTargets: {
      up: par0.father,
      up2: par0.mother,
      down: allKids[0] ?? null,
      right: orderedSpouses[0]?.spouseId ?? null,
    },
    // Zentrum MIT Verschiebung — der Viewport zentriert daran, er sieht nur das Ergebnis.
    centerX: personCX + shift,
    centerY: ry(0),
  };
}
