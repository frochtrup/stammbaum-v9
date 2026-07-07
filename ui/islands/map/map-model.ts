// ui/islands/map/map-model.ts — reine, DOM-freie Datenaufbereitung der Karten-Insel
// (Spec 20 §1.9 [S] "Interaktive Karte (3 Modi: Orte · Personen-Cluster · Migrationen
// nach Epoche eingefärbt/animiert)", ADR-v9-25). Framework-frei, testbar als reine
// Funktion Modell->Positionen (Spec 32 §2: "Imperative Inseln werden über ihre
// Layout-Berechnung unit-getestet, nicht über gerenderte Pixel").
//
// INV-ARCH-1: keine Kern-Logik hier (keine Identitätsauflösung/Parsen) — liest
// AUSSCHLIESSLICH über die core/places-Chokepoints (eventCoords/eventYear) und
// db.placeObjects/db.hofObjects direkt (Spec 11 §5, analog place-list-model.ts:
// "pl.lat != null && pl.long != null" statt eines eigenen Aggregats).
//
// Verhaltens-Orakel: legacy-v8/ui-views-map.js (_renderOrteModus/_renderPersonModus/
// _renderMigrModus/_MIGR_EPOCHS/_personGeoEvents/_buildMigrLines). Portiert die
// Datenaufbereitung als reine Funktionen; das Leaflet-/SVG-Rendering selbst lebt in
// leaflet-map.ts / svg-fallback-map.ts (Trennung Layout<->Rendering, Spec 02 §5).
//
// Bewusste v9-Abweichung vom Orakel: Koordinaten kommen ausschließlich über
// eventCoords(ev, ctx) (hofObject primär, placeObject sekundär, ev.lati/long
// Fallback — bereits im Chokepoint selbst gestaffelt, Spec 11 §5) — KEIN eigener
// hofObjects-Fallback-Zweig wie im Orakel (_personGeoEvents las hofObjects direkt),
// das wäre ein Chokepoint-Bypass.
import type { Database, Event, Person, PersonId, PlaceId } from '../../../core/model/types';
import type { PlaceContext } from '../../../core/places';
import { eventCoords, eventHofId, eventPlaceId, eventYear, type Coords } from '../../../core/places';

export interface PlacePoint {
  placeId: PlaceId;
  title: string;
  lat: number;
  long: number;
  /** Anzahl unterschiedlicher Personen, die über irgendein Event auf diesen Ort zeigen. */
  personCount: number;
  /** true = Hof (Diamant-Marker im Orakel), false = Dorf/Verwaltungsort (Kreis-Marker). */
  isHof: boolean;
}

/**
 * Epochen-Tabelle nach Geburtsjahr (Orakel: `_MIGR_EPOCHS`, wörtlich übernommene
 * Grenzen + Farben) — exportiert, damit Randjahre (1699/1700, 1799/1800, …) direkt
 * testbar sind (Spec-Auftrag "Epochen-Tabelle als exportierte Konstante").
 */
export interface MigrationEpoch {
  label: string;
  from: number;
  to: number;
  color: string;
}

export const MIGRATION_EPOCHS: readonly MigrationEpoch[] = [
  { label: 'vor 1700', from: 0, to: 1699, color: '#9b7aaa' },
  { label: '1700–1799', from: 1700, to: 1799, color: '#5b9bd5' },
  { label: '1800–1849', from: 1800, to: 1849, color: '#4aaa8a' },
  { label: '1850–1899', from: 1850, to: 1899, color: '#e8a33a' },
  { label: '1900–1949', from: 1900, to: 1949, color: '#e07050' },
  { label: '1950+', from: 1950, to: 9999, color: '#a0a8b0' },
];

/** Fallback-Farbe (Orakel: `#777`) für Personen ohne ermittelbares Geburtsjahr. */
export const MIGRATION_EPOCH_FALLBACK_COLOR = '#777';

