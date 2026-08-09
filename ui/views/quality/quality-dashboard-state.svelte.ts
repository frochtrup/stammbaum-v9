// ui/views/quality/quality-dashboard-state.svelte.ts — Ansichts-Unterzustand des Qualitäts-
// Dashboards, gehalten AUSSERHALB der Dashboard-Komponente (BL-319, Spec 21 §5).
//
// Warum außerhalb: `QualityDashboard` ist eines von vier Forschungs-Zielen und wird beim
// Wegnavigieren abgebaut (App.svelte rendert die Ziele über `{:else if}`). Lag der
// Zustand komponenten-lokal, war er nach jedem Blick auf eine Person weg — genau der vom
// Nutzer gemeldete Weg (2026-08-08): Filter setzen, zur Person mit dem Hinweis wechseln,
// zurück, Filter steht wieder auf der Vorgabe. Betroffen war nicht nur der Filter,
// sondern auch ein offener Prüfbericht samt Umfang und die gewählte Ast-Auswahl.
// Spec 21 §5 nennt das wörtlich: „Ansichts-Unterzustand, der eine Navigation überleben
// muss, gehört … nicht in komponenten-lokalen Zustand."
//
// Warum HIER und nicht in der ViewState-Instanz: derselbe Grund wie bei
// `media-gallery-filters.svelte.ts` (ADR-v9-192) — der ViewState hält AUSWAHLEN je
// Navigationsziel (INV-VS), keine Filter-/Anzeigezustände einer einzelnen Fläche. Ein
// Unterschied zur Galerie bleibt und ist beabsichtigt: deren Filter-Instanz gehört dem
// `EntityTab` (die Galerie wird nur INNERHALB dieses Tabs ersetzt), diese hier gehört
// der App-Wurzel — der gemeldete Weg verlässt die Forschungsfläche ganz, ein
// `ResearchTab`-eigener Halter würde mit ihr abgebaut und hätte nichts gerettet.
//
// Bewusst NICHT hier: der ⚙-Konfigurations-Sheet (`showValConfig`). Ein Bottom-Sheet ist
// eine begonnene Interaktion, kein Ansichtszustand — es nach der Rückkehr aus einer
// anderen Fläche wieder offen vorzufinden, wäre eine Überraschung, kein Dienst.
import { DEFAULT_BRANCH_LEVEL } from '../../../core/research/index';
import type { FocusFilter } from '../../../core/validate/index';

/** Vorgabe der Brennpunkte-Filterung: „Handlungsbedarf" (Fehler + Warnungen). */
export const DEFAULT_QUALITY_FOCUS: FocusFilter = 'attention';

/**
 * Umfang des offenen Prüfberichts — `'none'` = kein Bericht offen.
 *
 * Ein Slot statt zweier (`showReport` + `reportScope`): „offen" und „welcher Umfang" sind
 * nicht unabhängig, ein Umfang ohne offenen Bericht ist kein ausdrückbarer Zustand.
 */
export type QualityReportScope = 'none' | 'all' | 'geo';

export interface QualityDashboardState {
  /** Brennpunkte-Filter der `FilterBar`. */
  readonly focus: FocusFilter;
  setFocus(next: FocusFilter): void;
  /** Offener Prüfbericht samt Umfang (ADR-v9-98: beide Flächen leben im Dashboard). */
  readonly report: QualityReportScope;
  /** Öffnet den Bericht im gewählten Umfang; derselbe Umfang erneut schließt ihn. */
  toggleReport(scope: 'all' | 'geo'): void;
  closeReport(): void;
  /** Gewählte Ebene der Ast-Reifegrad-Sektion (ADR-v9-167). */
  readonly branchLevel: number;
  /** Gewählter Ast als Index in die Zeilenliste (inkl. Restzeile); `null` = keiner. */
  readonly branchIndex: number | null;
  /**
   * Ebene wechseln — hebt die Ast-Auswahl auf. Beides zusammen, weil ein Index ohne
   * seine Ebene auf einen ANDEREN Ast zeigt: eine halb erhaltene Auswahl wäre schlimmer
   * als keine (Spec 21 §5: „Ein nur zur Hälfte erhaltener Zustand … zählt nicht als
   * erhalten").
   */
  setBranchLevel(level: number): void;
  /** Ast wählen; derselbe Index erneut hebt die Auswahl auf. */
  toggleBranchIndex(index: number): void;
  clearBranchIndex(): void;
}

/**
 * Baut EINEN Halter. Kein Modul-Singleton (gleiche Begründung wie `createViewState`):
 * die App-Wurzel erzeugt genau eine Instanz und reicht sie durch, Komponententests
 * bekommen eine frische, isolierte.
 */
export function createQualityDashboardState(): QualityDashboardState {
  let focus = $state<FocusFilter>(DEFAULT_QUALITY_FOCUS);
  let report = $state<QualityReportScope>('none');
  let branchLevel = $state<number>(DEFAULT_BRANCH_LEVEL);
  let branchIndex = $state<number | null>(null);

  return {
    get focus() {
      return focus;
    },
    setFocus(next) {
      focus = next;
    },
    get report() {
      return report;
    },
    toggleReport(scope) {
      report = report === scope ? 'none' : scope;
    },
    closeReport() {
      report = 'none';
    },
    get branchLevel() {
      return branchLevel;
    },
    get branchIndex() {
      return branchIndex;
    },
    setBranchLevel(level) {
      branchLevel = level;
      branchIndex = null;
    },
    toggleBranchIndex(index) {
      branchIndex = branchIndex === index ? null : index;
    },
    clearBranchIndex() {
      branchIndex = null;
    },
  };
}
