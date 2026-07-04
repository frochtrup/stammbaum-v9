// ui/views/search/global-search-model.ts — reine Kernfunktion der globalen Suche
// (Spec 20 §1.1 [K]: "Globale Suche (erstklassiges Ziel) über Personen/Familien/
// Quellen/Orte, gruppierte Ergebnisse"; Spec 21 §2/§3: "das universelle 'finde
// irgendwas'" — die Command-Palette (⌘K, Desktop) nutzt später denselben Such-Kern,
// daher bewusst eine reine, DOM-/UI-freie Funktion ohne eigenen Zustand).
//
// Wiederverwendung statt Neuerfindung (ADR-v9-18-Lehre "eine Extraktionsfunktion statt
// Drift"): nutzt die bereits vorhandenen, jetzt exportierten `matchesSearch`-Bausteine
// aus person-/family-/source-/place-list-model.ts — KEINE zweite, abweichende
// Text-Match-Implementierung pro Entität.
//
// Scope-Grenze (Spec 20 §1.1 nennt explizit NUR Personen/Familien/Quellen/Orte, NICHT
// Höfe): Höfe werden hier bewusst NICHT durchsucht — offener Punkt für ein mögliches
// ADR, s. Abschlussbericht des Bau-Auftrags, nicht selbst entschieden.
import type { Database } from '../../../core/model/types';
import type { PlaceContext } from '../../../core/places';
import { matchesSearch as matchesPersonSearch } from '../person/person-list-model';
import { matchesSearch as matchesFamilySearch } from '../family/family-list-model';
import { matchesSearch as matchesSourceSearch } from '../source/source-list-model';
import { matchesSearch as matchesPlaceSearch } from '../place/place-list-model';
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
}

function emptyResults(): GroupedSearchResults {
  return { persons: [], families: [], sources: [], places: [] };
}

/** Gesamtzahl aller Treffer über alle Gruppen — praktisch für "keine Treffer"-Leerzustände. */
export function totalResultCount(results: GroupedSearchResults): number {
  return results.persons.length + results.families.length + results.sources.length + results.places.length;
}

/**
 * Durchsucht Personen/Familien/Quellen/Orte der übergebenen Datenbank und liefert
 * gruppierte Ergebnisse (Spec 20 §1.1 [K]). Reine Funktion (db/ctx/query -> Ergebnis),
 * kein eigener Zustand — Command-Palette-tauglich (Spec 21 §3).
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

  return { persons, families, sources, places };
}
