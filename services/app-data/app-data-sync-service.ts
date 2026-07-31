// services/app-data/app-data-sync-service.ts — Abgleich des B1-Bündels
// (Spec 30 §2.2/§2.3, ADR-v9-134/-173, BL-180).
//
// Generalisiert `PlacesSyncService`: gleicher `_rev`/`_device`/`_ts`-Wrapper, gleiche
// Konflikt-Politik (Spec 30 §4 LP-9), gleiche Schema-Bremse. Der EINE Unterschied liegt
// in der Merge-Einheit: `orte.json` vereinigt zwei Sammlungen JE OBJEKT (id → Objekt),
// B1 besteht aus SINGLETON-Abschnitten (eine Regel-Konfiguration, eine Export-Vorwahl).
// Ein Union-Merge „beide Seiten bleiben erhalten" ist dort nicht darstellbar — es gibt
// keine zwei Objekte, die nebeneinander stehen könnten. Deshalb:
//
//   - Abschnitt nur LOKAL geändert  → lokal gewinnt.
//   - Abschnitt nur ENTFERNT geändert → entfernt gewinnt.   ← das ist die „Union bei
//     disjunkten Änderungen" aus ADR-v9-134, auf Abschnitts-Ebene.
//   - BEIDE unterschiedlich geändert → lokal gewinnt, mit benanntem Konflikt-Hinweis.
//     Kein stilles Überschreiben und keine Feld-Verschmelzung (dieselbe bewusste Grenze
//     wie ADR-v9-116 beim shortName).
import type {
  AppDataReconcileResult,
  AppDataSections,
  AppDataStore,
  AppDataWarning,
  AppDataWrapper,
  LoadedAppData,
} from './types';
import { APP_DATA_SCHEMA_VERSION } from './types';

/** Zeitquelle — injiziert, nie Wall-Clock im Dienst selbst (TST-3). */
export interface Clock {
  now(): number;
}

/** Geräte-Kennung — dieselbe Rolle wie bei `orte.json` (LP-9). */
export interface DeviceIdProvider {
  deviceId(): string;
}

/** Der Stand, auf dem die übergebene lokale Fassung aufbaut (aus einem vorherigen `load()`). */
export interface AppDataBase {
  rev: number;
  sections: AppDataSections;
}

const SECTION_KEYS = ['valConfig', 'exportPrefs'] as const;
type SectionKey = (typeof SECTION_KEYS)[number];

/**
 * Abschnitts-Gleichheit über die serialisierte Form. Zulässig, weil alle Abschnitte
 * reine Datenwerte ohne Zyklen sind (JSON ist ohnehin ihr Wire-Format) — und der
 * Vergleich damit exakt das prüft, was gespeichert würde. Ein Feld-für-Feld-Vergleich
 * wäre eine zweite Wahrheit über die Struktur, die bei jeder Erweiterung mitwandern
 * müsste (genau die Drift, die `hypothesesEqual` beinahe eingefangen hätte).
 */
function sameSection(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function emptyWrapper(): AppDataWrapper {
  return { schemaVersion: APP_DATA_SCHEMA_VERSION, rev: 0, device: '', ts: 0, sections: {} };
}

export class AppDataSyncService {
  constructor(
    private readonly store: AppDataStore,
    private readonly deviceId: DeviceIdProvider,
    private readonly clock: Clock
  ) {}

  /** Lädt den gespeicherten Stand. Kein Schreiben, kein Merge. */
  async load(): Promise<LoadedAppData> {
    const wrapper = await this.store.load();
    if (!wrapper) return { sections: {}, rev: 0, ts: 0, isEmpty: true };
    return { sections: wrapper.sections, rev: wrapper.rev, ts: wrapper.ts, isEmpty: false };
  }

  /**
   * Schreibt eine lokale Fassung gegen den gespeicherten Stand — mit Konflikterkennung
   * (Spec 30 §4 LP-9), Wortlaut und Reihenfolge wie in `PlacesSyncService.reconcileAndSave`:
   *
   *   - Gespeichertes Schema NEUER als bekannt → nichts schreiben, `schema-too-new`.
   *     (Ein älterer Client darf einen neueren Stand nicht plattmachen.)
   *   - Gleiche `rev` + anderes Gerät, ODER der gespeicherte Stand ist weitergezogen
   *     (`rev` > `baseRev`) → Drei-Wege-Abgleich je Abschnitt gegen den gemeinsamen
   *     Vorfahren `base.sections`.
   *   - Sonst → normales Schreiben, `rev++`.
   */
  async reconcileAndSave(
    localSections: AppDataSections,
    base: AppDataBase
  ): Promise<AppDataReconcileResult> {
    const remoteWrapper = await this.store.load();

    if (remoteWrapper && remoteWrapper.schemaVersion > APP_DATA_SCHEMA_VERSION) {
      return {
        sections: remoteWrapper.sections,
        warning: { kind: 'schema-too-new', foundSchemaVersion: remoteWrapper.schemaVersion },
        saved: false,
        rev: remoteWrapper.rev,
      };
    }

    const remote = remoteWrapper ?? emptyWrapper();
    const sameRev = remoteWrapper != null && remote.rev === base.rev;
    const otherDevice = remoteWrapper != null && remote.device !== this.deviceId.deviceId();
    const remoteMovedOn = remoteWrapper != null && remote.rev > base.rev;

    let sections = localSections;
    let warning: AppDataWarning | null = null;

    if ((sameRev && otherDevice) || remoteMovedOn) {
      const merged: AppDataSections = {};
      const conflicts: string[] = [];
      for (const key of SECTION_KEYS) {
        const l = localSections[key];
        const r = remote.sections[key];
        const b = base.sections[key];
        if (sameSection(l, r)) {
          if (l !== undefined) merged[key] = l as never;
        } else if (sameSection(l, b)) {
          // Nur die Gegenseite hat geändert → ihre Fassung übernehmen (disjunkt).
          if (r !== undefined) merged[key] = r as never;
        } else if (sameSection(r, b)) {
          // Nur lokal geändert → lokale Fassung behalten (disjunkt).
          if (l !== undefined) merged[key] = l as never;
        } else {
          // Beide Seiten, unterschiedlich: lokal gewinnt, aber sichtbar.
          if (l !== undefined) merged[key] = l as never;
          conflicts.push(key satisfies SectionKey);
        }
      }
      sections = merged;
      if (conflicts.length > 0) warning = { kind: 'section-conflict', conflictSections: conflicts };
    }

    const next: AppDataWrapper = {
      schemaVersion: APP_DATA_SCHEMA_VERSION,
      rev: Math.max(remote.rev, base.rev) + 1,
      device: this.deviceId.deviceId(),
      ts: this.clock.now(),
      sections,
    };
    await this.store.save(next);
    return { sections, warning, saved: true, rev: next.rev };
  }
}
