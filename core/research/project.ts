// core/research/project.ts — Forschungsprojekt (Spec 12 §5).
// App-privat: reist NICHT mit der Datei (Persistenz: 30 §2). Hier nur die reine Form
// plus die Scope-Matching-Funktion (Spec 20 §1.11f, BL-58).
import type { Event, Person } from '../model/types';
import { eventYear } from '../places/build-plac';
import type { Project, ProjectScope } from './types';

function emptyScope(): ProjectScope {
  return { surnames: [], places: [], yearFrom: null, yearTo: null, personIds: [] };
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** Die für den Scope relevanten Ereignisse einer Person (Haupt-Lebensdaten + Rest). */
function scopeEvents(p: Person): Event[] {
  return [p.birth, p.chr, p.death, p.buri, ...p.events];
}

function surnameOk(p: Person, surnames: string[]): boolean {
  if (surnames.length === 0) return true; // leere Achse schränkt nicht ein
  const sn = norm(p.surname);
  return surnames.some((s) => norm(s) === sn);
}

function placeOk(p: Person, places: string[]): boolean {
  if (places.length === 0) return true;
  const evs = scopeEvents(p);
  return places.some((pl) => {
    const needle = norm(pl);
    return needle !== '' && evs.some((ev) => norm(ev.place ?? '').includes(needle));
  });
}

function yearOk(p: Person, from: number | null, to: number | null): boolean {
  if (from == null && to == null) return true;
  const years = [eventYear(p.birth), eventYear(p.death)].filter((y): y is number => y != null);
  if (years.length === 0) return false; // Zeitraum gefordert, aber kein datiertes Ereignis
  return years.some((y) => (from == null || y >= from) && (to == null || y <= to));
}

/**
 * Fällt eine Person in einen Scope (Spec 20 §1.11f, BL-58)? Die drei Achsen
 * Nachname/Ort/Zeitraum sind **UND-verknüpft**; eine leere Achse schränkt nicht ein
 * (ein vollständig leerer Scope trifft daher JEDE Person). Zusätzlich ist eine
 * ausdrücklich in `personIds` gelistete Person immer enthalten (ODER-Übersteuerung —
 * „diese Person gehört zum Projekt, egal was die Achsen sagen").
 */
export function matchesScope(person: Person, scope: ProjectScope): boolean {
  if (scope.personIds.includes(person.id)) return true;
  return (
    surnameOk(person, scope.surnames) &&
    placeOk(person, scope.places) &&
    yearOk(person, scope.yearFrom, scope.yearTo)
  );
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
