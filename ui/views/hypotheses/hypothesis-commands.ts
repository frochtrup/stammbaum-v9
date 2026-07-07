// ui/views/hypotheses/hypothesis-commands.ts — Mutations-Kommandos für Hypothesen an
// Person/Familie (Spec 12 §4, Spec 20 §1.11 [S]). Analog ui/views/tasks/tasks-commands.ts
// — Hypothesis HAT eine `id` (anders als LogEntry), adressierbar wie Task.
//
// Bewusst in ui/, NICHT in core/research: core/research/hypothesis.ts hat nur die
// reinen Konstruktoren/Helfer (makeHypothesis/addHypothesisEvidence), keine
// db-Mutations-Kommandos. Kein DOM/I/O hier — reine Datenmutation, `now`/`id` werden
// vom Aufrufer injiziert (TST-3), nie per Date.now()/Math.random() im Kommando selbst.
import type { Database, FamilyId, PersonId } from '../../../core/model/types';
import { makeHypothesis } from '../../../core/research/index';
import type { Hypothesis } from '../../../core/research/types';
import type { TaskEntityKind } from '../tasks/tasks-model';

/** Liefert das hypotheses[]-Array der Zielentität, oder null wenn die Entität fehlt. */
function hypothesesArrayOf(db: Database, kind: TaskEntityKind, entityId: PersonId | FamilyId) {
  if (kind === 'person') return db.individuals.get(entityId)?.hypotheses ?? null;
  return db.families.get(entityId)?.hypotheses ?? null;
}

/**
 * Kommando: legt eine neue Hypothese an einer Person ODER Familie an (Upsert-artig:
 * Hypothese ist neu, id wird injiziert). Gibt `false` zurück, wenn die Zielentität
 * nicht existiert (kein stiller Verlust).
 */
export function addHypothesis(
  db: Database,
  kind: TaskEntityKind,
  entityId: PersonId | FamilyId,
  id: string,
  patch: Partial<Omit<Hypothesis, 'id'>>,
  now: string,
): boolean {
  const arr = hypothesesArrayOf(db, kind, entityId);
  if (!arr) return false;
  arr.push(makeHypothesis(id, { ...patch, created: patch.created ?? now }));
  return true;
}

/** Kommando: ersetzt eine bestehende Hypothese vollständig (Bearbeiten-Formular). */
export function updateHypothesis(
  db: Database,
  kind: TaskEntityKind,
  entityId: PersonId | FamilyId,
  id: string,
  patch: Partial<Omit<Hypothesis, 'id'>>,
): boolean {
  const arr = hypothesesArrayOf(db, kind, entityId);
  const idx = arr?.findIndex((h) => h.id === id) ?? -1;
  if (!arr || idx < 0) return false;
  const existing = arr[idx]!;
  arr[idx] = makeHypothesis(id, { ...existing, ...patch });
  return true;
}

/** Kommando: entfernt eine Hypothese. */
export function deleteHypothesis(
  db: Database,
  kind: TaskEntityKind,
  entityId: PersonId | FamilyId,
  id: string,
): boolean {
  const owner = kind === 'person' ? db.individuals.get(entityId) : db.families.get(entityId);
  if (!owner) return false;
  const before = owner.hypotheses.length;
  owner.hypotheses = owner.hypotheses.filter((h) => h.id !== id);
  return owner.hypotheses.length !== before;
}

/** Deterministische Hypothesen-Id (kein GEDCOM-Xref-Format nötig, analog newTaskId()). */
export function newHypothesisId(): string {
  return `h_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
