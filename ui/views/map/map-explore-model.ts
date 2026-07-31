// ui/views/map/map-explore-model.ts — Datenmodell des Orts-Explorationspanels der
// Karte-Lens (BL-210, Spec 20 §1.9; v8-Orakel `_showExplorationPanel`,
// `legacy-v8/ui-views-map.js:399`).
//
// KEINE eigene Zähl-/Sammel-Logik. Ein Marker der Karte ist entweder ein PlaceObject
// oder ein HofObject (beide teilen den `placeId`-Schlüsselraum in `PlacePoint`, s.
// map-model.ts `placesWithCoords`) — für beide Fälle existiert bereits genau eine
// Quelle, die „wer war hier, wann, in welcher Rolle" beantwortet:
//   Ort → `buildPlaceContemporaries` (Ortszeitgenossen, ADR-v9-78 Punkt 5)
//   Hof → `buildHofDetail(...).residents` (Bewohner/Eigentümer, Spec 21 §10j)
// Diese Datei übersetzt nur beide auf EINE Zeilenform (INV-UI-4). Eine dritte,
// karten-eigene Personen-Sammlung wäre exakt die Doppel-Quelle, die dieses Projekt
// anderswo schon zweimal bezahlt hat.
//
// On-Demand wie die Steckbrief-Sektion: gerechnet wird erst, wenn ein Marker geklickt
// wurde — an Knotenpunkt-Orten sind es hunderte Zeilen.
import type { Database } from '../../../core/model/types';
import type { PlaceContext } from '../../../core/places';
import { placeDisplayName } from '../../../core/places';
import { buildPlaceContemporaries } from '../place/place-detail-model';
import { buildHofDetail } from '../hof/hof-detail-model';

/** Eine Zeile des Panels: eine Person mit einem Ereignis AN diesem Marker. */
export interface MapExploreRow {
  key: string;
  personId: string;
  personName: string;
  year: number | null;
  /** Ereignis-/Rollen-Label ("Geburt", "Wohnsitz", "Eigentümer" …). */
  label: string;
  /** Zusatz-Kontext: beim Ort der Hof-Name (falls das Ereignis an einem Hof hängt),
   *  beim Hof die Rolle (Bewohner/Eigentümer). `null` = nichts zu zeigen. */
  detail: string | null;
}

export interface MapExploreModel {
  /** `place` = Dorf/Verwaltungsort, `hof` = Hof — bestimmt das Sprungziel „Steckbrief". */
  kind: 'place' | 'hof';
  id: string;
  title: string;
  rows: MapExploreRow[];
}

/**
 * Baut das Panel-Modell für einen geklickten Marker. Gibt `null` zurück, wenn die Id in
 * keinem der beiden Register liegt (definierter Fallback, Spec 21 §5 — nie ein stiller
 * Abbruch, die aufrufende View zeigt dann einfach kein Panel).
 */
export function buildMapExplore(db: Database, ctx: PlaceContext, id: string): MapExploreModel | null {
  const place = db.placeObjects.get(id);
  if (place) {
    return {
      kind: 'place',
      id,
      // Anzeigename über den Chokepoint, nie `pl.title` direkt (INV-UI-14) — dieselbe
      // Regel wie beim Marker-Tooltip selbst (map-model.ts).
      title: placeDisplayName(place),
      rows: buildPlaceContemporaries(db, ctx, id).map((r) => ({
        key: r.key,
        personId: r.personId,
        personName: r.personName,
        year: r.year,
        label: r.label,
        detail: r.hofLabel,
      })),
    };
  }

  const hof = db.hofObjects.get(id);
  if (hof) {
    const detail = buildHofDetail(db, ctx, id);
    return {
      kind: 'hof',
      id,
      // `HofObject` hat kein `title` — der angezeigte Hof-„Name" ist `addrs[0].value`
      // (Spec 20 §1.8). Fallback auf die Id, damit nie eine leere Kopfzeile entsteht.
      title: hof.addrs[0]?.value || hof.id,
      rows: (detail?.residents ?? []).map((r) => ({
        key: r.key,
        personId: r.personId,
        personName: r.personName,
        year: r.year,
        label: r.label,
        detail: r.role,
      })),
    };
  }

  return null;
}
