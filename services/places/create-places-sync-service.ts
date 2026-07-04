// services/places/create-places-sync-service.ts — verdrahtet PlacesSyncService mit den
// ECHTEN Plattform-Adaptern (für app/ui). Tests importieren stattdessen PlacesSyncService
// direkt mit gemockten Adaptern (analog create-file-service.ts / ADR-v9-15).

import { PlacesSyncService } from './places-sync-service';
import { IdbPlacesStore } from './idb-places-store';
import { LocalStorageDeviceIdProvider } from './device-id-adapter';
import type { Clock } from './types';

const systemClock: Clock = { now: () => Date.now() };

export function createPlacesSyncService(): PlacesSyncService {
  return new PlacesSyncService(new IdbPlacesStore(), new LocalStorageDeviceIdProvider(), systemClock);
}
