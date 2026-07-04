// services/places/places-sync-service.ts — Orchestrierung des `orte.json`-Browser-
// Spiegels (Spec 14 §6, Spec 11 §2, Spec 30 §2.1/§4). Reine Logik mit injiziertem
// PlacesStore + injizierter Clock/DeviceIdProvider (Determinismus in Tests, analog
// ADR-v9-11/ADR-v9-15) — kein direkter IndexedDB-/localStorage-Zugriff hier.
//
// Zuständigkeiten:
//   - laden (`loadPlaces`): liest den Wrapper, entpackt Arrays → Maps.
//   - Konflikt-/Schema-Check + Union-Merge (Spec 30 §4 LP-9), wenn ein Aufrufer eine
//     lokale (ggf. durch Bootstrap gewachsene) Fassung gegen den gespeicherten Stand
//     abgleichen will (`reconcileAndSave`).
//   - speichern (`savePlaces`): packt Maps → Arrays, bumpt rev, schreibt über den Store.
//
// UNION-MERGE-POLICY (Design-Entscheidung dieser Slice, s. Bericht/ADR-Empfehlung):
//   PlaceObjects/HofObjects sind id-gekeyte Maps. „Union" heißt: alle IDs aus beiden
//   Seiten bleiben erhalten (keine Seite verliert einen Eintrag, den die andere nicht
//   hat). Existiert dieselbe ID auf beiden Seiten mit UNTERSCHIEDLICHEM Inhalt, gewinnt
//   die Seite mit dem neueren `ts` (Wrapper-Zeitstempel) — kein Feld-Level-Merge (das
//   wäre Überkonstruktion für diese Slice, s. Aufgabenstellung). Gleicher Inhalt auf
//   beiden Seiten ist kein Konflikt (keine Warnung, kein Merge-Aufwand).

import type { PlaceObject, HofObject } from '../../core/places/types';
import type { Clock, DeviceIdProvider, PlacesFileWrapper, PlacesStore } from './types';
import { PLACES_SCHEMA_VERSION } from './types';

export interface LoadedPlaces {
  placeObjects: Map<string, PlaceObject>;
  hofObjects: Map<string, HofObject>;
  /** Wrapper-Metadaten des geladenen Stands (rev/device/ts) — Basis für reconcileAndSave. */
  rev: number;
  ts: number;
  /** true, wenn nichts gespeichert war (frischer Start) — placeObjects/hofObjects sind leer. */
  isEmpty: boolean;
}

export type ConflictWarning =
  | { kind: 'union-merge'; mergedPlaceIds: string[]; mergedHofIds: string[] }
  | { kind: 'schema-too-new'; foundSchemaVersion: number };

export interface ReconcileResult {
  placeObjects: Map<string, PlaceObject>;
  hofObjects: Map<string, HofObject>;
  /** null = anstandslos gespeichert; sonst genau EINE der beiden Warnklassen. */
  warning: ConflictWarning | null;
  /** false bei schema-too-new (Spec 30 §4 Read-Only-Schreibstopp) — nichts wurde geschrieben. */
  saved: boolean;
}

const emptyWrapper = (): PlacesFileWrapper => ({
  schemaVersion: PLACES_SCHEMA_VERSION,
  rev: 0,
  device: '',
  ts: 0,
  placeObjects: [],
  hofObjects: []
});

function toMap<T extends { id: string }>(list: T[]): Map<string, T> {
  return new Map(list.map((item) => [item.id, item]));
}

function toList<T>(map: Map<string, T>): T[] {
  return Array.from(map.values());
}

/** Strukturelle Gleichheit über die Wire-Form (JSON) — genügt für Konflikt-Erkennung. */
function sameContent<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Union-Merge zweier id-gekeyter Maps (Spec 30 §4 LP-9): alle IDs aus beiden Seiten
 * bleiben; bei abweichendem Inhalt derselben ID gewinnt die Seite mit neuerem `ts`.
 * Gibt das gemergte Ergebnis + die Liste der tatsächlich kollidierten IDs zurück
 * (für die Warnung — nur IDs mit echtem Inhalts-Unterschied zählen als Konflikt).
 */
function unionMerge<T extends { id: string }>(
  local: Map<string, T>,
  remote: Map<string, T>,
  localTs: number,
  remoteTs: number
): { merged: Map<string, T>; collidedIds: string[] } {
  const merged = new Map<string, T>();
  const collidedIds: string[] = [];

  for (const [id, remoteItem] of remote) merged.set(id, remoteItem);
  for (const [id, localItem] of local) {
    const remoteItem = remote.get(id);
    if (remoteItem === undefined) {
      merged.set(id, localItem);
      continue;
    }
    if (sameContent(localItem, remoteItem)) continue; // kein Konflikt, identischer Inhalt.
    collidedIds.push(id);
    merged.set(id, localTs >= remoteTs ? localItem : remoteItem);
  }

  return { merged, collidedIds };
}

export class PlacesSyncService {
  constructor(
    private readonly store: PlacesStore,
    private readonly deviceId: DeviceIdProvider,
    private readonly clock: Clock
  ) {}