/** Ordnet ein Geburtsjahr einer Epoche zu; `null`/`undefined` -> Fallback-Farbe. */
export function migrationEpochColor(birthYear: number | null | undefined): string {
  if (birthYear == null) return MIGRATION_EPOCH_FALLBACK_COLOR;
  for (const e of MIGRATION_EPOCHS) {
    if (birthYear >= e.from && birthYear <= e.to) return e.color;
  }
  return MIGRATION_EPOCH_FALLBACK_COLOR;
}

/**
 * Alle Orte (Dörfer/Verwaltungsorte UND Höfe) mit gesetzten Koordinaten, je mit der
 * Anzahl unterschiedlicher Personen, die irgendein Event dorthin verlinkt haben
 * (Orakel: Marker-Radius/-Farbe nach `place.personIds.size`, hier als Zahl statt
 * fertigem Stil — Rendering-Entscheidung bleibt der Insel-Rendering-Schicht).
 */
export function placesWithCoords(db: Database, ctx: PlaceContext): PlacePoint[] {
  const villageCounts = new Map<PlaceId, Set<PersonId>>();
  const hofCounts = new Map<PlaceId, Set<PersonId>>();

  function countEvent(ev: Event, personId: PersonId): void {
    // Chokepoints (Spec 11 §5): Hof VOR Dorf — ein Event mit Hof-Bezug zählt auf den
    // Hof-Marker, nicht zusätzlich auf den umschließenden Ort (Orakel-Analogie:
    // Marker-Ebenen "Orte" und "Höfe" sind disjunkte Layer, kein Doppelzählen).
    const hofId = eventHofId(ev, ctx);
    if (hofId != null) {
      if (!hofCounts.has(hofId)) hofCounts.set(hofId, new Set());
      hofCounts.get(hofId)!.add(personId);
      return;
    }
    const placeId = eventPlaceId(ev, ctx);
    if (placeId != null) {
      if (!villageCounts.has(placeId)) villageCounts.set(placeId, new Set());
      villageCounts.get(placeId)!.add(personId);
    }
  }

  for (const p of db.individuals.values()) {
    countEvent(p.birth, p.id);
    countEvent(p.chr, p.id);
    countEvent(p.death, p.id);
    countEvent(p.buri, p.id);
    for (const ev of p.events) countEvent(ev, p.id);
  }
  for (const f of db.families.values()) {
    if (f.husband) countEvent(f.marriage, f.husband);
    if (f.wife) countEvent(f.marriage, f.wife);
  }

  const points: PlacePoint[] = [];
  for (const pl of db.placeObjects.values()) {
    if (pl.lat == null || pl.long == null) continue;
    points.push({
      placeId: pl.id,
      title: pl.title || pl.id,
      lat: pl.lat,
      long: pl.long,
      personCount: villageCounts.get(pl.id)?.size ?? 0,
      isHof: false,
    });
  }
  for (const h of db.hofObjects.values()) {
    if (h.lat == null || h.long == null) continue;
    const lastAddr = h.addrs[h.addrs.length - 1]?.value || h.id;
    points.push({
      placeId: h.id,
      title: lastAddr,
      lat: h.lat,
      long: h.long,
      personCount: hofCounts.get(h.id)?.size ?? 0,
      isHof: true,
    });
  }
  return points;
}

export interface BiographyPoint {
  placeId: PlaceId | null;
  /** Anzeigename (Orts-/Hof-Titel wenn auflösbar, sonst der rohe Event-Ort). */
  title: string;
  lat: number;
  long: number;
  date: string;
  /** Rollen-Label (Geburt/Taufe/Tod/Beerdigung/eventType, Orakel: `role`). */
  role: string;
}

function eventRole(ev: Event, fallback: string): string {
  return ev.eventType || fallback;
}

/**
 * Chronologische Geo-Stationen einer Person (Geburt/Taufe/Tod/Beerdigung + alle
 * weiteren Events mit Koordinaten), für den Personen-Modus (Orakel: `_personGeoEvents`).
 * Konsekutive Duplikat-Koordinaten werden NICHT entfernt (anders als `_buildMigrLines`
 * für die Migrations-Linie) — die Biografie-Linie im Personen-Modus zeigt jede Station.
 */
