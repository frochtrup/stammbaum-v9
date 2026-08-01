// core/research/branches.ts — Ast-Reifegrad, zweiter Scope-Erzeuger für das
// Qualitäts-Dashboard (Spec 20 §1.11g „Ast-Reifegrad", ADR-v9-167, BL-231).
//
// Kein zweites Dashboard, kein zweiter Bewertungsmechanismus: `ancestorBranches` liefert
// je Ast nur eine fertige Personenmenge — ausgewertet wird sie von derselben
// `buildQualityDashboard` (core/validate/dashboard.ts), die auch einen Projekt-Scope
// (§1.11f, BL-58) konsumiert. Framework-/DOM-frei (INV-ARCH-1).
import { getParentIds } from '../model/queries';
import { givenOf, surnameOf } from '../model/name-parts';
import type { Database, Person, PersonId } from '../model/types';

/** Vorgabe-Ebene (Großeltern), wie in ADR-v9-167 festgelegt. */
export const DEFAULT_BRANCH_LEVEL = 3;
/** Ebene 2 = Eltern (kleinste sinnvolle Verzweigung — Ebene 1 wäre der Proband selbst). */
export const MIN_BRANCH_LEVEL = 2;
/** Obergrenze: darüber misst der Vergleich Rauschen statt Forschungsstand (ADR-v9-167). */
export const MAX_BRANCH_LEVEL = 5;

/** Ein einzelner Ahnenast. */
export interface AncestorBranch {
  /** Wurzel-Id auf der gewählten Kekulé-Ebene; `null` = an dieser Position kein bekannter Vorfahre. */
  rootId: PersonId | null;
  /** Anzeige-Label: Linienpfad (Vater/Mutter-Kette ab dem Probanden) + Name, falls bekannt. */
  label: string;
  /**
   * Die transitive Elternhülle der Wurzel (Wurzel eingeschlossen) — NICHT
   * Kekulé-Arithmetik. Bei Ahnenschwund kann dieselbe Person in mehreren Ästen liegen;
   * das wird bewusst nicht aufgelöst (ADR-v9-167 Punkt 3/Verworfen d).
   */
  personIds: ReadonlySet<PersonId>;
}

export interface AncestorBranches {
  /** Tatsächlich verwendete Ebene (nach Klemmen auf [MIN_BRANCH_LEVEL, MAX_BRANCH_LEVEL]). */
  level: number;
  /** Ein Eintrag je Wurzel-Position der Ebene, in Kekulé-Reihenfolge (Vater-Linie zuerst). */
  branches: AncestorBranch[];
  /**
   * Personen außerhalb ALLER Äste (Nachkommen, Seitenlinien, Unverbundene) — eine
   * zusammengefasste Restzeile, damit die Bilanz keine Vollständigkeit behauptet, die sie
   * nicht hat (ADR-v9-167 Punkt 4).
   */
  rest: ReadonlySet<PersonId>;
}

/** `Math.min(MAX, Math.max(MIN, level))`, mit Ganzzahl-Absicherung. */
function clampLevel(level: number): number {
  const n = Number.isFinite(level) ? Math.round(level) : DEFAULT_BRANCH_LEVEL;
  return Math.min(MAX_BRANCH_LEVEL, Math.max(MIN_BRANCH_LEVEL, n));
}

type Side = 'f' | 'm';

interface BranchSlot {
  id: PersonId | null;
  path: Side[];
}

/**
 * Die Wurzel-Positionen einer Kekulé-Ebene, als Pfad (Vater/Mutter-Kette ab dem
 * Probanden) + Id. `depth` = Generationen ab dem Probanden (Ebene 2 = depth 1, …).
 * Bewusst OHNE geteiltes `visited`-Set über die Positionen hinweg — anders als
 * `ancestorLevel` (ui/islands/tree/tree-model.ts), die bei Ahnenschwund die zweite
 * Fundstelle stumm auf `null` setzt (fürs Baum-Rendering gewollt, hier falsch: Ahnenschwund
 * soll sichtbar bleiben, nicht verschwinden — ADR-v9-167 Verworfen (d)). Depth ist durch
 * MAX_BRANCH_LEVEL auf höchstens 4 begrenzt, ein Zyklus-Guard ist für diesen bounded
 * Abstieg nicht nötig; der Zyklus-Guard für die anschließende Elternhülle folgt unten.
 */
