// tests/services/app-data-tour-store.test.ts — „Erstnutzer-Rundgang gesehen" im
// B1-Bündel (Spec 30 §2.2, BL-213, ADR-v9-190). Bauform wie
// `app-data-projects-store.test.ts` daneben: In-Memory-Attrappe statt IndexedDB (TST-3).
//
// Der Merker liegt bewusst im MITREISENDEN Bündel, nicht gerätelokal: wer den Rundgang
// auf dem iPad gesehen hat, braucht ihn auf dem Mac nicht noch einmal. v8 legte
// dieselbe Information in `localStorage` — dieselbe Bauform wie das Hof-Sidecar aus
// Altlast §7.
import { describe, expect, it } from 'vitest';
import {
  AppDataSyncService,
  AppDataTourStore,
  APP_DATA_SCHEMA_VERSION,
  type AppDataStore,
  type AppDataWrapper,
} from '../../services/app-data/index';

class MemoryAppDataStore implements AppDataStore {
  constructor(public wrapper: AppDataWrapper | null = null) {}
  async load(): Promise<AppDataWrapper | null> {
    return this.wrapper;
  }
  async save(w: AppDataWrapper): Promise<void> {
    this.wrapper = w;
  }
}

function svcOf(store: AppDataStore): AppDataSyncService {
  return new AppDataSyncService(store, { deviceId: () => 'geraet-A' }, { now: () => 1_700_000_000 });
}

describe('AppDataTourStore (BL-213)', () => {
  it('meldet „noch nicht gesehen" für ein leeres Bündel', async () => {
    expect(await new AppDataTourStore(svcOf(new MemoryAppDataStore())).isDone()).toBe(false);
  });

  it('merkt sich „gesehen" und liest es zurück', async () => {
    const store = new MemoryAppDataStore();
    const tour = new AppDataTourStore(svcOf(store));

    await tour.markDone();

    expect(await tour.isDone()).toBe(true);
    expect(store.wrapper?.sections.tour).toEqual({ done: true });
    expect(store.wrapper?.schemaVersion).toBe(APP_DATA_SCHEMA_VERSION);
  });

  it('lässt die übrigen Abschnitte des Bündels unberührt', async () => {
    // Der Merker ist eine EIGENE Merge-Einheit — ein Rundgang darf niemandes
    // Regel-Konfiguration überschreiben (Abschnittsgrenze aus ADR-v9-173).
    const store = new MemoryAppDataStore({
      schemaVersion: APP_DATA_SCHEMA_VERSION,
      rev: 3,
      device: 'geraet-B',
      ts: 1,
      sections: { exportPrefs: { format: 'ged551', anonymize: true } },
    });

    await new AppDataTourStore(svcOf(store)).markDone();

    expect(store.wrapper?.sections.exportPrefs).toEqual({ format: 'ged551', anonymize: true });
    expect(store.wrapper?.sections.tour).toEqual({ done: true });
  });
});
