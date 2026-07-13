// ui/views/person/person-list-model.ts — reine Gruppierungs-/Sortier-/Filterlogik für
// die Personen-Liste (Spec 20 §1.4 [K]: "Alphabetische Liste mit Buchstaben-Trenner,
// Geburts-/Sterbejahr + Ort", "Sortier-Umschalter Name ⇄ Geburtsdatum", "Suche über
// Name/Titel/Ereignisse/Notizen/Religion", "erweiterte Filter: Geschlecht, Geburtsjahr-
// Bereich, Geburtsort, fehlende Felder"). Reine Funktionen (db → Zeilen/Gruppen), damit
// sie ohne DOM unit-testbar sind (Testpyramide, TST-5) — die Svelte-Komponente rendert nur.
import type { Database, Person, Sex } from '../../../core/model/types';
import type { PlaceContext } from '../../../core/places';
import { eventYear } from '../../../core/places';
import { displayName, sortKey, sortLetter, yearPlaceSummary, eventPlaceLabel } from '../../shell/person-display';

export type PersonSortMode = 'name' | 'birthDate';

export interface PersonFilters {
  /** '' = alle Geschlechter. */
  sex: Sex | '';
  /** null = keine Untergrenze. */
  birthYearFrom: number | null;
  /** null = keine Obergrenze. */
  birthYearTo: number | null;
  /** Textmatch (contains, case-insensitive) auf Geburts-/Taufort. */
  birthPlace: string;
  noDeathDate: boolean;
  noSources: boolean;
  noParents: boolean;
}

export function defaultPersonFilters(): PersonFilters {
  return {
    sex: '',
    birthYearFrom: null,
    birthYearTo: null,
    birthPlace: '',
    noDeathDate: false,
    noSources: false,
    noParents: false,
  };
}

export interface PersonRow {
  id: string;
  name: string;
  birthSummary: string;
  deathSummary: string;
  /** 📎-Medien-Badge (Spec 20 §1.4 [K], ADR-v9-79 Punkt 3) — `true` wenn `person.media`
   *  mind. einen Eintrag hat. Wiederverwendetes 📎-Symbol (Spec 21 §7: "ausschließlich
   *  Medien/OBJE, nie Quellen"). */
  hasMedia: boolean;
}

export interface PersonGroup {
  /** Buchstaben-Trenner-Wert; im Datum-Sortier-Modus stets null (keine Gruppierung). */
  letter: string | null;
  rows: PersonRow[];
}

