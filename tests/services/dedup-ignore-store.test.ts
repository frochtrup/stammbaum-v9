// tests/services/dedup-ignore-store.test.ts — Ignorier-Liste der Duplikat-Erkennung
// (BL-105, ADR-v9-104). Prüft den Vertrag und das Ausfallverhalten, nicht IndexedDB
// selbst (Plattform-API bleibt hinter dem Store, TST-3).
import { describe, expect, it } from 'vitest';
import { loadIgnoredPairs, type DedupIgnoreStore } from '../../services/dedup';
import { pairKey } from '../../core/dedup';

class MemoryStore implements DedupIgnoreStore {
  constructor(private keys: string[] = []) {}
  async load(): Promise<string[]> {
    return this.keys;
  }
  async save(keys: readonly string[]): Promise<void> {
    this.keys = [...keys];
  }
}

class BrokenStore implements DedupIgnoreStore {
  async load(): Promise<string[]> {
    throw new Error('IndexedDB nicht verfügbar');
  }
  async save(): Promise<void> {
    throw new Error('IndexedDB nicht verfügbar');
  }
}

describe('DedupIgnoreStore', () => {
  it('gibt Gespeichertes als Menge zurück', async () => {
    const store = new MemoryStore([pairKey('@I2@', '@I1@')]);
    const set = await loadIgnoredPairs(store);
    expect(set.has(pairKey('@I1@', '@I2@'))).toBe(true);
  });

  it('überlebt einen Speicher-Rundlauf', async () => {
    const store = new MemoryStore();
    await store.save([pairKey('@I1@', '@I2@'), pairKey('@I3@', '@I4@')]);
    expect((await loadIgnoredPairs(store)).size).toBe(2);
  });

  it('fällt bei defektem Speicher auf eine leere Liste zurück, statt zu werfen', async () => {
    // Der Nutzer sieht dann wieder abgehakte Paare (ärgerlich) statt gar keiner
    // Suche (kaputt) — dieselbe Haltung wie loadValConfig.
    await expect(loadIgnoredPairs(new BrokenStore())).resolves.toEqual(new Set());
  });

  it('der Schlüssel ist reihenfolge-unabhängig — sonst fände die Liste ihre Einträge nicht wieder', () => {
    // Der eine Grund, warum `pairKey` im Kern liegt und nicht je einmal in Finder,
    // Ansicht und Speicher nachgebaut wird.
    expect(pairKey('@I1@', '@I2@')).toBe(pairKey('@I2@', '@I1@'));
  });
});
