// services/app-data/index.ts — öffentliche Fläche des B1-Bündels (`app-data.json`,
// Spec 30 §2.2/§2.3, ADR-v9-134/-173, BL-180).
export * from './types';
export { AppDataSyncService, type AppDataBase, type Clock, type DeviceIdProvider } from './app-data-sync-service';
export { parseAppDataWrapper, serializeAppDataWrapper } from './app-data-wrapper';
export { IdbAppDataStore } from './idb-app-data-store';
export {
  createAppDataIO,
  createEntryTemplatesStore,
  createProjectsStore,
  createValConfigStore,
  createTourStore,
  type AppDataIO,
} from './create-app-data-io';
export { AppDataValConfigStore } from './app-data-val-config-store';
export { AppDataProjectsStore } from './app-data-projects-store';
export {
  AppDataEntryTemplatesStore,
  type EntryTemplatesStore,
} from './app-data-entry-templates-store';
export { AppDataTourStore, type TourStore } from './app-data-tour-store';
export {
  exportAppDataFile,
  importAppDataFile,
  APP_DATA_FILENAME,
  type ImportAppDataResult,
} from './export-app-data-file';
