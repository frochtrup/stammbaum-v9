// ui/views/place/place-dedup-model.ts — Massen-Dedup-Ansicht für Orte (Spec 20 §1.7 [K]
// "Massen-Dedup", Spec 11 §9.2, ADR-v9-45). Baut auf dem Kern-Finder `findPlaceDuplicates`
// auf (keine eigene Gruppen-Logik) und ergänzt nur die UI-seitige Gewinner-VORSCHLAGS-
// Anzeige (Verwendungszahl → Koordinaten → Notiz → kleinste ID, geteilt mit dem Höfe-
// Pendant über `pickWinnerId`, ui/shell/curation-dedup.ts) — der Nutzer kann den
// Vorschlag jederzeit ändern (§9.2: "Vorschlag, nicht bindend").
import type { Database, Event, PlaceId } from '../../../core/model/types';
import type { PlaceContext, PlaceObject, PlaceRegistry } from '../../../core/places';
import { findPlaceDuplicates, eventPlaceId, buildFullPlaceName, isEnrichedPlace } from '../../../core/places';
import { pickWinnerId, type DedupCandidateMeta } from '../../shell/curation-dedup';

export interface PlaceDedupMember {
  id: PlaceId;
  title: string;
  /** Volle Verwaltungskette (ADR-v9-50) — bei `conflict`-Gruppen der einzige Weg, gleichnamige
   * Orte für den Nutzer unterscheidbar zu machen (z. B. „Arpke, Burgdorf, …" vs. „Arpke, Uetze, …"). */
  fullName: string;
  /** ADR-v9-44/Spec 11 §9.1: `true` = kuratiert/angereichert (weicht vom Seed-Rohzustand ab);
   * `false` → „ohne Zusatzangaben"-Pille, damit der Nutzer im Dedup-Dialog erkennt, welches
   * Mitglied kuratiert ist (Kennzeichnung, kein Einfluss auf die Gewinner-Heuristik, A1). */
  enriched: boolean;
  /** ADR-v9-77: `PlaceObject.type` roh (z. B. „Town"/„District"), leer wenn unklassifiziert.
   * Zeigt dem Nutzer die Kategorisierung jedes Mitglieds direkt im Dedup-Dialog — der häufige
   * Fall „Stadt X" + „Kreis X" wird sonst nur über den vollen Namen sichtbar, wenn überhaupt. */
  type: string;
}

export interface PlaceDedupGroup {
  /** Stabiler Schlüssel für `{#each}` (die kleinste Mitglieds-id, deterministisch). */
  key: string;
  members: PlaceDedupMember[];
  /** Gewinner-VORSCHLAG (Heuristik) — der Nutzer wählt das tatsächliche Ziel selbst aus. */
  suggestedWinnerId: PlaceId;
  /** ADR-v9-50/Spec 11 §8 Restklasse 3: Mitglieder haben widersprüchliche Elternketten —
   * Gruppe kam nur über den gelockerten „gemeinsamer Vorfahre"-Pfad zustande, kein
   * automatischer Gewinner-Vorschlag ohne dass der Nutzer die volle Namenskette gesehen hat. */
  conflict: boolean;
  /** ADR-v9-77: mindestens ein Mitglieder-Paar trägt zwei verschiedene, beide nicht-leere
   * `type`-Werte (z. B. „Stadt Steinfurt" vs. „Kreis Steinfurt") — Warnung, kein Gate. */
  typeMismatch: boolean;
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
  const reg: PlaceRegistry = ctx.places;
  const titleOf = (id: PlaceId): string => db.placeObjects.get(id)?.title || id;
  const fullNameOf = (id: PlaceId): string => buildFullPlaceName(reg, id) || titleOf(id);

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
      const enrichedOf = (id: PlaceId): boolean => {
        const po = db.placeObjects.get(id);
        return po ? isEnrichedPlace(po) : false;
      };
      const typeOf = (id: PlaceId): string => db.placeObjects.get(id)?.type ?? '';
      const members: PlaceDedupMember[] = ids
        .map((id) => ({ id, title: titleOf(id), fullName: fullNameOf(id), enriched: enrichedOf(id), type: typeOf(id) }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName, 'de'));
      return {
        key: ids.slice().sort()[0],
        members,
        suggestedWinnerId: pickWinnerId(ids, meta),
        conflict: g.conflict === true,
        typeMismatch: g.typeMismatch === true,
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}
