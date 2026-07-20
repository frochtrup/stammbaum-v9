// ui/views/entity-draft.ts — gemeinsamer Zugriff auf die bearbeitbare Zielentität eines
// Forschungsdaten-Kommandos (Aufgaben, Protokoll, Hypothesen).
//
// Alle drei Kommando-Familien adressieren ihr Ziel identisch über (`kind`, `entityId`)
// und brauchen daraus eine bearbeitbare Person ODER Familie aus dem Copy-on-Write-Draft
// (ADR-v9-92). Der Helfer steht deshalb EINMAL hier statt dreimal gleich in
// tasks-/log-/hypothesis-commands.ts (INV-UI-4: ein Mechanismus, nicht pro View neu
// erfunden).
import type { Family, FamilyId, Person, PersonId } from '../../core/model/types';
import type { DatabaseDraft } from '../../core/model/draft';
import type { TaskEntityKind } from './tasks/tasks-model';

/** Bearbeitbare Zielentität (Person ODER Familie), oder `null` wenn sie fehlt. */
export function ownerOf(
  d: DatabaseDraft,
  kind: TaskEntityKind,
  entityId: PersonId | FamilyId,
): Person | Family | null {
  return kind === 'person' ? d.person(entityId) : d.family(entityId);
}
