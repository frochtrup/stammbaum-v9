// core/research/types.ts — Forschungsdaten-Typen (Spec 12).
// Kern-Schicht: DOM-frei, framework-frei (INV-ARCH-1). Reine Typdefinitionen.
// Reisen mit der Datei (Task/Log/Hypothese), außer Project (app-privat, §5).
import type { SourceId, RepoId } from '../model/types';

// --- §1 Forschungsaufgabe (Task) --------------------------------------------
export type TaskStatus = 'todo' | 'doing' | 'done';

/**
 * ResearchTask — Kanban-Aufgabe an Person/Familie.
 * INV (32 §6): `done === (status === 'done')`. `status` ist die Wahrheit;
 * `done` wird ausschließlich abgeleitet (siehe task.ts / makeTask).
 */
export interface ResearchTask {
  id: string;
  text: string;
  /** frei (Kirchenbuch, Urkunde, Online-Recherche, …) — kein geschlossenes Enum. */
  category: string;
  status: TaskStatus;
  done: boolean;
  /** injizierter Zeitstempel (ISO-Datum) — nie Wall-Clock (TST-3). */
  created: string;
}

// --- §2 Forschungsprotokoll (Log) -------------------------------------------
export type LogResult = 'found' | 'notfound' | 'pending';

export interface LogEntry {
  /** injizierter Zeitstempel (TST-3). */
  date: string;
  repoRef: RepoId | '';
  sourceRef: SourceId | '';
  query: string;
  result: LogResult;
  note: string;
}

// --- §4 Hypothese (leichtes GPS-Modell) -------------------------------------
export type HypothesisStatus = 'open' | 'confirmed' | 'rejected';
/** Forscher-Konfidenz — getrennt von Quellqualität (INV-H1). */
export type HypothesisWeight = 'low' | 'medium' | 'high';

/**
 * Evidenz-Referenz einer Hypothese: reine SID-Referenz (INV-H2),
 * KEIN duplizierter Zitatkörper (kein quay/note/media/eval).
 */
export interface EvidenceRef {
  sourceId: SourceId;
  page: string;
}

export interface Hypothesis {
  id: string;
  /** injizierter Zeitstempel (TST-3). */
  created: string;
  text: string;
  status: HypothesisStatus;
  weight: HypothesisWeight;
  evidence: EvidenceRef[];
  rationale: string;
  conclusion: string;
}

// --- §5 Forschungsprojekt (app-privat) --------------------------------------
export interface ProjectScope {
  surnames: string[];
  places: string[];
  yearFrom: number | null;
  yearTo: number | null;
  personIds: string[];
}

export interface Project {
  id: string;
  name: string;
  color: string;
  scope: ProjectScope;
  note: string;
  /** injizierter Zeitstempel (TST-3). */
  created: string;
}
