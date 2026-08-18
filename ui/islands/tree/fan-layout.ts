// ui/islands/tree/fan-layout.ts — reine Layout-Berechnung des Fächer-Diagramms
// (Spec 20 §1.3 [S], BL-123, ADR-v9-123). DOM-frei, framework-frei — liest ausschließlich
// Person/Family aus core/model. Orakel: legacy-v8 `ui-fanchart.js` (`_render`/`_arc`).
//
// Konzentrische Halbkreis-Segmente: Proband unten in der Mitte, Vorfahren fächern nach
// oben (π = links/Vater → 0 = rechts/Mutter). Generation g hat 2^g Segmente. Reiner
// Geometrie-Ausgang (Arc-Pfade + Textplatzierung); die Insel zeichnet nur noch.
import type { Database, PersonId } from '../../../core/model/types';
import { getParentIds } from './tree-model';
import type { DiagramNavTargets } from './tree-viewport';

/** Außenradius je Generation; Index 0 = Radius des Proband-Kreises (Orakel: `RADII`). */
const RADII = [38, 90, 148, 218, 296, 380, 464];
const PAD = 22;

export interface FanText {
  text: string;
  x: number;
  y: number;
  /** Rotation in Grad (Text zeigt vom Zentrum weg, bleibt lesbar). */
  rotation: number;
  fontSize: number;
  /** Sekundär-Ton (`--stb-text-dim`) statt `--stb-text`. */
  dim: boolean;
}

export interface FanSegment {
  id: PersonId | null;
  gen: number;
  /** SVG-Pfad des Ringsegments. */
  d: string;
  sex: 'M' | 'F' | 'U';
  /** Generations-Abstufung (außen blasser) — Tiefen-Hinweis. */
  fillOpacity: number;
  texts: FanText[];
}

/**
 * Der Kreis in der Mitte: die Person, um die GEZEICHNET wird — nicht der Proband
 * (ADR-v9-273, Zentrum ≠ Proband). Der Fächer kennt gar keinen Probanden; er trägt keine
 * Kekule-Nummern, deren Bezugspunkt das wäre.
 */
export interface FanCenter {
  id: PersonId;
  cx: number;
  cy: number;
  r: number;
  sex: 'M' | 'F' | 'U';
  given: string;
  surname: string;
}

export interface FanLayoutResult {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  center: FanCenter | null;
  segments: FanSegment[];
  navTargets: DiagramNavTargets;
}

/**
 * Wählbare Spanne der AHNEN-RINGE um den Zentrums-Kreis (BL-368). Achtung beim Zählen:
 * `generations = 5` heißt fünf Ringe ZUSÄTZLICH zum Zentrum, die äußerste Generation ist
 * also die der Ururgroßeltern. Obergrenze 6, weil `RADII` sieben Einträge hat — mehr
 * Ringe hätten keinen Radius.
 */
export const MIN_FAN_GENERATIONS = 3;
export const MAX_FAN_GENERATIONS = 6;
export const DEFAULT_FAN_GENERATIONS = 5;

/** Klemmt einen gewünschten Wert in die Spanne (Verteidigungslinie der Insel). */
export function clampFanGenerations(n: number): number {
  return Math.max(MIN_FAN_GENERATIONS, Math.min(MAX_FAN_GENERATIONS, Math.round(n)));
}

export interface FanLayoutOptions {
  /** Ahnen-Ringe um den Zentrums-Kreis (`MIN_`..`MAX_FAN_GENERATIONS`, Spec 20 §1.3).
   *  Ohne Angabe: `DEFAULT_FAN_GENERATIONS`. */
  generations?: number;
}

