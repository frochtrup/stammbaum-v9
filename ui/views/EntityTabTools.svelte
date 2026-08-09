<script lang="ts">
  // ui/views/EntityTabTools.svelte — welches WERKZEUG-Overlay das aktive Segment zeigt.
  //
  // Eigene Datei, weil `EntityTab.svelte` über die 600-Zeilen-Grenze lief. Herausgelöst wurde
  // eine kohäsive Einheit — die ganzflächigen Werkzeuge (Massen-Dedup, Orts-/Hof-Review) —
  // und bewusst NICHT die Listen- oder Detail-Fläche: die hängen an einem Dutzend
  // Navigations-Rückrufen, die `EntityTab` gehören (die Begründung steht dort am
  // `listPane`-Snippet). Die Werkzeuge brauchen nur zwei Sprünge und die Overlay-Schalter.
  //
  // WARUM SIE GANZFLÄCHIG SIND: ein Werkzeug IST eine Arbeitsfläche, keine zweite
  // Detailansicht — beides gleichzeitig zu zeigen war nie die Absicht
  // ([11 §6/§9.2](../../specs/v9/11-Orte-Hoefe-Identitaet.md),
  // [ADR-v9-184](../../specs/v9/04-Entscheidungslog.md#adr-v9-184)).
  import type { AppState } from '../shell/app-state.svelte';
  import type { ViewState } from '../shell/view-state.svelte';
  import type { createEntityTabOverlays } from './entity-tab-overlays.svelte';
  import PersonDedupView from './person/PersonDedupView.svelte';
  import RelationshipTool from './tools/RelationshipTool.svelte';
  import PlaceReview from './place/PlaceReview.svelte';
  import PlaceDedupView from './place/PlaceDedupView.svelte';
  import HofReview from './hof/HofReview.svelte';
  import HofDedupView from './hof/HofDedupView.svelte';

  interface Props {
    appState: AppState;
    viewState: ViewState;
    activeSegment: string;
    overlays: ReturnType<typeof createEntityTabOverlays>;
    onNavigateToPerson: (id: string) => void;
    onNavigateToFamily: (id: string) => void;
  }
  const { appState, viewState, activeSegment, overlays, onNavigateToPerson, onNavigateToFamily }: Props =
    $props();
</script>

{#if activeSegment === 'person' && overlays.personDedup}
  <PersonDedupView {appState} onClose={overlays.closePersonDedup} />
{:else if activeSegment === 'person' && overlays.relationshipTool}
  <RelationshipTool {appState} {viewState} onClose={overlays.closeRelationshipTool} />
{:else if activeSegment === 'place' && overlays.placeReview}
  <PlaceReview
    {appState}
    onNavigateToPerson={onNavigateToPerson}
    onNavigateToFamily={onNavigateToFamily}
    onClose={overlays.closePlaceReview}
  />
{:else if activeSegment === 'place' && overlays.placeDedup}
  <PlaceDedupView {appState} onClose={overlays.closePlaceDedup} />
{:else if activeSegment === 'hof' && overlays.hofReview}
  <HofReview
    {appState}
    onNavigateToPerson={onNavigateToPerson}
    onNavigateToFamily={onNavigateToFamily}
    onClose={overlays.closeHofReview}
  />
{:else if activeSegment === 'hof' && overlays.hofDedup}
  <HofDedupView {appState} onClose={overlays.closeHofDedup} />
{/if}
