// ui/shell/map-focus.ts — DER EINE Sprung zur Karte-Lens (ADR-v9-78 Punkt 4, INV-UI-3/4).
//
// Vormals lebte diese Reihenfolge nur in `CoordIndicator.svelte`. Seit die Mini-Karte im
// Ort-/Hof-Steckbrief denselben Sprung anbietet (ADR-v9-150), gibt es zwei Auslöser für
// EIN Verhalten — und damit die klassische Drift-Gefahr (belegt: `.person-detail__geo-link`
// /`.family-detail__geo-link` mussten für dieselbe Regel zweimal getrennt gefixt werden).
// Deshalb hier EINMAL, nicht je Komponente nachgebaut.
import type { ViewState } from './view-state.svelte';
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
  viewState: ViewState,
  coords: { lat: number; long: number } | null | undefined,
  focusId: string | null | undefined,
  onNavigateLens?: (lens: LensId) => void,
): void {
  if (!coords) return;
  viewState.setMapCoordFocus(coords);
  if (focusId) viewState.setCurrent('lensPlaceFocus', focusId);
  onNavigateLens?.('map');
}
