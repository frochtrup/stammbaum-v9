// ui/views/place/place-list-model.ts — reine Aufbereitung der Orte-Liste (Spec 20 §1.7
// [K]: "Automatische Sammlung aus allen Ereignissen; Typ-Badge, Koordinaten-Indikator,
// Typ-Filter", "Gruppen-Modus (String-Varianten unter PlaceObject-Titel), Admin-Filter").
// Liest AUSSCHLIESSLICH db.placeObjects (ID-basiert, Spec 11 §5 "Aggregatoren sind
// id-basiert, nicht string-basiert") — KEIN eigenes String-Aggregat über ev.place, das
// wäre eine Parallel-Implementierung der Kern-Identitätsauflösung (ADR-v9-18-Lehre).
import type { Database, Event, PlaceId } from '../../../core/model/types';
import type { PlaceContext, PlaceObject } from '../../../core/places';
import { placeTypeRank, isEnrichedPlace, hasReference, placeDisplayName, eventPlaceId } from '../../../core/places';

export interface PlaceRow {
  id: PlaceId;
  title: string;
  type: string;
  hasCoords: boolean;
  coords: { lat: number; long: number } | null;
  /** String-Varianten (pnames) für den Gruppen-Modus — leer, wenn keine erfasst sind. */
  variants: string[];
  /** ADR-v9-44/Spec 11 §9.1: `false` heißt "ohne Zusatzangaben" (Pille) — reines
   *  Inhalts-Prädikat, KEINE Herkunfts-Aussage (s. Modul-Kommentar der Kern-Funktion). */
  enriched: boolean;
  /** Hierarchie-Badge (Spec 20 §1.7 [K], ADR-v9-79 Punkt 3) — `true`, wenn mind. eine
   *  `enclosedBy`-Zugehörigkeit erfasst ist. UNABHÄNGIG von `enriched` (ein Ort kann
   *  eine Kette haben, ohne sonst angereichert zu sein, oder umgekehrt). */
  hasHierarchy: boolean;
  /** Zahl der DISTINKTEN Personen mit mind. einem Ereignis an diesem Ort (BL-204,
   *  v8-Orakel „N Personen"), über den `eventPlaceId`-Chokepoint aufgelöst. `0`, wenn
   *  keine Zählung übergeben wurde (z. B. globale Suche). */
  personCount: number;
}

/** Beide Kurations-Abschnitte der Hauptliste (Spec 20 §1.7 [K] Referenz-Filter, ADR-v9-46). */
export interface PlaceListSections {
  /** Von mind. einem Event der geladenen Datei referenziert — die eigentliche Hauptliste. */
  referenced: PlaceRow[];
  /** `hasReference === false` — separater Abschnitt, weiterhin voll editierbar/löschbar. */
  unreferenced: PlaceRow[];
}

export interface PlaceFilters {
  /** Leerer String = kein Typ-Filter. */
  type: string;
  /** Reine Verwaltungseinheiten (Rang ≥ Schwelle, s. ADMIN_RANK_THRESHOLD) ausblenden. */
  hideAdmin: boolean;
}

export function defaultPlaceFilters(): PlaceFilters {
  return { type: '', hideAdmin: false };
}

// Verwaltungs-Schwelle: Rang ab "District"/"County" (7) aufwärts gilt als reine
// Verwaltungseinheit (Kreis/Land), NICHT Dorf/Stadt (placeTypeRank, core/places/normalize.ts).
const ADMIN_RANK_THRESHOLD = 7;

export function isAdminType(type: string | null | undefined): boolean {
  return placeTypeRank(type) >= ADMIN_RANK_THRESHOLD;
}

function toRow(pl: PlaceObject, personCounts?: Map<PlaceId, number>): PlaceRow {
  const hasCoords = pl.lat != null && pl.long != null;
  return {
    id: pl.id,
    // Anzeigename über den einzigen erlaubten Weg (Spec 11 §5, INV-UI-14) — shortName vor
    // title, nie po.title direkt.
    title: placeDisplayName(pl),
    type: pl.type,
    hasCoords,
    coords: hasCoords ? { lat: pl.lat as number, long: pl.long as number } : null,
    variants: pl.pnames.map((p) => p.value).filter(Boolean),
    enriched: isEnrichedPlace(pl),
    hasHierarchy: pl.enclosedBy.length > 0,
    personCount: personCounts?.get(pl.id) ?? 0,
  };
}

