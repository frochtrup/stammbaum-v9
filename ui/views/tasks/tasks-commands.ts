// ui/views/tasks/tasks-commands.ts — Mutations-Kommandos für ResearchTask an Person/
// Familie (Spec 20 §1.11 [K]). Analog core/places/commands.ts: Kommandos nehmen ein
// VOLLSTÄNDIGES Objekt bzw. eine vollständige id entgegen, keine verstreuten Feld-
// Setter aus dem DOM.
//
// Bewusst in ui/, NICHT in core/research (Auftrags-Vorgabe): core/research/task.ts hat
// nur reine Konstruktoren/Helfer (makeTask/setTaskStatus/isTaskDone), keine db-Mutations-
// Kommandos. Kein DOM/I/O hier — reine Datenmutation, die Zeitstempel-Injektion
// (`created`, TST-3) erfolgt über einen übergebenen `now`-Wert, nie über direkten
// `Date.now()`-Aufruf im Kommando selbst (Aufrufer entscheidet die Uhrzeit, testbar ohne
// Wall-Clock-Mocking).
//
// COPY-ON-WRITE (ADR-v9-92, BL-01): Diese Kommandos mutierten Person/Family früher
// IN-PLACE. Das ist mit Undo/Redo unvereinbar — ein zurückgehaltener Snapshot teilt die
// Entitäts-Objekte und sah `addTask`-Änderungen sofort mit (am Code belegt). Sie nehmen
// jetzt eine eingefrorene `ReadonlyDatabase` entgegen und geben einen NEUEN Stand zurück;
// bearbeitbare Objekte gibt es nur über den Draft (core/model/draft.ts). `null` bedeutet
// „nicht angewandt" (Zielentität/Aufgabe fehlt) — kein stiller Verlust, Spec 21.
import type { Database, FamilyId, PersonId, SourceId } from '../../../core/model/types';
import { editDatabase, type ReadonlyDatabase } from '../../../core/model/draft';
import { ownerOf } from '../entity-draft';
import { makeTask } from '../../../core/research/index';
import type { TaskStatus } from '../../../core/research/types';
import type { TaskEntityKind } from './tasks-model';

/**
 * Kommando: legt eine neue Aufgabe an einer Person ODER Familie an (Upsert-artig: Task
 * ist neu, id wird injiziert). Gibt `null` zurück, wenn die Zielentität nicht existiert.
 */
export function addTask(
  db: ReadonlyDatabase,
  kind: TaskEntityKind,
  entityId: PersonId | FamilyId,
  taskId: string,
  text: string,
  category: string,
  now: string,
  sourceRef: SourceId | '' = '',
): Database | null {
  let applied = false;
  const next = editDatabase(db, (d) => {
    const owner = ownerOf(d, kind, entityId);
    if (!owner) return;
    owner.tasks.push(makeTask(taskId, { text: text.trim(), category, created: now, sourceRef }));
    applied = true;
  });
  return applied ? next : null;
}

/** Kommando: ersetzt Text/Kategorie/Quellen-Bezug einer bestehenden Aufgabe vollständig (Bearbeiten-Formular). */
export function updateTask(
  db: ReadonlyDatabase,
  kind: TaskEntityKind,
  entityId: PersonId | FamilyId,
  taskId: string,
  text: string,
  category: string,
  sourceRef: SourceId | '' = '',
): Database | null {
  let applied = false;
  const next = editDatabase(db, (d) => {
    const t = ownerOf(d, kind, entityId)?.tasks.find((x) => x.id === taskId);
    if (!t) return;
    t.text = text.trim();
    t.category = category;
    t.sourceRef = sourceRef;
    applied = true;
  });
  return applied ? next : null;
}

/** Kommando: setzt den Kanban-Status einer Aufgabe (hält `done` synchron, s. setTaskStatus-Invariante). */
export function setTaskStatusById(
  db: ReadonlyDatabase,
  kind: TaskEntityKind,
  entityId: PersonId | FamilyId,
  taskId: string,
  status: TaskStatus,
): Database | null {
  let applied = false;
  const next = editDatabase(db, (d) => {
    const t = ownerOf(d, kind, entityId)?.tasks.find((x) => x.id === taskId);
    if (!t) return;
    t.status = status;
    t.done = status === 'done';
    applied = true;
  });
  return applied ? next : null;
}

/** Kommando: entfernt eine Aufgabe. */
export function deleteTask(
  db: ReadonlyDatabase,
  kind: TaskEntityKind,
  entityId: PersonId | FamilyId,
  taskId: string,
): Database | null {
  let applied = false;
  const next = editDatabase(db, (d) => {
    const owner = ownerOf(d, kind, entityId);
    if (!owner) return;
    const before = owner.tasks.length;
    owner.tasks = owner.tasks.filter((t) => t.id !== taskId);
    applied = owner.tasks.length !== before;
  });
  return applied ? next : null;
}

/** Deterministische Task-Id (kein GEDCOM-Xref-Format nötig — `_ID` ist ein freier String, Spec 12 §1). */
export function newTaskId(): string {
  return `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
