// ui/views/family/family-list-model.ts — reine Aufbereitung der Familien-Liste
// (Spec 20 §1.5 [K]: "Liste (Elternpaar, Heiratsdatum, Kinderzahl)", "Sortier-Umschalter
// mit drei Zuständen: Nachname Ehemann · Nachname Ehefrau · Heiratsdatum", "Suche über
// Ehepartnernamen/Kindernamen/Ereignisse/Notizen", "erweiterte Filter: Heiratsjahr-
// Bereich, Heiratsort, fehlende Felder"). Reine Funktionen (db → Zeilen), damit sie
// ohne DOM unit-testbar sind (Testpyramide, TST-5) — die Svelte-Komponente rendert nur.
import type { Database, Family, Person } from '../../../core/model/types';
import type { PlaceContext } from '../../../core/places';
import { eventYear, buildListPlaceName } from '../../../core/places';
import { displayName, surnameCandidate, yearPlaceSummary, eventPlaceLabel } from '../../shell/person-display';
import { familyLabelFor } from '../source/family-label';

export type FamilySortMode = 'husbandSurname' | 'wifeSurname' | 'marriageDate';

export interface FamilyFilters {
  marriageYearFrom: number | null;
  marriageYearTo: number | null;
  /** Textmatch (contains, case-insensitive) auf den Heiratsort. */
  marriagePlace: string;
  noMarriageDate: boolean;
  noSources: boolean;
  noChildren: boolean;
}

export function defaultFamilyFilters(): FamilyFilters {
  return {
    marriageYearFrom: null,
    marriageYearTo: null,
    marriagePlace: '',
    noMarriageDate: false,
    noSources: false,
    noChildren: false,
  };
}

export interface FamilyRow {
  id: string;
  parentsLabel: string;
  /** "Jahr, Kurzname" (INV-UI-14). */
  marriageSummary: string;
  /** Volle periodengerechte Verwaltungskette für den Tooltip (ADR-v9-86) — leer, wenn
   *  kein Ort erfasst ist. */
  marriagePlaceFull: string;
  childCount: number;
}

function person(db: Database, id: string | null): Person | null {
  return id ? (db.individuals.get(id) ?? null) : null;
}

/**
 * Nachname für den Sortier-Modus "Nachname Ehemann"/"Nachname Ehefrau" (leer = fehlt).
 * Nutzt denselben Nachname-Kandidaten wie die Personen-Liste (surnameCandidate) —
 * NICHT nur p.surname direkt, das bei reinem `1 NAME Given /Surname/` ohne explizite
 * GIVN/SURN-Untertags leer bleibt (core/interop/gedcom-parse.ts liest GIVN/SURN separat).
 */
function surnameFor(db: Database, id: string | null): string {
  const p = person(db, id);
  return p ? surnameCandidate(p).trim() : '';
}

