// services/places/export-places-file.ts — orte.json Export (Bytes raus, ADR-v9-70,
// Spec 14 §6). Liest den ROHEN orte.json-Wrapper direkt über PlacesStore.load() — NICHT
// über PlacesSyncService.loadPlaces(), das Arrays bereits in Maps entpackt und den
// Wrapper (schemaVersion/rev/device/ts) verwirft. Für den Export wird exakt der
// gespeicherte Wrapper serialisiert, unverändert (kein neuer rev-Bump — Export
// verändert den IDB-Spiegel nicht, er liest ihn nur).
//
// Läuft durch DASSELBE Export-Rohr wie die Genealogie-Datei (INV-FILE-2-Analogie,
// FileService.exportToFile) — kein Sonderpfad, kein neuer Adapter-Typ (ADR-v9-70).

import type { FileService } from '../file/file-service';
import type { SaveResult } from '../file/types';
import type { PlacesFileHandleStore, PlacesStore } from './types';
import { PLACES_SCHEMA_VERSION } from './types';
import { serializePlacesFileWrapper } from './places-file-wrapper';

const PLACES_FILENAME = 'orte.json';
const PLACES_MIME_TYPE = 'application/json';

/**
 * Exportiert den aktuellen orte.json-IDB-Spiegel-Stand als Datei (Tier 1 in-place, falls
 * ein Handle im `handleStore` gemerkt ist, sonst Tier 2 Share/Download — die Tier-Wahl
 * bleibt vollständig FileService.exportToFile's Sache, INV-FILE-3). Kein gespeicherter
 * Stand (frischer Start, nie etwas gespeichert) → exportiert einen leeren Wrapper statt
 * zu werfen (ein leeres orte.json ist ein gültiges, wenn auch uninteressantes Ergebnis).
 */
export async function exportPlacesFile(
  fileService: FileService,
  placesStore: PlacesStore,
  handleStore: PlacesFileHandleStore
): Promise<SaveResult> {
  const wrapper = (await placesStore.load()) ?? {
    schemaVersion: PLACES_SCHEMA_VERSION,
    rev: 0,
    device: '',
    ts: 0,
    placeObjects: [],
    hofObjects: []
  };
  const text = serializePlacesFileWrapper(wrapper);
  const handle = (await handleStore.load()) ?? undefined;

  const result = await fileService.exportToFile(text, PLACES_FILENAME, PLACES_MIME_TYPE, { handle });

  // Ein NEUES Handle für orte.json entsteht aktuell nur über den Import-Pfad (der
  // PickerAdapter liefert bei FS-Access-fähigen Plattformen ein Handle mit dem gewählten
  // File zurück, s. ui/shell/places-file-import.ts) — exportToFile selbst erwirbt nie ein
  // neues Handle (kein showSaveFilePicker-Adapter, ADR-v9-70 "kein neuer Adapter-Typ").
  // War bereits ein Handle bekannt UND Tier 1 war erfolgreich, ist es unverändert im
  // Store — dieser Aufruf ist dann ein günstiges No-op, keine zusätzliche Schreiblast.
  if (result.ok && result.tier === 'fs-handle' && handle !== undefined) {
    await handleStore.save(handle);
  }

  return result;
}
