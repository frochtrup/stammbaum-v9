// ui/views/place/place-dedup-model.ts — Massen-Dedup-Ansicht für Orte (Spec 20 §1.7 [K]
// "Massen-Dedup", Spec 11 §9.2, ADR-v9-45). Baut auf dem Kern-Finder `findPlaceDuplicates`
// auf (keine eigene Gruppen-Logik) und ergänzt nur zwei UI-seitige Zutaten: den
// Gewinner-VORSCHLAG (geteilt mit dem Höfe-Pendant über `pickWinnerId`,
// ui/shell/curation-dedup.ts) und die REIHENFOLGE der Gruppen. Der Nutzer kann den
// Vorschlag jederzeit ändern (§9.2: "Vorschlag, nicht bindend").
import type { Database, Event, PlaceId } from '../../../core/model/types';
import type { PlaceContext, PlaceObject, PlaceRegistry } from '../../../core/places';
import { isCuratedPlace, findPlaceDuplicates, eventPlaceId, buildFullPlaceName, placeEnrichmentLevel, isReviewed, eventSpanne } from '../../../core/places';
import type { EnrichmentLevel } from '../../../core/places';
import { pickWinnerId, type DedupCandidateMeta } from '../../shell/curation-dedup';

export interface PlaceDedupMember {
  id: PlaceId;
  title: string;
  /** Volle Verwaltungskette (ADR-v9-50) — bei `conflict`-Gruppen der einzige Weg, gleichnamige
   * Orte für den Nutzer unterscheidbar zu machen (z. B. „Arpke, Burgdorf, …" vs. „Arpke, Uetze, …"). */
  fullName: string;
  /** Anreicherungs-GRAD (Spec 11 §9.1, ADR-v9-191) — hier bei JEDEM Mitglied sichtbar, nicht
   * nur beim leeren: „ausführlich" gegen „wenig ergänzt" ist genau die Frage, die der Nutzer
   * beim Zusammenführen stellt. Kein Einfluss auf die Gewinner-Heuristik. */
  level: EnrichmentLevel;
  /** Prüf-Marker (ADR-v9-191) — die zweite, unabhängige Achse: hat ein Mensch über dieses
   * Mitglied entschieden? Aus dem Inhalt nicht ableitbar, deshalb eigene Angabe. */
  reviewed: boolean;
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
  /** Transitive Reichweite der Gruppe ([ADR-v9-296]): wie viele Ereignisse hängen unter
   * ihrem reichweitenstärksten Mitglied? Ordnet die Liste — schwerste Zusammenführung
   * zuerst. KEIN Gewinner-Kriterium (s. `reachCounts`). */
  reach: number;
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
 * Transitive REICHWEITE je PlaceId ([ADR-v9-296]): wie viele Ereignisse hängen unter diesem
 * Knoten — direkt oder über die periodengerechte Zugehörigkeitskette?
 *
 * WOZU. Sie ordnet die Gruppen, sie wählt KEINEN Gewinner. Eine Verwaltungseinheit bindet
 * fast nie ein Ereignis direkt (das hängt am Dorf); `usage` ist dort für alle Mitglieder 0
 * und sagt nichts darüber, wie schwer eine Zusammenführung wiegt. Gemessen am Realbestand:
 * unter `Deutschland` hängen 1172 Ereignisse, unter `Deutscher Bund` 8, unter
 * `Norddeutscher Bund` 0 — und geordnet wurde die Liste bis dahin nach dem ID-String.
 *
 * NICHT als Gewinner-Kriterium, und das ist der Punkt: [ADR-v9-225] hat begründet, dass
 * eine Mengenzahl kein Argument FÜR ein Objekt ist (die Ereignisse folgen dem Gewinner
 * ohnehin). Eine Ebene höher gälte das genauso — die Reichweite beantwortet „welche
 * Zusammenführung sehe ich zuerst an", nicht „welches Objekt überlebt".
 *
 * EIN Durchlauf über die Ereignisse (je Ereignis einmal die Kette hoch), nicht je Kandidat
 * ein Scan über alle Ereignisse.
 */
function reachCounts(events: readonly Event[], ctx: PlaceContext): Map<PlaceId, number> {
  const counts = new Map<PlaceId, number>();
  for (const ev of events) {
    const leaf = eventPlaceId(ev, ctx);
    if (leaf == null) continue;
    for (const id of ctx.places.enclosureIdsAsOf(leaf, eventSpanne(ev))) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Menge der DATIERTEN Perioden eines Orts über BEIDE Zeitachsen — Zugehörigkeit
 * (`enclosedBy`) und Namen (`pnames`), [ADR-v9-296]. Bewusst die Menge, nicht der Anteil:
 * ein Land ohne Elter hätte 0/0, und ein Anteil bestrafte den Reicheren.
 */
function datedPeriods(po: PlaceObject | undefined): number {
  if (!po) return 0;
  const datiert = (x: { from: number | null; to: number | null }) => x.from != null || x.to != null;
  return po.enclosedBy.filter(datiert).length + po.pnames.filter(datiert).length;
}

/**
 * Baut die Massen-Dedup-Gruppen (Spec 11 §9.2): Kandidatengruppen aus `findPlaceDuplicates`
 * + je einem Gewinner-Vorschlag. Deterministisch bei gleicher Eingabe (TST-3-Analog auf
 * UI-Ebene — reine Funktion).
 */
export function buildPlaceDedupGroups(db: Database, ctx: PlaceContext, events: readonly Event[]): PlaceDedupGroup[] {
  const groups = findPlaceDuplicates(db.placeObjects, 'places');
  const reach = reachCounts(events, ctx);
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
              // ADR-v9-225: das erste Kriterium des Vorschlags — s. `DedupCandidateMeta`.
              curated: !!po && isCuratedPlace(po),
              // ADR-v9-296: die vorhandene Kennzahl IST jetzt die zweite Sprosse; die
              // früheren Einzelfragen `hasCoords`/`hasNote` sind zwei ihrer sieben Facetten.
              level: po ? placeEnrichmentLevel(po) : 'none',
              datiertePerioden: datedPeriods(po),
              usage: usage.get(id) ?? 0,
            },
          ];
        }),
      );
      const levelOf = (id: PlaceId): EnrichmentLevel => {
        const po = db.placeObjects.get(id);
        return po ? placeEnrichmentLevel(po) : 'none';
      };
      const reviewedOf = (id: PlaceId): boolean => {
        const po = db.placeObjects.get(id);
        return po ? isReviewed(po) : false;
      };
      const typeOf = (id: PlaceId): string => db.placeObjects.get(id)?.type ?? '';
      const members: PlaceDedupMember[] = ids
        .map((id) => ({
          id,
          title: titleOf(id),
          fullName: fullNameOf(id),
          level: levelOf(id),
          reviewed: reviewedOf(id),
          type: typeOf(id),
        }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName, 'de'));
      return {
        key: ids.slice().sort()[0],
        members,
        suggestedWinnerId: pickWinnerId(ids, meta),
        conflict: g.conflict === true,
        typeMismatch: g.typeMismatch === true,
        reach: ids.reduce((max, id) => Math.max(max, reach.get(id) ?? 0), 0),
      };
    })
    // Schwerste Zusammenführung zuerst ([ADR-v9-296]) — bei Gleichstand der stabile
    // Schlüssel, damit die Reihenfolge deterministisch bleibt (TST-3-Analog).
    .sort((a, b) => b.reach - a.reach || a.key.localeCompare(b.key));
}
