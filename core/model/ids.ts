// core/model/ids.ts — deterministische, injizierte ID-Vergabe (TST-3, ADR-v9-11).
// GEDCOM-Konvention: @<Präfix><n>@ mit n≥1. Kein Zufall, keine Wall-Clock.
import type { Database } from './types';

export type IdPrefix = 'I' | 'F' | 'S' | 'R' | 'N';

/** Zustand des Zählers je Präfix (letzte vergebene Nummer). */
export interface IdAllocator {
  counters: Record<IdPrefix, number>;
}

export function makeIdAllocator(
  initial: Partial<Record<IdPrefix, number>> = {},
): IdAllocator {
  return {
    counters: { I: 0, F: 0, S: 0, R: 0, N: 0, ...initial },
  };
}

/** Vergibt die nächste ID für ein Präfix und schreibt den Zähler fort. */
export function nextId(alloc: IdAllocator, prefix: IdPrefix): string {
  const n = alloc.counters[prefix] + 1;
  alloc.counters[prefix] = n;
  return `@${prefix}${n}@`;
}

/** Extrahiert die numerische Komponente aus `@I42@` → 42 (0 bei Fehlform). */
export function idNumber(id: string, prefix: IdPrefix): number {
  const m = new RegExp(`^@${prefix}(\\d+)@$`).exec(id);
  return m ? Number(m[1]) : 0;
}

/**
 * Leitet einen kollisionsfreien Allocator aus einer Datenbank ab:
 * der Zähler jedes Präfixes steht auf der höchsten belegten Nummer.
 */
export function allocatorFromDatabase(db: Database): IdAllocator {
  const alloc = makeIdAllocator();
  const bump = (id: string, p: IdPrefix): void => {
    const n = idNumber(id, p);
    if (n > alloc.counters[p]) alloc.counters[p] = n;
  };
  for (const id of db.individuals.keys()) bump(id, 'I');
  for (const id of db.families.keys()) bump(id, 'F');
  for (const id of db.sources.keys()) bump(id, 'S');
  for (const id of db.repositories.keys()) bump(id, 'R');
  for (const id of db.notes.keys()) bump(id, 'N');
  return alloc;
}
