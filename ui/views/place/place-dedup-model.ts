// ui/views/place/place-dedup-model.ts — Massen-Dedup-Ansicht für Orte (Spec 20 §1.7 [K]
// "Massen-Dedup", Spec 11 §9.2, ADR-v9-45). Baut auf dem Kern-Finder `findPlaceDuplicates`
// auf (keine eigene Gruppen-Logik) und ergänzt nur die UI-seitige Gewinner-VORSCHLAGS-
// Anzeige (Verwendungszahl → Koordinaten → Notiz → kleinste ID, geteilt mit dem Höfe-
// Pendant über `pickWinnerId`, ui/shell/curation-dedup.ts) — der Nutzer kann den
// Vorschlag jederzeit ändern (§9.2: "Vorschlag, nicht bindend").
import type { Database, Event, PlaceId } from '../../../core/model/types';
import type { PlaceContext, PlaceObject } from '../../../core/places';
import { findPlaceDuplicates, eventPlaceId } from '../../../core/places';
import { pickWinnerId, type DedupCandidateMeta } from '../../shell/curation-dedup';

export interface PlaceDedupMember {
  id: PlaceId;
  title: string;
}

export interface PlaceDedupGroup {
  /** Stabiler Schlüssel für `{#each}` (die kleinste Mitglieds-id, deterministisch). */
  key: string;
  members: PlaceDedupMember[];
  /** Gewinner-VORSCHLAG (Heuristik) — der Nutzer wählt das tatsächliche Ziel selbst aus. */
  suggestedWinnerId: PlaceId;
}

/** Verwendungszahl je PlaceId — wie oft `eventPlaceId(ev, ctx) === id` über alle Events. */
function usageCounts(ids: readonly PlaceId[], events: readonly Event[], ctx: PlaceContext): Map<PlaceId, number> {
  const counts = new Map<PlaceId, number>(ids.map((id) => [id, 0]));
  for (const ev of events) {
    const id = eventPlaceId(ev, ctx);
    if (id != null && counts.has(id)) counts.set(id, counts.get(id)! + 1);
  }
  return counts;
}

/**
 * Baut die Massen-Dedup-Gruppen (Spec 11 §9.2): Kandidatengruppen aus `findPlaceDuplicates`
 * + je einem Gewinner-Vorschlag. Deterministisch bei gleicher Eingabe (TST-3-Analog auf
 * UI-Ebene — reine Funktion).
 */
export function buildPlaceDedupGroups(db: Database, ctx: PlaceContext, events: readonly Event[]): PlaceDedupGroup[] {
  const groups = findPlaceDuplicates(db.placeObjects, 'places');
  const labelOf = (id: PlaceId): string => db.placeObjects.get(id)?.title || id;

  return groups
    .map((g) => {
      const ids = g.ids as PlaceId[];
      const usage = usageCounts(ids, events, ctx);
      const meta = new Map<PlaceId, DedupCandidateMeta>(
        ids.map((id) => {
          const po: PlaceObject | undefined = db.placeObjects.get(id);
          return [
            id,
            {
              usage: usage.get(id) ?? 0,
              hasCoords: !!po && po.lat != null && po.long != null,
              hasNote: !!po?.note,
            },
          ];
        }),
      );
      const members: PlaceDedupMember[] = ids
        .map((id) => ({ id, title: labelOf(id) }))
        .sort((a, b) => a.title.localeCompare(b.title, 'de'));
      return {
        key: ids.slice().sort()[0],
        members,
        suggestedWinnerId: pickWinnerId(ids, meta),
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}
