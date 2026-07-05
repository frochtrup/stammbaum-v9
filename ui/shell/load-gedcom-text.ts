// ui/shell/load-gedcom-text.ts — EINE gemeinsame GEDCOM-Text-Lade-Pipeline (Spec 20
// §1.2 [K]/[S]: "GEDCOM lokal öffnen" UND "Demo-Modus"), extrahiert aus
// ImportButton.svelte (Behebung des in dieser Aufgabe gefundenen Befunds: die Pipeline
// parseGedcom -> orte.json laden -> applyPlaceResolution -> ggf. reconcileAndSave ->
// appState.loadDatabase() stand komplett inline in handleClick() und hätte sich beim
// Demo-Ladeweg dupliziert — INV-UI-4-Lehre "wiederkehrendes Muster, eine Quelle" gilt
// nicht nur für CSS/Komponenten, sondern genauso für Lade-Orchestrierung).
//
// Reine Orchestrierung (kein Kern, keine Identitätsauflösung/Parsen selbst — die läuft
// in core/interop.parseGedcom + services/places): nimmt EINEN GEDCOM-Text-String,
// unabhängig davon ob er aus einem echten Datei-Picker (ImportButton) oder einem
// mitgelieferten Demo-Asset (DemoButton, fetch('./demo.ged')) stammt, und führt sie bis
// appState.loadDatabase() durch. Lebt in ui/shell (nicht services/), weil sie den
// AppState-Kommando-Chokepoint direkt aufruft (Spec 02 §3: "Ein Kommando -> Chokepoints
// neu lesen -> Views aktualisieren sich", EIN Pfad) — services/ selbst kennt AppState
// nicht (Abhängigkeitsrichtung Schale -> Dienste, INV-ARCH-1).
import { parseGedcom } from '../../core/interop';
import { applyPlaceResolution } from '../../services/places';
import type { PlacesSyncService } from '../../services/places';
import type { AppState } from './app-state.svelte';

/** Hinweis-Text für Orts-/Hofwissen-Konflikte beim Reconcile (Spec 30 §4 LP-9). */
export interface LoadGedcomTextResult {
  /** Leerer String = kein Hinweis nötig. */
  placesNotice: string;
}

/**
 * Führt die gemeinsame Lade-Pipeline für EINEN GEDCOM-Text-String durch:
 * parseGedcom -> orte.json laden -> applyPlaceResolution -> ggf. reconcileAndSave ->
 * appState.loadDatabase(). Wirft bei Parse-Fehlern (Aufrufer fängt/zeigt sie an, analog
 * dem bisherigen try/catch in ImportButton.svelte).
 */
export async function loadGedcomText(
  text: string,
  fileName: string,
  appState: AppState,
  placesSync: PlacesSyncService
): Promise<LoadGedcomTextResult> {
  const parsed = parseGedcom(text);

  const loaded = await placesSync.loadPlaces();
  parsed.db.placeObjects = loaded.placeObjects;
  parsed.db.hofObjects = loaded.hofObjects;

  const resolution = applyPlaceResolution(parsed.db);

  let placesNotice = '';
  if (resolution.hofObjectsGrew || resolution.placeObjectsGrew) {
    const reconciled = await placesSync.reconcileAndSave(
      parsed.db.placeObjects,
      parsed.db.hofObjects,
      loaded.rev
    );
    parsed.db.placeObjects = reconciled.placeObjects;
    parsed.db.hofObjects = reconciled.hofObjects;
    if (reconciled.warning?.kind === 'union-merge') {
      placesNotice = 'Orts-/Hofwissen wurde mit einem anderen Gerät zusammengeführt (kein Datenverlust).';
    } else if (reconciled.warning?.kind === 'schema-too-new') {
      placesNotice = 'Orts-/Hofwissen stammt von einer neueren App-Version — nicht gespeichert (Nur-Lese-Schutz).';
    }
  }

  appState.loadDatabase(parsed.db, fileName);

  return { placesNotice };
}
