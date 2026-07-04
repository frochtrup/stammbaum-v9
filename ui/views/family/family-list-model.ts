// ui/views/family/family-list-model.ts — reine Aufbereitung der Familien-Liste
// (Spec 20 §1.5 [K]: "Liste (Elternpaar, Heiratsdatum, Kinderzahl)"). Reine Funktion
// (db → Zeilen), damit sie ohne DOM unit-testbar ist (Testpyramide, TST-5) — die
// Svelte-Komponente rendert nur.
import type { Database, Family } from '../../../core/model/types';
import type { PlaceContext } from '../../../core/places';
import { yearPlaceSummary } from '../../shell/person-display';
import { familyLabelFor } from '../source/family-label';

export interface FamilyRow {
  id: string;
  parentsLabel: string;
  marriageSummary: string;
  childCount: number;
}

/** Nach Elternpaar-Label alphabetisch sortiert (stabil, gleiches Muster wie Personen). */
export function buildFamilyRows(db: Database, ctx: PlaceContext): FamilyRow[] {
  const families = Array.from(db.families.values());
  return families
    .map((f) => toRow(f, db, ctx))
    .sort((a, b) => a.parentsLabel.localeCompare(b.parentsLabel, 'de'));
}

function toRow(f: Family, db: Database, ctx: PlaceContext): FamilyRow {
  return {
    id: f.id,
    parentsLabel: familyLabelFor(db, f.id),
    marriageSummary: yearPlaceSummary(f.marriage, ctx),
    childCount: f.children.length,
  };
}
