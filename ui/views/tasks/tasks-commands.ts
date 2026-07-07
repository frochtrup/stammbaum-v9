// ui/views/tasks/tasks-commands.ts — Mutations-Kommandos für ResearchTask an Person/
// Familie (Spec 20 §1.11 [K]). Analog core/places/commands.ts: Kommandos nehmen ein
// VOLLSTÄNDIGES Objekt bzw. eine vollständige id entgegen, keine verstreuten Feld-
// Setter aus dem DOM.
//
// Bewusst in ui/, NICHT in core/research (Auftrags-Vorgabe): core/research/task.ts hat
// nur reine Konstruktoren/Helfer (makeTask/setTaskStatus/isTaskDone), keine db-Mutations-
// Kommandos. Diese Funktionen mutieren Person/Family in-place (analog
// core/places/commands.ts `linkEventToPlace` — Event-/Task-Arrays werden von ihren
// Owner-Objekten referenziert) und werden von einem AppState-Kommando aufgerufen, das
// die Svelte-Reaktivität auslöst (Reassign obliegt der Schale, s. app-state.svelte.ts).
// Kein DOM/I/O hier — reine Datenmutation, die Zeitstempel-Injektion (`created`, TST-3)
// erfolgt über einen übergebenen `now`-Wert, nie über direkten `Date.now()`-Aufruf im
// Kommando selbst (Aufrufer entscheidet die Uhrzeit, testbar ohne Wall-Clock-Mocking).
import type { Database, FamilyId, PersonId, SourceId } from '../../../core/model/types';
import { makeTask } from '../../../core/research/index';
import type { TaskStatus } from '../../../core/research/types';
import type { TaskEntityKind } from './tasks-model';

/** Liefert das tasks[]-Array der Zielentität, oder null wenn die Entität fehlt. */
function tasksArrayOf(db: Database, kind: TaskEntityKind, entityId: PersonId | FamilyId) {
  if (kind === 'person') return db.individuals.get(entityId)?.tasks ?? null;
  return db.families.get(entityId)?.tasks ?? null;
}

/**
 * Kommando: legt eine neue Aufgabe an einer Person ODER Familie an (Upsert-artig: Task
 * ist neu, id wird injiziert). Gibt `false` zurück, wenn die Zielentität nicht existiert
 * (kein stiller Verlust, s. Spec 21 "nie stiller Abbruch").
 */
export function addTask(
  db: Database,
  kind: TaskEntityKind,
  entityId: PersonId | FamilyId,
  taskId: string,
  text: string,
  category: string,
  now: string,
  sourceRef: SourceId | '' = '',
): boolean {
  const arr = tasksArrayOf(db, kind, entityId);
  if (!arr) return false;
  arr.push(makeTask(taskId, { text: text.trim(), category, created: now, sourceRef }));
  return true;
}

/** Kommando: ersetzt Text/Kategorie/Quellen-Bezug einer bestehenden Aufgabe vollständig (Bearbeiten-Formular). */
export function updateTask(
  db: Database,
  kind: TaskEntityKind,
  entityId: PersonId | FamilyId,
  taskId: string,
  text: string,
  category: string,
  sourceRef: SourceId | '' = '',
): boolean {
  const arr = tasksArrayOf(db, kind, entityId);
  const t = arr?.find((x) => x.id === taskId);
  if (!t) return false;
  t.text = text.trim();
  t.category = category;
  t.sourceRef = sourceRef;
  return true;
}

/** Kommando: setzt den Kanban-Status einer Aufgabe (hält `done` synchron, s. setTaskStatus-Invariante). */
export function setTaskStatusById(
  db: Database,
  kind: TaskEntityKind,
  entityId: PersonId | FamilyId,
  taskId: string,
  status: TaskStatus,
): boolean {
  const arr = tasksArrayOf(db, kind, entityId);
  const t = arr?.find((x) => x.id === taskId);
  if (!t) return false;
  t.status = status;
  t.done = status === 'done';
  return true;
}

/** Kommando: entfernt eine Aufgabe. */
export function deleteTask(
  db: Database,
  kind: TaskEntityKind,
  entityId: PersonId | FamilyId,
  taskId: string,
): boolean {
  const owner = kind === 'person' ? db.individuals.get(entityId) : db.families.get(entityId);
  if (!owner) return false;
  const before = owner.tasks.length;
  owner.tasks = owner.tasks.filter((t) => t.id !== taskId);
  return owner.tasks.length !== before;
}

/** Deterministische Task-Id (kein GEDCOM-Xref-Format nötig — `_ID` ist ein freier String, Spec 12 §1). */
export function newTaskId(): string {
  return `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
