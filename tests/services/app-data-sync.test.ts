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
import { makeProject, type Project } from '../../core/research/index';
import { makeEntryTemplate, type EntryTemplate } from '../../core/model/index';

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

describe('BL-239: die Projekte reisen mit — je Objekt vereinigt, nicht je Abschnitt', () => {
  function projekt(id: string, name: string): Project {
    return makeProject(id, { name, created: '2026-08-01' });
  }

  it('zwei Geräte legen je ein eigenes Projekt an → BEIDE bleiben erhalten', async () => {
    // Genau der Fall, den eine Abschnitts-Merge verloren hätte (mit Konflikt-Hinweis,
    // aber verloren): zwei Projekte sind kein Konflikt, sie sind zwei Projekte.
    const store = new MemoryAppDataStore(wrapperOf(1, 'geraet-B', { projects: [projekt('p2', 'Höfe Rheine')] }));
    const svc = new AppDataSyncService(store, hier, clock);

    const res = await svc.reconcileAndSave(
      { projects: [projekt('p1', 'Linie Decker')] },
      { rev: 1, sections: {} },
    );

    expect(res.sections.projects?.map((p) => p.id).sort()).toEqual(['p1', 'p2']);
    expect(res.warning).toBeNull();
  });

  it('dasselbe Projekt beidseitig unterschiedlich geändert → lokal gewinnt, benannt', async () => {
    const basis = projekt('p1', 'Linie Decker');
    const store = new MemoryAppDataStore(wrapperOf(1, 'geraet-B', { projects: [projekt('p1', 'Fremd umbenannt')] }));
    const svc = new AppDataSyncService(store, hier, clock);

    const res = await svc.reconcileAndSave(
      { projects: [projekt('p1', 'Lokal umbenannt')] },
      { rev: 1, sections: { projects: [basis] } },
    );

    expect(res.sections.projects?.[0].name).toBe('Lokal umbenannt');
    expect(res.warning).toEqual({ kind: 'section-conflict', conflictSections: ['projects'] });
  });

  it('nur die Gegenseite hat geändert → ihre Fassung übernehmen (disjunkt)', async () => {
    const basis = projekt('p1', 'Linie Decker');
    const store = new MemoryAppDataStore(wrapperOf(1, 'geraet-B', { projects: [projekt('p1', 'Dort umbenannt')] }));
    const svc = new AppDataSyncService(store, hier, clock);

    const res = await svc.reconcileAndSave(
      { projects: [basis] },
      { rev: 1, sections: { projects: [basis] } },
    );

    expect(res.sections.projects?.[0].name).toBe('Dort umbenannt');
    expect(res.warning).toBeNull();
  });
});

