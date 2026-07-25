// core/research/log.ts — Forschungsprotokoll-Eintrag (Spec 12 §2).
import type { LogEntry, ResearchTask } from './types';

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

/**
 * UI-Kurzweg „aus Aufgabe → Protokolleintrag" (Spec 12 §2, Spec 20 §1.11b, BL-65).
 * Baut einen vorbefüllten, noch offenen (`pending`) LogEntry aus der auslösenden Aufgabe:
 * der `taskId`-Vorwärtsverweis (ADR-v9-36) und ein evtl. schon an der Aufgabe hängender
 * Quellenbezug (`sourceRef`) werden übernommen; `date` wird injiziert (TST-3).
 *
 * Bewusst NUR ein Vorwärtsverweis, KEIN Auto-Schließen der Aufgabe — eine Aufgabe kann
 * mehrere Sucheinträge brauchen; das Schließen bleibt eine bewusste Nutzerhandlung
 * (`status`), kein abgeleiteter Seiteneffekt (Spec 12 §2).
 */
export function linkLogToTask(task: ResearchTask, today: string): LogEntry {
  return makeLogEntry({
    date: today,
    sourceRef: task.sourceRef,
    taskId: task.id,
    result: 'pending',
  });
}
