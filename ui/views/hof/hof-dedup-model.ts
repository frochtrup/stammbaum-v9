// ui/views/hof/hof-dedup-model.ts — Massen-Dedup-Ansicht für Höfe (Spec 20 §1.8 [K]
// "Massen-Dedup", Spec 11 §9.2, ADR-v9-45). Analog place-dedup-model.ts, auf
// `findPlaceDuplicates(items, 'farms')` aufbauend.
import type { Database, Event, HofId } from '../../../core/model/types';
import type { PlaceContext, HofObject } from '../../../core/places';
import { findPlaceDuplicates, eventHofId, hofEnrichmentLevel, isReviewed, placeDisplayName } from '../../../core/places';
import type { EnrichmentLevel } from '../../../core/places';
import { pickWinnerId, type DedupCandidateMeta } from '../../shell/curation-dedup';

export interface HofDedupMember {
  id: HofId;
  addr: string;
  /** Anreicherungs-GRAD (Spec 11 §9.1, ADR-v9-191) — bei JEDEM Mitglied sichtbar. Eigene
   * Hof-Schwelle, s. `hofEnrichmentLevel`: „ausführlich" heißt hier „mehr als die
   * massenhaft gesetzte Koordinate". */
  level: EnrichmentLevel;
  /** Prüf-Marker (ADR-v9-191) — zweite, unabhängige Achse. */
  reviewed: boolean;
}

export interface HofDedupGroup {
  key: string;
  villageTitle: string;
  members: HofDedupMember[];
  suggestedWinnerId: HofId;
}

/** Verwendungszahl je HofId — wie oft `eventHofId(ev, ctx) === id` über alle Events. */
function usageCounts(ids: readonly HofId[], events: readonly Event[], ctx: PlaceContext): Map<HofId, number> {
  const counts = new Map<HofId, number>(ids.map((id) => [id, 0]));
  for (const ev of events) {
    const id = eventHofId(ev, ctx);
    if (id != null && counts.has(id)) counts.set(id, counts.get(id)! + 1);
  }
  return counts;
}

/** Baut die Massen-Dedup-Gruppen für Höfe (Spec 11 §9.2), analog `buildPlaceDedupGroups`. */
export function buildHofDedupGroups(db: Database, ctx: PlaceContext, events: readonly Event[]): HofDedupGroup[] {
  const groups = findPlaceDuplicates(db.hofObjects, 'farms');
  const addrOf = (id: HofId): string => db.hofObjects.get(id)?.addrs[0]?.value || id;

  return groups
    .map((g) => {
      const ids = g.ids as HofId[];
      const usage = usageCounts(ids, events, ctx);
      const meta = new Map<HofId, DedupCandidateMeta>(
        ids.map((id) => {
          const h: HofObject | undefined = db.hofObjects.get(id);
          return [
            id,
            {
              usage: usage.get(id) ?? 0,
              hasCoords: !!h && h.lat != null && h.long != null,
              hasNote: !!h?.note,
            },
          ];
        }),
      );
      const levelOf = (id: HofId): EnrichmentLevel => {
        const h = db.hofObjects.get(id);
        return h ? hofEnrichmentLevel(h) : 'none';
      };
      const reviewedOf = (id: HofId): boolean => {
        const h = db.hofObjects.get(id);
        return h ? isReviewed(h) : false;
      };
      const members: HofDedupMember[] = ids
        .map((id) => ({ id, addr: addrOf(id), level: levelOf(id), reviewed: reviewedOf(id) }))
        .sort((a, b) => a.addr.localeCompare(b.addr, 'de'));
      const firstVillageId = db.hofObjects.get(ids[0])?.villageId;
      const villageTitle =
        (firstVillageId && placeDisplayName(db.placeObjects.get(firstVillageId))) || firstVillageId || '';
      return {
        key: ids.slice().sort()[0],
        villageTitle,
        members,
        suggestedWinnerId: pickWinnerId(ids, meta),
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}
