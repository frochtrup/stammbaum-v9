// tests/ui/proband.test.ts — Proband-Auflösung (BL-120, ADR-v9-135). Der Session-Zustand
// (ViewState) + die effektive-Proband-Regel (kleinste ID als Default). Headless.
import { describe, expect, it } from 'vitest';
import { makeDatabase, makePerson, smallestPersonId } from '../../core/model';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { resolveProband } from '../../ui/shell/proband';

function dbWith(...ids: string[]) {
  const db = makeDatabase();
  for (const id of ids) db.individuals.set(id, makePerson(id));
  return db;
}

describe('smallestPersonId (Kern)', () => {
  it('liefert die lexikografisch kleinste ID', () => {
    expect(smallestPersonId(dbWith('@I3@', '@I1@', '@I2@'))).toBe('@I1@');
  });
  it('null bei leerer Datenbank', () => {
    expect(smallestPersonId(makeDatabase())).toBeNull();
  });
});

describe('resolveProband (effektive Referenzperson)', () => {
  it('Default = kleinste ID, wenn nichts gesetzt', () => {
    const db = dbWith('@I2@', '@I1@');
    expect(resolveProband(db, createViewState())).toBe('@I1@');
  });

  it('nutzt den gesetzten Proband, wenn er im Bestand ist', () => {
    const db = dbWith('@I1@', '@I2@');
    const vs = createViewState();
    vs.setProband('@I2@');
    expect(resolveProband(db, vs)).toBe('@I2@');
  });

  it('fällt auf kleinste ID zurück, wenn der gesetzte Proband nicht (mehr) existiert', () => {
    const db = dbWith('@I1@', '@I2@');
    const vs = createViewState();
    vs.setProband('@I99@'); // z. B. nach Datei-Wechsel
    expect(resolveProband(db, vs)).toBe('@I1@');
  });

  it('null bei leerer Datenbank', () => {
    expect(resolveProband(makeDatabase(), createViewState())).toBeNull();
  });
});
