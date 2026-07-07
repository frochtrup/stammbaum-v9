// core/research/project.ts — Forschungsprojekt (Spec 12 §5).
// App-privat: reist NICHT mit der Datei (Persistenz: 30 §2). Hier nur die reine Form.
import type { Project, ProjectScope } from './types';

function emptyScope(): ProjectScope {
  return { surnames: [], places: [], yearFrom: null, yearTo: null, personIds: [] };
}

/** Konstruktor. `created` wird injiziert (TST-3); leerer Scope als Default. */
export function makeProject(id: string, patch: Partial<Omit<Project, 'id'>> = {}): Project {
  return {
    id,
    name: patch.name ?? '',
    color: patch.color ?? '',
    scope: patch.scope ?? emptyScope(),
    note: patch.note ?? '',
    created: patch.created ?? '',
  };
}
