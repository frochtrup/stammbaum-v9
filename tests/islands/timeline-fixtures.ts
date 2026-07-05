// tests/islands/timeline-fixtures.ts — synthetische Test-DB-/Kontext-Bauhelfer für die
// Zeitleiste-Insel (analog tests/islands/map-fixtures.ts, tests/islands/tree-fixtures.ts).
import type { Database } from '../../core/model/types';
import { makeDatabase, makeEvent, makeFamily, makePerson } from '../../core/model';
import { makePlaceRegistry, makeHofRegistry, type PlaceContext } from '../../core/places';
import { place } from '../core/places-fixtures';

/** Baut den PlaceContext frisch aus der aktuellen db (analog app-state.svelte.ts $derived). */
export function contextFor(db: Database): PlaceContext {
  return { places: makePlaceRegistry(db.placeObjects), hofs: makeHofRegistry(db.hofObjects) };
}

export function addPlace(db: Database, id: string, title: string): void {
  db.placeObjects.set(id, place(id, { title }));
}

export { makeDatabase, makeEvent, makeFamily, makePerson };
