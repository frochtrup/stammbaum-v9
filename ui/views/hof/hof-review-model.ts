// ui/views/hof/hof-review-model.ts — "Hof-Zuweisungen prüfen"-Review (Spec 20 §1.8 [K],
// Spec 11 §6). Sammelt ALLE Events der Datenbank in eine flache, owner-annotierte Liste
// und ruft den EINEN Kern-Klassifikator `resolveEvents()` auf — keine eigene Review-
// Logik in der UI-Schicht (ADR-v9-18-Lehre: Chokepoints/Kern-Funktionen wiederverwenden,
// nicht parallel neu bauen).
import type { Database, Event, PlaceId } from '../../../core/model/types';
import type { HofObjects, ReviewItem, ReviewClass } from '../../../core/places';
import { resolveEvents } from '../../../core/places';
import { displayName } from '../../shell/person-display';

interface OwnerRef {
  ownerKind: 'person' | 'family';
  ownerId: string;
}

export interface HofReviewRow {
  index: number;
  klass: ReviewClass;
  addr: string;
  eventType: string;
  ownerKind: 'person' | 'family';
  ownerId: string;
  ownerLabel: string;
  /** Bei Klasse C: mehrdeutige Hof-Kandidaten (id + Adress-Label). */
  candidates: { hofId: string; label: string }[];
  /**
   * Dorf-Scope für "Hof anlegen" (Spec 11 §6) — aus der von resolveEvents
   * ZURÜCKGEGEBENEN Event-Kopie gelesen (resolveEvents ist rein und mutiert das
   * Original-Event NICHT, s. Modul-Kommentar). NICHT verwechseln mit
   * flatEvents[index].placeId, das bleibt bis zur echten Aktion unverändert.
   */
  villageId: PlaceId | null;
}

export interface HofReviewResult {
  rows: HofReviewRow[];
  /** Flache Event-Liste in EXAKT der Reihenfolge, die resolveEvents bekam — der
   * Aufrufer (UI-Kommando) braucht sie, um review[].index auf das echte Event
   * zurückzuführen (s. applyHofChoice/applyCreateHof/applyAddVariant unten). */
  flatEvents: Event[];
  owners: OwnerRef[];
}

function ownerLabelFor(db: Database, ref: OwnerRef): string {
  if (ref.ownerKind === 'person') {
    const p = db.individuals.get(ref.ownerId);
    return p ? displayName(p) : '(unbekannte Person)';
  }
  const f = db.families.get(ref.ownerId);
  if (!f) return '(unbekannte Familie)';
  const names = [f.husband, f.wife]
    .filter((id): id is string => id != null)
    .map((id) => db.individuals.get(id))
    .filter((p): p is NonNullable<typeof p> => p != null)
    .map(displayName);
  return names.length ? names.join(' ⚭ ') : 'Familie';
}

/**
 * Baut die flache, owner-annotierte Event-Liste — MUSS mit derselben Reihenfolge und
 * Auswahl arbeiten wie applyHofReviewAction, sonst laufen review[].index und die echten
 * Event-Referenzen auseinander. Reine Sammel-Funktion, keine Auflösung.
 */
function collectAllEvents(db: Database): { events: Event[]; owners: OwnerRef[] } {
  const events: Event[] = [];
  const owners: OwnerRef[] = [];
  const push = (ev: Event, ref: OwnerRef) => {
    events.push(ev);
    owners.push(ref);
  };

  for (const p of db.individuals.values()) {
    push(p.birth, { ownerKind: 'person', ownerId: p.id });
    push(p.chr, { ownerKind: 'person', ownerId: p.id });
    push(p.death, { ownerKind: 'person', ownerId: p.id });
    push(p.buri, { ownerKind: 'person', ownerId: p.id });
    for (const ev of p.events) push(ev, { ownerKind: 'person', ownerId: p.id });
  }
  for (const f of db.families.values()) {
    push(f.engagement, { ownerKind: 'family', ownerId: f.id });
    push(f.marriage, { ownerKind: 'family', ownerId: f.id });
    for (const ev of f.events) push(ev, { ownerKind: 'family', ownerId: f.id });
  }

  return { events, owners };
}

function hofLabel(hofObjects: HofObjects, hofId: string): string {
  return hofObjects.get(hofId)?.addrs[0]?.value ?? hofId;
}

/**
 * Baut das Review (Spec 11 §6, Klassen A/C/D) über ALLE Events der Datenbank.
 * `flatEvents`/`owners` werden mitgeliefert, weil resolveEvents rein ist (kopiert
 * Events) — die UI-Kommandos zum Anwenden einer Aktion müssen auf die ECHTEN,
 * in Person/Family lebenden Event-Objekte zugreifen (s. hof-review-actions.ts).
 */
export function buildHofReview(db: Database): HofReviewResult {
  const { events, owners } = collectAllEvents(db);
  const result = resolveEvents(events, db.placeObjects, db.hofObjects);

  const rows: HofReviewRow[] = result.review.map((item: ReviewItem) => {
    const owner = owners[item.index];
    return {
      index: item.index,
      klass: item.klass,
      addr: item.addr,
      eventType: item.eventType,
      ownerKind: owner.ownerKind,
      ownerId: owner.ownerId,
      ownerLabel: ownerLabelFor(db, owner),
      candidates: item.candidates.map((hofId) => ({ hofId, label: hofLabel(result.hofObjects, hofId) })),
      villageId: result.events[item.index]?.event.placeId ?? null,
    };
  });

  return { rows, flatEvents: events, owners };
}
