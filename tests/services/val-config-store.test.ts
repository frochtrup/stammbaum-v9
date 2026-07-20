// Persistenz-Rundlauf der Regel-Konfiguration (Spec 20 §3, ADR-v9-96).
// Gegen eine In-Memory-Attrappe des Speicher-Vertrags — kein echtes IndexedDB nötig
// (TST-3: Plattform-APIs bleiben hinter injizierbaren Adaptern).
import { describe, expect, it } from 'vitest';
import { loadValConfig, type ValConfigStore } from '../../services/validate/index';
import { configFromStored, configToStored, defaultConfig } from '../../core/validate/index';
import type { StoredValidationConfig } from '../../core/validate/index';

class MemoryStore implements ValConfigStore {
  constructor(public value: StoredValidationConfig | null = null) {}
  async load() { return this.value; }
  async save(cfg: StoredValidationConfig) { this.value = cfg; }
  async clear() { this.value = null; }
}

class BrokenStore implements ValConfigStore {
  async load(): Promise<StoredValidationConfig | null> { throw new Error('IDB weg'); }
  async save() { throw new Error('IDB weg'); }
  async clear() { throw new Error('IDB weg'); }
}

describe('ValConfigStore', () => {
  it('speichern → laden erhält Abschaltungen und Schwellen', async () => {
    const store = new MemoryStore();
    const cfg = defaultConfig();
    await store.save(configToStored({
      ...cfg,
      disabled: new Set(['MISSING_SEX']),
      thresholds: { ...cfg.thresholds, maxAge: 99 },
    }));

    const wieder = configFromStored(await loadValConfig(store));
    expect(wieder.disabled.has('MISSING_SEX')).toBe(true);
    expect(wieder.thresholds.maxAge).toBe(99);
  });

  it('ein defekter Speicher blockiert die Prüfung nicht — er fällt auf die Defaults zurück', async () => {
    // Der wichtigere Fall: „Website-Daten löschen" darf die Datenprüfung nicht lahmlegen.
    const cfg = configFromStored(await loadValConfig(new BrokenStore()));
    expect([...cfg.disabled].sort()).toEqual(['MISSING_EVAL', 'OPEN_HYPO']);
  });

  it('leerer Speicher liefert den Auslieferungszustand', async () => {
    const cfg = configFromStored(await loadValConfig(new MemoryStore(null)));
    expect(cfg.thresholds.maxAge).toBe(110);
  });
});
