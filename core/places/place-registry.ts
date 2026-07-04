// core/places/place-registry.ts — reiner, deterministischer Index über placeObjects.
// Ersetzt den lazy-gecachten, an AppState hängenden v8-getPlaceRegistry durch eine
// reine Funktion (context → registry). Kein Zustand, keine Mutation (TST-3, Spec 11 §4.1).
import type { PlaceId } from '../model/types';
import type { PlaceObject, PlaceObjects, Year } from './types';
import { normPlaceName, placeYear, placeTypeRank } from './normalize';

export interface EnclosureMeta {
  truncated: boolean;
}

export interface PlaceRegistry {
  byId: (id: PlaceId) => PlaceObject | undefined;
  /** Bester Kandidat gleichen Namens (spezifisch→allgemein), sonst null. */
  findByName: (name: string) => PlaceId | null;
  /** Alle Kandidaten gleichen Namens, spezifisch→allgemein sortiert (stabil). */
  findAllByName: (name: string) => PlaceId[];
  /** Periodenkorrekter Name: im Jahr gültige pname, sonst title. */
  resolveAsOf: (id: PlaceId, year: Year) => string | null;
  /** [Ort, übergeordnet, …] als periodenkorrekte Namen. Optional meta.truncated. */
  enclosureChainAsOf: (id: PlaceId, year: Year, meta?: EnclosureMeta) => string[];
}

// Undatiert im PlaceObject-pname-Kontext gilt NICHT „jederzeit" — nur der Fallback
// auf title. Datierte Einträge matchen periodengerecht.
function dateMatches(from: Year, to: Year, y: number): boolean {
  if (from == null && to == null) return false;
  return (from == null || y >= from) && (to == null || y <= to);
}

/**
 * Baut eine reine PlaceRegistry aus der placeObjects-Sammlung.
 * Deterministisch: gleiche Eingabe → gleiche Registry (Iterationsreihenfolge der Map
 * = Einfügereihenfolge; byNormAll bewahrt sie).
 */
export function makePlaceRegistry(places: PlaceObjects): PlaceRegistry {
  const byNorm = new Map<string, PlaceId>();
  const byNormAll = new Map<string, PlaceId[]>();

  for (const pl of places.values()) {
    const names = [pl.title, ...pl.pnames.map((p) => p.value)];
    const seenForThis = new Set<string>(); // ein PO zählt pro norm nur einmal
    for (const nm of names) {
      const k = normPlaceName(nm);
      if (!k || seenForThis.has(k)) continue;
      seenForThis.add(k);
      if (!byNorm.has(k)) byNorm.set(k, pl.id);
      const arr = byNormAll.get(k);
      if (arr) arr.push(pl.id);
      else byNormAll.set(k, [pl.id]);
    }
  }

  const candidatesByName = (str: string): PlaceId[] => {
    const k = normPlaceName(str);
    const ids = (k && byNormAll.get(k)) || [];
    if (ids.length < 2) return ids.slice();
    return ids
      .slice()
      .sort((a, b) => placeTypeRank(places.get(a)?.type) - placeTypeRank(places.get(b)?.type));
  };

  const enclosureWinnerAsOf = (
    id: PlaceId,
    y: number,
  ): { placeId: PlaceId | null; truncated: boolean } => {
    const pl = places.get(id);
    if (!pl) return { placeId: null, truncated: false };
    const encs = pl.enclosedBy;
    let bestFrom = -Infinity;
    let bestId: PlaceId | null = null;
    let undated: PlaceId | null = null;
    for (const e of encs) {
      const ef = placeYear(e.from);
      const et = placeYear(e.to);
      if (ef == null && et == null) {
        if (undated == null) undated = e.placeId;
        continue;
      }
      if (dateMatches(ef, et, y)) {
        const f = ef ?? -Infinity;
        if (f > bestFrom) {
          bestFrom = f;
          bestId = e.placeId;
        }
      }
    }
    const chosen = bestId ?? undated;
    const hasDated = encs.some((e) => placeYear(e.from) != null || placeYear(e.to) != null);
    return { placeId: chosen, truncated: chosen == null && hasDated };
  };

  const reg: PlaceRegistry = {
    byId: (id) => places.get(id),
    findByName: (str) => {
      const c = candidatesByName(str);
      return c.length ? c[0] : null;
    },
    findAllByName: candidatesByName,
    resolveAsOf: (id, year) => {
      const pl = places.get(id);
      if (!pl) return null;
      const y = placeYear(year);
      if (y != null) {
        let bestFrom = -Infinity;
        let bestVal: string | null = null;
        for (const pn of pl.pnames) {
          if (!dateMatches(placeYear(pn.from), placeYear(pn.to), y)) continue;
          const f = placeYear(pn.from) ?? -Infinity;
          if (f > bestFrom) {
            bestFrom = f;
            bestVal = pn.value;
          }
        }
        if (bestVal != null) return bestVal;
      }
      return pl.title || pl.pnames[0]?.value || '';
    },
    enclosureChainAsOf: (id, year, meta) => {
      const out: string[] = [];
      const seen = new Set<PlaceId>();
      const y = placeYear(year);
      let cur: PlaceId | null = id;
      while (cur && places.has(cur) && !seen.has(cur)) {
        seen.add(cur);
        const pl: PlaceObject = places.get(cur)!;
        if (y != null && (pl.existsFrom != null || pl.existsTo != null)) {
          const ef = placeYear(pl.existsFrom);
          const et = placeYear(pl.existsTo);
          if ((ef != null && y < ef) || (et != null && y > et)) break;
        }
        const name = reg.resolveAsOf(cur, year);
        if (name != null) out.push(name);
        if (y != null) {
          const w = enclosureWinnerAsOf(cur, y);
          if (w.truncated && meta) meta.truncated = true;
          cur = w.placeId;
        } else {
          cur = pl.enclosedBy[0]?.placeId ?? null;
        }
      }
      return out;
    },
  };

  return reg;
}