function familySearchText(db: Database, f: Family): string {
  const husband = person(db, f.husband);
  const wife = person(db, f.wife);
  const children = f.children.map((cid) => person(db, cid)).filter((p): p is Person => p != null);
  return [
    husband ? displayName(husband) : '',
    wife ? displayName(wife) : '',
    ...children.map(displayName),
    f.noteText,
    f.marriage.place,
    f.marriage.date,
    ...f.events.map((ev) => [ev.value, ev.place, ev.date, ev.eventType].join(' ')),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/**
 * Textmatch über Ehepartnernamen/Kindernamen/Ereignisse/Notizen (Spec 20 §1.5 [K]).
 * EXPORTIERT für die globale Suche (ui/views/search/global-search-model.ts,
 * Spec 20 §1.1 [K]) — kein zweiter, abweichender Familien-Matcher (ADR-v9-18-Lehre).
 */
export function matchesSearch(db: Database, f: Family, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return familySearchText(db, f).includes(q);
}

function hasAnyCitations(f: Family): boolean {
  if (f.citations.length > 0) return true;
  if (f.marriage.citations.length || f.engagement.citations.length) return true;
  return f.events.some((ev) => ev.citations.length > 0);
}

function matchesFilters(f: Family, filters: FamilyFilters, ctx: PlaceContext): boolean {
  if (filters.marriageYearFrom != null || filters.marriageYearTo != null) {
    const year = eventYear(f.marriage);
    if (year == null) return false;
    if (filters.marriageYearFrom != null && year < filters.marriageYearFrom) return false;
    if (filters.marriageYearTo != null && year > filters.marriageYearTo) return false;
  }

  const placeQuery = filters.marriagePlace.trim().toLowerCase();
  if (placeQuery) {
    // Ergänzt um den Kurznamen (inkl. shortName) — ersetzt die Ketten-Suche nicht,
    // Spec 11 §1 "was sichtbar ist, muss auffindbar sein" (ADR-v9-100).
    const place = eventPlaceLabel(f.marriage, ctx).toLowerCase();
    const placeShort = buildListPlaceName(f.marriage, ctx).toLowerCase();
    if (!place.includes(placeQuery) && !placeShort.includes(placeQuery)) return false;
  }

  if (filters.noMarriageDate && f.marriage.date) return false;
  if (filters.noSources && hasAnyCitations(f)) return false;
  if (filters.noChildren && f.children.length > 0) return false;

  return true;
}

/** Filtert + sortiert Familien; reine Funktion, getrennt von der Zeilen-Aufbereitung. */
export function filterAndSortFamilies(
  db: Database,
  ctx: PlaceContext,
  sortMode: FamilySortMode,
  query: string,
  filters: FamilyFilters,
): Family[] {
  const all = Array.from(db.families.values());
  const filtered = all.filter((f) => matchesSearch(db, f, query) && matchesFilters(f, filters, ctx));

  if (sortMode === 'marriageDate') {
    return filtered.slice().sort((a, b) => {
      const ya = eventYear(a.marriage);
      const yb = eventYear(b.marriage);
      if (ya == null && yb == null) return familyLabelFor(db, a.id).localeCompare(familyLabelFor(db, b.id), 'de');
      if (ya == null) return 1;
      if (yb == null) return -1;
      if (ya !== yb) return ya - yb;
      return familyLabelFor(db, a.id).localeCompare(familyLabelFor(db, b.id), 'de');
    });
  }

  const personId: 'husband' | 'wife' = sortMode === 'wifeSurname' ? 'wife' : 'husband';
  return filtered.slice().sort((a, b) => {
    const sa = surnameFor(db, a[personId]);
    const sb = surnameFor(db, b[personId]);
    // Fehlender Nachname (kein Partner bzw. Partner ohne Nachnamen) sortiert ans Ende.
    if (!sa && !sb) return familyLabelFor(db, a.id).localeCompare(familyLabelFor(db, b.id), 'de');
    if (!sa) return 1;
    if (!sb) return -1;
    const cmp = sa.localeCompare(sb, 'de');
    if (cmp !== 0) return cmp;
    return familyLabelFor(db, a.id).localeCompare(familyLabelFor(db, b.id), 'de');
  });
}

function toRow(f: Family, db: Database, ctx: PlaceContext): FamilyRow {
  return {
    id: f.id,
    parentsLabel: familyLabelFor(db, f.id),
    marriageSummary: yearPlaceSummary(f.marriage, ctx),
    marriagePlaceFull: eventPlaceLabel(f.marriage, ctx),
    childCount: f.children.length,
  };
}

/** Kombiniert Filtern/Sortieren/Zeilen-Aufbereitung — üblicher Einstiegspunkt für die View. */
export function buildFamilyRows(
  db: Database,
  ctx: PlaceContext,
  sortMode: FamilySortMode = 'husbandSurname',
  query = '',
  filters: FamilyFilters = defaultFamilyFilters(),
): FamilyRow[] {
  const families = filterAndSortFamilies(db, ctx, sortMode, query, filters);
  return families.map((f) => toRow(f, db, ctx));
}
