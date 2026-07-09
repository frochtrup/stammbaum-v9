// ui/views/hof/hof-list-model.ts — reine Aufbereitung der Höfe-Liste (Spec 20 §1.8
// [K]: "Hof-Liste (aus Events aufgelöst, numerisch sortiert), Detail mit Bewohnern
// chronologisch"). Liest AUSSCHLIESSLICH db.hofObjects + db.placeObjects (id-basiert).
import type { Database, Event, PlaceId, HofId } from '../../../core/model/types';
import type { HofObject, PlaceContext } from '../../../core/places';
import { isEnrichedHof, hasReference } from '../../../core/places';

export interface HofRow {
  id: HofId;
  /** Aktuellste/erste Adressbezeichnung (Formular-Anzeige — Periodengerechtheit ist
   * Sache des Steckbriefs, hier reicht die Listen-Kurzform). */
  addr: string;
  villageId: PlaceId;
  villageTitle: string;
  hasCoords: boolean;
  /** ADR-v9-44/Spec 11 §9.1: `false` heißt "ohne Zusatzangaben" (Pille). */
  enriched: boolean;
}

/** Beide Kurations-Abschnitte der Hauptliste (Spec 20 §1.8 [K] Referenz-Filter, ADR-v9-46). */
export interface HofListSections {
  referenced: HofRow[];
  unreferenced: HofRow[];
}

/**
 * Numerischer Sortier-Schlüssel: die führende Zahl (Hausnummer) einer Adresse, sonst
 * +Infinity (Adressen ohne führende Zahl sortieren ans Ende, s. Spec 20 §1.8 "numerisch
 * sortiert" — gemeint ist die Hausnummer, nicht der komplette String alphabetisch).
 */
export function houseNumberOf(addr: string): number {
  const m = addr.match(/^\D*(\d+)/);
  return m ? parseInt(m[1], 10) : Number.POSITIVE_INFINITY;
}

export function toRow(h: HofObject, db: Database): HofRow {
  const village = db.placeObjects.get(h.villageId);
  const addr = h.addrs[0]?.value ?? '';
  return {
    id: h.id,
    addr,
    villageId: h.villageId,
    villageTitle: village?.title || h.villageId,
    hasCoords: h.lat != null && h.long != null,
    enriched: isEnrichedHof(h),
  };
}

/**
 * Textmatch über Adresse + Dorf-Titel (Spec 20 §1.8 [K]).
 * EXPORTIERT für die globale Suche (ui/views/search/global-search-model.ts,
 * Spec 20 §1.1 [K], ADR-v9-24) — kein zweiter, abweichender Hof-Matcher
 * (ADR-v9-18-Lehre "eine Extraktionsfunktion statt Drift").
 */
export function matchesSearch(row: HofRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${row.addr} ${row.villageTitle}`.toLowerCase().includes(q);
}

/** Baut + sortiert die Hof-Zeilen: numerisch nach Hausnummer, dann alphabetisch nach Adresse. */
export function buildHofRows(db: Database, query = ''): HofRow[] {
  return Array.from(db.hofObjects.values())
    .map((h) => toRow(h, db))
    .filter((row) => matchesSearch(row, query))
    .sort((a, b) => {
      const na = houseNumberOf(a.addr);
      const nb = houseNumberOf(b.addr);
      if (na !== nb) return na - nb;
      return a.addr.localeCompare(b.addr, 'de');
    });
}

/**
 * Referenz-Filter (Spec 20 §1.8 [K], ADR-v9-46) — analog `buildPlaceListSections`:
 * partitioniert die Zeilen nach `hasReference` in Hauptliste (`referenced`) und
 * separaten "Ohne Bezug"-Abschnitt (`unreferenced`, weiterhin voll editierbar/löschbar).
 */
export function buildHofListSections(
  db: Database,
  ctx: PlaceContext,
  events: readonly Event[],
  query = '',
): HofListSections {
  const rows = buildHofRows(db, query);
  const referenced: HofRow[] = [];
  const unreferenced: HofRow[] = [];
  for (const row of rows) {
    (hasReference(row.id, events, ctx) ? referenced : unreferenced).push(row);
  }
  return { referenced, unreferenced };
}
