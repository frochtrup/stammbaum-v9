// services/places/index.ts — öffentliche API des orte.json-Browser-Spiegels + der
// Resolve-Wiring-Orchestrierung (Spec 14 §6, Spec 11 §2, Spec 30 §2.1/§4).

export { PlacesSyncService } from './places-sync-service';
export type { LoadedPlaces, ConflictWarning, ReconcileResult } from './places-sync-service';
export { createPlacesSyncService } from './create-places-sync-service';
export { applyPlaceResolution } from './apply-resolution';
export type { ApplyResolutionResult } from './apply-resolution';
export { IdbPlacesStore } from './idb-places-store';
export { LocalStorageDeviceIdProvider } from './device-id-adapter';
export { PLACES_SCHEMA_VERSION } from './types';
export type {
  PlacesFileWrapper,
  PlacesStore,
  DeviceIdProvider,
  Clock
} from './types';
