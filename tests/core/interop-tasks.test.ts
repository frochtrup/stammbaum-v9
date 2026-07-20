// tests/core/interop-tasks.test.ts — Parse + Write-Back für ResearchTask an INDI/FAM
// (Spec 12 §1 Wire-Format `_TASK`/`_ID`/`_CAT`/`_TSTAT`/`_DONE`/DATE; Spec 13 §2.3).
//
// Verriegelt insbesondere die `_REPO_MODELLED`-Falle: sobald `_TASK` modelliert ist, MUSS
// es aus dem Passthrough herausgelöst werden, sonst Doppelschreibung pro Roundtrip. Der
// nicht-mutierende Roundtrip-Test (byte-identisch) ist der kritischste Fall.

import { describe, it, expect } from 'vitest';
import { parseGedcom, serializeGedcom, applyDatabaseToRoots } from '../../core/interop';
import { makeTask } from '../../core/research';
import type { ParsedGedcom } from '../../core/interop';

/** roots durch Write-Back schicken und serialisieren (Editier-Pfad, wie ADR-v9-32). */
function serializeAfterWriteBack(doc: ParsedGedcom): string {
  return serializeGedcom({ db: doc.db, roots: applyDatabaseToRoots(doc.db, doc.roots) });
}

// Fixture: ein INDI mit ZWEI _TASK-Blöcken + Passthrough-Tag, ein FAM mit EINEM _TASK-Block.
// Reihenfolge/Tags nach v8-Oracle (gedcom-writer.js _writeINDIExt): _CAT, _DONE(0/1),
// _TSTAT, _DATE, _ID, SOUR (ADR-v9-35/36).
const FIXTURE = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 5.5.1',
  '0 @I1@ INDI',
  '1 NAME Max /Muster/',
  '1 SEX M',
  '1 _FOO unbekannt bleibt Passthrough',
  '1 _TASK Kirchenbuch Ochtrup prüfen',
  '2 _CAT Kirchenbuch',
  '2 _DONE 0',
  '2 _TSTAT todo',
  '2 _DATE 2026-07-01',
  '2 _ID t_aaa',
  '1 _TASK Heiratsurkunde bestellen',
  '2 _CAT Urkunde',
  '2 _DONE 1',
  '2 _TSTAT done',
  '2 _DATE 2026-07-02',
  '2 _ID t_bbb',
  '2 SOUR @S9@',
  '0 @F1@ FAM',
  '1 HUSB @I1@',
  '1 _TASK Trauzeugen recherchieren',
  '2 _CAT Online-Recherche',
  '2 _DONE 0',
  '2 _TSTAT doing',
  '2 _DATE 2026-07-03',
  '2 _ID t_ccc',
  '0 TRLR',
].join('\n');

describe('interop tasks — Parse', () => {
  it('parst _TASK-Blöcke auf INDI und FAM in ResearchTask[] (Reihenfolge erhalten)', () => {
    const { db } = parseGedcom(FIXTURE);
    const p = db.individuals.get('@I1@')!;
    expect(p.tasks).toEqual([
      { id: 't_aaa', text: 'Kirchenbuch Ochtrup prüfen', category: 'Kirchenbuch', status: 'todo', done: false, created: '2026-07-01', sourceRef: '' },
      { id: 't_bbb', text: 'Heiratsurkunde bestellen', category: 'Urkunde', status: 'done', done: true, created: '2026-07-02', sourceRef: '@S9@' },
    ]);
    const f = db.families.get('@F1@')!;
    expect(f.tasks).toEqual([
      { id: 't_ccc', text: 'Trauzeugen recherchieren', category: 'Online-Recherche', status: 'doing', done: false, created: '2026-07-03', sourceRef: '' },
    ]);
  });

  it('leitet done immer aus _TSTAT ab (ignoriert widersprüchliches _DONE)', () => {
    const src = [
      '0 HEAD', '1 GEDC', '2 VERS 5.5.1',
      '0 @I1@ INDI',
      '1 _TASK widerspruch',
      '2 _ID t_x',
      '2 _TSTAT done',
      '2 _DONE 0', // widersprüchlich — status gewinnt
      '0 TRLR',
    ].join('\n');
    const { db } = parseGedcom(src);
    expect(db.individuals.get('@I1@')!.tasks[0].done).toBe(true);
  });

  it('parst optionales SOUR unter _TASK in sourceRef (roher @Sxx@-Xref)', () => {
    const { db } = parseGedcom(FIXTURE);
    expect(db.individuals.get('@I1@')!.tasks[1].sourceRef).toBe('@S9@');
    expect(db.individuals.get('@I1@')!.tasks[0].sourceRef).toBe('');
  });
});

