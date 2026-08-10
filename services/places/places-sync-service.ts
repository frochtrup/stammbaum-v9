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
// UNION-MERGE-POLICY:
//   PlaceObjects/HofObjects sind id-gekeyte Maps; die Politik dafür lebt seit BL-239
//   EINMAL in `services/union-merge.ts` (dort der vollständige Wortlaut) — sie gilt seither
//   auch für die Forschungsprojekte im B1-Bündel.
//
//   BIS BL-82 entschied hier ein Zeitvergleich: `clock.now()` gegen `remote.ts`. Das ist
//   kein Vergleich zweier Inhalts-Alter, sondern „jetzt" gegen „irgendwann früher" —
//   `now()` ist per Definition größer als jeder bereits gespeicherte Zeitstempel, die
//   lokale Seite gewann also immer. Ein Gerät mit stundenaltem, unverändertem Stand machte
//   damit die Kuration des anderen Geräts beim nächsten Speichern rückgängig. Die drei
//   bestehenden Tests belegten scheinbar beide Richtungen, weil ihre Mock-Uhr 2000 lieferte,
//   während der gespeicherte Stand ts=5000 trug — ein Zustand, den eine echte Uhr nicht
//   erzeugen kann. Zeitstempel taugen für die Frage „wer ist neuer" hier grundsätzlich
//   nicht: sie beantworten nicht, WER sich geändert hat. Der Vorfahre beantwortet genau das.

import type { PlaceObject, HofObject } from '../../core/places/types';
import { leiteGrenzjahreAbImHof, leiteGrenzjahreAbImOrt } from '../../core/places';
import type { Clock, DeviceIdProvider, PlacesFileWrapper, PlacesStore } from './types';
// Der Union-Merge lebt seit BL-239 EINMAL für alle id-gekeyten Sammlungen (services/union-merge.ts):
// die Forschungsprojekte im B1-Bündel brauchen dieselbe Konfliktpolitik. Die Policy-Beschreibung
// steht dort im Kopfkommentar.
import { toList, toMap, unionMerge } from '../union-merge';
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
  | {
      kind: 'union-merge';
      /** IDs, die auf beiden Seiten mit abweichendem Inhalt vorlagen. */
      mergedPlaceIds: string[];
      mergedHofIds: string[];
      /** Teilmenge davon: beide Seiten haben sich seit der Basis geändert — eine Fassung
       *  wurde überschrieben. Getrennt gemeldet, weil „zusammengeführt, kein Datenverlust"
       *  für diese IDs schlicht nicht stimmt (BL-82). */
      conflictPlaceIds: string[];
      conflictHofIds: string[];
    }
  | { kind: 'schema-too-new'; foundSchemaVersion: number };

/**
 * Der Stand, aus dem die lokale Fassung hervorgegangen ist — der gemeinsame Vorfahre des
 * Drei-Wege-Merges. Pflichtparameter und nicht optional: ohne ihn fällt der Merge auf ein
 * Raten zurück, und ein optionaler Parameter würde genau dort vergessen, wo es darauf
 * ankommt (der Aufrufer hat ihn ohnehin — er hat den Stand geladen).
 */
export interface SyncBase {
  rev: number;
  placeObjects: Map<string, PlaceObject>;
  hofObjects: Map<string, HofObject>;
}

export interface ReconcileResult {
  placeObjects: Map<string, PlaceObject>;
  hofObjects: Map<string, HofObject>;
  /** null = anstandslos gespeichert; sonst genau EINE der beiden Warnklassen. */
  warning: ConflictWarning | null;
  /** false bei schema-too-new (Spec 30 §4 Read-Only-Schreibstopp) — nichts wurde geschrieben. */
  saved: boolean;
  /** Revision des Ergebnisses: die geschriebene rev bei saved=true, sonst die remote rev.
   * Der Aufrufer nutzt sie als `baseRev` des nächsten Speicherns (Rev-Tracking). */
  rev: number;
}

