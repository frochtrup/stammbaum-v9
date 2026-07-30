// ui/views/person/person-list-model.ts — reine Gruppierungs-/Sortier-/Filterlogik für
// die Personen-Liste (Spec 20 §1.4 [K]: "Alphabetische Liste mit Buchstaben-Trenner,
// Geburts-/Sterbejahr + Ort", "Sortier-Umschalter Name ⇄ Geburtsdatum", "Suche über
// Name/Titel/Ereignisse/Notizen/Religion", "erweiterte Filter: Geschlecht, Geburtsjahr-
// Bereich, Geburtsort, fehlende Felder"). Reine Funktionen (db → Zeilen/Gruppen), damit
// sie ohne DOM unit-testbar sind (Testpyramide, TST-5) — die Svelte-Komponente rendert nur.
import type { Database, Person, PersonId, Sex } from '../../../core/model/types';
import type { PlaceContext } from '../../../core/places';
import { eventYear, buildListPlaceName } from '../../../core/places';
import { displayName, sortKey, sortLetter, yearPlaceSummary, eventPlaceLabel, NAMELESS_LETTER } from '../../shell/person-display';
import { computeKekuleNumbers } from '../../islands/tree/tree-model';
import { germanSoundex, isPureLetterQuery } from '../../shell/soundex';

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
  /**
   * Soundex-Modus (BL-10, ADR-v9-159): Filteroption hinter der `FilterBar`, zählt in
   * `countActiveFilters` mit — kein eigener Dauer-Toggle in der Kopfzeile (INV-UI-11).
   * Getrennter Zustand von der globalen Suche (kein gemeinsamer Topf, INV-VS).
   */
  soundex: boolean;
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
    soundex: false,
  };
}

export interface PersonRow {
  id: string;
  name: string;
  /** "Jahr, Kurzname" (INV-UI-14) — der sichtbare Zeilentext. */
  birthSummary: string;
  deathSummary: string;
  /** Volle periodengerechte Verwaltungskette (`eventPlaceLabel`) für den Tooltip an
   *  derselben Zeile (ADR-v9-86) — leer, wenn kein Ort erfasst ist (kein Tooltip). */
  birthPlaceFull: string;
  deathPlaceFull: string;
  /** 📎-Medien-Badge (Spec 20 §1.4 [K], ADR-v9-79 Punkt 3) — `true` wenn `person.media`
   *  mind. einen Eintrag hat. Wiederverwendetes 📎-Symbol (Spec 21 §7: "ausschließlich
   *  Medien/OBJE, nie Quellen"). */
  hasMedia: boolean;
  /** Geschlecht für das Zeilen-Icon (BL-195, ♂/♀/◇ via `sexSymbol`). */
  sex: Sex;
  /** Kekulé-/Ahnenziffer relativ zum Proband (BL-195, v8-Orakel `p-kekule`) — `null`, wenn
   *  die Person kein Vorfahr des Probanden ist oder kein Proband bestimmbar war. Aus dem
   *  geteilten `computeKekuleNumbers` (kein zweiter Rechenweg, INV-UI-4). */
  kekule: number | null;
}

export interface PersonGroup {
  /** Buchstaben-Trenner-Wert; im Datum-Sortier-Modus stets null (keine Gruppierung). */
  letter: string | null;
  rows: PersonRow[];
  /** Die Sammel-Gruppe der Namenlosen (`letter === NAMELESS_LETTER`) — die View rendert
   *  sie als kollabierbare „N ohne Namen"-Zeile statt einzeln (ADR-v9-121). Im Datum-Modus
   *  stets false (keine Buchstaben-Gruppierung). */
  nameless: boolean;
  /** Die Vorrang-Gruppe des Soundex-Modus (ADR-v9-160): Treffer, deren NACHNAME phonetisch
   *  zur Anfrage passt, stehen als EINE Gruppe ganz oben — darunter folgt die gewohnte
   *  Gruppierung mit allen übrigen Treffern. `letter` ist dabei null (kein Buchstaben-
   *  Trenner); die View beschriftet die Gruppe eigens. Außerhalb des Soundex-Modus nie true. */
  phonetic: boolean;
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

/** Namensfelder für den Soundex-Vergleich — dieselben Namensträger, die bereits in
 *  `personSearchText` einfließen (inkl. Namensvarianten `extraNames`), nicht mehr. */
function nameFieldsFor(p: Person): string[] {
  return [
    p.name,
    p.given,
    p.surname,
    p.nick,
    ...p.extraNames.flatMap((en) => [en.nameRaw, en.given, en.surname]),
  ].filter((s): s is string => Boolean(s));
}

/**
 * Textmatch über Name/Titel/Ereignisse/Notizen/Religion (Spec 20 §1.4 [K]).
 * EXPORTIERT, damit die globale Suche (ui/views/search/global-search-model.ts,
 * Spec 20 §1.1 [K]) denselben Baustein nutzt statt einer zweiten, abweichenden
 * Personen-Matchlogik (ADR-v9-18-Lehre: eine Extraktionsfunktion statt Drift).
 *
 * `soundex` (BL-10, ADR-v9-159, Default `false` — bestehende Aufrufer bleiben
 * unverändert): ergänzt den Substring-Treffer um einen phonetischen Treffer auf den
 * Namensfeldern (inkl. Namensvarianten), wenn die Anfrage rein aus Buchstaben besteht
 * ("greift wie in v8 nur bei reinen Buchstaben-Anfragen") — der bestehende Substring-
 * Treffer über ALLE Felder (Ereignisse/Notizen/Religion/…) bleibt zusätzlich erhalten,
 * eine Vollzeichenkette wird durch den Soundex-Modus also nie unauffindbar.
 */
export function matchesSearch(p: Person, query: string, soundex = false): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (personSearchText(p).includes(q)) return true;
  if (soundex && isPureLetterQuery(q)) {
    const qSdx = germanSoundex(q);
    if (qSdx && nameFieldsFor(p).some((name) => germanSoundex(name) === qSdx)) return true;
  }
  return false;
}

