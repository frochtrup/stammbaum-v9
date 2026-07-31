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
  /** optionaler Quellen-Bezug (v8-Parität `t.sid`, ADR-v9-36). '' = kein Bezug. */
  sourceRef: SourceId | '';
}

// --- §2 Forschungsprotokoll (Log) -------------------------------------------
// 'partial' („teilweise"): trennt „nichts gefunden" von „Fund, aber unvollständig"
// und trägt damit die Wiedervorlage (Spec 12 §2, Spec 20 §1.11b, BL-135).
export type LogResult = 'found' | 'partial' | 'notfound' | 'pending';

/**
 * LogEntry — EIN protokollierter Sucheintrag. Bewusst OHNE eigene `id` (v8-Parität,
 * `ui-views-rlog.js` `_deleteRlogEntry(personId, idx)`: index-adressiert innerhalb des
 * jeweiligen `researchLog[]`-Arrays, keine stabile ID nötig — Reihenfolge ist Einfüge-
 * Reihenfolge, wird nie umsortiert).
 */
export interface LogEntry {
  /** injizierter Zeitstempel (TST-3). */
  date: string;
  repoRef: RepoId | '';
  sourceRef: SourceId | '';
  query: string;
  result: LogResult;
  note: string;
  /** optionaler Bezug: welche ResearchTask.id hat diesen Sucheintrag veranlasst
   *  (ADR-v9-36, neu ggü. v8 — kein Oracle-Vorbild). '' = kein Bezug. */
  taskId: string;
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

/**
 * Art der Behauptung (ADR-v9-174). `identity` = „die referenzierten Datensätze
 * bezeichnen dieselbe Person"; zusammen mit `status` trägt sie das Dubletten-Urteil
 * (`rejected` = Ausschluss, `confirmed` = Merge-Begründung, `open` = in Prüfung).
 *
 * Warum das nicht am Freitext hängen darf: ohne maschinenlesbare Art läse der
 * Dubletten-Filter eine abgelehnte Hypothese „A ist der Vater von B", die A und B
 * referenziert, als Dublettenausschluss — ein stiller Fehlschluss.
 */
export type HypothesisKind = 'free' | 'identity';

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
  /** Art der Behauptung (ADR-v9-174). Vorgabe `free` = die bisherige freie Hypothese. */
  kind: HypothesisKind;
  /**
   * Weitere betroffene Datensätze (`@I…@`/`@F…@`) — eine Hypothese hängt an EINEM
   * Datensatz, spricht aber oft über zwei. Wiederholbar; deckt Person↔Person,
   * Person↔Familie und Familie↔Familie ab (beide Träger führen `hypotheses[]`).
   */
  refs: string[];
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
