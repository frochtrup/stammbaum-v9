// ui/views/person/person-list-model.ts — reine Gruppierungs-/Sortierlogik für die
// Personen-Liste (Spec 20 §1.4 [K]: "Alphabetische Liste mit Buchstaben-Trenner,
// Geburts-/Sterbejahr + Ort"). Reine Funktion (db → Gruppen), damit sie ohne DOM
// unit-testbar ist (Testpyramide, TST-5) — die Svelte-Komponente rendert nur.
import type { Database, Person } from '../../../core/model/types';
import type { PlaceContext } from '../../../core/places';
import { displayName, sortLetter, yearPlaceSummary } from '../../shell/person-display';

export interface PersonRow {
  id: string;
  name: string;
  birthSummary: string;
  deathSummary: string;
}

export interface PersonGroup {
  letter: string;
  rows: PersonRow[];
}

/** Alphabetisch nach Nachname gruppiert (Buchstaben-Trenner), Namen innerhalb sortiert. */
export function buildPersonGroups(db: Database, ctx: PlaceContext): PersonGroup[] {
  const persons = Array.from(db.individuals.values());
  const sorted = persons.slice().sort((a, b) => displayName(a).localeCompare(displayName(b), 'de'));

  const groups: PersonGroup[] = [];
  let current: PersonGroup | null = null;

  for (const p of sorted) {
    const letter = sortLetter(p);
    if (!current || current.letter !== letter) {
      current = { letter, rows: [] };
      groups.push(current);
    }
    current.rows.push(toRow(p, ctx));
  }
  return groups;
}

function toRow(p: Person, ctx: PlaceContext): PersonRow {
  return {
    id: p.id,
    name: displayName(p),
    birthSummary: yearPlaceSummary(p.birth, ctx),
    deathSummary: yearPlaceSummary(p.death, ctx),
  };
}
