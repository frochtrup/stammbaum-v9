// ui/shell/places-persister.ts — kapselt PlacesSyncService + baseRev-Tracking (Spec 30 §4).
//
// Der EINE Ort, an dem der orte.json-Spiegel geladen UND gespeichert wird — sowohl vom
// Import-Pfad (load-gedcom-text) als auch von den Orts-/Hof-Edit-Kommandos (app-state):
// beide teilen dieselbe `baseRev`, damit reconcileAndSave keine falschen Konflikte meldet
// und Edits nach dem Import auf der richtigen Revision aufsetzen. Behebt Befund 1 /
// task_a82678c1: savePlace/saveHof/deletePlace/deleteHof/mergePlace persistieren jetzt
// nach orte.json, statt nur im Speicher zu leben (sonst würde der Auto-Seed die Dublette
// beim nächsten Laden neu anlegen).
import type { PlaceObject, HofObject } from '../../core/places';
import type { PlacesSyncService, LoadedPlaces } from '../../services/places';

const UNION_MERGE_NOTICE =
  'Orts-/Hofwissen wurde mit einem anderen Gerät zusammengeführt (kein Datenverlust).';
const SCHEMA_TOO_NEW_NOTICE =
  'Orts-/Hofwissen stammt von einer neueren App-Version — nicht gespeichert (Nur-Lese-Schutz).';

export interface PlacesPersistResult {
  /** Nutzer-Hinweis bei Konflikt (union-merge / schema-too-new), sonst ''. */
  notice: string;
  /** Ergebnis-Maps (bei union-merge ggf. angereichert) — der Aufrufer übernimmt sie. */
  placeObjects: Map<string, PlaceObject>;
  hofObjects: Map<string, HofObject>;
}

export interface PlacesPersister {
  /** Lädt den orte.json-Spiegel und merkt sich dessen Revision als baseRev. */
  load(): Promise<LoadedPlaces>;
  /** Persistiert den aktuellen Orts-/Hof-Stand (reconcileAndSave); aktualisiert baseRev. */
  persist(
    placeObjects: Map<string, PlaceObject>,
    hofObjects: Map<string, HofObject>,
  ): Promise<PlacesPersistResult>;
}

export function createPlacesPersister(sync: PlacesSyncService): PlacesPersister {
  let baseRev = 0;
  return {
    async load() {
      const loaded = await sync.loadPlaces();
      baseRev = loaded.rev;
      return loaded;
    },
    async persist(placeObjects, hofObjects) {
      const res = await sync.reconcileAndSave(placeObjects, hofObjects, baseRev);
      // Auch bei schema-too-new die remote rev übernehmen — der nächste Versuch baut darauf auf.
      baseRev = res.rev;
      const notice =
        res.warning?.kind === 'union-merge'
          ? UNION_MERGE_NOTICE
          : res.warning?.kind === 'schema-too-new'
            ? SCHEMA_TOO_NEW_NOTICE
            : '';
      return { notice, placeObjects: res.placeObjects, hofObjects: res.hofObjects };
    },
  };
}
