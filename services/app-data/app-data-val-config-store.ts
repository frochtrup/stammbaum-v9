// services/app-data/app-data-val-config-store.ts — die Regel-Konfiguration wohnt im
// B1-Bündel (Spec 30 §2.2, ADR-v9-173, BL-180).
//
// WARUM ein Adapter und kein zweiter Speicher: `ValConfigStore` ist ein bestehender
// Vertrag (services/validate/val-config-store.ts), die Validierungs-Fläche kennt nur
// ihn. Indem das B1-Bündel diesen Vertrag erfüllt, wandert die Konfiguration in den
// mitreisenden Zustand, OHNE dass die UI etwas davon merkt — und es gibt weiterhin
// genau EINE Wahrheit, nicht zwei Stores mit demselben Inhalt.
//
// Der alte Store bleibt als EINMALIGE Quelle für die Übernahme bestehen: findet sich
// im Bündel keine Konfiguration, aber im Altspeicher eine, wird sie übernommen. Das
// geschieht hier bewusst STILL (anders als beim Dublettenausschluss, BL-240) — es ist
// eine Verschiebung von gerätelokal nach gerätelokal, kein Schreibvorgang in die
// geteilte Genealogie-Datei.
import type { StoredValidationConfig } from '../../core/validate/index';
import type { ValConfigStore } from '../validate/index';
import type { AppDataSyncService } from './app-data-sync-service';

export class AppDataValConfigStore implements ValConfigStore {
  constructor(
    private readonly sync: AppDataSyncService,
    /** Altspeicher — nur zum einmaligen Übernehmen; wird nie beschrieben. */
    private readonly legacy?: ValConfigStore
  ) {}

  async load(): Promise<StoredValidationConfig | null> {
    const state = await this.sync.load();
    if (state.sections.valConfig) return state.sections.valConfig;

    const alt = await this.legacy?.load();
    if (!alt) return null;
    // Übernahme: ab jetzt ist das Bündel die Wahrheit.
    await this.sync.reconcileAndSave(
      { ...state.sections, valConfig: alt },
      { rev: state.rev, sections: state.sections }
    );
    return alt;
  }

  async save(cfg: StoredValidationConfig): Promise<void> {
    const state = await this.sync.load();
    await this.sync.reconcileAndSave(
      { ...state.sections, valConfig: cfg },
      { rev: state.rev, sections: state.sections }
    );
  }

  async clear(): Promise<void> {
    const state = await this.sync.load();
    const { valConfig: _entfernt, ...rest } = state.sections;
    void _entfernt;
    await this.sync.reconcileAndSave(rest, { rev: state.rev, sections: state.sections });
  }
}
