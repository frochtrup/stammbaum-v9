// ui/views/hof/hof-list-model.ts — reine Aufbereitung der Höfe-Liste (Spec 20 §1.8
// [K]: "Hof-Liste (aus Events aufgelöst, numerisch sortiert), Detail mit Bewohnern
// chronologisch"). Liest AUSSCHLIESSLICH db.hofObjects + db.placeObjects (id-basiert).
import type { Database, Event, Person, PlaceId, HofId } from '../../../core/model/types';
import type { HofObject, PlaceContext } from '../../../core/places';
import { isEnrichedHof, hasReference, placeDisplayName, eventHofId, eventYear } from '../../../core/places';
import { isEventPresent } from '../../../core/model';
import { groupByKey, type EventGroup } from '../../shell/event-grouping';
import { hofRole } from './hof-detail-model';

export interface HofRow {
  id: HofId;
  /** = `id` — für `EventsByType.svelte`s generischen `{key: string}`-Zeilen-Kontrakt
   *  (INV-UI-4, dieselbe Komponente wie PlaceDetail/SourceDetail, kein eigener
   *  Gruppen+Header-Renderer für die Höfe-Liste). */
  key: HofId;
  /** Aktuellste/erste Adressbezeichnung (Formular-Anzeige — Periodengerechtheit ist
   * Sache des Steckbriefs, hier reicht die Listen-Kurzform). */
  addr: string;
  villageId: PlaceId;
  villageTitle: string;
  hasCoords: boolean;
  coords: { lat: number; long: number } | null;
  /** ADR-v9-44/Spec 11 §9.1: `false` heißt "ohne Zusatzangaben" (Pille). */
  enriched: boolean;
  /** Distinkte Bewohner (RESI/CENS/Lebensereignis) an diesem Hof (BL-205) — `0`, wenn keine
   *  Belegung übergeben wurde. Über den `eventHofId`-Chokepoint, wie der Steckbrief. */
  residents: number;
  /** Distinkte Eigentümer (PROP) an diesem Hof (BL-205). */
  owners: number;
  /** Jahres-Spanne der Belegung „min–max" (BL-205) — leer, wenn keine datierten Ereignisse. */
  yearSpan: string;
  /** Notiz-Marker (📝, BL-205) — `true`, wenn `hof.note` nicht leer ist. */
  hasNote: boolean;
}

/** Aggregierte Belegungs-Kennzahlen je Hof (BL-205). */
export interface HofOccupancy {
  residents: Set<string>;
  owners: Set<string>;
  minYear: number | null;
  maxYear: number | null;
}

/** Reihenfolge der Ereignisse einer Person mit ihrem REALEN Tag (wie `collectResident`). */
function hofEventEntries(p: Person): [Event, string][] {
  return [
    [p.birth, 'BIRT'],
    [p.chr, 'CHR'],
    [p.death, 'DEAT'],
    [p.buri, 'BURI'],
    ...p.events.map((ev): [Event, string] => [ev, ev.type || 'EVEN']),
  ];
}

/**
 * Belegung je Hof (BL-205): distinkte Bewohner/Eigentümer + Jahres-Spanne, EINMAL für den
 * ganzen Bestand über den `eventHofId`-Chokepoint (Spec 11 §5) — dieselbe Rollen-Regel
 * (`hofRole`, PROP = Eigentümer) wie der Steckbrief, keine zweite Klassifikation (INV-UI-4).
 */
export function countHofOccupancy(db: Database, ctx: PlaceContext): Map<HofId, HofOccupancy> {
  const map = new Map<HofId, HofOccupancy>();
  const get = (id: HofId): HofOccupancy => {
    let o = map.get(id);
    if (!o) {
      o = { residents: new Set(), owners: new Set(), minYear: null, maxYear: null };
      map.set(id, o);
    }
    return o;
  };
  for (const p of db.individuals.values()) {
    for (const [ev, tag] of hofEventEntries(p)) {
      if (!isEventPresent(ev)) continue;
      const hofId = eventHofId(ev, ctx);
      if (hofId == null) continue;
      const o = get(hofId);
      (hofRole(tag) === 'Eigentümer' ? o.owners : o.residents).add(p.id);
      const y = eventYear(ev);
      if (y != null) {
        o.minYear = o.minYear == null ? y : Math.min(o.minYear, y);
        o.maxYear = o.maxYear == null ? y : Math.max(o.maxYear, y);
      }
    }
  }
  return map;
}

function formatYearSpan(o: HofOccupancy | undefined): string {
  if (!o || o.minYear == null || o.maxYear == null) return '';
  return o.minYear === o.maxYear ? String(o.minYear) : `${o.minYear}–${o.maxYear}`;
}

