// tests/services/app-data-entry-templates-store.test.ts — die Erfassungs-Vorlagen im
// B1-Bündel (Spec 30 §2.2/§2.3, Spec 20 §2, ADR-v9-264 E7, BL-232).
//
// Geprüft wird der Adapter, nicht IndexedDB: der Bündel-Speicher ist eine In-Memory-
// Attrappe, Geräte-Id und Uhr sind injiziert (TST-3). Kein Altspeicher — die Information
// entsteht in v9 zum ersten Mal (wie beim Rundgang-Merker, BL-213).
import { describe, expect, it } from 'vitest';
import {
  AppDataEntryTemplatesStore,
  AppDataSyncService,
  APP_DATA_SCHEMA_VERSION,
  type AppDataStore,
  type AppDataWrapper,
} from '../../services/app-data/index';
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

function svcOf(store: AppDataStore): AppDataSyncService {
  return new AppDataSyncService(store, { deviceId: () => 'geraet-A' }, { now: () => 1_700_000_000 });
}

const EIGEN: EntryTemplate = makeEntryTemplate('eigene-1', {
  label: 'Trauregister Ochtrup',
  slots: [
    { role: 'spouseFamily', field: 'date', event: 'MARR' },
    { role: 'main', field: 'surname' },
  ],
  source: {
    sourceId: '@S3@',
    abbr: 'KB Heiraten',
    title: '',
    quay: 3,
    pagePattern: 'Nr. […]',
    urlPattern: '',
    pageCarry: false,
    urlCarry: false,
  },
});

describe('AppDataEntryTemplatesStore (BL-232)', () => {
  it('speichern → laden über das Bündel, als Abschnitt DERSELBEN Datei', async () => {
    const bundle = new MemoryAppDataStore();
    const store = new AppDataEntryTemplatesStore(svcOf(bundle));

    await store.save([EIGEN]);
    const geladen = await store.load();

    expect(geladen).toHaveLength(1);
    expect(geladen[0].label).toBe('Trauregister Ochtrup');
    expect(geladen[0].slots).toHaveLength(2);
    expect(bundle.wrapper?.sections.entryTemplates?.[0].id).toBe('eigene-1');
    expect(bundle.wrapper?.schemaVersion).toBe(APP_DATA_SCHEMA_VERSION);
  });

  it('leeres Bündel ⇒ leere Liste, ohne zu schreiben', async () => {
    const bundle = new MemoryAppDataStore();
    const store = new AppDataEntryTemplatesStore(svcOf(bundle));
    expect(await store.load()).toEqual([]);
    expect(bundle.wrapper).toBeNull();
  });

  it('die Quellen-Vorbelegung reist MIT Fingerabdruck — keine nackte Id (ADR-v9-264 E7)', async () => {
    const bundle = new MemoryAppDataStore();
    await new AppDataEntryTemplatesStore(svcOf(bundle)).save([EIGEN]);
    const roh = JSON.stringify(bundle.wrapper?.sections.entryTemplates);
    expect(roh).toContain('@S3@');
    // Der Fingerabdruck ist die Bedingung dafür, dass die Id hier überhaupt stehen darf
    // (Spec 30 §2.3: „keine UNGEPRÜFTEN GEDCOM-Ids").
    expect(roh).toContain('KB Heiraten');
  });

  it('hebt eine von Hand bearbeitete Vorlage beim Laden auf die aktuelle Form', async () => {
    const kaputt = {
      id: 'fremd',
      label: 'Fremd',
      slots: [{ role: 'main', field: 'given' }, { role: 'main', field: 'unfug' }],
    };
    const bundle = new MemoryAppDataStore({
      schemaVersion: APP_DATA_SCHEMA_VERSION,
      rev: 1,
      device: 'geraet-B',
      ts: 1,
      sections: { entryTemplates: [kaputt as unknown as EntryTemplate] },
    });
    const geladen = await new AppDataEntryTemplatesStore(svcOf(bundle)).load();
    expect(geladen).toHaveLength(1);
    expect(geladen[0].slots).toHaveLength(1); // der unbrauchbare Slot fällt weg
    expect(geladen[0].slots[0].field).toBe('given');
  });

  it('ändert die übrigen Abschnitte nicht mit', async () => {
    const bundle = new MemoryAppDataStore({
      schemaVersion: APP_DATA_SCHEMA_VERSION,
      rev: 1,
      device: 'geraet-A',
      ts: 1,
      sections: { tour: { done: true } },
    });
    await new AppDataEntryTemplatesStore(svcOf(bundle)).save([EIGEN]);
    expect(bundle.wrapper?.sections.tour).toEqual({ done: true });
    expect(bundle.wrapper?.sections.entryTemplates).toHaveLength(1);
  });
});
