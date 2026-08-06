// ui/shell/load-gramps-text.ts — die GRAMPS-Schwester von load-gedcom-text.ts (BL-139).
//
// Dieselbe Lade-Orchestrierung wie beim GEDCOM-Import, nur der Parser unterscheidet sich:
//   parseXMLText -> orte.json laden -> applyPlaceResolution -> ggf. reconcileAndSave ->
//   appState.loadGrampsDoc().
//
// Der `applyPlaceResolution`-Schritt IST BL-141 (ADR-v9-114 D3, String-Weg): die
// GRAMPS-Projektion (BL-140) liefert `event.place` als String (placeobj → ptitle); der
// bestehende, format-agnostische Orts-/Hof-Auflösungsdienst bindet daraus `placeId`/`hofId`
// — exakt derselbe Dienst und Pfad wie beim GEDCOM-Import (kein zweiter Ortscode). Die volle
// placeobj-Hierarchie (Typ/Koordinaten/placeref-Kette) bleibt Passthrough bis BL-143.
//
// Reine Orchestrierung (kein Kern/keine Identitätsauflösung selbst) — lebt in ui/shell, weil
// sie den AppState-Chokepoint direkt aufruft (INV-ARCH-1, Schale -> Dienste). Der
// GRAMPS-Text ist bereits ENTPACKT (der Picker gunzip-t, s. picker-adapter.ts).
import { parseXMLText } from '../../core/interop';
import { applyPlaceResolution, mergeGrampsPlaces } from '../../services/places';
import type { AppState } from './app-state.svelte';
import type { PlacesPersister } from './places-persister';
import type { LoadGedcomTextResult } from './load-gedcom-text';

/**
 * Lade-Pipeline für EINEN GRAMPS-XML-Text-String (bereits entpackt):
 * parseXMLText -> orte.json -> applyPlaceResolution (BL-141) -> ggf. reconcileAndSave ->
 * appState.loadGrampsDoc(). Wirft bei Parse-Fehlern (Aufrufer fängt/zeigt sie an).
 */
export async function loadGrampsText(
  xml: string,
  fileName: string,
  appState: AppState,
  persister: PlacesPersister,
): Promise<LoadGedcomTextResult> {
  const parsed = parseXMLText(xml);

  // BL-143: parseXMLText hat die NATIVEN placeObjects/hofObjects aus den `<placeobj>`-Records
  // der Datei gefüllt (Quelle der Wahrheit). Mit dem persistierten orte.json MERGEN statt
  // überschreiben — sonst gingen Datei-Hierarchie/Koordinaten verloren. Der Merge übernimmt
  // aus orte.json nur, was die Datei nicht hält (datei-fremde/gebootete Höfe, app-privater
  // shortName); für den Rest gewinnt der native Datei-Stand.
  const loaded = await persister.load();
  const merged = mergeGrampsPlaces(
    { placeObjects: parsed.db.placeObjects, hofObjects: parsed.db.hofObjects },
    { placeObjects: loaded.placeObjects, hofObjects: loaded.hofObjects },
  );
  parsed.db.placeObjects = merged.placeObjects;
  parsed.db.hofObjects = merged.hofObjects;

  const resolution = applyPlaceResolution(parsed.db);

  let placesNotice = '';
  if (resolution.hofObjectsGrew || resolution.placeObjectsGrew) {
    const persisted = await persister.persist(parsed.db.placeObjects, parsed.db.hofObjects);
    parsed.db.placeObjects = persisted.placeObjects;
    parsed.db.hofObjects = persisted.hofObjects;
    placesNotice = persisted.notice;
  }

  appState.loadGrampsDoc(parsed.db, fileName, parsed.doc);

  // Wie im GEDCOM-Pfad (ADR-v9-224): der Autoritäts-Satz gilt formatunabhängig — er ist
  // eine Aussage über Ortswissen, nicht über eine Dateiform.
  appState.alignPlaceTexts();

  return { placesNotice };
}
