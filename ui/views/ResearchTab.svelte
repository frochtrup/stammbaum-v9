<script lang="ts">
  // ui/views/ResearchTab.svelte — Forschungs-Tab-Umbrella (Spec 20 §1.11, Spec 12).
  // Vollständig analog EntityTab.svelte: mobile Segment-Reihe oben (entfällt auf Desktop,
  // dort trägt die Sidebar-Gruppe „Forschung" die Ziele direkt — Spec 21 §3), Bottom-Nav-
  // Slot-Text/-Icon bleibt "☑ Aufgaben" unverändert (Spec 21 §2).
  //
  // Seit ADR-v9-116 sind die vier Flächen ERSTKLASSIGE Nav-Ziele der Rolle 'research'
  // (nav-model.ts), nicht mehr Segmente innerhalb von 'tasks': Aufgaben (TasksView) ·
  // Protokoll (LogView) · Hypothesen (HypothesesView) · Dashboard (QualityDashboard).
  // In der mobilen Reihe steht das Dashboard an erster Stelle (s. `segments` unten), die
  // Default-Landung bleibt „Aufgaben". Das Dashboard ist bewusst KEIN Unterbereich der
  // Statistik-Lens (Spec 20 §1.11g): "Baum-Demografie" und "Forschungsqualität" sind zwei
  // verschiedene Fragen. Es wird nur gemountet, wenn es gewählt ist — die Validierung
  // läuft über die ganze Datenbank und soll die drei anderen Flächen nicht mitbelasten.
  //
  // Das aktive Ziel liegt in der Routen-Quelle (`route.researchTarget`), nicht in einem
  // lokalen `$state` (ADR-v9-102). Der Merker wird — wie `entityTarget`/`lensTarget` —
  // über `route.setTarget()` gepflegt; ohne ihn fiel die Fläche bei jedem Verlassen auf
  // "Aufgaben" zurück (dieselbe Lücke, die `entityTarget` für die Entitäten längst schloss,
  // BL-90/ADR-v9-101).
  import type { AppState } from '../shell/app-state.svelte';
  import type { Route } from '../shell/route.svelte';
  import type { ViewState } from '../shell/view-state.svelte';
  import { RESEARCH_TARGETS } from '../shell/nav-model';
  import { layout } from '../shell/layout.svelte';
  import TasksView from './tasks/TasksView.svelte';
  import LogView from './research-log/LogView.svelte';
  import type { LogPrefill } from './research-log/log-model';
  import { linkLogToTask } from '../../core/research/index';
  import HypothesesView from './hypotheses/HypothesesView.svelte';
  import QualityDashboard from './quality/QualityDashboard.svelte';
  import ProjectBar from './research-projects/ProjectBar.svelte';
  import type { ProjectsState } from '../shell/projects-state.svelte';

  interface Props {
    appState: AppState;
    route: Route;
    /** Für das Qualitäts-Dashboard/Ast-Reifegrad: `resolveProband(db, viewState)`
     *  (ADR-v9-140/167) — die EINE Proband-Auflösung, kein zweiter Rückfall hier. */
    viewState: ViewState;
    /** Forschungsprojekte + aktive Auswahl (BL-58) — scopen Aufgaben/Protokoll/Hypothesen. */
    projects: ProjectsState;
    onNavigateToPerson?: (id: string) => void;
    onNavigateToFamily?: (id: string) => void;
    onNavigateToPlace?: (id: string) => void;
    onNavigateToHof?: (id: string) => void;
  }
  const {
    appState,
    route,
    viewState,
    projects,
    onNavigateToPerson,
    onNavigateToFamily,
    onNavigateToPlace,
    onNavigateToHof,
  }: Props = $props();

  // Die Segment-Reihe ist eine Projektion des einen Registers (RESEARCH_TARGETS), genau wie
  // EntityTab ENTITY_TARGETS nutzt — keine zweite Ziel-Liste (INV-UI-15). Dashboard steht
  // an erster Stelle, auf Desktop-Sidebar UND mobiler Reihe dieselbe Ordnung (ADR-v9-116).
  // Reihenfolge ≠ Default-Landung: die Default-Auswahl bleibt „Aufgaben" (`route`-Default
  // 'tasks'), weil das Dashboard nur bei Auswahl mountet und seine DB-weite Validierung
  // nicht bei jedem Öffnen der Fläche anlaufen soll.
  const segments = RESEARCH_TARGETS;

  const activeSegment = $derived(route.researchTarget);

  // BL-65 UI-Kurzweg „aus Aufgabe → Protokoll": aus der Aufgabe direkt einen offenen,
  // verknüpften Protokolleintrag anlegen (undo-fähig über appState) und ins Protokoll-
  // Segment wechseln — der Eintrag steht dort (neueste zuerst) mit „🔗 aus Aufgabe"-
  // Rückverweis, bereit zum Vervollständigen (Ergebnis/Notiz per ✎).
  function startLogFromTask(pf: LogPrefill) {
    const today = new Date().toISOString().slice(0, 10);
    appState.addLogEntry(pf.kind, pf.entityId, linkLogToTask(pf.task, today));
    route.setTarget('log');
  }

  // Wie EntityTab.selectSegment: setzt das Ziel über die EINE Routen-Quelle (der
  // researchTarget-Merker zieht in setTarget mit, ADR-v9-116) — kein Sonder-Setter.
  function selectSegment(segment: (typeof segments)[number]) {
    route.setTarget(segment.id);
  }