/** Auf 1 Dezimalstelle runden (kompaktere, deterministische SVG-Ausgabe, Orakel `f`). */
function f(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Ringsegment-Pfad (Orakel `_arc`): a1 > a2, Außenbogen im Uhrzeigersinn (sweep 1). */
function arcPath(cx: number, cy: number, r1: number, r2: number, a1: number, a2: number): string {
  const X = (r: number, a: number) => f(cx + r * Math.cos(a));
  const Y = (r: number, a: number) => f(cy - r * Math.sin(a)); // SVG-y invertiert
  const lg = a1 - a2 > Math.PI ? 1 : 0;
  return [
    `M ${X(r2, a1)} ${Y(r2, a1)}`,
    `A ${r2} ${r2} 0 ${lg} 1 ${X(r2, a2)} ${Y(r2, a2)}`,
    `L ${X(r1, a2)} ${Y(r1, a2)}`,
    `A ${r1} ${r1} 0 ${lg} 0 ${X(r1, a1)} ${Y(r1, a1)}`,
    'Z',
  ].join(' ');
}

/** Name kürzen (Orakel `_fcName`): „Johann Georg Schmidt" → „J. G. Schmidt" → Trunkierung. */
function fcName(given: string, surname: string, name: string, limit: number): string {
  const nm = name || '';
  if (!limit || nm.length <= limit) return nm;
  const inits = given.trim() ? given.trim().split(/\s+/).map((w) => w[0] + '.').join(' ') : '';
  const short = inits ? inits + ' ' + surname : '';
  if (short && short.length <= limit) return short;
  return nm.substring(0, Math.max(0, limit - 1)) + '…';
}

function sexOf(db: Database, id: PersonId | null): 'M' | 'F' | 'U' {
  const s = id ? db.individuals.get(id)?.sex : undefined;
  return s === 'M' || s === 'F' ? s : 'U';
}

export function computeFanLayout(db: Database, centerId: PersonId, options: FanLayoutOptions = {}): FanLayoutResult | null {
  const center = db.individuals.get(centerId);
  if (!center) return null;

  const genCount = clampFanGenerations(options.generations ?? DEFAULT_FAN_GENERATIONS);
  const maxR = RADII[genCount];
  const width = maxR * 2 + PAD * 2;
  const height = maxR + PAD + 52; // Puffer unter dem Proband-Mittelpunkt
  const cx = width / 2;
  const cy = height - 32; // Proband nahe der Unterkante

  // Vorfahren per BFS: gens[g][i] = Person-ID oder null (2^g Einträge je Generation).
  const gens: (PersonId | null)[][] = [[centerId]];
  for (let g = 1; g <= genCount; g++) {
    const cur: (PersonId | null)[] = [];
    for (const id of gens[g - 1]) {
      if (id) {
        const { father, mother } = getParentIds(db, id);
        cur.push(father, mother);
      } else {
        cur.push(null, null);
      }
    }
    gens.push(cur);
  }

  const segments: FanSegment[] = [];
  for (let g = 1; g <= genCount; g++) {
    const r1 = g === 1 ? RADII[0] : RADII[g - 1];
    const r2 = RADII[g];
    const n = gens[g].length; // 2^g
    const fillOpacity = Math.max(0.4, 1 - (g - 1) * 0.12);
    for (let i = 0; i < n; i++) {
      const a1 = Math.PI * (1 - i / n);
      const a2 = Math.PI * (1 - (i + 1) / n);
      const id = gens[g][i];
      const person = id ? db.individuals.get(id) : null;
      const seg: FanSegment = {
        id: id ?? null,
        gen: g,
        d: arcPath(cx, cy, r1, r2, a1, a2),
        sex: sexOf(db, id),
        fillOpacity,
        texts: [],
      };

      if (person) {
        const midA = (a1 + a2) / 2;
        const midR = (r1 + r2) / 2;
        const tx = cx + midR * Math.cos(midA);
        const ty = cy - midR * Math.sin(midA);
        const arcLen = Math.abs(a1 - a2) * midR;
        const ringH = r2 - r1;
        let rot = -(midA * 180) / Math.PI;
        if (midA > Math.PI / 2) rot += 180;
        const given = person.given || '';
        const surname = person.surname || '';
        const name = person.name || id || '';

        if (g <= 2) {
          const fs1 = g === 1 ? 11 : 9;
          const fs2 = g === 1 ? 10 : 8;
          const off = g === 1 ? 7 : 5;
          if (given) seg.texts.push({ text: given, x: f(tx), y: f(ty - off), rotation: f(rot), fontSize: fs1, dim: false });
          if (surname) seg.texts.push({ text: surname, x: f(tx), y: f(ty + off), rotation: f(rot), fontSize: fs2, dim: true });
        } else if (g === 3) {
          seg.texts.push({ text: fcName(given, surname, name, 14), x: f(tx), y: f(ty), rotation: f(rot), fontSize: 8, dim: false });
        } else if (g === 4 && arcLen > 26) {
          seg.texts.push({ text: fcName(given, surname, name, 12), x: f(tx), y: f(ty), rotation: f(rot), fontSize: 7.5, dim: false });
        } else if (g >= 5 && arcLen > 22 && ringH > 18) {
          seg.texts.push({ text: surname || fcName(given, surname, name, 8), x: f(tx), y: f(ty), rotation: f(rot), fontSize: 6.5, dim: false });
        }
      }

      segments.push(seg);
    }
  }

  const par0 = getParentIds(db, centerId);
  const navTargets: DiagramNavTargets = {
    up: par0.father || par0.mother || null,
    up2: par0.father ? par0.mother : null,
    down: null, // Fächer zeigt nur Vorfahren
    right: null,
  };

  return {
    width,
    height,
    centerX: cx,
    centerY: height / 2,
    center: {
      id: centerId,
      cx,
      cy,
      r: RADII[0],
      sex: sexOf(db, centerId),
      given: center.given || (center.name || '').split(/\s+/)[0] || '',
      surname: center.surname || '',
    },
    segments,
    navTargets,
  };
}
