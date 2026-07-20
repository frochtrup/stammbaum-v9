// ui/views/hof/hof-review-model.ts — "Hof-Zuweisungen prüfen"-Review (Spec 20 §1.8 [K],
// Spec 11 §6). Sammelt ALLE Events der Datenbank in eine flache, owner-annotierte Liste
// und ruft den EINEN Kern-Klassifikator `resolveEvents()` auf — keine eigene Review-
// Logik in der UI-Schicht (ADR-v9-18-Lehre: Chokepoints/Kern-Funktionen wiederverwenden,
// nicht parallel neu bauen).
import type { Database, Event, PlaceId } from '../../../core/model/types';
import type { HofObjects, ReviewItem, ReviewClass } from '../../../core/places';
import { resolveEvents } from '../../../core/places';
// collectAllEvents/ownerLabelFor/OwnerRef leben seit 2026-07-16 geteilt in ui/shell
// (INV-UI-4) — die Orts-Review (Klasse P) braucht exakt dieselbe Sammlung, und die
// review[].index→Event-Invariante darf nur EINE Quelle haben, s. dortiger Kommentar.
import { collectAllEvents, ownerLabelFor, type OwnerRef } from '../../shell/review-events';

/**
 * Die Hof-Review kennt NUR A/C/D (Spec 20 §1.8) — `P` entsteht ausschließlich im
 * PLACE-Pfad (`resolve.ts`: zwei gleichnamige Orte, Event OHNE `addr`, also ohne jeden
 * Hof-Bezug) und hat hier keine Bedeutung: die angebotenen Hof-Aktionen passen auf ein
 * Orts-Problem nicht. Bis 2026-07-16 war dieses Feld `ReviewClass` (inkl. `P`) und
 * `buildHofReview` reichte P-Items ungefiltert durch — sichtbar wurde es erst, als
 * svelte-check die Lücke im `klassLabel`-Record von `HofReview.svelte` meldete (P fehlte
 * dort zu Recht, das Label rendert ungeschützt → leere Klassen-Spalte).
 */
export type HofReviewClass = Exclude<ReviewClass, 'P'>;

export interface HofReviewRow {
  index: number;
  klass: HofReviewClass;
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

  // Klasse P gehört in die Orts-, nicht die Hof-Review (Spec 20 §1.8) — s. HofReviewClass.
  const hofItems = result.review.filter((item: ReviewItem): item is ReviewItem & { klass: HofReviewClass } => item.klass !== 'P');

  const rows: HofReviewRow[] = hofItems.map((item) => {
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
