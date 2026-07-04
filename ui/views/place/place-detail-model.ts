// ui/views/place/place-detail-model.ts — reiner Orts-Steckbrief (Spec 20 §1.7 [K]:
// "Ereignisse nach Typ, Quellen, … periodengerechte Verwaltungszeitlinie"). SVG-
// Namens-Zeitstrahl + Mini-Karte sind AUSSER SCOPE (imperative Inseln, Spec 20 §1.9/
// §1.10 — anderer Bauabschnitt); hier nur eine textuelle pnames-Liste als Platzhalter.
// Liest AUSSCHLIESSLICH über core-Chokepoints (eventPlaceId) — Ereignisse, die dieses
// PlaceObject referenzieren, werden durch einmaliges Scannen aller Personen-/Familien-
// Events ermittelt (kein v8-artiger `collectPlaces`-Cache nötig für diese Scheibe;
// wird bei Performance-Bedarf ein Folge-Schritt, s. Auftrag "Vereinfachen vor Erfinden").
import type { Citation, Database, Event, PlaceId } from '../../../core/model/types';
import type { PlaceContext, PlaceObject } from '../../../core/places';
import { eventPlaceId, normPlaceName } from '../../../core/places';
import { isEventPresent } from '../../../core/model';
import { displayName, yearPlaceSummary } from '../../shell/person-display';

export interface PlaceEventRow {
  key: string;
  eventType: string;
  label: string;
  summary: string;
  ownerId: string;
  ownerKind: 'person' | 'family';
  ownerLabel: string;
}

export interface PlaceVariantRow {
  value: string;
  from: number | null;
  to: number | null;
}

/**
 * Ein Event, dessen `ev.place`-String zwar zum Namen dieses PlaceObject passt (Titel
 * ODER pnames-Variante), das aber noch KEIN `ev.placeId` trägt (String→PlaceObject
 * verknüpfen, Spec 20 §1.7 [K]). Referenz auf das Event selbst (nicht kopiert) — die
 * Verknüpfung mutiert es über linkEventToPlace(event, placeId) in-place.
 */
export interface UnlinkedEventRow {
  key: string;
  event: Event;
  ownerId: string;
  ownerKind: 'person' | 'family';
  ownerLabel: string;
  eventType: string;
  placeText: string;
}

export interface PlaceDetailModel {
  place: PlaceObject;
  /** Ereignisse, gruppiert nach Typ-Schlüssel (BIRT/DEAT/RESI/…), je periodengerecht sortiert. */
  eventsByType: { type: string; rows: PlaceEventRow[] }[];
  citations: Citation[];
  variants: PlaceVariantRow[];
  /** [Ort, übergeordnet, …] periodengerecht — Fallback ohne Jahr: undatierte Kette. */
  enclosureChain: string[];
  /** String→PlaceObject-Kandidaten (Spec 20 §1.7 [K], Re-Import-Erkennung). */
  unlinkedEvents: UnlinkedEventRow[];
}

function ownerLabelFor(db: Database, kind: 'person' | 'family', id: string): string {
  if (kind === 'person') {
    const p = db.individuals.get(id);
    return p ? displayName(p) : '(unbekannte Person)';
  }
  const f = db.families.get(id);
  if (!f) return '(unbekannte Familie)';
  const names = [f.husband, f.wife]
    .filter((pid): pid is string => pid != null)
    .map((pid) => db.individuals.get(pid))
    .filter((p): p is NonNullable<typeof p> => p != null)
    .map(displayName);
  return names.length ? names.join(' ⚭ ') : 'Familie';
}

function collectEvent(
  ev: Event,
  key: string,
  label: string,
  ownerKind: 'person' | 'family',
  ownerId: string,
  db: Database,
  ctx: PlaceContext,
  targetPlaceId: PlaceId,
  out: PlaceEventRow[],
): void {
  if (!isEventPresent(ev)) return;
  if (eventPlaceId(ev, ctx) !== targetPlaceId) return;
  out.push({
    key,
    eventType: ev.eventType || ev.type || label,
    label,
    summary: yearPlaceSummary(ev, ctx),
    ownerId,
    ownerKind,
    ownerLabel: ownerLabelFor(db, ownerKind, ownerId),
  });
}

const PERSON_SPECIAL_LABELS: Record<string, string> = {
  BIRT: 'Geburt',
  CHR: 'Taufe',
  DEAT: 'Tod',
  BURI: 'Bestattung',
};

const FAMILY_SPECIAL_LABELS: Record<string, string> = {
  ENGA: 'Verlobung',
  MARR: 'Heirat',
};

function collectUnlinked(
  ev: Event,
  key: string,
  ownerKind: 'person' | 'family',
  ownerId: string,
  db: Database,
  namesNorm: Set<string>,
  out: UnlinkedEventRow[],
): void {
  if (!isEventPresent(ev)) return;
  if (ev.placeId != null) return; // bereits verknüpft
  if (!ev.place) return;
  if (!namesNorm.has(normPlaceName(ev.place))) return;
  out.push({
    key,
    event: ev,
    ownerId,
    ownerKind,
    ownerLabel: ownerLabelFor(db, ownerKind, ownerId),
    eventType: ev.eventType || ev.type || 'Ereignis',
    placeText: ev.place,
  });
}

/**
 * Baut den read-only Steckbrief eines PlaceObject. Gibt null zurück, wenn die id im
 * aktuellen Datenbestand fehlt (definierter Fallback, Spec 21 §5).
 */