/** Aggregierter Such-String über alle relevanten Felder (Spec 20 §1.4 [K]). */
function personSearchText(p: Person): string {
  return [
    p.id,
    p.name,
    p.given,
    p.surname,
    p.prefix,
    p.suffix,
    p.nick,
    p.title,
    p.religion,
    p.noteText,
    ...p.extraNames.map((en) => [en.nameRaw, en.given, en.surname].filter(Boolean).join(' ')),
    ...p.events.map((ev) => [ev.value, ev.place, ev.date, ev.eventType].join(' ')),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/**
 * Textmatch über Name/Titel/Ereignisse/Notizen/Religion (Spec 20 §1.4 [K]).
 * EXPORTIERT, damit die globale Suche (ui/views/search/global-search-model.ts,
 * Spec 20 §1.1 [K]) denselben Baustein nutzt statt einer zweiten, abweichenden
 * Personen-Matchlogik (ADR-v9-18-Lehre: eine Extraktionsfunktion statt Drift).
 */
export function matchesSearch(p: Person, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return personSearchText(p).includes(q);
}

function hasAnyCitations(p: Person): boolean {
  if (p.topLevelCitations.length > 0 || p.nameCitations.length > 0) return true;
  if (p.birth.citations.length || p.chr.citations.length || p.death.citations.length || p.buri.citations.length) {
    return true;
  }
  return p.events.some((ev) => ev.citations.length > 0);
}

function matchesFilters(p: Person, filters: PersonFilters, ctx: PlaceContext): boolean {
  if (filters.sex) {
    const sex = p.sex || 'U';
    if (filters.sex === 'U') {
      if (sex !== 'U') return false;
    } else if (sex !== filters.sex) {
      return false;
    }
  }

  if (filters.birthYearFrom != null || filters.birthYearTo != null) {
    const year = eventYear(p.birth);
    if (year == null) return false;
    if (filters.birthYearFrom != null && year < filters.birthYearFrom) return false;
    if (filters.birthYearTo != null && year > filters.birthYearTo) return false;
  }

  const placeQuery = filters.birthPlace.trim().toLowerCase();
  if (placeQuery) {
    const birthPlace = eventPlaceLabel(p.birth, ctx).toLowerCase();
    const chrPlace = eventPlaceLabel(p.chr, ctx).toLowerCase();
    if (!birthPlace.includes(placeQuery) && !chrPlace.includes(placeQuery)) return false;
  }

  if (filters.noDeathDate && p.death.date) return false;
  if (filters.noSources && hasAnyCitations(p)) return false;
  if (filters.noParents && p.childOf.length > 0) return false;

  return true;
}

/** Filtert + sortiert Personen; reine Funktion, unabhängig von der Gruppierung. */
export function filterAndSortPersons(
  db: Database,
  ctx: PlaceContext,
  sortMode: PersonSortMode,
  query: string,
  filters: PersonFilters,
): Person[] {
  const all = Array.from(db.individuals.values());
  const filtered = all.filter((p) => matchesSearch(p, query) && matchesFilters(p, filters, ctx));

  if (sortMode === 'birthDate') {
    return filtered.slice().sort((a, b) => {
      const ya = eventYear(a.birth);
      const yb = eventYear(b.birth);
      // Fehlendes Geburtsjahr sortiert ans Ende (unabhängig von der Richtung).
      if (ya == null && yb == null) return sortKey(a).localeCompare(sortKey(b), 'de');
      if (ya == null) return 1;
      if (yb == null) return -1;
      if (ya !== yb) return ya - yb;
      return sortKey(a).localeCompare(sortKey(b), 'de');
    });
  }

  // Name-Modus: nach Nachname sortieren (sortKey), NICHT nach displayName() ("Vorname
  // Nachname") — sonst laufen Buchstaben-Trenner (Nachname) und Reihenfolge auseinander.
  return filtered.slice().sort((a, b) => sortKey(a).localeCompare(sortKey(b), 'de'));
}

/**
 * Gruppiert die (bereits gefilterten/sortierten) Personen für die Liste.
 * Buchstaben-Trenner nur im Name-Modus (Spec 20 §1.4: "ersetzt die Buchstaben-Trenner-
 * Gruppierung im Datum-Modus durch schlichte chronologische Reihenfolge").
 */
export function groupPersonRows(persons: Person[], ctx: PlaceContext, sortMode: PersonSortMode): PersonGroup[] {
  if (sortMode === 'birthDate') {
    if (persons.length === 0) return [];
    return [{ letter: null, rows: persons.map((p) => toRow(p, ctx)) }];
  }

  const groups: PersonGroup[] = [];
  let current: PersonGroup | null = null;

  for (const p of persons) {
    const letter = sortLetter(p);
    if (!current || current.letter !== letter) {
      current = { letter, rows: [] };
      groups.push(current);
    }
    current.rows.push(toRow(p, ctx));
  }
  return groups;
}

/** Kombiniert Filtern/Sortieren/Gruppieren — der übliche Einstiegspunkt für die View. */
export function buildPersonGroups(
  db: Database,
  ctx: PlaceContext,
  sortMode: PersonSortMode = 'name',
  query = '',
  filters: PersonFilters = defaultPersonFilters(),
): PersonGroup[] {
  const persons = filterAndSortPersons(db, ctx, sortMode, query, filters);
  return groupPersonRows(persons, ctx, sortMode);
}

function toRow(p: Person, ctx: PlaceContext): PersonRow {
  return {
    id: p.id,
    name: displayName(p),
    birthSummary: yearPlaceSummary(p.birth, ctx),
    deathSummary: yearPlaceSummary(p.death, ctx),
    hasMedia: p.media.length > 0,
  };
}
