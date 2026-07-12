// services/places/create-places-file-io.ts — verdrahtet den orte.json-Datei-Ein-/
// Ausgang mit den ECHTEN Plattform-Adaptern (für app/). Tests importieren stattdessen
// exportPlacesFile()/den Import-Orchestrator direkt mit gemockten Stores/Adaptern
// (analog create-file-service.ts / create-places-sync-service.ts, ADR-v9-15/ADR-v9-20).
//
// EIN eigener PickerAdapter (zweite InputFilePickerAdapter-Instanz, unabhängig von der,
// die FileService für die Genealogie-Datei hält) — ein orte.json-Datei-Öffnen-Vorgang
// darf nie den GEDCOM-Picker-State berühren (ADR-v9-70).

import { IdbPlacesStore } from './idb-places-store';
import { IdbPlacesFileHandleStore } from './idb-places-file-handle-store';
import { InputFilePickerAdapter } from '../file';
import type { PickerAdapter } from '../file';
import type { PlacesFileHandleStore, PlacesStore } from './types';

export interface PlacesFileIO {
  placesStore: PlacesStore;
  handleStore: PlacesFileHandleStore;
  picker: PickerAdapter;
}

export function createPlacesFileIO(): PlacesFileIO {
  return {
    placesStore: new IdbPlacesStore(),
    handleStore: new IdbPlacesFileHandleStore(),
    picker: new InputFilePickerAdapter()
  };
}