/**
 * Trifft die Anfrage phonetisch den NACHNAMEN (inkl. der Nachnamen von Namensvarianten)?
 *
 * Warum eigens neben `matchesSearch` (BL-10-Nachtrag, ADR-v9-160): der Soundex-Modus trifft
 * bewusst Vor- UND Nachnamen (v8-Verhalten) — an echten Daten gemessen sind das für eine
 * Nachnamen-Anfrage aber überwiegend Vornamens-Zufallstreffer ("Meier" und "Maria" haben
 * beide den Code M600: 85 der 90 Treffer waren Vornamen). Die TrefferMENGE bleibt deshalb
 * unverändert — nur die REIHENFOLGE nutzt dieses Prädikat, damit die gesuchten Namensvarianten
 * oben stehen. Kein Filter: wer nach einem Vornamen sucht, verliert nichts.
 */
export function matchesSurnameSoundex(p: Person, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q || !isPureLetterQuery(q)) return false;
  const qSdx = germanSoundex(q);
  if (!qSdx) return false;
  const surnames = [p.surname, ...p.extraNames.map((en) => en.surname)].filter((s): s is string => Boolean(s));
  return surnames.some((s) => germanSoundex(s) === qSdx);
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
    // Matcht sowohl über die volle Kette (eventPlaceLabel) ALS AUCH über den Kurznamen
    // inkl. shortName (buildListPlaceName) — ergänzt, ersetzt nicht (Spec 11 §1 "was
    // sichtbar ist, muss auffindbar sein", ADR-v9-100).
    const birthPlace = eventPlaceLabel(p.birth, ctx).toLowerCase();
    const birthShort = buildListPlaceName(p.birth, ctx).toLowerCase();
    const chrPlace = eventPlaceLabel(p.chr, ctx).toLowerCase();
    const chrShort = buildListPlaceName(p.chr, ctx).toLowerCase();
    const hay = [birthPlace, birthShort, chrPlace, chrShort];
    if (!hay.some((s) => s.includes(placeQuery))) return false;
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
  const filtered = all.filter((p) => matchesSearch(p, query, filters.soundex) && matchesFilters(p, filters, ctx));

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
export function groupPersonRows(
  persons: Person[],
  ctx: PlaceContext,
  sortMode: PersonSortMode,
  kekule?: Map<PersonId, number> | null,
): PersonGroup[] {
  if (sortMode === 'birthDate') {
    if (persons.length === 0) return [];
    return [{ letter: null, rows: persons.map((p) => toRow(p, ctx, kekule)), nameless: false, phonetic: false }];
  }

  const groups: PersonGroup[] = [];
  let current: PersonGroup | null = null;

  for (const p of persons) {
    const letter = sortLetter(p);
    if (!current || current.letter !== letter) {
      current = { letter, rows: [], nameless: letter === NAMELESS_LETTER, phonetic: false };
      groups.push(current);
    }
    current.rows.push(toRow(p, ctx, kekule));
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
  /** Effektiver Proband (BL-195/BL-120) — bestimmt die Kekulé-Ziffern der Zeilen. `null`
   *  (Default) = keine Ahnenziffern. Von der View über `resolveProband` gereicht, damit
   *  das Modell rein/DOM-frei bleibt. */
  probandId: PersonId | null = null,
): PersonGroup[] {
  const persons = filterAndSortPersons(db, ctx, sortMode, query, filters);
  // Kekulé EINMAL für den ganzen Bestand berechnen (kein zweiter Rechenweg, INV-UI-4),
  // nicht je Zeile — computeKekuleNumbers traversiert den Ahnenbaum des Probanden.
  const kekule = probandId ? computeKekuleNumbers(db, probandId) : null;

  // Soundex-Vorrang (ADR-v9-160): Nachnamen-Treffer als EINE Gruppe nach oben. Die Menge
  // bleibt unverändert — die übrigen (meist Vornamens-)Treffer folgen darunter in der
  // gewohnten Gruppierung. Ohne Soundex-Modus fällt der ganze Zweig weg.
  if (filters.soundex) {
    const leading = persons.filter((p) => matchesSurnameSoundex(p, query));
    if (leading.length > 0 && leading.length < persons.length) {
      const inLead = new Set(leading);
      const rest = persons.filter((p) => !inLead.has(p));
      const head: PersonGroup = {
        letter: null,
        rows: leading.map((p) => toRow(p, ctx, kekule)),
        nameless: false,
        phonetic: true,
      };
      return [head, ...groupPersonRows(rest, ctx, sortMode, kekule)];
    }
  }

  return groupPersonRows(persons, ctx, sortMode, kekule);
}

function toRow(p: Person, ctx: PlaceContext, kekule?: Map<PersonId, number> | null): PersonRow {
  return {
    id: p.id,
    name: displayName(p),
    birthSummary: yearPlaceSummary(p.birth, ctx),
    deathSummary: yearPlaceSummary(p.death, ctx),
    birthPlaceFull: eventPlaceLabel(p.birth, ctx),
    deathPlaceFull: eventPlaceLabel(p.death, ctx),
    hasMedia: p.media.length > 0,
    sex: p.sex,
    kekule: kekule?.get(p.id) ?? null,
  };
}
