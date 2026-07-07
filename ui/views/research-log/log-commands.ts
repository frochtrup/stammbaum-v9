// ui/views/research-log/log-commands.ts — Mutations-Kommandos für LogEntry (Forschungs-
// protokoll) an Person/Familie (Spec 12 §2, Spec 20 §1.11 [S]). Analog
// ui/views/tasks/tasks-commands.ts, ABER LogEntry ist bewusst OHNE eigene `id`
// (Spec 12 §2: "index-adressiert innerhalb des jeweiligen researchLog[]-Arrays,
// Reihenfolge ist Einfüge-Reihenfolge, wird nie umsortiert") — Einträge werden per
// Array-Index adressiert, nicht per Id.
//
// Bewusst in ui/, NICHT in core/research (gleiche Begründung wie tasks-commands.ts):
// core/research/log.ts hat nur den reinen Konstruktor (makeLogEntry), keine
// db-Mutations-Kommandos. Kein DOM/I/O hier — reine Datenmutation, `date` wird als
// injizierter Zeitstempel übergeben (TST-3), nie per Date.now() im Kommando selbst.
import type { Database, FamilyId, PersonId } from '../../../core/model/types';
import type { LogEntry } from '../../../core/research/types';
import type { TaskEntityKind } from '../tasks/tasks-model';

/** Liefert das researchLog[]-Array der Zielentität, oder null wenn die Entität fehlt. */
function logArrayOf(db: Database, kind: TaskEntityKind, entityId: PersonId | FamilyId) {
  if (kind === 'person') return db.individuals.get(entityId)?.researchLog ?? null;
  return db.families.get(entityId)?.researchLog ?? null;
}

/**
 * Kommando: fügt einen neuen Protokoll-Eintrag an einer Person ODER Familie an
 * (Append — kein id-Upsert, s. Datei-Kopf). Gibt `false` zurück, wenn die
 * Zielentität nicht existiert (kein stiller Verlust).
 */
export function addLogEntry(
  db: Database,
  kind: TaskEntityKind,
  entityId: PersonId | FamilyId,
  entry: LogEntry,
): boolean {
  const arr = logArrayOf(db, kind, entityId);
  if (!arr) return false;
  arr.push({ ...entry });
  return true;
}

/**
 * Kommando: ersetzt einen bestehenden Protokoll-Eintrag vollständig (Bearbeiten-
 * Formular). `index` referenziert die Position im researchLog[]-Array.
 */
export function updateLogEntry(
  db: Database,
  kind: TaskEntityKind,
  entityId: PersonId | FamilyId,
  index: number,
  entry: LogEntry,
): boolean {
  const arr = logArrayOf(db, kind, entityId);
  if (!arr || index < 0 || index >= arr.length) return false;
  arr[index] = { ...entry };
  return true;
}

/** Kommando: entfernt einen Protokoll-Eintrag an der angegebenen Position. */
export function deleteLogEntry(
  db: Database,
  kind: TaskEntityKind,
  entityId: PersonId | FamilyId,
  index: number,
): boolean {
  const arr = logArrayOf(db, kind, entityId);
  if (!arr || index < 0 || index >= arr.length) return false;
  arr.splice(index, 1);
  return true;
}