</script>

<div class="research-tab">
  <!-- Projekt-Chip-Selektor GENAU EINMAL oberhalb der Segmente (BL-58, INV-UI-11) —
       scoped Aufgaben/Protokoll/Hypothesen gemeinsam, in BEIDEN Formfaktoren. -->
  <ProjectBar {projects} />

  <!-- Die Forschungs-Segmentreihe ist die MOBILE Sub-Navigation (Spec 21 §2). Auf Desktop
       führt die Sidebar dieselben vier Ziele beschriftet und dauerhaft in der Gruppe
       „Forschung" (Spec 21 §3, ADR-v9-116) — beides gleichzeitig wären zwei Wege zum
       selben Ziel (INV-UI-2). Die Reihe entfällt daher oberhalb der Layout-Grenze,
       wörtlich wie die Entitäten-Segmentreihe in EntityTab. -->
  {#if !layout.isDesktopLayout}
    <div class="research-tab__segments stb-segment-row stb-segment-row--full" role="tablist" aria-label="Forschungsansicht wählen">
      {#each segments as segment (segment.id)}
        <button
          type="button"
          role="tab"
          aria-selected={segment.id === activeSegment}
          class="stb-segment-btn"
          class:stb-segment-btn--active={segment.id === activeSegment}
          onclick={() => selectSegment(segment)}
        >
          {segment.label}
        </button>
      {/each}
    </div>
  {/if}

  {#if activeSegment === 'tasks'}
    <TasksView {appState} {onNavigateToPerson} {onNavigateToFamily} onStartLogFromTask={startLogFromTask} scope={projects.activeScope} />
  {:else if activeSegment === 'log'}
    <LogView {appState} {onNavigateToPerson} {onNavigateToFamily} scope={projects.activeScope} />
  {:else if activeSegment === 'hypotheses'}
    <HypothesesView {appState} {onNavigateToPerson} {onNavigateToFamily} scope={projects.activeScope} />
  {:else if activeSegment === 'quality'}
    <QualityDashboard
      {appState}
      {viewState}
      scope={projects.activeScope}
      {onNavigateToPerson}
      {onNavigateToFamily}
      {onNavigateToPlace}
      {onNavigateToHof}
    />
  {/if}
</div>

<style>
  .research-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  /* Segment-Control-Pillen selbst kommen aus design-system.css (.stb-segment-row/
     .stb-segment-btn/--active, INV-UI-4) — hier bleibt nur das ResearchTab-eigene
     Layout-Detail (Trennlinie unter der Segment-Reihe, analog EntityTab). */
  .research-tab__segments {
    border-bottom: 1px solid var(--stb-surface-3);
  }
</style>