const emptyWrapper = (): PlacesFileWrapper => ({
  schemaVersion: PLACES_SCHEMA_VERSION,
  rev: 0,
  device: '',
  ts: 0,
  placeObjects: [],
  hofObjects: []
});


export class PlacesSyncService {
  constructor(
    private readonly store: PlacesStore,
    private readonly deviceId: DeviceIdProvider,
    private readonly clock: Clock
  ) {}

  /**
   * Die ZWEITE Tür, durch die fremde Bytes zu Orten werden (BL-332, [ADR-v9-248]) — die
   * erste ist `parsePlacesFileWrapper` (gewählte Datei). Der IDB-Spiegel ist zwar vom
   * Programm selbst geschrieben, aber nicht notwendig von DIESER Fassung: ein Stand, den
   * eine ältere Version vor der Ableitung abgelegt hat, trägt die Inkongruenz weiter.
   * Deshalb geht JEDER Lesezugriff auf den Store hier durch — `loadPlaces` wie der
   * Remote-Lesezugriff in `reconcileAndSave`. Liefe nur einer der beiden durch die
   * Ableitung, sähe der Union-Merge einen Unterschied, den es nicht gibt, und die
   * abgeleitete Seite könnte von der rohen überschrieben werden.
   */
  private async ladeSpiegel(): Promise<PlacesFileWrapper | null> {
    const wrapper = await this.store.load();
    if (!wrapper) return null;
    return {
      ...wrapper,
      placeObjects: wrapper.placeObjects.map(leiteGrenzjahreAbImOrt),
      hofObjects: wrapper.hofObjects.map(leiteGrenzjahreAbImHof),
    };
  }

  /** Lädt den gespeicherten Stand (Arrays → Maps entpackt). Kein Schreiben, keine Merges. */
  async loadPlaces(): Promise<LoadedPlaces> {
    const wrapper = await this.ladeSpiegel();
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
   * `base` ist der Stand, auf dem die übergebene lokale Fassung aufbaut (aus einem
   * vorherigen loadPlaces()): seine Revision erkennt "gleiche rev" (Spec-Wortlaut), sein
   * INHALT ist der gemeinsame Vorfahre des Merges (BL-82).
   */
  async reconcileAndSave(
    localPlaceObjects: Map<string, PlaceObject>,
    localHofObjects: Map<string, HofObject>,
    base: SyncBase
  ): Promise<ReconcileResult> {
    const baseRev = base.rev;
    const remoteWrapper = await this.ladeSpiegel();

    if (remoteWrapper && remoteWrapper.schemaVersion > PLACES_SCHEMA_VERSION) {
      return {
        placeObjects: toMap(remoteWrapper.placeObjects),
        hofObjects: toMap(remoteWrapper.hofObjects),
        warning: { kind: 'schema-too-new', foundSchemaVersion: remoteWrapper.schemaVersion },
        saved: false,
        rev: remoteWrapper.rev
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
      const placeMerge = unionMerge(localPlaceObjects, remotePlaces, base.placeObjects);
      const hofMerge = unionMerge(localHofObjects, remoteHofs, base.hofObjects);
      finalPlaces = placeMerge.merged;
      finalHofs = hofMerge.merged;
      if (placeMerge.collidedIds.length > 0 || placeMerge.merged.size !== localPlaceObjects.size
        || hofMerge.collidedIds.length > 0 || hofMerge.merged.size !== localHofObjects.size) {
        warning = {
          kind: 'union-merge',
          mergedPlaceIds: placeMerge.collidedIds,
          mergedHofIds: hofMerge.collidedIds,
          conflictPlaceIds: placeMerge.conflictIds,
          conflictHofIds: hofMerge.conflictIds
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

    return { placeObjects: finalPlaces, hofObjects: finalHofs, warning, saved: true, rev: nextRev };
  }
}
