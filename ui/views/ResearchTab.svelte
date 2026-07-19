<script lang="ts">
  // ui/views/ResearchTab.svelte — Forschungs-Tab-Umbrella (Spec 20 §1.11, Spec 12).
  // Analog EntityTab.svelte: Segment-Umschalter oben (INV-UI-2 "genau ein kanonischer
  // Weg"), Bottom-Nav-Slot-Text/-Icon bleibt "☑ Aufgaben" unverändert (Spec 21 §2) —
  // nur der Inhalt dahinter bekommt Segmente, analog wie "Personen" bereits Familien/
  // Quellen/Orte/Höfe-Segmente enthält, ohne dass der Slot-Text sich ändert.
  //
  // Vier Segmente: Aufgaben (TasksView, weiterhin erster/Default-Segment) · Protokoll
  // (LogView) · Hypothesen (HypothesesView) · Dashboard (QualityDashboard, BL-05).
  // Das Dashboard ist bewusst KEIN Unterbereich der Statistik-Lens (Spec 20 §1.11g):
  // "Baum-Demografie" und "Forschungsqualität" sind zwei verschiedene Fragen. Es wird
  // nur gemountet, wenn es gewählt ist — die Validierung läuft über die ganze Datenbank
  // und soll die drei anderen Segmente nicht mitbelasten.
  //
  // Das aktive Segment liegt in der Routen-Quelle (`route.researchTarget`), nicht in
  // einem lokalen `$state` (ADR-v9-102). Bis dahin stand hier ausdrücklich das
  // Gegenteil — "braucht KEINE Verankerung, die Unter-Views sind flache Listen ohne
  // Zustand, den es zu erhalten gäbe". Der Trugschluss: erhalten werden muss nicht der
  // Zustand IN den Listen, sondern WELCHE der vier Flächen offen war. Ohne den Merker
  // fiel die Fläche bei jedem Verlassen auf "Aufgaben" zurück — dieselbe Lücke, die
  // `entityTarget` für die Entitäten-Segmente längst schloss (BL-90/ADR-v9-101).
  import type { AppState } from '../shell/app-state.svelte';
  import type { Route } from '../shell/route.svelte';
  import type { ResearchSegmentId } from '../shell/nav-model';
  import TasksView from './tasks/TasksView.svelte';
  import LogView from './research-log/LogView.svelte';
  import HypothesesView from './hypotheses/HypothesesView.svelte';
  import QualityDashboard from './quality/QualityDashboard.svelte';

  interface Props {
    appState: AppState;
    route: Route;
    onNavigateToPerson?: (id: string) => void;
    onNavigateToFamily?: (id: string) => void;
    onNavigateToPlace?: (id: string) => void;
    onNavigateToHof?: (id: string) => void;
  }
  const {
    appState,
    route,
    onNavigateToPerson,
    onNavigateToFamily,
    onNavigateToPlace,
    onNavigateToHof,
  }: Props = $props();

  interface SegmentDef {
    id: ResearchSegmentId;
    label: string;
  }

  const segments: SegmentDef[] = [
    { id: 'tasks', label: 'Aufgaben' },
    { id: 'log', label: 'Protokoll' },
    { id: 'hypotheses', label: 'Hypothesen' },
    { id: 'quality', label: 'Dashboard' },
  ];

  const activeSegment = $derived(route.researchTarget);

  function selectSegment(segment: SegmentDef) {
    route.setResearchTarget(segment.id);
  }
</script>

<div class="research-tab">
  <div class="research-tab__segments stb-segment-row" role="tablist" aria-label="Forschungsansicht wählen">
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

  {#if activeSegment === 'tasks'}
    <TasksView {appState} {onNavigateToPerson} {onNavigateToFamily} />
  {:else if activeSegment === 'log'}
    <LogView {appState} {onNavigateToPerson} {onNavigateToFamily} />
  {:else if activeSegment === 'hypotheses'}
    <HypothesesView {appState} {onNavigateToPerson} {onNavigateToFamily} />
  {:else if activeSegment === 'quality'}
    <QualityDashboard
      {appState}
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
