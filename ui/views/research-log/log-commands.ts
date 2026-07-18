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
//
// COPY-ON-WRITE (ADR-v9-92, BL-01): nimmt eine eingefrorene `ReadonlyDatabase` entgegen
// und gibt einen NEUEN Stand zurück, statt Person/Family in-place zu mutieren — sonst
// sähe ein zurückgehaltener Undo-Snapshot die Änderung sofort mit. `null` = nicht
// angewandt (Zielentität fehlt / Index außerhalb), kein stiller Verlust.
import type { Database, FamilyId, PersonId } from '../../../core/model/types';
import { editDatabase, type ReadonlyDatabase } from '../../../core/model/draft';
import { ownerOf } from '../entity-draft';
import type { LogEntry } from '../../../core/research/types';
import type { TaskEntityKind } from '../tasks/tasks-model';

/**
 * Kommando: fügt einen neuen Protokoll-Eintrag an einer Person ODER Familie an
 * (Append — kein id-Upsert, s. Datei-Kopf).
 */
export function addLogEntry(
  db: ReadonlyDatabase,
  kind: TaskEntityKind,
  entityId: PersonId | FamilyId,
  entry: LogEntry,
): Database | null {
  let applied = false;
  const next = editDatabase(db, (d) => {
    const owner = ownerOf(d, kind, entityId);
    if (!owner) return;
    owner.researchLog.push({ ...entry });
    applied = true;
  });
  return applied ? next : null;
}

/**
 * Kommando: ersetzt einen bestehenden Protokoll-Eintrag vollständig (Bearbeiten-
 * Formular). `index` referenziert die Position im researchLog[]-Array.
 */
export function updateLogEntry(
  db: ReadonlyDatabase,
  kind: TaskEntityKind,
  entityId: PersonId | FamilyId,
  index: number,
  entry: LogEntry,
): Database | null {
  let applied = false;
  const next = editDatabase(db, (d) => {
    const owner = ownerOf(d, kind, entityId);
    if (!owner || index < 0 || index >= owner.researchLog.length) return;
    owner.researchLog[index] = { ...entry };
    applied = true;
  });
  return applied ? next : null;
}

/** Kommando: entfernt einen Protokoll-Eintrag an der angegebenen Position. */
export function deleteLogEntry(
  db: ReadonlyDatabase,
  kind: TaskEntityKind,
  entityId: PersonId | FamilyId,
  index: number,
): Database | null {
  let applied = false;
  const next = editDatabase(db, (d) => {
    const owner = ownerOf(d, kind, entityId);
    if (!owner || index < 0 || index >= owner.researchLog.length) return;
    owner.researchLog.splice(index, 1);
    applied = true;
  });
  return applied ? next : null;
}