/**
 * Zahl der DISTINKTEN Personen je Ort (BL-204) — für jede Person einmal die Menge der
 * berührten `placeId`s über den `eventPlaceId`-Chokepoint (Spec 11 §5) bilden, dann je
 * Ort zählen. `Set` je Person verhindert Doppelzählung, wenn mehrere Ereignisse derselben
 * Person an denselben Ort fallen. EINMAL für den ganzen Bestand berechnen, nicht je Zeile.
 */
export function countPersonsPerPlace(db: Database, ctx: PlaceContext): Map<PlaceId, number> {
  const counts = new Map<PlaceId, number>();
  for (const p of db.individuals.values()) {
    const seen = new Set<PlaceId>();
    for (const ev of [p.birth, p.chr, p.death, p.buri, ...p.events]) {
      const id = eventPlaceId(ev, ctx);
      if (id != null) seen.add(id);
    }
    for (const id of seen) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/** Alle bekannten Typen (für den Typ-Filter-Dropdown), alphabetisch, ohne Duplikate. */
export function knownPlaceTypes(db: Database): string[] {
  const types = new Set<string>();
  for (const pl of db.placeObjects.values()) {
    if (pl.type) types.add(pl.type);
  }
  return Array.from(types).sort((a, b) => a.localeCompare(b, 'de'));
}

function matchesFilters(pl: PlaceObject, filters: PlaceFilters): boolean {
  if (filters.type && pl.type !== filters.type) return false;
  if (filters.hideAdmin && isAdminType(pl.type)) return false;
  return true;
}

/**
 * Textmatch über Titel + pnames-Varianten (Spec 20 §1.7 [K]).
 * EXPORTIERT für die globale Suche (ui/views/search/global-search-model.ts,
 * Spec 20 §1.1 [K]) — kein zweiter, abweichender Orts-Matcher (ADR-v9-18-Lehre).
 */
export function matchesSearch(pl: PlaceObject, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  // shortName ergänzt den Heuhaufen (was sichtbar ist, muss auffindbar sein, ADR-v9-100) —
  // title/pnames bleiben weiterhin durchsuchbar, shortName ersetzt sie nicht. translations
  // (Sprachachse, BL-59) ebenso: „Wrocław" muss den Ort „Breslau" finden. `?? []` toleriert
  // aus einer feldlosen orte.json geladene Orte.
  const haystack = [
    pl.title,
    pl.shortName,
    ...pl.pnames.map((p) => p.value),
    ...(pl.translations ?? []).map((t) => t.value),
  ].join(' ').toLowerCase();
  return haystack.includes(q);
}

/** Filtert + baut Zeilen; alphabetisch nach Titel sortiert. */
export function buildPlaceRows(
  db: Database,
  query = '',
  filters: PlaceFilters = defaultPlaceFilters(),
  personCounts?: Map<PlaceId, number>,
): PlaceRow[] {
  return Array.from(db.placeObjects.values())
    .filter((pl) => matchesSearch(pl, query) && matchesFilters(pl, filters))
    .map((pl) => toRow(pl, personCounts))
    .sort((a, b) => a.title.localeCompare(b.title, 'de'));
}

/**
 * Referenz-Filter (Spec 20 §1.7 [K], ADR-v9-46): partitioniert die (bereits Such-/Typ-
 * gefilterten) Zeilen nach `hasReference` — die Hauptliste zeigt nur `referenced`,
 * `unreferenced` füllt den separaten "Ohne Bezug"-Abschnitt (weiterhin voll editierbar/
 * löschbar, keine automatische Löschung). Baut auf `buildPlaceRows` auf (kein zweiter
 * Aufbereitungs-Pfad) — reine Zusatz-Partitionierung.
 */
export function buildPlaceListSections(
  db: Database,
  ctx: PlaceContext,
  events: readonly Event[],
  query = '',
  filters: PlaceFilters = defaultPlaceFilters(),
): PlaceListSections {
  const rows = buildPlaceRows(db, query, filters, countPersonsPerPlace(db, ctx));
  const referenced: PlaceRow[] = [];
  const unreferenced: PlaceRow[] = [];
  for (const row of rows) {
    (hasReference(row.id, events, ctx) ? referenced : unreferenced).push(row);
  }
  return { referenced, unreferenced };
}
