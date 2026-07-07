// ui/views/search/global-search-model.ts — reine Kernfunktion der globalen Suche
// (Spec 20 §1.1 [K]: "Globale Suche (erstklassiges Ziel) über Personen/Familien/
// Quellen/Orte/Höfe, gruppierte Ergebnisse"; Spec 21 §2/§3: "das universelle 'finde
// irgendwas'" — die Command-Palette (⌘K, Desktop) nutzt später denselben Such-Kern,
// daher bewusst eine reine, DOM-/UI-freie Funktion ohne eigenen Zustand).
//
// Wiederverwendung statt Neuerfindung (ADR-v9-18-Lehre "eine Extraktionsfunktion statt
// Drift"): nutzt die bereits vorhandenen, jetzt exportierten `matchesSearch`-Bausteine
// aus person-/family-/source-/place-/hof-list-model.ts — KEINE zweite, abweichende
// Text-Match-Implementierung pro Entität.
//
// Höfe (ADR-v9-24): Spec 20 §1.1 wurde korrigiert, Höfe gehören seither explizit in
// die globale Suche dazu — hier über dieselbe `matchesSearch`+`toRow`-Aufbereitung
// wie die Höfe-Liste (hof-list-model.ts), keine Parallel-Formatierung.
import type { Database } from '../../../core/model/types';
import type { PlaceContext } from '../../../core/places';
import { matchesSearch as matchesPersonSearch } from '../person/person-list-model';
import { matchesSearch as matchesFamilySearch } from '../family/family-list-model';
import { matchesSearch as matchesSourceSearch } from '../source/source-list-model';
import { matchesSearch as matchesPlaceSearch } from '../place/place-list-model';
import { matchesSearch as matchesHofSearch, toRow as toHofRow } from '../hof/hof-list-model';
import { displayName, yearPlaceSummary } from '../../shell/person-display';
import { familyLabelFor } from '../source/family-label';

/** Unterhalb dieser Zeichenzahl liefert die Suche bewusst keine Ergebnisse (kein
 * Full-Scan-Flackern bei jedem Tastendruck) — einfache, ausreichende Grenze, keine
 * Überkonstruktion (z. B. Debounce wäre ein zweiter Mechanismus für dasselbe Problem). */
export const MIN_QUERY_LENGTH = 2;

export interface SearchResultRow {
  id: string;
  /** Haupttext der Ergebniszeile (Name/Elternpaar/Kurzname/Titel). */
  primary: string;
  /** Kurzinfo-Zeile (Jahr+Ort / Autor / Typ …), leer wenn nichts Sinnvolles vorhanden. */
  secondary: string;
}

export interface GroupedSearchResults {
  persons: SearchResultRow[];
  families: SearchResultRow[];
  sources: SearchResultRow[];
  places: SearchResultRow[];
  hofs: SearchResultRow[];
}

function emptyResults(): GroupedSearchResults {
  return { persons: [], families: [], sources: [], places: [], hofs: [] };
}

/** Gesamtzahl aller Treffer über alle Gruppen — praktisch für "keine Treffer"-Leerzustände. */
export function totalResultCount(results: GroupedSearchResults): number {
  return (
    results.persons.length +
    results.families.length +
    results.sources.length +
    results.places.length +
    results.hofs.length
  );
}

/**
 * Durchsucht Personen/Familien/Quellen/Orte/Höfe der übergebenen Datenbank und liefert
 * gruppierte Ergebnisse (Spec 20 §1.1 [K], ADR-v9-24). Reine Funktion (db/ctx/query ->
 * Ergebnis), kein eigener Zustand — Command-Palette-tauglich (Spec 21 §3).
 */
export function globalSearch(db: Database, ctx: PlaceContext, query: string): GroupedSearchResults {
  const q = query.trim();
  if (q.length < MIN_QUERY_LENGTH) return emptyResults();

  const persons: SearchResultRow[] = [];
  for (const p of db.individuals.values()) {
    if (!matchesPersonSearch(p, q)) continue;
    persons.push({ id: p.id, primary: displayName(p), secondary: yearPlaceSummary(p.birth, ctx) });
  }
  persons.sort((a, b) => a.primary.localeCompare(b.primary, 'de'));

  const families: SearchResultRow[] = [];
  for (const f of db.families.values()) {
    if (!matchesFamilySearch(db, f, q)) continue;
    families.push({ id: f.id, primary: familyLabelFor(db, f.id), secondary: yearPlaceSummary(f.marriage, ctx) });
  }
  families.sort((a, b) => a.primary.localeCompare(b.primary, 'de'));

  const sources: SearchResultRow[] = [];
  for (const s of db.sources.values()) {
    if (!matchesSourceSearch(s, q)) continue;
    sources.push({ id: s.id, primary: s.abbr || s.title || s.id, secondary: s.author });
  }
  sources.sort((a, b) => a.primary.localeCompare(b.primary, 'de'));

  const places: SearchResultRow[] = [];
  for (const pl of db.placeObjects.values()) {
    if (!matchesPlaceSearch(pl, q)) continue;
    places.push({ id: pl.id, primary: pl.title || pl.id, secondary: pl.type });
  }
  places.sort((a, b) => a.primary.localeCompare(b.primary, 'de'));

  const hofs: SearchResultRow[] = [];
  for (const h of db.hofObjects.values()) {
    const row = toHofRow(h, db);
    if (!matchesHofSearch(row, q)) continue;
    hofs.push({ id: row.id, primary: row.addr || row.id, secondary: row.villageTitle });
  }
  hofs.sort((a, b) => a.primary.localeCompare(b.primary, 'de'));

  return { persons, families, sources, places, hofs };
}
