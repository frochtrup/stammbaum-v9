<script lang="ts">
  // ui/views/EntityTabSegments.svelte — die beiden Reiter-Reihen der Entitäten-Fläche
  // (Entität wählen · Quellen/Archive), extrahiert aus `EntityTab.svelte` ([ADR-v9-297]).
  //
  // WARUM EXTRAHIERT: `EntityTab.svelte` lief mit dem Startbildschirm über die 600-Zeilen-
  // Grenze. Nicht getrimmt und die Schwelle nicht angehoben, sondern eine KOHÄSIVE Einheit
  // herausgelöst — „welche Reiter zeigt diese Fläche" ist eine Frage für sich, sie hat
  // eigene Regeln (mobil-only, Sub-Reihe nur bei Quellen) und eigene Layout-Details.
  //
  // KEINE Logik ist mitgewandert: `segments`, der aktive Zustand und die beiden Umschalter
  // bleiben beim Aufrufer. Diese Komponente rendert, sie entscheidet nicht.
  import type { EntityTargetId, NavTargetDef } from '../shell/nav-model';
  import { layout } from '../shell/layout.svelte';

  interface Props {
    segments: readonly NavTargetDef[];
    activeSegment: EntityTargetId;
    sourceSubView: 'sources' | 'repositories';
    onSelectSegment: (segment: NavTargetDef) => void;
    onSelectSourceSubView: (view: 'sources' | 'repositories') => void;
  }
  const {
    segments,
    activeSegment,
    sourceSubView,
    onSelectSegment,
    onSelectSourceSubView,
  }: Props = $props();
</script>

<!-- Die Entitäts-Segmentreihe ist die MOBILE Sub-Navigation (Spec 21 §2: "Familien /
     Quellen / Orte / Höfe über einen Segment-Umschalter oben"). Auf Desktop führt die
     Sidebar dieselben fünf Ziele beschriftet und dauerhaft (Spec 21 §3) — beides
     gleichzeitig wären ZWEI Wege zum selben Ziel und damit ein Bruch von INV-UI-2
     ("genau ein kanonischer Weg"), zusätzlich zu der Redundanz, die Spec 21 §9 B2 an
     v8 kritisiert. Die Reihe entfällt daher oberhalb der Layout-Grenze.
     Die Quellen/Archive-Unterreihe darunter bleibt: Archive sind KEIN Sidebar-Ziel,
     sondern eine Unteransicht des Quellen-Ziels (Spec 20 §1.6). -->
{#if !layout.isDesktopLayout}
  <div
    class="entity-tab__segments stb-segment-row stb-segment-row--full"
    role="tablist"
    aria-label="Entität wählen"
    data-tour="segments"
  >
    {#each segments as segment (segment.id)}
      <button
        type="button"
        role="tab"
        aria-selected={segment.id === activeSegment}
        class="stb-segment-btn"
        class:stb-segment-btn--active={segment.id === activeSegment}
        disabled={!segment.implemented}
        aria-label={segment.label}
        onclick={() => onSelectSegment(segment)}
      >
        {segment.shortLabel ?? segment.label}{segment.implemented ? '' : ' (folgt)'}
      </button>
    {/each}
  </div>
{/if}

{#if activeSegment === 'source'}
  <div
    class="entity-tab__subsegments stb-segment-row stb-segment-row--full entity-tab__subsegments--dashed"
    role="tablist"
    aria-label="Quellen-Ansicht wählen"
  >
    <button
      type="button"
      role="tab"
      aria-selected={sourceSubView === 'sources'}
      class="stb-segment-btn"
      class:stb-segment-btn--active={sourceSubView === 'sources'}
      onclick={() => onSelectSourceSubView('sources')}
    >
      Quellen
    </button>
    <button
      type="button"
      role="tab"
      aria-selected={sourceSubView === 'repositories'}
      class="stb-segment-btn"
      class:stb-segment-btn--active={sourceSubView === 'repositories'}
      onclick={() => onSelectSourceSubView('repositories')}
    >
      Archive
    </button>
  </div>
{/if}

<style>
  /* Segment-Control-Pillen selbst kommen aus design-system.css (.stb-segment-row/
     .stb-segment-btn/--active) — hier bleibt nur das EntityTab-eigene Layout-Detail
     (Trennlinie unter der Segment-Reihe, gestrichelt unter der Subsegment-Reihe). */
  .entity-tab__segments,
  .entity-tab__subsegments {
    border-bottom: 1px solid var(--stb-surface-3);
  }

  /* KEIN `padding-top: 0` (BL-299): die Trefferzone ist auf die PILLE zentriert, die
     Mindesthöhe der Reihe hält sie deshalb nur dann in ihren Grenzen, wenn die Pille auch
     mittig sitzt. Die asymmetrische Polsterung zog sie 2,8px nach oben — der Abstand zur
     Segment-Reihe darüber fiel damit auf 41,3px, und die untere Zone deckte den unteren
     Rand der oberen zu. Die Reihen bleiben trotzdem als Paar erkennbar: das leistet die
     gestrichelte Trennlinie, nicht die fehlende Polsterung. */
  .entity-tab__subsegments--dashed {
    border-bottom-style: dashed;
  }
</style>
