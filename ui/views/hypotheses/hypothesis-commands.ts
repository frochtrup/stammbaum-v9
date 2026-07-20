// ui/views/hypotheses/hypothesis-commands.ts — Mutations-Kommandos für Hypothesen an
// Person/Familie (Spec 12 §4, Spec 20 §1.11 [S]). Analog ui/views/tasks/tasks-commands.ts
// — Hypothesis HAT eine `id` (anders als LogEntry), adressierbar wie Task.
//
// Bewusst in ui/, NICHT in core/research: core/research/hypothesis.ts hat nur die
// reinen Konstruktoren/Helfer (makeHypothesis/addHypothesisEvidence), keine
// db-Mutations-Kommandos. Kein DOM/I/O hier — reine Datenmutation, `now`/`id` werden
// vom Aufrufer injiziert (TST-3), nie per Date.now()/Math.random() im Kommando selbst.
//
// COPY-ON-WRITE (ADR-v9-92, BL-01): nimmt eine eingefrorene `ReadonlyDatabase` entgegen
// und gibt einen NEUEN Stand zurück, statt Person/Family in-place zu mutieren — sonst
// sähe ein zurückgehaltener Undo-Snapshot die Änderung sofort mit. `null` = nicht
// angewandt (Zielentität/Hypothese fehlt), kein stiller Verlust.
import type { Database, FamilyId, PersonId } from '../../../core/model/types';
import { editDatabase, type ReadonlyDatabase } from '../../../core/model/draft';
import { ownerOf } from '../entity-draft';
import { makeHypothesis } from '../../../core/research/index';
import type { Hypothesis } from '../../../core/research/types';
import type { TaskEntityKind } from '../tasks/tasks-model';

/**
 * Kommando: legt eine neue Hypothese an einer Person ODER Familie an (Upsert-artig:
 * Hypothese ist neu, id wird injiziert).
 */
export function addHypothesis(
  db: ReadonlyDatabase,
  kind: TaskEntityKind,
  entityId: PersonId | FamilyId,
  id: string,
  patch: Partial<Omit<Hypothesis, 'id'>>,
  now: string,
): Database | null {
  let applied = false;
  const next = editDatabase(db, (d) => {
    const owner = ownerOf(d, kind, entityId);
    if (!owner) return;
    owner.hypotheses.push(makeHypothesis(id, { ...patch, created: patch.created ?? now }));
    applied = true;
  });
  return applied ? next : null;
}

/** Kommando: ersetzt eine bestehende Hypothese vollständig (Bearbeiten-Formular). */
export function updateHypothesis(
  db: ReadonlyDatabase,
  kind: TaskEntityKind,
  entityId: PersonId | FamilyId,
  id: string,
  patch: Partial<Omit<Hypothesis, 'id'>>,
): Database | null {
  let applied = false;
  const next = editDatabase(db, (d) => {
    const owner = ownerOf(d, kind, entityId);
    const idx = owner?.hypotheses.findIndex((h) => h.id === id) ?? -1;
    if (!owner || idx < 0) return;
    const existing = owner.hypotheses[idx]!;
    owner.hypotheses[idx] = makeHypothesis(id, { ...existing, ...patch });
    applied = true;
  });
  return applied ? next : null;
}

/** Kommando: entfernt eine Hypothese. */
export function deleteHypothesis(
  db: ReadonlyDatabase,
  kind: TaskEntityKind,
  entityId: PersonId | FamilyId,
  id: string,
): Database | null {
  let applied = false;
  const next = editDatabase(db, (d) => {
    const owner = ownerOf(d, kind, entityId);
    if (!owner) return;
    const before = owner.hypotheses.length;
    owner.hypotheses = owner.hypotheses.filter((h) => h.id !== id);
    applied = owner.hypotheses.length !== before;
  });
  return applied ? next : null;
}

/** Deterministische Hypothesen-Id (kein GEDCOM-Xref-Format nötig, analog newTaskId()). */
export function newHypothesisId(): string {
  return `h_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