/** Beide Kurations-Abschnitte der Hauptliste (Spec 20 §1.8 [K] Referenz-Filter, ADR-v9-46). */
export interface HofListSections {
  referenced: HofRow[];
  unreferenced: HofRow[];
}

/**
 * Numerischer Sortier-Schlüssel: die erste Zahl (Hausnummer) einer Adresse, sonst
 * +Infinity (Adressen ohne Zahl sortieren ans Ende).
 */
export function houseNumberOf(addr: string): number {
  const m = addr.match(/^\D*(\d+)/);
  return m ? parseInt(m[1], 10) : Number.POSITIVE_INFINITY;
}

/** Straßenname-Anteil (Adresse ohne die Hausnummer und alles danach), getrimmt — der
 *  alphabetische Sortier-/Gruppierungsschlüssel VOR der Hausnummer (Nutzer-Vorgabe
 *  2026-07-10: erst alphabetisch nach Straße, dann numerisch nach Hausnummer, nicht
 *  umgekehrt). Adressen ohne führenden Nicht-Zahl-Anteil (z. B. "9 Hauptstraße") liefern
 *  die volle Adresse als Schlüssel — es gibt dort keinen sinnvollen "Straßenname vor der
 *  Zahl" zu isolieren. */
export function streetNameOf(addr: string): string {
  const m = addr.match(/^(\D*)\d/);
  const name = m ? m[1].trim() : '';
  return name || addr.trim();
}

export function toRow(h: HofObject, db: Database, occupancy?: Map<HofId, HofOccupancy>): HofRow {
  const village = db.placeObjects.get(h.villageId);
  const addr = h.addrs[0]?.value ?? '';
  const hasCoords = h.lat != null && h.long != null;
  const o = occupancy?.get(h.id);
  return {
    id: h.id,
    key: h.id,
    addr,
    villageId: h.villageId,
    // Dorf-Anzeigename über den einzigen erlaubten Weg (Spec 11 §5, INV-UI-14).
    villageTitle: village ? placeDisplayName(village) : h.villageId,
    hasCoords,
    coords: hasCoords ? { lat: h.lat as number, long: h.long as number } : null,
    enriched: isEnrichedHof(h),
    residents: o?.residents.size ?? 0,
    owners: o?.owners.size ?? 0,
    yearSpan: formatYearSpan(o),
    hasNote: h.note.trim() !== '',
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

/** Baut + sortiert die Hof-Zeilen: alphabetisch nach Straßenname, dann numerisch nach
 *  Hausnummer (Nutzer-Vorgabe 2026-07-10 — vorher umgekehrt: numerisch zuerst, was
 *  gleiche Hausnummern verschiedener Straßen nebeneinander stellte, statt Straßen
 *  zusammenzuhalten). Voller Adress-String bleibt als letzter Tie-Breaker. */
export function buildHofRows(db: Database, query = '', occupancy?: Map<HofId, HofOccupancy>): HofRow[] {
  return Array.from(db.hofObjects.values())
    .map((h) => toRow(h, db, occupancy))
    .filter((row) => matchesSearch(row, query))
    .sort((a, b) => {
      const streetCmp = streetNameOf(a.addr).localeCompare(streetNameOf(b.addr), 'de');
      if (streetCmp !== 0) return streetCmp;
      const na = houseNumberOf(a.addr);
      const nb = houseNumberOf(b.addr);
      if (na !== nb) return na - nb;
      return a.addr.localeCompare(b.addr, 'de');
    });
}

/**
 * Gruppiert bereits sortierte Hof-Zeilen nach Dorf (Nutzer-Fund 2026-07-10) — nutzt DIE
 * EINE Gruppierungs-Funktion (`groupByKey`, INV-UI-4, bereits für PlaceDetail/SourceDetail
 * etabliert) statt eine eigene zu bauen. Dörfer alphabetisch (de), Höfe je Dorf bleiben in
 * ihrer bestehenden Reihenfolge (numerisch nach Hausnummer, s. `buildHofRows`).
 */
export function groupHofRowsByVillage(rows: HofRow[]): EventGroup<HofRow>[] {
  return groupByKey(rows, (row) => row.villageTitle);
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
  const rows = buildHofRows(db, query, countHofOccupancy(db, ctx));
  const referenced: HofRow[] = [];
  const unreferenced: HofRow[] = [];
  for (const row of rows) {
    (hasReference(row.id, events, ctx) ? referenced : unreferenced).push(row);
  }
  return { referenced, unreferenced };
}
