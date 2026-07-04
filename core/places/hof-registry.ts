// core/places/hof-registry.ts — reiner, deterministischer Index über hofObjects.
// Read-Tolerance (Spec 11 §4.4, LP-6): erst Voll-Norm, dann Extract-Fallback.
import type { HofId, PlaceId } from '../model/types';
import type { HofObject, HofObjects, Year } from './types';
import { normHofAddr, extractHofAddr, placeYear } from './normalize';

export interface HofRegistry {
  byId: (id: HofId) => HofObject | undefined;
  byVillage: (villageId: PlaceId) => HofId[];
  /** Genau eine eindeutige Auflösung zum Jahr, sonst null (Mehrdeutigkeit → Review). */
  findByAddr: (addr: string, year: Year, villageId?: PlaceId) => HofId | null;
  /** Alle Kandidaten mit zum Jahr passender addrs[]-Bezeichnung (Read-Tolerant). */
  findAllByAddr: (addr: string, year: Year, villageId?: PlaceId) => HofId[];
  /** Periodenkorrekte Adress-Bezeichnung (analog placeRegistry.resolveAsOf). */
  resolveAddrAsOf: (id: HofId, year: Year) => string | null;
}

function dateMatches(from: Year, to: Year, y: number): boolean {
  // undatiert = jederzeit gültig (Hof-Adressen ohne Datum sind Standard-Bezeichnung)
  if (from == null && to == null) return true;
  return (from == null || y >= from) && (to == null || y <= to);
}

function hofAliveAt(h: HofObject, y: number | null): boolean {
  if (y == null) return true;
  const ef = placeYear(h.existsFrom);
  const et = placeYear(h.existsTo);
  if (ef != null && y < ef) return false;
  if (et != null && y > et) return false;
  return true;
}

export function makeHofRegistry(hofs: HofObjects): HofRegistry {
  const byVillage = new Map<PlaceId, HofId[]>();
  const byNormAll = new Map<string, HofId[]>();

  for (const h of hofs.values()) {
    const arr = byVillage.get(h.villageId);
    if (arr) arr.push(h.id);
    else byVillage.set(h.villageId, [h.id]);
    const seen = new Set<string>();
    for (const a of h.addrs) {
      const k = normHofAddr(a.value);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      const ids = byNormAll.get(k);
      if (ids) ids.push(h.id);
      else byNormAll.set(k, [h.id]);
    }
  }

  const lookup = (k: string, year: Year, villageId?: PlaceId): HofId[] => {
    const ids = (k && byNormAll.get(k)) || [];
    if (!ids.length) return [];
    const y = placeYear(year);
    const out: HofId[] = [];
    for (const id of ids) {
      const h = hofs.get(id);
      if (!h) continue;
      if (villageId != null && h.villageId !== villageId) continue;
      if (!hofAliveAt(h, y)) continue;
      if (y != null) {
        const okAddr = h.addrs.some(
          (a) => normHofAddr(a.value) === k && dateMatches(placeYear(a.from), placeYear(a.to), y),
        );
        if (!okAddr) continue;
      }
      out.push(id);
    }
    return out;
  };

  const reg: HofRegistry = {
    byId: (id) => hofs.get(id),
    byVillage: (villageId) => byVillage.get(villageId)?.slice() ?? [],
    findAllByAddr: (addr, year, villageId) => {
      // Read-Tolerance: erst Voll-Norm (matcht historische Komma-Höfe wie
      // „Oster 82a, Wester 141"), dann Extract-Fallback (matcht Adressbuch-
      // Übernahmen „Wall 33, 48607 Ochtrup" gegen Hof „Wall 33").
      const fullKey = normHofAddr(addr);
      const fullHits = lookup(fullKey, year, villageId);
      if (fullHits.length) return fullHits;
      const extractKey = normHofAddr(extractHofAddr(addr));
      if (extractKey && extractKey !== fullKey) return lookup(extractKey, year, villageId);
      return [];
    },
    findByAddr: (addr, year, villageId) => {
      const all = reg.findAllByAddr(addr, year, villageId);
      return all.length === 1 ? all[0] : null; // strikt eindeutig — sonst Review
    },
    resolveAddrAsOf: (id, year) => {
      const h = hofs.get(id);
      if (!h) return null;
      const y = placeYear(year);
      if (y != null) {
        let bestFrom = -Infinity;
        let bestVal: string | null = null;
        for (const a of h.addrs) {
          const from = placeYear(a.from);
          const to = placeYear(a.to);
          if (from == null && to == null) continue; // undatiert nur als Fallback
          if (!dateMatches(from, to, y)) continue;
          const f = from ?? -Infinity;
          if (f > bestFrom) {
            bestFrom = f;
            bestVal = a.value;
          }
        }
        if (bestVal != null) return bestVal;
      }
      const undated = h.addrs.find((a) => a.from == null && a.to == null);
      return undated?.value ?? h.addrs[0]?.value ?? '';
    },
  };

  return reg;
}
