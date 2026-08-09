// core/places/hof-registry.ts — reiner, deterministischer Index über hofObjects.
// Read-Tolerance (Spec 11 §4.4, LP-6): erst Voll-Norm, dann Extract-Fallback.
import type { HofId, PlaceId } from '../model/types';
import type { HofObject, HofObjects, Year } from './types';
import { normHofAddr, extractHofAddr, placeYear } from './normalize';
import {
  alsSpanne,
  beginnWert,
  istDatiert,
  jahrAus,
  spanneVonDatiert,
  trifft,
  type Spanne,
  type Zeitbezug,
} from './zeitbezug';

export interface HofRegistry {
  byId: (id: HofId) => HofObject | undefined;
  byVillage: (villageId: PlaceId) => HofId[];
  /** Genau eine eindeutige Auflösung zum Jahr, sonst null (Mehrdeutigkeit → Review). */
  findByAddr: (addr: string, when: Zeitbezug, villageId?: PlaceId) => HofId | null;
  /** Alle Kandidaten mit zum Jahr passender addrs[]-Bezeichnung (Read-Tolerant). */
  findAllByAddr: (addr: string, when: Zeitbezug, villageId?: PlaceId) => HofId[];
  /** Periodenkorrekte Adress-Bezeichnung (analog placeRegistry.resolveAsOf). */
  resolveAddrAsOf: (id: HofId, when: Zeitbezug) => string | null;
  /**
   * Schreibt die Indizes um EINEN neu entstandenen Hof fort (ADR-v9-88).
   *
   * WARUM ES DAS GIBT: der Hof-Bootstrap in `resolve.ts` (Pfade C/B') erzeugt Höfe
   * WÄHREND der Auflösung, die nachfolgende Ereignisse sehen müssen. Bis ADR-v9-88 wurde
   * dafür die ganze Registry pro Ereignis neu gebaut — O(events × hofs), gemessen 89 s
   * bei 20.000 Personen. Der Lookup-Pfad liest die `hofs`-Map ohnehin live (`byId`,
   * `lookup`); veraltet waren allein `byVillage`/`byNormAll`. Diese Funktion ergänzt
   * genau die beiden, statt sie neu zu berechnen — die Sichtbarkeits-Zusicherung
   * (Spec 11 §4.2) bleibt unverändert, nur der Weg dorthin ändert sich.
   *
   * VERTRAG: `hof` muss NEU sein (noch nicht indiziert) und bereits in der `hofs`-Map
   * liegen, die dieser Registry übergeben wurde. Nur additiv — für GEÄNDERTE Höfe
   * (andere `addrs`) ist das kein Ersatz; dort weiterhin eine frische Registry bauen.
   * Die Index-Reihenfolge entspricht dem Neubau (Map-Einfügereihenfolge), damit
   * `findAllByAddr` deterministisch dieselbe Kandidatenfolge liefert wie zuvor.
   */
  indexHof: (hof: HofObject) => void;
}

/** Indiziert einen Hof in die beiden Index-Maps (gemeinsam von Aufbau + Fortschreibung). */
function addToIndex(
  hof: HofObject,
  byVillage: Map<PlaceId, HofId[]>,
  byNormAll: Map<string, HofId[]>,
): void {
  const arr = byVillage.get(hof.villageId);
  if (arr) arr.push(hof.id);
  else byVillage.set(hof.villageId, [hof.id]);
  const seen = new Set<string>();
  for (const a of hof.addrs) {
    const k = normHofAddr(a.value);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    const ids = byNormAll.get(k);
    if (ids) ids.push(hof.id);
    else byNormAll.set(k, [hof.id]);
  }
}

function adressePasst(
  a: { from: Year; to: Year; fromDate?: string | null; toDate?: string | null },
  bezug: Spanne,
): boolean {
  // undatiert = jederzeit gültig (Hof-Adressen ohne Datum sind Standard-Bezeichnung) —
  // das ist der Unterschied zu den `pnames` in place-registry.ts, wo undatiert NUR als
  // title-Fallback zählt. Seit BL-324 über Spannen statt Jahre; ohne `fromDate`/`toDate`
  // ist das Ergebnis unverändert.
  if (!istDatiert(a)) return true;
  return trifft(spanneVonDatiert(a), bezug);
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

  for (const h of hofs.values()) addToIndex(h, byVillage, byNormAll);

  const lookup = (k: string, when: Zeitbezug, villageId?: PlaceId): HofId[] => {
    const ids = (k && byNormAll.get(k)) || [];
    if (!ids.length) return [];
    const bezug = alsSpanne(when);
    // `existsFrom`/`existsTo` des Hofes bleiben Jahres-Skalare (wie beim Ort, BL-324).
    const y = bezug == null ? null : jahrAus(bezug);
    const out: HofId[] = [];
    for (const id of ids) {
      const h = hofs.get(id);
      if (!h) continue;
      if (villageId != null && h.villageId !== villageId) continue;
      if (!hofAliveAt(h, y)) continue;
      if (bezug != null) {
        const okAddr = h.addrs.some((a) => normHofAddr(a.value) === k && adressePasst(a, bezug));
        if (!okAddr) continue;
      }
      out.push(id);
    }
    return out;
  };

  const reg: HofRegistry = {
    byId: (id) => hofs.get(id),
    indexHof: (hof) => addToIndex(hof, byVillage, byNormAll),
    byVillage: (villageId) => byVillage.get(villageId)?.slice() ?? [],
    findAllByAddr: (addr, when, villageId) => {
      // Read-Tolerance: erst Voll-Norm (matcht historische Komma-Höfe wie
      // „Oster 82a, Wester 141"), dann Extract-Fallback (matcht Adressbuch-
      // Übernahmen „Wall 33, 48607 Ochtrup" gegen Hof „Wall 33").
      const fullKey = normHofAddr(addr);
      const fullHits = lookup(fullKey, when, villageId);
      if (fullHits.length) return fullHits;
      const extractKey = normHofAddr(extractHofAddr(addr));
      if (extractKey && extractKey !== fullKey) return lookup(extractKey, when, villageId);
      return [];
    },
    findByAddr: (addr, when, villageId) => {
      const all = reg.findAllByAddr(addr, when, villageId);
      return all.length === 1 ? all[0] : null; // strikt eindeutig — sonst Review
    },
    resolveAddrAsOf: (id, when) => {
      const h = hofs.get(id);
      if (!h) return null;
      const bezug = alsSpanne(when);
      if (bezug != null) {
        let bestFrom = -Infinity;
        let bestVal: string | null = null;
        for (const a of h.addrs) {
          if (!istDatiert(a)) continue; // undatiert nur als Fallback
          if (!adressePasst(a, bezug)) continue;
          const f = beginnWert(spanneVonDatiert(a));
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
