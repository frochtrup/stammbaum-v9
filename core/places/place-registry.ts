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
  /**
   * [Ort-Id, übergeordnete Id, …] — dieselbe periodenkorrekte Kettenwahl wie
   * `enclosureChainAsOf`, aber als Knoten-IDs statt Namen. Für Identitäts-/Verträglichkeits-
   * Prüfungen (`chainCompatible`), die pro Knoten gegen die VOLLE Namensmenge (title + alle
   * pnames) prüfen müssen — ein einzelner periodenkorrekter Name reicht nicht (ein PLAC-Segment
   * „Bayern" ist mit dem Knoten kompatibel, dessen periodenkorrekter Name „Königreich Bayern" ist).
   */
  enclosureIdsAsOf: (id: PlaceId, year: Year, meta?: EnclosureMeta) => PlaceId[];
}

// Undatiert im PlaceObject-pname-Kontext gilt NICHT „jederzeit" — nur der Fallback
// auf title. Datierte Einträge matchen periodengerecht.
function dateMatches(from: Year, to: Year, y: number): boolean {
  if (from == null && to == null) return false;
  return (from == null || y >= from) && (to == null || y <= to);
}

/** Volle normalisierte Namensmenge eines Knotens (title + alle pnames). */
function nodeNames(node: PlaceObject): Set<string> {
  const names = new Set<string>();
  for (const nm of [node.title, ...node.pnames.map((p) => p.value)]) {
    const k = normPlaceName(nm);
    if (k) names.add(k);
  }
  return names;
}

/**
 * UNDATIERTE Eltern-Verträglichkeit über ALLE `enclosedBy`-Pfade (DFS/Backtracking).
 *
 * WARUM DFS statt linearem `enclosedBy[0]`-Walk (Bugfix 2026-07-12, ADR-v9-72): ein durch
 * `mergePlaceObjectPair` zusammengeführter Ort (z. B. der kuratierte `_po_ochtrup`, in den
 * 15 „Ochtrup"-Varianten gefaltet wurden) trägt MEHRERE `enclosedBy`-Einträge — jede der
 * gemergten historischen Verwaltungsketten. Ein PLAC-Segment, dessen Kette NICHT zufällig
 * der ERSTEN dieser Ketten entspricht, wurde vom Index-0-Walk fälschlich als „unbekannt"
 * gewertet → der Ort (bzw. seine Kette) wurde beim nächsten Laden/Seeden neu angelegt,
 * obwohl seine Kette bereits (an anderer Position) in `enclosedBy` steht (stille Verdopplung).
 *
 * Verträglich = es EXISTIERT ein Pfad durch den undatierten `enclosedBy`-Graphen ab
 * `leafId`, sodass `statedParentsNorm[i]` einen Namen des i-ten Vorfahren trifft
 * (Präfix-Semantik: läuft die Modell-Kette vor den Stated-Segmenten aus, bleibt es
 * verträglich). Deterministisch (Eingabe-Ordnung der `enclosedBy`-Liste). Lenient bei
 * fehlenden/zyklischen Knoten (wie der frühere Einzelpfad-Walk: nicht verifizierbar → ok).
 *
 * EIN gemeinsamer Mechanismus für `seed.ts::existingParentsCompatible` UND
 * `resolve.ts::chainCompatible` (year==null) — nicht zweimal geschrieben.
 */
export function chainCompatibleAnyPath(
  byId: (id: PlaceId) => PlaceObject | undefined,
  leafId: PlaceId,
  statedParentsNorm: readonly string[],
): boolean {
  const dfs = (curId: PlaceId, depth: number, seen: ReadonlySet<PlaceId>): boolean => {
    if (depth >= statedParentsNorm.length) return true; // alle Stated getroffen
    const cur = byId(curId);
    if (!cur) return true; // Knoten fehlt → nicht verifizierbar, lenient
    const entries = cur.enclosedBy;
    if (entries.length === 0) return true; // Modell-Kette endet → Präfix ok
    const want = statedParentsNorm[depth];
    for (const e of entries) {
      const childId = e.placeId;
      if (seen.has(childId)) return true; // Zyklus → wie Einzelpfad-Walk (lenient)
      const child = byId(childId);
      if (!child) return true; // dangling → lenient
      if (!nodeNames(child).has(want)) continue; // dieser Elter passt nicht → nächster
      const nextSeen = new Set(seen);
      nextSeen.add(childId);
      if (dfs(childId, depth + 1, nextSeen)) return true;
    }
    return false;
  };
  return dfs(leafId, 0, new Set([leafId]));
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
        // `bestId == null` MUSS mitgeprüft werden: eine nach unten offene Zuordnung
        // (`from` fehlt, `to` gesetzt — „seit jeher bis X", Spec 11 §1) trägt
        // `f = -Infinity` und wäre gegen den Startwert `bestFrom = -Infinity` nie „größer".
        // Sie konnte deshalb NIE gewinnen: `enclosureWinnerAsOf` gab für jedes Jahr
        // innerhalb dieser Periode `null` zurück und meldete `truncated` — der Ort galt
        // dort als ohne Zugehörigkeit. Das traf die periodengerechte PLAC-Projektion
        // ebenso wie die Verwaltungsgeschichte (ADR-v9-181, BL-249). Die Vorrangregel
        // „spätestes `from` gewinnt" bleibt unverändert: ein datierter Eintrag überschreibt
        // den offenen, sobald seine Periode ebenfalls trifft.
        if (bestId == null || f > bestFrom) {
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
          // Gleicher Grund wie in `enclosureWinnerAsOf` (ADR-v9-181): eine nach unten
          // offene Namensvariante („hieß bis 1400 Ochtorpe") trägt `-Infinity` und hätte
          // den Startwert nie überboten — sie fiel durch und der Ort hieß auch 1350 noch
          // nach seinem heutigen `title`.
          if (bestVal == null || f > bestFrom) {
            bestFrom = f;
            bestVal = pn.value;
          }
        }
        if (bestVal != null) return bestVal;
      }
      return pl.title || pl.pnames[0]?.value || '';
    },
    enclosureIdsAsOf: (id, year, meta) => {
      const out: PlaceId[] = [];
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
        out.push(cur);
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
    enclosureChainAsOf: (id, year, meta) => {
      // Namenskette = periodenkorrekter Name JEDES Knotens der ID-Kette (gleiche Auswahl-Logik).
      const out: string[] = [];
      for (const nid of reg.enclosureIdsAsOf(id, year, meta)) {
        const name = reg.resolveAsOf(nid, year);
        if (name != null) out.push(name);
      }
      return out;
    },
  };

  return reg;
}