function branchSlots(db: Database, rootId: PersonId | null, depth: number, path: Side[]): BranchSlot[] {
  if (depth === 0) return [{ id: rootId, path }];
  const { father, mother } = rootId ? getParentIds(db, rootId) : { father: null, mother: null };
  return [
    ...branchSlots(db, father, depth - 1, [...path, 'f']),
    ...branchSlots(db, mother, depth - 1, [...path, 'm']),
  ];
}

/**
 * Transitive Elternhülle einer Wurzel (Wurzel eingeschlossen), unbegrenzt nach oben.
 * Eigenes `visited`-Set PRO Ast (Zyklus-Guard, Muster aus `ancestorLevel`/
 * `computeKekuleNumbers`) — verhindert endlose Rekursion bei fehlerhaften Zirkel-Daten,
 * ohne Ahnenschwund ZWISCHEN verschiedenen Ästen zu unterdrücken.
 */
function ancestorClosure(db: Database, rootId: PersonId): Set<PersonId> {
  const visited = new Set<PersonId>();
  const stack: PersonId[] = [rootId];
  while (stack.length > 0) {
    const id = stack.pop() as PersonId;
    if (visited.has(id)) continue;
    visited.add(id);
    const { father, mother } = getParentIds(db, id);
    if (father) stack.push(father);
    if (mother) stack.push(mother);
  }
  return visited;
}

const GENERATION_TERM: Record<number, [father: string, mother: string]> = {
  1: ['Vater', 'Mutter'],
  2: ['Großvater', 'Großmutter'],
  3: ['Urgroßvater', 'Urgroßmutter'],
  4: ['Ururgroßvater', 'Ururgroßmutter'],
};

function personLabel(p: Person): string {
  const composed = `${givenOf(p)} ${surnameOf(p)}`.trim();
  return composed || p.id;
}

/** „Großvater (Vater → Vater) — Johann Schmidt" bzw. „… — unbekannt". */
function branchLabel(db: Database, slot: BranchSlot): string {
  const depth = slot.path.length;
  const last = slot.path[slot.path.length - 1];
  const [fatherTerm, motherTerm] = GENERATION_TERM[depth] ?? [`Vorfahre (Ebene ${depth + 1})`, `Vorfahre (Ebene ${depth + 1})`];
  const term = last === 'f' ? fatherTerm : motherTerm;
  const chain = slot.path.map((s) => (s === 'f' ? 'Vater' : 'Mutter')).join(' → ');
  const who = slot.id ? personLabel(db.individuals.get(slot.id) as Person) : 'unbekannt';
  return depth <= 1 ? `${term} — ${who}` : `${term} (${chain}) — ${who}`;
}

/**
 * Ast-Reifegrad (Spec 20 §1.11g, ADR-v9-167): die Ahnenäste des Probanden auf einer
 * wählbaren Kekulé-Ebene, als fertige Personenmengen für `buildQualityDashboard`.
 *
 * - `level` wird auf [MIN_BRANCH_LEVEL, MAX_BRANCH_LEVEL] geklemmt (Vorgabe 3).
 * - Ein Ast ist die transitive Elternhülle seiner Wurzel — NICHT Kekulé-Arithmetik. Bei
 *   Ahnenschwund liegt eine Person daher in mehreren `branches[i].personIds` zugleich;
 *   das wird nicht aufgelöst.
 * - Eine fehlende Wurzel ist ein leerer, aber vorhandener Ast (`rootId: null`,
 *   `personIds` leer) — sie verschwindet nicht aus `branches`.
 * - `rest` sind alle Personen der Datenbank außerhalb JEDES Astes.
 */
export function ancestorBranches(
  db: Database,
  probandId: PersonId | null,
  level: number = DEFAULT_BRANCH_LEVEL,
): AncestorBranches {
  const clamped = clampLevel(level);
  const depth = clamped - 1;
  const root = probandId && db.individuals.has(probandId) ? probandId : null;
  const slots = branchSlots(db, root, depth, []);

  const inAnyBranch = new Set<PersonId>();
  const branches: AncestorBranch[] = slots.map((slot) => {
    const personIds = slot.id ? ancestorClosure(db, slot.id) : new Set<PersonId>();
    for (const id of personIds) inAnyBranch.add(id);
    return { rootId: slot.id, label: branchLabel(db, slot), personIds };
  });

  const rest = new Set<PersonId>();
  for (const id of db.individuals.keys()) {
    if (!inAnyBranch.has(id)) rest.add(id);
  }

  return { level: clamped, branches, rest };
}
