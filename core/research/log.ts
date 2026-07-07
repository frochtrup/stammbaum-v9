// core/research/log.ts — Forschungsprotokoll-Eintrag (Spec 12 §2).
import type { LogEntry } from './types';

/** Konstruktor. `date` wird injiziert (TST-3); result-Default = pending. */
export function makeLogEntry(patch: Partial<LogEntry> = {}): LogEntry {
  return {
    date: patch.date ?? '',
    repoRef: patch.repoRef ?? '',
    sourceRef: patch.sourceRef ?? '',
    query: patch.query ?? '',
    result: patch.result ?? 'pending',
    note: patch.note ?? '',
    taskId: patch.taskId ?? '',
  };
}
