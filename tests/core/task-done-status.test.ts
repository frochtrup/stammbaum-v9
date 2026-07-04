// Spec 12 §1 — ResearchTask.
// INV (Kontrakt-Matrix 32 §6): done === (status === 'done'). Der Kanban-Status
// ist die Wahrheit; `done` ist eine abgeleitete, nie unabhängig setzbare Sicht.
import { describe, it, expect } from 'vitest';
import { makeTask, setTaskStatus, isTaskDone } from '../../core/research/index';

describe("Spec 12 §1: Task done === (status === 'done')", () => {
  it('frischer Task ist todo und nicht done', () => {
    const t = makeTask('t1', { text: 'Kirchenbuch Hildesheim prüfen', created: '2026-07-04' });
    expect(t.status).toBe('todo');
    expect(t.done).toBe(false);
    expect(t.done).toBe(t.status === 'done');
  });

  it('done-Feld folgt jedem Status (Invariante hält über alle drei Werte)', () => {
    for (const status of ['todo', 'doing', 'done'] as const) {
      const t = makeTask('t', { status });
      expect(t.done).toBe(status === 'done');
    }
  });

  it('setTaskStatus hält die Invariante done === (status === done)', () => {
    let t = makeTask('t2', { text: 'x' });
    t = setTaskStatus(t, 'doing');
    expect(t.done).toBe(false);
    t = setTaskStatus(t, 'done');
    expect(t.status).toBe('done');
    expect(t.done).toBe(true);
    t = setTaskStatus(t, 'todo');
    expect(t.done).toBe(false);
  });

  it('done lässt sich NICHT unabhängig setzen: ein Patch mit done=true ohne status=done wird korrigiert', () => {
    // Der Konstruktor leitet `done` immer aus `status` ab — ein widersprüchlicher
    // Patch (done=true, status=todo) kann die Invariante nicht brechen.
    const t = makeTask('t3', { status: 'todo', done: true } as never);
    expect(t.status).toBe('todo');
    expect(t.done).toBe(false);
  });

  it('isTaskDone spiegelt den Status, unabhängig vom gespeicherten done-Flag', () => {
    const t = makeTask('t4', { status: 'done' });
    expect(isTaskDone(t)).toBe(true);
    expect(isTaskDone(makeTask('t5', { status: 'doing' }))).toBe(false);
  });

  it('created wird injiziert, nicht aus der Wall-Clock gelesen (TST-3)', () => {
    const t = makeTask('t6', { created: '1999-12-31' });
    expect(t.created).toBe('1999-12-31');
  });
});
