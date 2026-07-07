<script lang="ts">
  // ui/views/ResearchTab.svelte — Forschungs-Tab-Umbrella (Spec 20 §1.11, Spec 12).
  // Analog EntityTab.svelte: Segment-Umschalter oben (INV-UI-2 "genau ein kanonischer
  // Weg"), Bottom-Nav-Slot-Text/-Icon bleibt "☑ Aufgaben" unverändert (Spec 21 §2) —
  // nur der Inhalt dahinter bekommt Segmente, analog wie "Personen" bereits Familien/
  // Quellen/Orte/Höfe-Segmente enthält, ohne dass der Slot-Text sich ändert.
  //
  // Drei Segmente: Aufgaben (TasksView, weiterhin erster/Default-Segment) · Protokoll
  // (LogView) · Hypothesen (HypothesesView). Anders als EntityTab braucht dieser
  // Umbrella KEINE ViewState-Verankerung des aktiven Segments — die drei Unter-Views
  // sind flache globale Listen ohne Detail-Drill-down/Master-Detail-Zustand, den es
  // über einen App-Resume hinweg zu erhalten gäbe (Spec 21 §5 gilt für Entitäts-
  // Auswahl, nicht für einen reinen Listen-Filter-Tab).
  import type { AppState } from '../shell/app-state.svelte';
  import TasksView from './tasks/TasksView.svelte';
  import LogView from './research-log/LogView.svelte';
  import HypothesesView from './hypotheses/HypothesesView.svelte';

  interface Props {
    appState: AppState;
    onNavigateToPerson?: (id: string) => void;
    onNavigateToFamily?: (id: string) => void;
  }
  const { appState, onNavigateToPerson, onNavigateToFamily }: Props = $props();

  type ResearchSegment = 'tasks' | 'log' | 'hypotheses';

  interface SegmentDef {
    id: ResearchSegment;
    label: string;
  }

  const segments: SegmentDef[] = [
    { id: 'tasks', label: 'Aufgaben' },
    { id: 'log', label: 'Protokoll' },
    { id: 'hypotheses', label: 'Hypothesen' },
  ];

  let activeSegment = $state<ResearchSegment>('tasks');

  function selectSegment(segment: SegmentDef) {
    activeSegment = segment.id;
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
