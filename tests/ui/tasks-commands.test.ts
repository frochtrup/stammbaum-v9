// tests/ui/tasks-commands.test.ts — Mutations-Kommandos für ResearchTask (Spec 20
// §1.11 [K]). Kein DOM nötig (reine Datenmutation) — läuft im globalen 'node'-Environment.
import { describe, expect, it } from 'vitest';
import { makeDatabase, makePerson, makeFamily } from '../../core/model/index';
import { addTask, updateTask, setTaskStatusById, deleteTask } from '../../ui/views/tasks/tasks-commands';

describe('addTask — legt eine Aufgabe an Person oder Familie an', () => {
  it('fügt eine Aufgabe zu einer Person hinzu, created wird injiziert (kein Date.now() im Kommando)', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@'));

    const ok = addTask(db, 'person', '@I1@', 't1', ' Kirchenbuch prüfen ', 'Kirchenbuch', '2026-07-04');

    expect(ok).toBe(true);
    const t = db.individuals.get('@I1@')!.tasks[0]!;
    expect(t.text).toBe('Kirchenbuch prüfen'); // getrimmt
    expect(t.category).toBe('Kirchenbuch');
    expect(t.created).toBe('2026-07-04');
    expect(t.status).toBe('todo');
    expect(t.done).toBe(false);
  });

  it('fügt eine Aufgabe zu einer Familie hinzu', () => {
    const db = makeDatabase();
    db.families.set('@F1@', makeFamily('@F1@'));

    const ok = addTask(db, 'family', '@F1@', 't1', 'Heiratsurkunde beschaffen', 'Urkunde', '2026-07-04');

    expect(ok).toBe(true);
    expect(db.families.get('@F1@')!.tasks).toHaveLength(1);
  });

  it('akzeptiert eine freie Kategorie außerhalb der v8-Presets (kein geschlossenes Enum)', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@'));

    addTask(db, 'person', '@I1@', 't1', 'x', 'Ahnenforschung.de-Match', '2026-07-04');

    expect(db.individuals.get('@I1@')!.tasks[0]!.category).toBe('Ahnenforschung.de-Match');
  });

  it('gibt false zurück, wenn die Zielentität nicht existiert (kein stiller Verlust)', () => {
    const db = makeDatabase();
    expect(addTask(db, 'person', '@I999@', 't1', 'x', 'Kirchenbuch', '2026-07-04')).toBe(false);
  });
});

describe('updateTask — Text/Kategorie einer bestehenden Aufgabe ersetzen', () => {
  it('aktualisiert Text und Kategorie', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@'));
    addTask(db, 'person', '@I1@', 't1', 'alt', 'Kirchenbuch', '2026-07-04');

    const ok = updateTask(db, 'person', '@I1@', 't1', 'neu', 'Urkunde');

    expect(ok).toBe(true);
    const t = db.individuals.get('@I1@')!.tasks[0]!;
    expect(t.text).toBe('neu');
    expect(t.category).toBe('Urkunde');
  });

  it('gibt false zurück, wenn die Aufgabe nicht existiert', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@'));
    expect(updateTask(db, 'person', '@I1@', 'missing', 'x', 'y')).toBe(false);
  });
});

describe('setTaskStatusById — Kanban-Status, done bleibt synchron', () => {
  it('setzt den Status und synchronisiert done', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@'));
    addTask(db, 'person', '@I1@', 't1', 'x', 'Kirchenbuch', '2026-07-04');

    setTaskStatusById(db, 'person', '@I1@', 't1', 'doing');
    expect(db.individuals.get('@I1@')!.tasks[0]!.done).toBe(false);

    setTaskStatusById(db, 'person', '@I1@', 't1', 'done');
    const t = db.individuals.get('@I1@')!.tasks[0]!;
    expect(t.status).toBe('done');
    expect(t.done).toBe(true);
  });
});

describe('deleteTask — entfernt eine Aufgabe', () => {
  it('entfernt genau die angegebene Aufgabe', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@'));
    addTask(db, 'person', '@I1@', 't1', 'a', 'Kirchenbuch', '2026-07-04');
    addTask(db, 'person', '@I1@', 't2', 'b', 'Kirchenbuch', '2026-07-04');

    const ok = deleteTask(db, 'person', '@I1@', 't1');

    expect(ok).toBe(true);
    const remaining = db.individuals.get('@I1@')!.tasks;
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe('t2');
  });

  it('gibt false zurück, wenn nichts entfernt wurde', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@'));
    expect(deleteTask(db, 'person', '@I1@', 'missing')).toBe(false);
  });
});
