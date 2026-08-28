// ui/views/hof/hof-dedup-model.ts — Massen-Dedup-Ansicht für Höfe (Spec 20 §1.8 [K]
// "Massen-Dedup", Spec 11 §9.2, ADR-v9-45). Analog place-dedup-model.ts, auf
// `findPlaceDuplicates(items, 'farms')` aufbauend.
import type { Database, Event, HofId } from '../../../core/model/types';
import type { PlaceContext, HofObject } from '../../../core/places';
import { findPlaceDuplicates, eventHofId, hofEnrichmentLevel, isReviewed, placeDisplayName, isCuratedHof, hofDatedPeriods } from '../../../core/places';
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
  /** Datierte Adressvarianten ([ADR-v9-296]) — die Zeitachse eines Hofs; sichtbar, damit der
   * Vorschlag nachvollziehbar ist. */
  datiertePerioden: number;
}

export interface HofDedupGroup {
  key: string;
  villageTitle: string;
  members: HofDedupMember[];
  suggestedWinnerId: HofId;
  /** Gewicht der Zusammenführung ([ADR-v9-296]) — ordnet die Liste, wählt keinen Gewinner. */
  reach: number;
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
              // ADR-v9-225: das erste Kriterium des Vorschlags — s. `DedupCandidateMeta`.
              // Der Hof-Pfad bekommt es mit, obwohl der gemessene Fall ein Ort war: die
              // Heuristik ist EINE (geteilte Datei), und die Begründung — die Ereignisse
              // folgen ohnehin dem Gewinner — gilt für Höfe wortgleich.
              curated: !!h && isCuratedHof(h),
              // ADR-v9-296: die Kennzahl statt zweier ihrer Facetten. Für Höfe gilt die
              // EIGENE Schwelle (`hofEnrichmentLevel`, ADR-v9-191: „ausführlich" heißt hier
              // „mehr als die massenhaft gesetzte Koordinate") — eine gemeinsame Zahl für
              // zwei verschieden große Feldmengen wäre die falsche Aussage.
              level: h ? hofEnrichmentLevel(h) : 'none',
              // Die Zeitachse eines Hofs sind seine datierten Adressvarianten — `enclosedBy`
              // und `pnames` hat er nicht (Spec 11 §1: Hof ist keine Verwaltungseinheit).
              datiertePerioden: hofDatedPeriods(h),
              usage: usage.get(id) ?? 0,
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
        .map((id) => ({
          id,
          addr: addrOf(id),
          level: levelOf(id),
          reviewed: reviewedOf(id),
          datiertePerioden: hofDatedPeriods(db.hofObjects.get(id)),
        }))
        .sort((a, b) => a.addr.localeCompare(b.addr, 'de'));
      const firstVillageId = db.hofObjects.get(ids[0])?.villageId;
      const villageTitle =
        (firstVillageId && placeDisplayName(db.placeObjects.get(firstVillageId))) || firstVillageId || '';
      return {
        key: ids.slice().sort()[0],
        villageTitle,
        members,
        suggestedWinnerId: pickWinnerId(ids, meta),
        // ADR-v9-296, Ordnung wie bei den Orten: schwerste Zusammenführung zuerst. Beim Hof
        // ist das die DIREKTE Verwendung — er hat keine Kinder, unter ihm hängt nichts.
        // Dieselbe Frage („wie viele Ereignisse bewegt dieser Merge"), zwei Rechenwege.
        reach: ids.reduce((sum, id) => sum + (usage.get(id) ?? 0), 0),
      };
    })
    .sort((a, b) => b.reach - a.reach || a.key.localeCompare(b.key));
}
