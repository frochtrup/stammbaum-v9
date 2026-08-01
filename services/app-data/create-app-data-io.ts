// services/app-data/create-app-data-io.ts — verdrahtet das B1-Bündel mit den ECHTEN
// Plattform-Adaptern (für app/). Tests importieren stattdessen AppDataSyncService direkt
// mit Attrappen (analog create-places-file-io.ts, ADR-v9-20).
//
// EIGENER PickerAdapter (dritte Instanz neben Genealogie-Datei und orte.json): ein
// app-data.json-Öffnen darf weder den GEDCOM- noch den Orte-Picker-State berühren.
import { InputFilePickerAdapter } from '../file';
import type { PickerAdapter } from '../file';
import { LocalStorageDeviceIdProvider } from '../places';
import { IdbProjectsStore } from '../research/index';
import type { ProjectsStore } from '../research/index';
import { IdbValConfigStore } from '../validate';
import type { ValConfigStore } from '../validate';
import { IdbAppDataStore } from './idb-app-data-store';
import { AppDataSyncService } from './app-data-sync-service';
import { AppDataProjectsStore } from './app-data-projects-store';
import { AppDataValConfigStore } from './app-data-val-config-store';
import { AppDataTourStore, type TourStore } from './app-data-tour-store';
import type { AppDataStore } from './types';

export interface AppDataIO {
  store: AppDataStore;
  sync: AppDataSyncService;
  picker: PickerAdapter;
}

export function createAppDataIO(): AppDataIO {
  const store = new IdbAppDataStore();
  return {
    store,
    // Dieselbe Geräte-ID wie orte.json (derselbe localStorage-Schlüssel) — es IST dasselbe
    // Gerät; zwei Kennungen wären zwei Wahrheiten über dieselbe Tatsache.
    sync: new AppDataSyncService(store, new LocalStorageDeviceIdProvider(), { now: () => Date.now() }),
    picker: new InputFilePickerAdapter(),
  };
}

/**
 * Die Regel-Konfiguration aus dem B1-Bündel (BL-180) — mit dem alten, gerätelokalen
 * Store als einmaliger Übernahme-Quelle. Aufrufer (Baum-Ansicht, Qualitäts-Dashboard)
 * kennen weiterhin nur den `ValConfigStore`-Vertrag; DIESE Fabrik ist der einzige Ort,
 * an dem steht, wo die Konfiguration tatsächlich wohnt.
 */
export function createValConfigStore(io: AppDataIO = createAppDataIO()): ValConfigStore {
  return new AppDataValConfigStore(io.sync, new IdbValConfigStore());
}

/**
 * Die Forschungsprojekte aus dem B1-Bündel (BL-239) — mit dem alten, gerätelokalen
 * Store als einmaliger Übernahme-Quelle. Exakt dieselbe Bauart wie
 * `createValConfigStore` darüber: die UI kennt nur den `ProjectsStore`-Vertrag, DIESE
 * Fabrik ist der einzige Ort, an dem steht, wo die Projekte tatsächlich wohnen.
 */
export function createProjectsStore(io: AppDataIO = createAppDataIO()): ProjectsStore {
  return new AppDataProjectsStore(io.sync, new IdbProjectsStore());
}

/**
 * Der „Rundgang gesehen"-Merker aus dem B1-Bündel (BL-213) — dieselbe Bauart wie die
 * beiden Fabriken darüber, nur ohne Altspeicher: die Information entsteht in v9 zum
 * ersten Mal.
 */
export function createTourStore(io: AppDataIO = createAppDataIO()): TourStore {
  return new AppDataTourStore(io.sync);
}
