// ui/views/research-segment-state.svelte.ts — Filterzustand der drei übrigen Forschungs-
// Segmente (Aufgaben · Protokoll · Hypothesen), gehalten AUSSERHALB der Komponenten
// (BL-320, Spec 21 §5).
//
// Dieselbe Klasse und derselbe Weg wie beim vierten Segment, dem Qualitäts-Dashboard
// (BL-319/ADR-v9-229): jedes Segment wird beim Wechsel des Nav-Ziels abgebaut, ein
// gesetzter Filter war danach weg. Eigentümer ist die App-Wurzel, weil auch `ResearchTab`
// selbst abgebaut wird, sobald der Weg auf eine Person führt.
//
// Ein Datensatz je Segment (nicht ein gemeinsamer Topf): die drei Filter sind fachlich
// verschiedene Wertebereiche und gehören je einer Fläche — dasselbe Argument, mit dem die
// Soundex-Schalter von Personenliste und globaler Suche getrennt bleiben (INV-VS,
// ADR-v9-159).
//
// Die ANZEIGE-MODI der beiden Umschalter (Liste/Board, gruppiert/Zeitleiste) liegen NICHT
// hier, sondern als Merker in der Routen-Quelle — dort, wo `mapMode`/`treeMode`/
// `storyMode`/`timelineMode` schon liegen (Spec 21 §5 Heimat ①). Das war die eigentliche
// Geschwister-Lücke: die Regel war an vier Lens-Stellen gebaut und an diesen zwei nicht.
import type { TaskFilter } from './tasks/tasks-model';
import type { LogFilter } from './research-log/log-model';
import type { HypothesisFilter } from './hypotheses/hypothesis-model';
import type { KinshipClass } from '../../core/model/kinship';

/**
 * Vorgaben — hier, nicht je View: `countActiveFilters` vergleicht den aktuellen Wert
 * gegen die Vorgabe, und beide gehören damit an EINE Stelle (vorher stand je View ein
 * eigenes `DEFAULT_FILTER`, das mit dem Halter auseinanderlaufen könnte).
 */
export const DEFAULT_TASK_FILTER: TaskFilter = 'open';
export const DEFAULT_LOG_FILTER: LogFilter = 'all';
export const DEFAULT_HYPO_FILTER: HypothesisFilter = 'all';
/** Vorgabe der Relevanz-Achse (BL-375): keine Einschränkung. */
export const DEFAULT_KINSHIP: KinshipClass = 'all';

export interface TasksViewState {
  filter: TaskFilter;
  /** Suchanfrage (BL-374) — im SELBEN Halter wie der Filter, nicht in einem zweiten
   *  `$state` daneben: beide beantworten dieselbe Frage („was zeigt diese Fläche") und
   *  müssen denselben Navigationsweg überleben. */
  query: string;
}

export interface LogViewState {
  filter: LogFilter;
  query: string;
}

export interface HypothesesViewState {
  filter: HypothesisFilter;
  query: string;
}

/**
 * Die Relevanz-Achse der Forschungs-Umbrella (BL-375, Spec 20 §1.11i).
 *
 * EIGENER Halter, nicht ein viertes Feld in den drei Segment-Haltern: die Achse gehört
 * nicht EINER Fläche, sie scoped alle vier gemeinsam — dieselbe Rolle wie der aktive
 * Projekt-Scope, der aus demselben Grund in `ProjectsState` oberhalb der Segmente liegt.
 * Sie dreimal zu halten hieße, drei Wahrheiten über denselben Ausschnitt zu führen.
 */
export interface ResearchScopeState {
  kinship: KinshipClass;
}

export function createTasksViewState(): TasksViewState {
  const s = $state<TasksViewState>({ filter: DEFAULT_TASK_FILTER, query: '' });
  return s;
}

export function createLogViewState(): LogViewState {
  const s = $state<LogViewState>({ filter: DEFAULT_LOG_FILTER, query: '' });
  return s;
}

export function createHypothesesViewState(): HypothesesViewState {
  const s = $state<HypothesesViewState>({ filter: DEFAULT_HYPO_FILTER, query: '' });
  return s;
}

export function createResearchScopeState(): ResearchScopeState {
  const s = $state<ResearchScopeState>({ kinship: DEFAULT_KINSHIP });
  return s;
}

