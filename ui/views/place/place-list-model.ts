// ui/views/place/place-list-model.ts — reine Aufbereitung der Orte-Liste (Spec 20 §1.7
// [K]: "Automatische Sammlung aus allen Ereignissen; Typ-Badge, Koordinaten-Indikator,
// Typ-Filter", "Gruppen-Modus (String-Varianten unter PlaceObject-Titel), Admin-Filter").
// Liest AUSSCHLIESSLICH db.placeObjects (ID-basiert, Spec 11 §5 "Aggregatoren sind
// id-basiert, nicht string-basiert") — KEIN eigenes String-Aggregat über ev.place, das
// wäre eine Parallel-Implementierung der Kern-Identitätsauflösung (ADR-v9-18-Lehre).
import type { Database, PlaceId } from '../../../core/model/types';
import type { PlaceObject } from '../../../core/places';
import { placeTypeRank } from '../../../core/places';

export interface PlaceRow {
  id: PlaceId;
  title: string;
  type: string;
  hasCoords: boolean;
  /** String-Varianten (pnames) für den Gruppen-Modus — leer, wenn keine erfasst sind. */
  variants: string[];
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

function toRow(pl: PlaceObject): PlaceRow {
  return {
    id: pl.id,
    title: pl.title || pl.id,
    type: pl.type,
    hasCoords: pl.lat != null && pl.long != null,
    variants: pl.pnames.map((p) => p.value).filter(Boolean),
  };
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
  const haystack = [pl.title, ...pl.pnames.map((p) => p.value)].join(' ').toLowerCase();
  return haystack.includes(q);
}

/** Filtert + baut Zeilen; alphabetisch nach Titel sortiert. */
export function buildPlaceRows(
  db: Database,
  query = '',
  filters: PlaceFilters = defaultPlaceFilters(),
): PlaceRow[] {
  return Array.from(db.placeObjects.values())
    .filter((pl) => matchesSearch(pl, query) && matchesFilters(pl, filters))
    .map(toRow)
    .sort((a, b) => a.title.localeCompare(b.title, 'de'));
}