  /** Lädt den gespeicherten Stand (Arrays → Maps entpackt). Kein Schreiben, keine Merges. */
  async loadPlaces(): Promise<LoadedPlaces> {
    const wrapper = await this.store.load();
    if (!wrapper) {
      return { placeObjects: new Map(), hofObjects: new Map(), rev: 0, ts: 0, isEmpty: true };
    }
    return {
      placeObjects: toMap(wrapper.placeObjects),
      hofObjects: toMap(wrapper.hofObjects),
      rev: wrapper.rev,
      ts: wrapper.ts,
      isEmpty: false
    };
  }

  /**
   * Speichert eine lokale Fassung (z. B. nach Hof-Bootstrap durch resolveEvents) gegen den
   * aktuell gespeicherten Stand ab — mit Konflikterkennung (Spec 30 §4 LP-9):
   *
   *   - Kein gespeicherter Stand ODER `baseRev` stimmt mit dem gespeicherten `rev` überein
   *     UND (gleiches Device ODER kein abweichender Inhalt) → normales Schreiben, rev++.
   *   - Gleiche `baseRev` + ANDERES Device + inhaltlich abweichend → Union-Merge (LP-9):
   *     beide Seiten bleiben erhalten, kein Datenverlust; Warnung `union-merge`.
   *   - Gespeicherter Stand hat eine HÖHERE `schemaVersion` als bekannt → Read-Only-
   *     Schreibstopp (Spec 11 §2 Zeile „bekannte Schema-Version"): nichts wird
   *     geschrieben, Warnung `schema-too-new`.
   *
   * `baseRev` ist die Revision, auf der die übergebene lokale Fassung aufbaut (aus einem
   * vorherigen loadPlaces()) — nötig, um "gleiche rev" (Spec-Wortlaut) zu erkennen.
   */
  async reconcileAndSave(
    localPlaceObjects: Map<string, PlaceObject>,
    localHofObjects: Map<string, HofObject>,
    baseRev: number
  ): Promise<ReconcileResult> {
    const remoteWrapper = await this.store.load();

    if (remoteWrapper && remoteWrapper.schemaVersion > PLACES_SCHEMA_VERSION) {
      return {
        placeObjects: toMap(remoteWrapper.placeObjects),
        hofObjects: toMap(remoteWrapper.hofObjects),
        warning: { kind: 'schema-too-new', foundSchemaVersion: remoteWrapper.schemaVersion },
        saved: false
      };
    }

    const remote = remoteWrapper ?? emptyWrapper();
    const remotePlaces = toMap(remote.placeObjects);
    const remoteHofs = toMap(remote.hofObjects);

    const sameRev = remoteWrapper != null && remote.rev === baseRev;
    const otherDevice = remoteWrapper != null && remote.device !== this.deviceId.deviceId();
    // Spec-Wortlaut (Spec 30 §4/Spec 11 §2): "gleiche Revision + verschiedenes Device +
    // abweichender Inhalt → Union-Merge". Zusätzlich (Härtung dieser Slice): ist die
    // gespeicherte Revision bereits WEITER als die, auf der die lokale Fassung aufbaut
    // (baseRev < remote.rev), hat sich der Stand seit dem letzten Laden bereits geändert
    // — unabhängig vom Device dürfen dessen Einträge nie stillschweigend überschrieben
    // werden (das wäre Last-Write-Wins). Beide Fälle laufen über dieselbe Union-Merge-
    // Politik (kein Feld-Level-Merge, neueres `ts` gewinnt bei Kollision derselben ID).
    const remoteMovedOn = remoteWrapper != null && remote.rev > baseRev;
    const localTs = this.clock.now();

    let finalPlaces = localPlaceObjects;
    let finalHofs = localHofObjects;
    let warning: ConflictWarning | null = null;

    if ((sameRev && otherDevice) || remoteMovedOn) {
      const placeMerge = unionMerge(localPlaceObjects, remotePlaces, localTs, remote.ts);
      const hofMerge = unionMerge(localHofObjects, remoteHofs, localTs, remote.ts);
      finalPlaces = placeMerge.merged;
      finalHofs = hofMerge.merged;
      if (placeMerge.collidedIds.length > 0 || placeMerge.merged.size !== localPlaceObjects.size
        || hofMerge.collidedIds.length > 0 || hofMerge.merged.size !== localHofObjects.size) {
        warning = {
          kind: 'union-merge',
          mergedPlaceIds: placeMerge.collidedIds,
          mergedHofIds: hofMerge.collidedIds
        };
      }
    }

    const nextRev = (remoteWrapper?.rev ?? 0) + 1;
    const wrapper: PlacesFileWrapper = {
      schemaVersion: PLACES_SCHEMA_VERSION,
      rev: nextRev,
      device: this.deviceId.deviceId(),
      ts: localTs,
      placeObjects: toList(finalPlaces),
      hofObjects: toList(finalHofs)
    };
    await this.store.save(wrapper);

    return { placeObjects: finalPlaces, hofObjects: finalHofs, warning, saved: true };
  }
}
