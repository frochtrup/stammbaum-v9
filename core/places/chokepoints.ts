// core/places/chokepoints.ts — die einzigen erlaubten Orts-/Hof-Reads (Spec 11 §5).
// Vier zentrale Helfer sind die Naht zur UI-Schale (Spec 02 §3.1). Kein direkter
// Feldzugriff auf interne Orts-Strukturen von außen — nur über diese Reads.
import type { Event, PlaceId, HofId } from '../model/types';
import type { PlaceContext } from './build-plac';
import { eventSpanne } from './build-plac';

export interface Coords {
  lat: number;
  long: number;
}

/**
 * Chokepoint (Spec 11 §5): Welches Dorf?
 * A: ev.placeId (Wahrheit) · B: findByName(ev.place) (Projektion).
 */
export function eventPlaceId(ev: Event, ctx: PlaceContext): PlaceId | null {
  if (ev.placeId != null) return ev.placeId;
  if (ev.place) return ctx.places.findByName(ev.place);
  return null;
}

/**
 * Chokepoint (Spec 11 §5): Welcher Hof?
 * A: ev.hofId · B: findByAddr(ev.addr, year) im Dorf-Scope.
 */
export function eventHofId(ev: Event, ctx: PlaceContext): HofId | null {
  if (ev.hofId != null) return ev.hofId;
  if (ev.addr) {
    const villageId = eventPlaceId(ev, ctx) ?? undefined;
    return ctx.hofs.findByAddr(ev.addr, eventSpanne(ev), villageId);
  }
  return null;
}

/**
 * Chokepoint (Spec 11 §5): Welche Koordinaten?
 * hofObject/placeObject primär, ev.lati/long Fallback (INV-PLACE-Analog §3).
 */
export function eventCoords(ev: Event, ctx: PlaceContext): Coords | null {
  const hofId = eventHofId(ev, ctx);
  if (hofId != null) {
    const hof = ctx.hofs.byId(hofId);
    if (hof && hof.lat != null && hof.long != null) return { lat: hof.lat, long: hof.long };
  }
  const placeId = eventPlaceId(ev, ctx);
  if (placeId != null) {
    const pl = ctx.places.byId(placeId);
    if (pl && pl.lat != null && pl.long != null) return { lat: pl.lat, long: pl.long };
  }
  if (ev.lati != null && ev.long != null) return { lat: ev.lati, long: ev.long };
  return null;
}
