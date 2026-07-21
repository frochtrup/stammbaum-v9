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
import type { PlacesSyncService, LoadedPlaces, SyncBase } from '../../services/places';

const UNION_MERGE_NOTICE =
  'Orts-/Hofwissen wurde mit einem anderen Gerät zusammengeführt (kein Datenverlust).';
const UNION_MERGE_CONFLICT_NOTICE =
  'Orts-/Hofwissen wurde zusammengeführt — einzelne Einträge waren auf beiden Geräten geändert; hier gilt die Fassung dieses Geräts.';
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
  // Die Basis des Drei-Wege-Merges (BL-82): nicht nur die Revision, sondern der INHALT,
  // aus dem die aktuelle lokale Fassung hervorgegangen ist. Ohne ihn kann der Merge nicht
  // unterscheiden, WELCHE Seite sich geändert hat, und muss raten.
  //
  // Flache Map-Kopie, kein Deep-Clone: Orts-/Hof-Objekte werden ausschließlich per
  // Copy-on-Write ersetzt (ADR-v9-92), nie an Ort und Stelle mutiert — die Kopie der
  // Zuordnung genügt also, um den geladenen Stand einzufrieren. Eine geteilte Map-Referenz
  // dagegen würde jede lokale Änderung stillschweigend in die „Basis" mitschreiben und den
  // Merge glauben lassen, lokal habe sich nichts getan.
  let base: SyncBase = { rev: 0, placeObjects: new Map(), hofObjects: new Map() };
  return {
    async load() {
      const loaded = await sync.loadPlaces();
      base = {
        rev: loaded.rev,
        placeObjects: new Map(loaded.placeObjects),
        hofObjects: new Map(loaded.hofObjects),
      };
      return loaded;
    },
    async persist(placeObjects, hofObjects) {
      const res = await sync.reconcileAndSave(placeObjects, hofObjects, base);
      // Auch bei schema-too-new die remote rev übernehmen — der nächste Versuch baut darauf
      // auf; das Ergebnis ist ab jetzt der gemeinsame Vorfahre.
      base = {
        rev: res.rev,
        placeObjects: new Map(res.placeObjects),
        hofObjects: new Map(res.hofObjects),
      };
      // „Kein Datenverlust" gilt nur, solange der Vorfahre die Kollision auflösen konnte.
      // Wo BEIDE Geräte denselben Eintrag geändert haben, wurde eine Fassung überschrieben
      // — das darf die Meldung nicht verschweigen (BL-82).
      const echterKonflikt =
        res.warning?.kind === 'union-merge' &&
        res.warning.conflictPlaceIds.length + res.warning.conflictHofIds.length > 0;
      const notice =
        res.warning?.kind === 'union-merge'
          ? echterKonflikt
            ? UNION_MERGE_CONFLICT_NOTICE
            : UNION_MERGE_NOTICE
          : res.warning?.kind === 'schema-too-new'
            ? SCHEMA_TOO_NEW_NOTICE
            : '';
      return { notice, placeObjects: res.placeObjects, hofObjects: res.hofObjects };
    },
  };
}
