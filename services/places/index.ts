// services/places/index.ts — öffentliche API des orte.json-Browser-Spiegels + der
// Resolve-Wiring-Orchestrierung (Spec 14 §6, Spec 11 §2, Spec 30 §2.1/§4).

export { PlacesSyncService } from './places-sync-service';
export type { LoadedPlaces, ConflictWarning, ReconcileResult, SyncBase } from './places-sync-service';
export { createPlacesSyncService } from './create-places-sync-service';
export {
  applyPlaceResolution,
  deletePlaceCascade,
  deleteHofCascade,
  renameHofAddrInEvents,
  relinkHofVillageInEvents,
} from './apply-resolution';
export { mergeGrampsPlaces } from './merge-gramps-places';
export type { GrampsPlaceState } from './merge-gramps-places';
export type { ApplyResolutionResult } from './apply-resolution';
export { IdbPlacesStore } from './idb-places-store';
export { LocalStorageDeviceIdProvider } from './device-id-adapter';
export { PLACES_SCHEMA_VERSION } from './types';
export type {
  PlacesFileWrapper,
  PlacesStore,
  PlacesFileHandleStore,
  DeviceIdProvider,
  Clock
} from './types';

// orte.json Datei-Ein-/Ausgang (ADR-v9-70, Spec 14 §6) — "Bytes rein"/"Bytes raus" für
// den IDB-Spiegel, GETRENNT vom Genealogie-Dateihandling (services/file).
export { IdbPlacesFileHandleStore } from './idb-places-file-handle-store';
export { createPlacesFileIO } from './create-places-file-io';
export type { PlacesFileIO } from './create-places-file-io';
export { parsePlacesFileWrapper, serializePlacesFileWrapper } from './places-file-wrapper';
export { exportPlacesFile } from './export-places-file';

// Nominatim-Geocoding (BL-130, Spec 20 §1.7) — Plattform-`fetch` hinter mockbarem Adapter.
export {
  geocodePlace,
  batchGeocodePlaces,
  browserGeocodeDeps,
  NOMINATIM_BASE,
  NOMINATIM_RATE_MS,
  type GeocodeDeps,
  type BatchProgress,
} from './geocode-service';
