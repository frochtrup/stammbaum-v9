// tests/islands/map-fixtures.ts — synthetische Test-DB-/Kontext-Bauhelfer für die
// Karten-Insel (analog tests/islands/tree-fixtures.ts, tests/core/places-fixtures.ts).
import type { Database } from '../../core/model/types';
import { makeDatabase, makeEvent, makePerson } from '../../core/model';
import { makePlaceRegistry, makeHofRegistry, type PlaceContext } from '../../core/places';
import { place, hof } from '../core/places-fixtures';

/** Baut den PlaceContext frisch aus der aktuellen db (analog app-state.svelte.ts $derived). */
export function contextFor(db: Database): PlaceContext {
  return { places: makePlaceRegistry(db.placeObjects), hofs: makeHofRegistry(db.hofObjects) };
}

export function addPlace(db: Database, id: string, title: string, lat: number | null, long: number | null): void {
  db.placeObjects.set(id, place(id, { title, lat, long }));
}

export function addHof(
  db: Database,
  id: string,
  villageId: string,
  addr: string,
  lat: number | null,
  long: number | null,
): void {
  db.hofObjects.set(id, hof(id, villageId, { addrs: [{ value: addr, from: null, to: null }], lat, long }));
}

export { makeDatabase, makeEvent, makePerson };