export function buildPlaceDetail(db: Database, ctx: PlaceContext, placeId: PlaceId): PlaceDetailModel | null {
  const place = db.placeObjects.get(placeId);
  if (!place) return null;

  const rows: PlaceEventRow[] = [];

  for (const p of db.individuals.values()) {
    collectEvent(p.birth, `${p.id}-BIRT`, PERSON_SPECIAL_LABELS.BIRT, 'person', p.id, db, ctx, placeId, rows);
    collectEvent(p.chr, `${p.id}-CHR`, PERSON_SPECIAL_LABELS.CHR, 'person', p.id, db, ctx, placeId, rows);
    collectEvent(p.death, `${p.id}-DEAT`, PERSON_SPECIAL_LABELS.DEAT, 'person', p.id, db, ctx, placeId, rows);
    collectEvent(p.buri, `${p.id}-BURI`, PERSON_SPECIAL_LABELS.BURI, 'person', p.id, db, ctx, placeId, rows);
    p.events.forEach((ev, i) => {
      collectEvent(ev, `${p.id}-ev-${i}`, ev.eventType || ev.type || 'Ereignis', 'person', p.id, db, ctx, placeId, rows);
    });
  }

  for (const f of db.families.values()) {
    collectEvent(f.engagement, `${f.id}-ENGA`, FAMILY_SPECIAL_LABELS.ENGA, 'family', f.id, db, ctx, placeId, rows);
    collectEvent(f.marriage, `${f.id}-MARR`, FAMILY_SPECIAL_LABELS.MARR, 'family', f.id, db, ctx, placeId, rows);
    f.events.forEach((ev, i) => {
      collectEvent(ev, `${f.id}-ev-${i}`, ev.eventType || ev.type || 'Ereignis', 'family', f.id, db, ctx, placeId, rows);
    });
  }

  const byType = new Map<string, PlaceEventRow[]>();
  for (const row of rows) {
    const list = byType.get(row.eventType);
    if (list) list.push(row);
    else byType.set(row.eventType, [row]);
  }
  const eventsByType = Array.from(byType.entries())
    .map(([type, typeRows]) => ({ type, rows: typeRows }))
    .sort((a, b) => a.type.localeCompare(b.type, 'de'));

  // Quellen: alle Zitate der Events, die diesen Ort referenzieren, dedupliziert per sourceId.
  const citationsBySource = new Map<string, Citation>();
  const collectCitations = (evs: Event[]) => {
    for (const ev of evs) {
      if (!isEventPresent(ev)) continue;
      if (eventPlaceId(ev, ctx) !== placeId) continue;
      for (const cit of ev.citations) {
        if (!citationsBySource.has(cit.sourceId)) citationsBySource.set(cit.sourceId, cit);
      }
    }
  };
  for (const p of db.individuals.values()) {
    collectCitations([p.birth, p.chr, p.death, p.buri, ...p.events]);
  }
  for (const f of db.families.values()) {
    collectCitations([f.engagement, f.marriage, ...f.events]);
  }

  const variants: PlaceVariantRow[] = place.pnames.map((pn) => ({ value: pn.value, from: pn.from, to: pn.to }));

  // Undatierte (aktuelle) enclosedBy-Kette — die volle periodengerechte Zeitleiste je
  // Ereignisjahr ist Teil der ausgeklammerten SVG-Zeitleiste (Spec 20 §1.9/§1.10,
  // anderer Bauabschnitt); hier der einfache "Ort, übergeordnet, …"-Steckbrief-Fallback.
  const enclosureChain = ctx.places.enclosureChainAsOf(placeId, null);

  // String→PlaceObject-Kandidaten: Events, deren rohes ev.place zum Titel ODER einer
  // pnames-Variante dieses PlaceObject normalisiert passt, aber noch ohne placeId sind.
  const namesNorm = new Set([place.title, ...place.pnames.map((p) => p.value)].map(normPlaceName).filter(Boolean));
  const unlinkedEvents: UnlinkedEventRow[] = [];
  if (namesNorm.size > 0) {
    for (const p of db.individuals.values()) {
      collectUnlinked(p.birth, `${p.id}-BIRT`, 'person', p.id, db, namesNorm, unlinkedEvents);
      collectUnlinked(p.chr, `${p.id}-CHR`, 'person', p.id, db, namesNorm, unlinkedEvents);
      collectUnlinked(p.death, `${p.id}-DEAT`, 'person', p.id, db, namesNorm, unlinkedEvents);
      collectUnlinked(p.buri, `${p.id}-BURI`, 'person', p.id, db, namesNorm, unlinkedEvents);
      p.events.forEach((ev, i) => collectUnlinked(ev, `${p.id}-ev-${i}`, 'person', p.id, db, namesNorm, unlinkedEvents));
    }
    for (const f of db.families.values()) {
      collectUnlinked(f.engagement, `${f.id}-ENGA`, 'family', f.id, db, namesNorm, unlinkedEvents);
      collectUnlinked(f.marriage, `${f.id}-MARR`, 'family', f.id, db, namesNorm, unlinkedEvents);
      f.events.forEach((ev, i) => collectUnlinked(ev, `${f.id}-ev-${i}`, 'family', f.id, db, namesNorm, unlinkedEvents));
    }
  }

  return {
    place,
    eventsByType,
    citations: Array.from(citationsBySource.values()),
    variants,
    enclosureChain,
    unlinkedEvents,
  };
}
