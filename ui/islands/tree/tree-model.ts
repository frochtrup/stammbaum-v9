// ui/islands/tree/tree-model.ts — reine Traversal-Helfer für den Sanduhr-Baum
// (Spec 20 §1.3 [K]). DOM-frei, framework-frei — liest ausschließlich Person/Family
// aus core/model (childOf/parentIn), keine Kern-Logik/Identitätsauflösung hier
// (INV-ARCH-1: die Insel enthält keine Kern-Logik, sie konsumiert core/model-Typen).
import type { Database, FamilyId, PersonId } from '../../../core/model/types';

// `getParentIds`/`ParentIds` leben seit BL-231 im Kern (`core/model/queries.ts`) — der
// Ast-Reifegrad braucht dieselbe Aufwärts-Kante, und der Kern darf nicht in die UI greifen
// (INV-ARCH-1). Hier nur re-exportiert, damit die bestehenden Insel-/View-Aufrufer
// unverändert bleiben; EINE Implementierung, zwei Importwege.
export { getParentIds, type ParentIds } from '../../../core/model/queries';
import { getParentIds } from '../../../core/model/queries';

export interface SpouseFamily {
  familyId: FamilyId;
  spouseId: PersonId | null;
  children: PersonId[];
}

/** Alle Familien, in denen `personId` Elternteil ist (Spec: Mehrfach-Ehen `⚭N`). */
export function getSpouseFamilies(db: Database, personId: PersonId): SpouseFamily[] {
  const person = db.individuals.get(personId);
  if (!person) return [];
  const out: SpouseFamily[] = [];
  for (const familyId of person.parentIn) {
    const fam = db.families.get(familyId);
    if (!fam) continue;
    const spouseId = fam.husband === personId ? fam.wife : fam.wife === personId ? fam.husband : null;
    out.push({ familyId, spouseId, children: [...fam.children] });
  }
  return out;
}

/**
 * Kekule/Ahnentafel-Nummern (Standard-Ahnentafel-Nummerierung, Spec 20 §1.3 [K]):
 * Proband = 1, Vater = 2, Mutter = 3, Vatersvater = 4, … (`2k`/`2k+1`-Rekursion,
 * Orakel: v8 `ui-views-tree.js` `_kWalk`). Zyklus-Guard über `depth` UND das bereits
 * befüllte `Map` selbst (ein Individuum bekommt nie zwei Nummern) — Graphen können bei
 * fehlerhaften Daten zurücklaufen (Spec-Auftrag "Zyklus-Guards, wo Graphen zurücklaufen
 * können").
 */
export function computeKekuleNumbers(
  db: Database,
  probandId: PersonId,
  maxDepth = 8,
): Map<PersonId, number> {
  const kekule = new Map<PersonId, number>();
  function walk(id: PersonId | null, k: number, depth: number): void {
    if (!id || depth > maxDepth || !db.individuals.has(id) || kekule.has(id)) return;
    kekule.set(id, k);
    const { father, mother } = getParentIds(db, id);
    walk(father, k * 2, depth + 1);
    walk(mother, k * 2 + 1, depth + 1);
  }
  walk(probandId, 1, 0);
  return kekule;
}

/**
 * Vorfahren-Ebene `depth` (1 = Eltern, 2 = Großeltern, …) als Array der Länge 2^depth,
 * slotweise (Index i*2/i*2+1 = Vater/Mutter von Ebene depth-1 Index i). `null` = unbekannt.
 * Zyklus-Guard: `visited`-Set verhindert endlose Rekursion, falls Testdaten einen
 * Eltern-Zirkel enthalten (sollte INV-P-Regeln nie zulassen, aber die Insel darf sich
 * nicht darauf verlassen).
 */
export function ancestorLevel(
  db: Database,
  probandId: PersonId,
  depth: number,
  visited: Set<PersonId> = new Set(),
): (PersonId | null)[] {
  if (depth <= 0) return [probandId];
  const prev = ancestorLevel(db, probandId, depth - 1, visited);
  const out: (PersonId | null)[] = [];
  for (const id of prev) {
    if (id && visited.has(id)) {
      out.push(null, null);
      continue;
    }
    if (id) visited.add(id);
    const { father, mother } = getParentIds(db, id);
    out.push(father, mother);
  }
  return out;
}

/** Ob `depth` mindestens eine belegte (nicht-null) Person enthält. */
export function ancestorLevelHasAny(level: (PersonId | null)[]): boolean {
  return level.some((id) => id != null);
}

export interface SiblingInfo {
  id: PersonId;
  /** Kein Kind der ersten (primären) Eltern-Familie des Probanden -> `½`-Markierung (Spec 20 §1.3 [K]). */
  isHalf: boolean;
}

/**
 * Voll- und Halbgeschwister des Probanden: alle Kinder der Eltern-Familie(n) in
 * `person.childOf`, außer dem Probanden selbst (ADR-v9-23 — eigene Zeile im Sanduhr-Baum,
 * nicht nur die `½`-Markierung). Ein Kind zählt als Halbgeschwister, wenn es NICHT Kind
 * der ersten (primären) Herkunftsfamilie ist — analog zur bestehenden Haupt-/Nebenfamilie-
 * Unterscheidung bei den Kindern des Probanden (`mainKidSet`/`halfKidSet` in tree-layout.ts).
 * Reihenfolge: primäre Familie zuerst, danach weitere Familien; Dubletten (Kind mehrerer
 * Eltern-Familien) einmalig, als Vollgeschwister sobald es in der primären Familie auftaucht.
 */
export function getSiblingIds(db: Database, personId: PersonId | null | undefined): SiblingInfo[] {
  if (!personId) return [];
  const person = db.individuals.get(personId);
  if (!person || person.childOf.length === 0) return [];

  const primaryFamilyId = person.childOf[0].familyId;
  const out: SiblingInfo[] = [];
  const seen = new Set<PersonId>();
  for (const link of person.childOf) {
    const fam = db.families.get(link.familyId);
    if (!fam) continue;
    const isHalf = link.familyId !== primaryFamilyId;
    for (const childId of fam.children) {
      if (childId === personId || seen.has(childId)) continue;
      seen.add(childId);
      out.push({ id: childId, isHalf });
    }
  }
  return out;
}