export function personBiographyPoints(db: Database, ctx: PlaceContext, personId: PersonId): BiographyPoint[] {
  const person = db.individuals.get(personId);
  if (!person) return [];

  function toPoint(ev: Event, fallbackRole: string): BiographyPoint | null {
    const coords = eventCoords(ev, ctx);
    if (!coords) return null;
    // Chokepoints (Spec 11 §5): Hof-Titel vor Dorf-Titel vor rohem String.
    const hofId = eventHofId(ev, ctx);
    const placeId = eventPlaceId(ev, ctx);
    const title =
      (hofId != null ? ctx.hofs.byId(hofId)?.addrs.at(-1)?.value : null) ||
      (placeId != null ? ctx.places.byId(placeId)?.title : null) ||
      ev.place ||
      ev.addr ||
      '';
    return { placeId, title, lat: coords.lat, long: coords.long, date: ev.date ?? '', role: eventRole(ev, fallbackRole) };
  }

  const points: BiographyPoint[] = [];
  const birthPt = toPoint(person.birth, 'Geburt');
  if (birthPt) points.push(birthPt);
  const chrPt = toPoint(person.chr, 'Taufe');
  if (chrPt) points.push(chrPt);
  for (const ev of person.events) {
    const pt = toPoint(ev, 'Ereignis');
    if (pt) points.push(pt);
  }
  const deathPt = toPoint(person.death, 'Tod');
  if (deathPt) points.push(deathPt);
  const buriPt = toPoint(person.buri, 'Beerdigung');
  if (buriPt) points.push(buriPt);

  points.sort((a, b) => {
    const ya = a.date.match(/\b(\d{4})\b/)?.[1] ?? '9999';
    const yb = b.date.match(/\b(\d{4})\b/)?.[1] ?? '9999';
    return ya.localeCompare(yb);
  });
  return points;
}

export interface MigrationLine {
  personId: PersonId;
  /** Anzeigename der Person (Orakel-Tooltip "Name (Jahre) Von -> Nach"). */
  personName: string;
  points: { lat: number; long: number }[];
  color: string;
  /** Geburtsjahr, sofern ermittelbar — Sortierschlüssel (Orakel: `_animLines.sort`). */
  birthYear: number | null;
}

/**
 * Migrationslinien aller Personen mit >= 2 unterschiedlichen Geo-Stationen
 * (Orakel: `_buildMigrLines` — konsekutive Koordinaten-Duplikate werden entfernt,
 * damit eine Person, die nie umgezogen ist, keine Nulllinie erzeugt). Farbe nach
 * Geburtsjahr-Epoche (migrationEpochColor). Sortiert nach Geburtsjahr aufsteigend,
 * undatiert ans Ende (Orakel: `year = 9999` als Sortier-Fallback).
 */
export function migrationLines(db: Database, ctx: PlaceContext): MigrationLine[] {
  const lines: MigrationLine[] = [];
  for (const person of db.individuals.values()) {
    const evs = personBiographyPoints(db, ctx, person.id);
    if (evs.length < 2) continue;
    const dedup: Coords[] = [{ lat: evs[0].lat, long: evs[0].long }];
    for (let i = 1; i < evs.length; i++) {
      const prev = dedup[dedup.length - 1];
      if (evs[i].lat !== prev.lat || evs[i].long !== prev.long) {
        dedup.push({ lat: evs[i].lat, long: evs[i].long });
      }
    }
    if (dedup.length < 2) continue;
    const birthYear = eventYear(person.birth);
    lines.push({
      personId: person.id,
      personName: personDisplayName(person),
      points: dedup,
      color: migrationEpochColor(birthYear),
      birthYear,
    });
  }
  lines.sort((a, b) => (a.birthYear ?? 9999) - (b.birthYear ?? 9999));
  return lines;
}

function personDisplayName(p: Person): string {
  const full = `${p.given} ${p.surname}`.trim();
  return full || p.name || p.id;
}
