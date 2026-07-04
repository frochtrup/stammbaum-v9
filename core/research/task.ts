// core/research/task.ts — ResearchTask (Spec 12 §1).
// Invariante (32 §6): done === (status === 'done'). Der Kanban-`status` ist die
// einzige Wahrheit; `done` wird immer daraus abgeleitet — nie unabhängig gesetzt.
import type { ResearchTask, TaskStatus } from './types';

/** `done` deterministisch aus dem Status ableiten (die einzige Quelle der Wahrheit). */
export function isTaskDone(t: Pick<ResearchTask, 'status'>): boolean {
  return t.status === 'done';
}

/**
 * Konstruktor. Ein per Patch übergebenes `done` wird IGNORIERT und aus `status`
 * neu abgeleitet — so kann kein widersprüchlicher Zustand entstehen.
 */
export function makeTask(
  id: string,
  patch: Partial<Omit<ResearchTask, 'id' | 'done'>> = {},
): ResearchTask {
  const status: TaskStatus = patch.status ?? 'todo';
  return {
    id,
    text: patch.text ?? '',
    category: patch.category ?? '',
    status,
    done: status === 'done',
    created: patch.created ?? '',
  };
}

/** Setzt den Status und hält `done` synchron (reine Funktion, neues Objekt). */
export function setTaskStatus(t: ResearchTask, status: TaskStatus): ResearchTask {
  return { ...t, status, done: status === 'done' };
}
