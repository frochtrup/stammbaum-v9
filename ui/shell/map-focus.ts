// ui/shell/map-focus.ts — DER EINE Sprung zur Karte-Lens (ADR-v9-78 Punkt 4, INV-UI-3/4).
//
// Vormals lebte diese Reihenfolge nur in `CoordIndicator.svelte`. Seit die Mini-Karte im
// Ort-/Hof-Steckbrief denselben Sprung anbietet (ADR-v9-150), gibt es zwei Auslöser für
// EIN Verhalten — und damit die klassische Drift-Gefahr (belegt: `.person-detail__geo-link`
// /`.family-detail__geo-link` mussten für dieselbe Regel zweimal getrennt gefixt werden).
// Deshalb hier EINMAL, nicht je Komponente nachgebaut.
// Der Parameter ist `PlacesNav`, nicht `ViewState`: die Orts-/Hof-Views werden von zwei
// Programmen gezeigt (Spec 22), und der Sprung ist eine Fähigkeit des Wirts (D6). Fehlt
// `setMapCoordFocus`, passiert nichts — genau wie ohne Koordinaten. `ViewState` erfüllt
// `PlacesNav`, für das Hauptprogramm ändert sich damit nichts.
import type { PlacesNav } from './places-host';
import type { LensId } from './lens-model';

/**
 * Zentriert die Karte-Lens auf `coords` und wechselt dorthin.
 *
 * Setzt IMMER den Roh-Koordinaten-Slot (`setMapCoordFocus`) — Event-/Objekt-Koordinaten
 * sind oft präziser als ein kuratierter Marker (Spec 11 §5). `focusId` ist optional und
 * dient NUR der zusätzlichen Marker-Hervorhebung, nicht dem Sprung selbst; der Sprung
 * funktioniert auch ohne aufgelöstes Place-/Hof-Objekt (ADR-v9-78 Nachtrag).
 *
 * Ohne `coords` passiert nichts (kein Ziel → kein Sprung).
 */
export function focusOnMap(
  viewState: PlacesNav,
  coords: { lat: number; long: number } | null | undefined,
  focusId: string | null | undefined,
  onNavigateLens?: (lens: LensId) => void,
): void {
  if (!coords || !viewState.setMapCoordFocus) return;
  viewState.setMapCoordFocus(coords);
  if (focusId) viewState.setCurrent('lensPlaceFocus', focusId);
  onNavigateLens?.('map');
}
