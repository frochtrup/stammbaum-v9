// core/places/build-plac.ts — Chokepoint buildPlacForGedcom (Spec 11 §5).
// Reiner PLAC-String-Bau aus (event, year, registries). Gemeinsamer Chokepoint mit
// dem Writer (Spec 13): ändert sich das PLAC-Bauen, ist roundtrip-verify (LP-1) Pflicht.
import type { Event, PlaceId, HofId } from '../model/types';
import type { Year } from './types';
import type { PlaceRegistry } from './place-registry';
import type { HofRegistry } from './hof-registry';
import { extractHofAddr, placeYear } from './normalize';

/** Erstes Komma-Segment eines Namens (atomarer Ortsname ohne Hierarchie). */
function atomic(s: string | null): string {
  return s ? s.split(',')[0].trim() : '';
}

export interface PlaceContext {
  places: PlaceRegistry;
  hofs: HofRegistry;
}

/**
 * Periodenkorrekter, FORM-kompatibler Dorf-PLAC-String via enclosureChainAsOf.
 * Pro Knoten nur das erste Komma-Segment (atomar) — sonst würde „Bayern, Deutschland"
 * als ein Knotenname die Kette verdoppeln.
 */
export function buildFormString(
  reg: PlaceRegistry,
  placeId: PlaceId | null,
  year: Year,
): string | null {
  if (!placeId) return null;
  if (year == null) return atomic(reg.resolveAsOf(placeId, null)) || null;
  const chain = reg.enclosureChainAsOf(placeId, year).map(atomic).filter(Boolean);
  if (chain.length) return chain.join(', ');
  return atomic(reg.resolveAsOf(placeId, year)) || null;
}

/**
 * Vollständige Namenskette eines Orts, periodenunabhängig (nutzt `enclosureChainAsOf`
 * direkt mit `year=null` — anders als `buildFormString`, das bei `year=null` bewusst nur
 * den atomaren Einzelnamen liefert). Für Kuration/Anzeige OHNE Event-/Jahres-Kontext,
 * z. B. Massen-Dedup (Spec 11 §9.2, ADR-v9-50) — dort sollen mehrere gleichnamige Orte
 * anhand ihrer vollen Verwaltungskette unterscheidbar sein. NICHT für den Wire-Bau
 * (dafür `buildFormString`/`buildPlacForGedcom` mit echtem Jahr). Reine Funktion, kein
 * Wall-Clock (TST-3).
 */
export function buildFullPlaceName(reg: PlaceRegistry, placeId: PlaceId | null): string | null {
  if (!placeId) return null;
  const chain = reg.enclosureChainAsOf(placeId, null).map(atomic).filter(Boolean);
  return chain.length ? chain.join(', ') : null;
}

/**
 * Chokepoint (Spec 11 §5): welcher PLAC-String würde für dieses Event geschrieben?
 * Zwei orthogonale Pfade:
 *   1. hofId gesetzt → Hof-Adresse (periodengerecht, Komma-geschützt via Konvention α)
 *      + Dorf-Hierarchie aus buildFormString(hof.villageId). Hof-Blatt erscheint genau
 *      einmal.
 *   2. kein hofId, aber placeId → nur Dorf-Hierarchie.
 * Reine Funktion — keine Wall-Clock, kein Zustand.
 */
export function buildPlacForGedcom(ev: Event, year: Year, ctx: PlaceContext): string | null {
  if (!ev) return null;

  const hofId: HofId | null = ev.hofId;
  if (hofId != null) {
    const hof = ctx.hofs.byId(hofId);
    if (hof) {
      const hofAddrFull = ctx.hofs.resolveAddrAsOf(hofId, year) ?? '';
      // Komma-Schutz: PLAC nutzt ',' als Hierarchie-Separator. Enthält die Hof-Adresse
      // selbst ein Komma (Altbestand „Oster 82a, Wester 141"), nur den Teil bis zum
      // ersten Komma in PLAC schreiben. ADDR trägt den vollen Wert; beim Re-Import
      // findet Pfad B (ADDR-basiert) den Hof wieder.
      const hofAddr = hofAddrFull.includes(',') ? extractHofAddr(hofAddrFull) : hofAddrFull;
      const villagePart = buildFormString(ctx.places, hof.villageId, year);
      if (hofAddr && villagePart) return hofAddr + ', ' + villagePart;
      return hofAddr || villagePart || null;
    }
    // GUARD: hofId gesetzt aber hofObject fehlt (stale). NICHT nur placeId schreiben —
    // das würde den Hof-Adressteil verlieren. null → Aufrufer fällt auf ev.place zurück.
    return null;
  }

  if (ev.placeId != null) return buildFormString(ctx.places, ev.placeId, year);
  return null;
}

/** Jahr des Events aus seinem DATE-Feld (Chokepoint-intern; null wenn undatiert). */
export function eventYear(ev: Event): Year {
  return placeYear(ev.date);
}
