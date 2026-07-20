// tests/ui/log-commands.test.ts — Mutations-Kommandos für LogEntry (Spec 12 §2,
// Spec 20 §1.11 [S]). Kein DOM nötig (reine Datenmutation) — läuft im globalen
// 'node'-Environment. LogEntry ist index-adressiert (keine eigene id, s. log-commands.ts-Kopf).
import { describe, expect, it } from 'vitest';
import { makeDatabase, makePerson, makeFamily } from '../../core/model/index';
import { makeLogEntry } from '../../core/research/index';
import { addLogEntry, updateLogEntry, deleteLogEntry } from '../../ui/views/research-log/log-commands';

describe('addLogEntry — fügt einen Protokoll-Eintrag an Person oder Familie an', () => {
  it('fügt einen Eintrag zu einer Person hinzu (Append, keine id)', () => {
    let db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@'));

    const entry = makeLogEntry({ date: '2026-07-07', query: 'Taufeintrag suchen', result: 'pending' });
    const ok = addLogEntry(db, 'person', '@I1@', entry);
    db = ok ?? db;

    expect(ok).not.toBeNull();
    const log = db.individuals.get('@I1@')!.researchLog;
    expect(log).toHaveLength(1);
    expect(log[0]!.query).toBe('Taufeintrag suchen');
  });

  it('fügt einen Eintrag zu einer Familie hinzu', () => {
    let db = makeDatabase();
    db.families.set('@F1@', makeFamily('@F1@'));

    const ok = addLogEntry(db, 'family', '@F1@', makeLogEntry({ query: 'Heiratseintrag' }));

    db = ok ?? db;

    expect(ok).not.toBeNull();
    expect(db.families.get('@F1@')!.researchLog).toHaveLength(1);
  });

  it('kopiert den Eintrag (kein geteiltes Objekt mit dem Aufrufer)', () => {
    let db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@'));
    const entry = makeLogEntry({ query: 'x' });

    db = addLogEntry(db, 'person', '@I1@', entry) ?? db;
    entry.query = 'geändert';

    expect(db.individuals.get('@I1@')!.researchLog[0]!.query).toBe('x');
  });

  it('gibt false zurück, wenn die Zielentität nicht existiert (kein stiller Verlust)', () => {
    const db = makeDatabase();
    expect(addLogEntry(db, 'person', '@I999@', makeLogEntry())).toBeNull();
  });
});

describe('updateLogEntry — ersetzt einen Eintrag an gegebenem Index vollständig', () => {
  it('aktualisiert den Eintrag an Index 0', () => {
    let db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@'));
    db = addLogEntry(db, 'person', '@I1@', makeLogEntry({ query: 'alt', result: 'pending' })) ?? db;

    const ok = updateLogEntry(db, 'person', '@I1@', 0, makeLogEntry({ query: 'neu', result: 'found' }));

    db = ok ?? db;

    expect(ok).not.toBeNull();
    const e = db.individuals.get('@I1@')!.researchLog[0]!;
    expect(e.query).toBe('neu');
    expect(e.result).toBe('found');
  });

  it('gibt false zurück bei Index außerhalb des Arrays', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@'));
    expect(updateLogEntry(db, 'person', '@I1@', 0, makeLogEntry())).toBeNull();
    expect(updateLogEntry(db, 'person', '@I1@', -1, makeLogEntry())).toBeNull();
  });
});

describe('deleteLogEntry — entfernt einen Eintrag an gegebenem Index', () => {
  it('entfernt genau den Eintrag am angegebenen Index, Reihenfolge der übrigen bleibt', () => {
    let db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@'));
    db = addLogEntry(db, 'person', '@I1@', makeLogEntry({ query: 'a' })) ?? db;
    db = addLogEntry(db, 'person', '@I1@', makeLogEntry({ query: 'b' })) ?? db;
    db = addLogEntry(db, 'person', '@I1@', makeLogEntry({ query: 'c' })) ?? db;

    const ok = deleteLogEntry(db, 'person', '@I1@', 1);

    db = ok ?? db;

    expect(ok).not.toBeNull();
    const log = db.individuals.get('@I1@')!.researchLog;
    expect(log.map((e) => e.query)).toEqual(['a', 'c']);
  });

  it('gibt false zurück bei Index außerhalb des Arrays', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@'));
    expect(deleteLogEntry(db, 'person', '@I1@', 0)).toBeNull();
  });
});