describe('interop tasks — Write-Back Roundtrip', () => {
  it('nicht-mutierender Roundtrip ist byte-identisch (_TASK NICHT doppelt — _REPO_MODELLED-Falle)', () => {
    const doc = parseGedcom(FIXTURE);
    const out = serializeAfterWriteBack(doc);
    const expected = FIXTURE.split('\n').join('\r\n');
    expect(out).toBe(expected);
    // Doppelt-Guard: die Zeile darf genau einmal je Task auftauchen.
    expect(out.match(/_TASK Kirchenbuch Ochtrup prüfen/g)!.length).toBe(1);
  });

  it('out1 === out2 (Idempotenz, RT-1)', () => {
    const doc1 = parseGedcom(FIXTURE);
    const out1 = serializeAfterWriteBack(doc1);
    const doc2 = parseGedcom(out1);
    const out2 = serializeAfterWriteBack(doc2);
    expect(out2).toBe(out1);
  });

  it('unveränderter Record bleibt die IDENTISCHE GedNode-Referenz (kein Neubau)', () => {
    const doc = parseGedcom(FIXTURE);
    const before = doc.roots.find((r) => r.xref === '@I1@')!;
    const after = applyDatabaseToRoots(doc.db, doc.roots).find((r) => r.xref === '@I1@')!;
    expect(after).toBe(before);
  });
});

describe('interop tasks — Mutationen überleben Roundtrip', () => {
  it('Aufgabe hinzufügen: neue _TASK-Zeile mit allen Feldern nach Re-Parse vorhanden', () => {
    const doc = parseGedcom(FIXTURE);
    doc.db.individuals.get('@I1@')!.tasks.push(
      makeTask('t_new', { text: 'Neue Aufgabe', category: 'Archiv', status: 'todo', created: '2026-07-05' }),
    );
    const round = parseGedcom(serializeAfterWriteBack(doc));
    const tasks = round.db.individuals.get('@I1@')!.tasks;
    expect(tasks.length).toBe(3);
    expect(tasks[2]).toEqual({ id: 't_new', text: 'Neue Aufgabe', category: 'Archiv', status: 'todo', done: false, created: '2026-07-05', sourceRef: '' });
    // Passthrough unangetastet
    expect(serializeAfterWriteBack(doc)).toContain('_FOO unbekannt bleibt Passthrough');
  });

  it('Aufgabe ändern (Status): nur das geänderte Feld unterscheidet sich, Rest unangetastet', () => {
    const doc = parseGedcom(FIXTURE);
    const t = doc.db.individuals.get('@I1@')!.tasks[0];
    t.status = 'done';
    t.done = true;
    const round = parseGedcom(serializeAfterWriteBack(doc));
    const tasks = round.db.individuals.get('@I1@')!.tasks;
    expect(tasks[0].status).toBe('done');
    expect(tasks[0].done).toBe(true);
    // Andere Felder desselben Tasks unverändert
    expect(tasks[0].text).toBe('Kirchenbuch Ochtrup prüfen');
    // Zweiter Task unverändert
    expect(tasks[1]).toEqual({ id: 't_bbb', text: 'Heiratsurkunde bestellen', category: 'Urkunde', status: 'done', done: true, created: '2026-07-02', sourceRef: '@S9@' });
    // Passthrough unangetastet
    expect(serializeAfterWriteBack(doc)).toContain('_FOO unbekannt bleibt Passthrough');
  });

  it('Aufgabe ändern (Text/Kategorie) an FAM überlebt', () => {
    const doc = parseGedcom(FIXTURE);
    const t = doc.db.families.get('@F1@')!.tasks[0];
    t.text = 'Trauzeugen im Archiv X';
    t.category = 'Archiv';
    const round = parseGedcom(serializeAfterWriteBack(doc));
    const rt = round.db.families.get('@F1@')!.tasks[0];
    expect(rt.text).toBe('Trauzeugen im Archiv X');
    expect(rt.category).toBe('Archiv');
    expect(rt.status).toBe('doing');
  });

  it('Aufgabe löschen: der _TASK-Block ist weg, der andere bleibt', () => {
    const doc = parseGedcom(FIXTURE);
    const p = doc.db.individuals.get('@I1@')!;
    p.tasks = p.tasks.filter((x) => x.id !== 't_aaa');
    const out = serializeAfterWriteBack(doc);
    expect(out).not.toContain('Kirchenbuch Ochtrup prüfen');
    expect(out).toContain('Heiratsurkunde bestellen');
    const round = parseGedcom(out);
    const tasks = round.db.individuals.get('@I1@')!.tasks;
    expect(tasks.length).toBe(1);
    expect(tasks[0].id).toBe('t_bbb');
    // Passthrough unangetastet
    expect(out).toContain('_FOO unbekannt bleibt Passthrough');
  });

  it('sourceRef setzen/entfernen überlebt Roundtrip (SOUR-Zeile erscheint/verschwindet)', () => {
    // Setzen an einem Task, der bisher keinen Bezug hatte.
    const doc = parseGedcom(FIXTURE);
    doc.db.individuals.get('@I1@')!.tasks[0].sourceRef = '@S3@';
    const out = serializeAfterWriteBack(doc);
    expect(out).toContain('2 SOUR @S3@');
    const round = parseGedcom(out);
    expect(round.db.individuals.get('@I1@')!.tasks[0].sourceRef).toBe('@S3@');

    // Entfernen am Task, der einen Bezug hatte (t_bbb → @S9@).
    const doc2 = parseGedcom(FIXTURE);
    doc2.db.individuals.get('@I1@')!.tasks[1].sourceRef = '';
    const out2 = serializeAfterWriteBack(doc2);
    expect(out2).not.toContain('SOUR @S9@');
    const round2 = parseGedcom(out2);
    expect(round2.db.individuals.get('@I1@')!.tasks[1].sourceRef).toBe('');
  });
});
