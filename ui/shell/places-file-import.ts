// ui/shell/places-file-import.ts — orte.json Import (Bytes rein, ADR-v9-70, Spec 14 §6).
//
// Lebt in ui/shell (nicht services/), weil dieser Orchestrator den geteilten
// PlacesPersister braucht (ui/shell/places-persister.ts, hält die baseRev — INV-ARCH-1:
// services/ darf nicht aus ui/ importieren, s. load-gedcom-text.ts-Kopf für dasselbe
// Muster beim GEDCOM-Import).
//
// Nutzt PlacesPersister.persist() DIREKT statt PlacesSyncService.reconcileAndSave() ein
// zweites Mal selbst zu orchestrieren: persist() macht bereits GENAU das Nötige — ruft
// reconcileAndSave() mit der vom Persister intern getrackten baseRev auf UND aktualisiert
// diese baseRev danach auf das Ergebnis (das ist der GANZE Zweck des Persisters, s. dessen
// Kopfkommentar "DER EINE Ort, an dem der orte.json-Spiegel geladen UND gespeichert
// wird"). Eine importierte fremde orte.json verhält sich dadurch automatisch "wie ein
// Stand von einem anderen Device" (ADR-v9-70) — dieselbe Union-Merge-/Schema-Gate-Logik,
// kein zweiter, abweichender Reconcile-Pfad (Ein-Invalidierungspfad-Prinzip).

import { parsePlacesFileWrapper } from '../../services/places';
import type { PickerAdapter } from '../../services/file';
import type { PlacesFileHandleStore } from '../../services/places';
import type { PlacesPersister } from './places-persister';
import type { PlaceObject, HofObject } from '../../core/places';

export interface ImportPlacesFileResult {
  /** false = Nutzer hat den Picker abgebrochen (kein Fehler, kein Import). */
  imported: boolean;
  placeObjects?: Map<string, PlaceObject>;
  hofObjects?: Map<string, HofObject>;
  /** Konflikt-/Schema-Hinweis (union-merge / schema-too-new), '' wenn keiner. */
  notice?: string;
}

function toMap<T extends { id: string }>(list: readonly T[]): Map<string, T> {
  return new Map(list.map((item) => [item.id, item]));
}

/**
 * Bytes rein: öffnet den Picker (EIGENE PickerAdapter-Instanz, s. create-places-file-io.ts
 * — berührt nie den GEDCOM-Picker-State), parst den gewählten Text als PlacesFileWrapper
 * (wirft bei kaputtem/fremdem JSON — Aufrufer fängt/zeigt die Meldung, analog
 * loadGedcomText/parseGedcom), merkt ein ggf. mitgeliefertes FS-Handle für künftige
 * In-Place-Exporte (Tier 1), und gleicht den importierten Stand über den geteilten
 * PlacesPersister gegen den lokalen IDB-Spiegel ab. Ergebnis-Maps übernimmt der Aufrufer
 * (appState.replacePlacesAndHofs) — analog wie der GEDCOM-Import-Pfad hofObjects/
 * placeObjects nach resolveEvents() übernimmt.
 */
export async function importPlacesFile(
  picker: PickerAdapter,
  handleStore: PlacesFileHandleStore,
  persister: PlacesPersister
): Promise<ImportPlacesFileResult> {
  const picked = await picker.pick();
  if (!picked) return { imported: false };

  const wrapper = parsePlacesFileWrapper(picked.text);

  if (picked.handle !== undefined) {
    await handleStore.save(picked.handle);
  }

  const merged = await persister.persist(toMap(wrapper.placeObjects), toMap(wrapper.hofObjects));

  return {
    imported: true,
    placeObjects: merged.placeObjects,
    hofObjects: merged.hofObjects,
    notice: merged.notice
  };
}
