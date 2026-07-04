// tests/services/mock-places-store.ts — gemockte PlacesStore/DeviceIdProvider/Clock-
// Implementierungen (Spec 32 §5 "Plattform-Adapter mockbar"). Keine echte IndexedDB/kein
// localStorage — reine In-Memory-Fakes, analog tests/services/mock-adapters.ts (Baumuster
// ADR-v9-15). Damit ist PlacesSyncService headless testbar, ohne je eine echte
// Plattform-API zu berühren.

import { vi } from 'vitest';
import type { Clock, DeviceIdProvider, PlacesFileWrapper, PlacesStore } from '../../services/places/types';

/** In-Memory-PlacesStore: hält höchstens EINEN Wrapper (spiegelt den festen IDB-Key). */
export function createMockPlacesStore(initial: PlacesFileWrapper | null = null): PlacesStore & {
  _peek(): PlacesFileWrapper | null;
} {
  let current: PlacesFileWrapper | null = initial;
  return {
    load: vi.fn(async () => current),
    save: vi.fn(async (wrapper: PlacesFileWrapper) => {
      current = wrapper;
    }),
    _peek: () => current
  };
}

export function createMockDeviceId(id: string): DeviceIdProvider {
  return { deviceId: () => id };
}

export function createMockClock(initialNow: number): Clock & { advance(byMs: number): void } {
  let now = initialNow;
  return {
    now: () => now,
    advance(byMs: number) {
      now += byMs;
    }
  };
}