describe('BL-232: die Sammlungs-Politik ist ein Mechanismus, kein Sonderweg der Projekte', () => {
  // Die Erfassungs-Vorlagen sind der ZWEITE Sammlungs-Abschnitt (Spec 30 §2.3: „zugleich
  // die Probe darauf, dass die Sammlungs-Politik ein geteilter Mechanismus ist"). Sie
  // müssen sich deshalb Zeile für Zeile wie die Projekte verhalten, ohne eine zweite Kopie
  // derselben Regel im Dienst.
  const tpl = (id: string, label: string): EntryTemplate =>
    makeEntryTemplate(id, { label, slots: [{ role: 'main', field: 'given' }] });

  it('zwei Geräte legen je eine eigene Vorlage an → BEIDE bleiben erhalten', async () => {
    const store = new MemoryAppDataStore(
      wrapperOf(1, 'geraet-B', { entryTemplates: [tpl('v2', 'Sterbefall Rheine')] }),
    );
    const svc = new AppDataSyncService(store, hier, clock);

    const res = await svc.reconcileAndSave(
      { entryTemplates: [tpl('v1', 'Trauregister Ochtrup')] },
      { rev: 1, sections: {} },
    );

    expect(res.sections.entryTemplates?.map((t) => t.id).sort()).toEqual(['v1', 'v2']);
    expect(res.warning).toBeNull();
  });

  it('dieselbe Vorlage beidseitig unterschiedlich geändert → lokal gewinnt, benannt', async () => {
    const basis = tpl('v1', 'Trauregister');
    const store = new MemoryAppDataStore(
      wrapperOf(1, 'geraet-B', { entryTemplates: [tpl('v1', 'Fremd umbenannt')] }),
    );
    const svc = new AppDataSyncService(store, hier, clock);

    const res = await svc.reconcileAndSave(
      { entryTemplates: [tpl('v1', 'Lokal umbenannt')] },
      { rev: 1, sections: { entryTemplates: [basis] } },
    );

    expect(res.sections.entryTemplates?.[0].label).toBe('Lokal umbenannt');
    expect(res.warning).toEqual({ kind: 'section-conflict', conflictSections: ['entryTemplates'] });
  });

  it('nur die Gegenseite hat geändert → ihre Fassung übernehmen (disjunkt)', async () => {
    const basis = tpl('v1', 'Trauregister');
    const store = new MemoryAppDataStore(
      wrapperOf(1, 'geraet-B', { entryTemplates: [tpl('v1', 'Dort umbenannt')] }),
    );
    const svc = new AppDataSyncService(store, hier, clock);

    const res = await svc.reconcileAndSave(
      { entryTemplates: [basis] },
      { rev: 1, sections: { entryTemplates: [basis] } },
    );

    expect(res.sections.entryTemplates?.[0].label).toBe('Dort umbenannt');
    expect(res.warning).toBeNull();
  });

  it('Vorlagen und Projekte werden im SELBEN Abgleich je Objekt vereinigt', async () => {
    // Der eigentliche Punkt der Verallgemeinerung: kein `if (key === 'projects')` mehr,
    // sondern eine Politik, die für jeden als Sammlung deklarierten Abschnitt greift.
    const store = new MemoryAppDataStore(
      wrapperOf(1, 'geraet-B', {
        projects: [makeProject('p2', { name: 'Höfe Rheine' })],
        entryTemplates: [tpl('v2', 'Sterbefall')],
      }),
    );
    const svc = new AppDataSyncService(store, hier, clock);

    const res = await svc.reconcileAndSave(
      { projects: [makeProject('p1', { name: 'Linie Decker' })], entryTemplates: [tpl('v1', 'Heirat')] },
      { rev: 1, sections: {} },
    );

    expect(res.sections.projects?.map((p) => p.id).sort()).toEqual(['p1', 'p2']);
    expect(res.sections.entryTemplates?.map((t) => t.id).sort()).toEqual(['v1', 'v2']);
    expect(res.warning).toBeNull();
  });
});

describe('INV: `app-data.json` trägt keine UNGEPRÜFTEN GEDCOM-Ids (ADR-v9-173/-176)', () => {
  it('die Abschnitts-Liste ist geschlossen — der Dublettenausschluss gehört nicht hierher', () => {
    // Der Schutz ist strukturell: die Abschnitts-Liste ist geschlossen. Bis ADR-v9-176 war
    // die Regel „gar keine GEDCOM-Ids"; sie hätte auch die Projekte draußen gehalten.
    // Jetzt lautet sie „keine UNGEPRÜFTEN": die Projekte dürfen hier sein, WEIL ihre
    // Personenbezüge einen Fingerabdruck tragen (BL-238) und am Referenten geprüft werden.
    // Der Dublettenausschluss bleibt draußen — er ist seit ADR-v9-174 gar kein app-privater
    // Zustand mehr, sondern eine abgelehnte Identitäts-Hypothese in der Genealogie-Datei.
    const erlaubt: (keyof AppDataSections)[] = ['valConfig', 'exportPrefs', 'projects', 'entryTemplates'];
    expect(erlaubt).not.toContain('dedupIgnored' as keyof AppDataSections);
  });

  it('jeder Personenbezug im mitgereisten Scope ist geprüft — blanke Ids gibt es nicht', () => {
    // Der eigentliche Wächter: käme je wieder ein `personIds: string[]` in den Scope,
    // reiste eine ungeprüfte Datei-Id mit — genau der Defekt aus BL-238.
    const scope = makeProject('p1').scope;
    expect(Object.keys(scope)).not.toContain('personIds');
    expect(scope.personRefs).toEqual([]);
  });
});
