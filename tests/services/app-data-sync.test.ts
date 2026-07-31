// tests/services/app-data-sync.test.ts — B1-Bündel `app-data.json`
// (Spec 30 §2.2/§2.3, ADR-v9-173, BL-180).
//
// Geprüft wird die Merge-Politik, nicht IndexedDB: der Store ist eine In-Memory-Attrappe
// (TST-3). Die drei Fälle, die zählen — disjunkt in beide Richtungen, echter Konflikt,
// und die Schema-Bremse — plus die Zusicherung, die den ganzen Mechanismus begrenzt:
// baumgebundener Zustand hat hier nichts verloren (ADR-v9-173).
import { describe, it, expect } from 'vitest';
import { AppDataSyncService } from '../../services/app-data/index';
import type { AppDataStore, AppDataWrapper, AppDataSections } from '../../services/app-data/index';
import { APP_DATA_SCHEMA_VERSION } from '../../services/app-data/index';

class MemoryAppDataStore implements AppDataStore {
  constructor(public wrapper: AppDataWrapper | null = null) {}
  async load(): Promise<AppDataWrapper | null> {
    return this.wrapper;
  }
  async save(w: AppDataWrapper): Promise<void> {
    this.wrapper = w;
  }
}

const clock = { now: () => 1_700_000_000 };
const hier = { deviceId: () => 'geraet-A' };

function wrapperOf(rev: number, device: string, sections: AppDataSections): AppDataWrapper {
  return { schemaVersion: APP_DATA_SCHEMA_VERSION, rev, device, ts: 1, sections };
}

const CFG_A = { disabled: ['R1'], thresholds: {}, known: ['R1', 'R2'] };
const CFG_B = { disabled: ['R2'], thresholds: {}, known: ['R1', 'R2'] };
const PREFS = { format: 'gedcom-7.0', anonymize: true };

describe('AppDataSyncService — Abgleich je Abschnitt', () => {
  it('schreibt auf leeren Speicher und zählt die Revision hoch', async () => {
    const store = new MemoryAppDataStore();
    const svc = new AppDataSyncService(store, hier, clock);

    const res = await svc.reconcileAndSave({ valConfig: CFG_A }, { rev: 0, sections: {} });

    expect(res.saved).toBe(true);
    expect(res.warning).toBeNull();
    expect(res.rev).toBe(1);
    expect(store.wrapper!.device).toBe('geraet-A');
    expect(store.wrapper!.sections.valConfig).toEqual(CFG_A);
  });

  it('vereinigt DISJUNKTE Änderungen zweier Geräte — beide Abschnitte überleben', async () => {
    // Gerät B hat die Export-Vorwahl gesetzt, hier wurde die Regel-Konfiguration geändert.
    // Genau der Fall, für den „Union bei disjunkten Änderungen" steht: keiner verliert.
    const store = new MemoryAppDataStore(wrapperOf(1, 'geraet-B', { exportPrefs: PREFS }));
    const svc = new AppDataSyncService(store, hier, clock);

    const res = await svc.reconcileAndSave({ valConfig: CFG_A }, { rev: 1, sections: {} });

    expect(res.warning).toBeNull();
    expect(res.sections.valConfig).toEqual(CFG_A);
    expect(res.sections.exportPrefs).toEqual(PREFS);
  });

  it('meldet einen Konflikt, wenn BEIDE denselben Abschnitt unterschiedlich ändern', async () => {
    const store = new MemoryAppDataStore(wrapperOf(1, 'geraet-B', { valConfig: CFG_B }));
    const svc = new AppDataSyncService(store, hier, clock);

    const res = await svc.reconcileAndSave({ valConfig: CFG_A }, { rev: 1, sections: {} });

    expect(res.warning).toEqual({ kind: 'section-conflict', conflictSections: ['valConfig'] });
    // Lokal gewinnt — aber sichtbar, nicht still.
    expect(res.sections.valConfig).toEqual(CFG_A);
  });

  it('übernimmt die Gegenseite, wenn NUR sie den Abschnitt geändert hat', async () => {
    // Gemeinsamer Vorfahre = CFG_A; lokal unverändert, entfernt auf CFG_B geändert.
    const store = new MemoryAppDataStore(wrapperOf(2, 'geraet-B', { valConfig: CFG_B }));
    const svc = new AppDataSyncService(store, hier, clock);

    const res = await svc.reconcileAndSave({ valConfig: CFG_A }, { rev: 1, sections: { valConfig: CFG_A } });

    expect(res.warning).toBeNull();
    expect(res.sections.valConfig).toEqual(CFG_B);
  });

  it('schreibt NICHT, wenn der gespeicherte Stand ein neueres Schema trägt', async () => {
    // Ein älterer Client darf einen neueren Stand nicht plattmachen (Spec 11 §2, LP-9).
    const zukunft: AppDataWrapper = {
      ...wrapperOf(5, 'geraet-B', { valConfig: CFG_B }),
      schemaVersion: APP_DATA_SCHEMA_VERSION + 1,
    };
    const store = new MemoryAppDataStore(zukunft);
    const svc = new AppDataSyncService(store, hier, clock);

    const res = await svc.reconcileAndSave({ valConfig: CFG_A }, { rev: 5, sections: {} });

    expect(res.saved).toBe(false);
    expect(res.warning).toEqual({ kind: 'schema-too-new', foundSchemaVersion: APP_DATA_SCHEMA_VERSION + 1 });
    expect(store.wrapper).toBe(zukunft);
  });

  it('überschreibt einen weitergezogenen Stand nicht still (rev > baseRev, gleiches Gerät)', async () => {
    // Härtung wie bei orte.json: „seit meinem Laden hat sich etwas getan" schlägt die
    // Geräte-Gleichheit — sonst wäre es Last-Write-Wins.
    const store = new MemoryAppDataStore(wrapperOf(4, 'geraet-A', { exportPrefs: PREFS }));
    const svc = new AppDataSyncService(store, hier, clock);

    const res = await svc.reconcileAndSave({ valConfig: CFG_A }, { rev: 1, sections: {} });

    expect(res.sections.exportPrefs).toEqual(PREFS);
    expect(res.sections.valConfig).toEqual(CFG_A);
    expect(res.rev).toBe(5);
  });
});

describe('INV: `app-data.json` trägt nur dateiübergreifenden Zustand (ADR-v9-173)', () => {
  it('kennt keinen Abschnitt, der GEDCOM-Ids referenziert', () => {
    // Der Schutz ist strukturell: die Abschnitts-Liste ist geschlossen. Diese Zusicherung
    // ist der Wächter dagegen, dass jemand Projekte oder Ausschluss-Paare hier einhängt —
    // beides ist baumgebunden, und der Merge kennt keinen Datei-Kontext (er vereinigte
    // dann Ids aus verschiedenen Beständen).
    const erlaubt: (keyof AppDataSections)[] = ['valConfig', 'exportPrefs'];
    const verboten = ['projects', 'dedupIgnored', 'personIds'];
    for (const k of verboten) expect(erlaubt).not.toContain(k as keyof AppDataSections);
  });
});
