<script lang="ts">
  // ui/views/EntityTab.svelte — Entitäten-Tab-Umbrella (Spec 20 §1.4–§1.6, Spec 21 §2:
  // "Personen ist der Einstieg in die Entitäten; Familien/Quellen/Orte/Höfe über einen
  // Segment-Umschalter oben"). Ersetzt/erweitert das ehemalige PersonTab.svelte, das nur
  // "Personen" befüllte. Mobile: Liste ODER Detail (Master-Detail auf einer Fläche,
  // Desktop-Multi-Pane ist NICHT Teil dieser Scheibe).
  //
  // Cross-Entitäts-Navigation (Familie -> Person, Quelle -> Person/Familie/Archiv,
  // Archiv -> Quelle) wechselt hier zentral BEIDES: den Entitäts-Segment UND die
  // ViewState-Auswahl des Zielsegments — ein kanonischer Weg (INV-UI-2), keine
  // verstreuten Ad-hoc-Sprünge in den einzelnen Detail-Komponenten.
  import { untrack } from 'svelte';
  import type { AppState } from '../shell/app-state.svelte';
  import type { ViewState, ViewTarget } from '../shell/view-state.svelte';
  import PersonList from './person/PersonList.svelte';
  import PersonDetail from './person/PersonDetail.svelte';
  import FamilyList from './family/FamilyList.svelte';
  import FamilyDetail from './family/FamilyDetail.svelte';
  import SourceList from './source/SourceList.svelte';
  import SourceDetail from './source/SourceDetail.svelte';
  import RepositoryList from './repository/RepositoryList.svelte';
  import RepositoryDetail from './repository/RepositoryDetail.svelte';
  import PlaceList from './place/PlaceList.svelte';
  import PlaceDetail from './place/PlaceDetail.svelte';
  import HofList from './hof/HofList.svelte';
  import HofDetail from './hof/HofDetail.svelte';
  import HofReview from './hof/HofReview.svelte';

  interface Props {
    appState: AppState;
    viewState: ViewState;
    /**
     * Cross-Navigation "Im Baum anzeigen" (PersonDetail -> Baum-Tab, Spec 20 §1.3 [K]).
     * Optional durchgereicht statt hier verdrahtet: `activeTarget` (welcher Bottom-Nav-
     * Slot aktiv ist) sitzt in App.svelte, nicht in EntityTab — das ist bewusst KEIN
     * EntityTab-Sub-Callback wie navigateToPerson/-Family/etc. (die bleiben INNERHALB
     * dieser Scheibe), sondern ein Durchreichen nach oben zum echten Ziel-Umschalter.
     */
    onNavigateToTree?: (personId: string) => void;
  }
  const { appState, viewState, onNavigateToTree }: Props = $props();

  type EntitySegment = 'person' | 'family' | 'source' | 'repository' | 'place' | 'hof';

  interface SegmentDef {
    id: EntitySegment;
    label: string;
    target: ViewTarget | null;
    implemented: boolean;
  }

  const segments: SegmentDef[] = [
    { id: 'person', label: 'Personen', target: 'person', implemented: true },
    { id: 'family', label: 'Familien', target: 'family', implemented: true },
    { id: 'source', label: 'Quellen', target: 'source', implemented: true },
    { id: 'place', label: 'Orte', target: 'place', implemented: true },
    { id: 'hof', label: 'Höfe', target: 'hof', implemented: true },
  ];

  // Archive sind Teil des Quellen-Tabs (Spec 20 §1.6: "Quellen-Tab & Archive"), aber
  // kein eigener Segment-Button — Zugang über die Quellen-Detailseite (verlinktes
  // Archiv) bzw. den Archiv-Picker innerhalb des Quellen-Segments.
  //
  // Initialer Segment/Sub-View leitet sich aus einer schon vorhandenen ViewState-
  // Auswahl ab (z. B. nach App-Resume, Spec 21 §5 "Selektion überlebt App-Resume", oder
  // wenn ein Aufrufer vor dem Mount bereits eine Auswahl gesetzt hat) — kein doppelter,
  // widersprüchlicher Default gegenüber dem, was ViewState bereits weiß.
  function initialSegment(): EntitySegment {
    if (viewState.getCurrent('family')) return 'family';
    if (viewState.getCurrent('source') || viewState.getCurrent('repository')) return 'source';
    if (viewState.getCurrent('place')) return 'place';
    if (viewState.getCurrent('hof')) return 'hof';
    return 'person';
  }

  // untrack: NUR der Startwert beim Mount zählt (Spec 21 §5 "Selektion überlebt
  // App-Resume") — kein fortlaufendes Re-Sync bei jeder ViewState-Änderung, sonst
  // würde z. B. ein Zurück-Klick in der Personenliste den Segment-State erneut ableiten
  // und den Nutzer aus einem bewusst gewählten Segment werfen.
  let activeSegment = $state<EntitySegment>(untrack(initialSegment));
  let sourceSubView = $state<'sources' | 'repositories'>(
    untrack(() => (viewState.getCurrent('repository') ? 'repositories' : 'sources')),
  );
  // "Hof-Zuweisungen prüfen" (Spec 20 §1.8 [K], Spec 11 §6) ist ein Overlay innerhalb
  // des Höfe-Segments, kein eigener Segment-Button (INV-UI-2: ein kanonischer Weg zu
  // Höfe-nahen Daten bleibt "Höfe" — der Review ist ein Werkzeug darin, kein Ziel).
  let hofReviewOpen = $state(false);

  function selectSegment(segment: SegmentDef) {
    if (!segment.implemented) return;
    activeSegment = segment.id;
  }

  function backToList() {
    if (activeSegment === 'person') viewState.setCurrent('person', null);
    else if (activeSegment === 'family') viewState.setCurrent('family', null);
    else if (activeSegment === 'source') {
      if (viewState.getCurrent('repository')) viewState.setCurrent('repository', null);
      else viewState.setCurrent('source', null);
    } else if (activeSegment === 'place') viewState.setCurrent('place', null);
    else if (activeSegment === 'hof') viewState.setCurrent('hof', null);
  }

  function navigateToPerson(id: string) {
    activeSegment = 'person';
    hofReviewOpen = false;
    viewState.setCurrent('person', id);
  }

  function navigateToFamily(id: string) {
    activeSegment = 'family';
    hofReviewOpen = false;
    viewState.setCurrent('family', id);
  }

  function navigateToSource(id: string) {
    activeSegment = 'source';
    sourceSubView = 'sources';
    viewState.setCurrent('repository', null);
    viewState.setCurrent('source', id);
  }

  function navigateToRepository(id: string) {
    activeSegment = 'source';
    sourceSubView = 'repositories';
    viewState.setCurrent('repository', id);
  }

  function navigateToPlace(id: string) {
    activeSegment = 'place';
    viewState.setCurrent('place', id);
  }

  function navigateToHof(id: string) {
    activeSegment = 'hof';
    hofReviewOpen = false;
    viewState.setCurrent('hof', id);
  }

  const selectedPersonId = $derived(viewState.getCurrent('person'));
  const selectedFamilyId = $derived(viewState.getCurrent('family'));
  const selectedSourceId = $derived(viewState.getCurrent('source'));
  const selectedRepositoryId = $derived(viewState.getCurrent('repository'));
  const selectedPlaceId = $derived(viewState.getCurrent('place'));
  const selectedHofId = $derived(viewState.getCurrent('hof'));

  const showBack = $derived(
    (activeSegment === 'person' && !!selectedPersonId) ||
      (activeSegment === 'family' && !!selectedFamilyId) ||
      (activeSegment === 'source' && (!!selectedSourceId || !!selectedRepositoryId)) ||
      (activeSegment === 'place' && !!selectedPlaceId) ||
      (activeSegment === 'hof' && !!selectedHofId && !hofReviewOpen),
  );
</script>

<div class="entity-tab">
  <div class="entity-tab__segments" role="tablist" aria-label="Entität wählen">
    {#each segments as segment (segment.id)}
      <button
        type="button"
        role="tab"
        aria-selected={segment.id === activeSegment}
        class="entity-tab__segment"
        class:entity-tab__segment--active={segment.id === activeSegment}
        disabled={!segment.implemented}
        onclick={() => selectSegment(segment)}
      >
        {segment.label}{segment.implemented ? '' : ' (folgt)'}
      </button>
    {/each}
  </div>

  {#if activeSegment === 'source'}
    <div class="entity-tab__subsegments" role="tablist" aria-label="Quellen-Ansicht wählen">
      <button
        type="button"
        role="tab"
        aria-selected={sourceSubView === 'sources'}
        class="entity-tab__subsegment"
        class:entity-tab__subsegment--active={sourceSubView === 'sources'}
        onclick={() => {
          sourceSubView = 'sources';
        }}
      >
        Quellen
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={sourceSubView === 'repositories'}
        class="entity-tab__subsegment"
        class:entity-tab__subsegment--active={sourceSubView === 'repositories'}
        onclick={() => {
          sourceSubView = 'repositories';
        }}
      >
        Archive
      </button>
    </div>
  {/if}

  {#if activeSegment === 'hof' && !selectedHofId}
    <div class="entity-tab__detail-header">
      <button type="button" class="entity-tab__review-toggle" onclick={() => (hofReviewOpen = !hofReviewOpen)}>
        {hofReviewOpen ? '← Zur Hof-Liste' : 'Hof-Zuweisungen prüfen'}
      </button>
    </div>
  {/if}

  {#if showBack}
    <div class="entity-tab__detail-header">
      <button type="button" class="entity-tab__back" onclick={backToList}>← Zur Liste</button>
    </div>
  {/if}

  {#if activeSegment === 'person'}
    {#if selectedPersonId}
      <PersonDetail
        {appState}
        {viewState}
        onNavigateToFamily={navigateToFamily}
        onNavigateToSource={navigateToSource}
        onNavigateToPlace={navigateToPlace}
        onNavigateToHof={navigateToHof}
        {onNavigateToTree}
      />
    {:else}
      <PersonList {appState} {viewState} />
    {/if}
  {:else if activeSegment === 'family'}
    {#if selectedFamilyId}
      <FamilyDetail
        {appState}
        {viewState}
        onNavigateToPerson={navigateToPerson}
        onNavigateToSource={navigateToSource}
        onNavigateToPlace={navigateToPlace}
        onNavigateToHof={navigateToHof}
      />
    {:else}
      <FamilyList {appState} {viewState} />
    {/if}
  {:else if activeSegment === 'source'}
    {#if sourceSubView === 'repositories'}
      {#if selectedRepositoryId}
        <RepositoryDetail {appState} {viewState} onNavigateToSource={navigateToSource} />
      {:else}
        <RepositoryList {appState} {viewState} />
      {/if}
    {:else if selectedSourceId}
      <SourceDetail
        {appState}
        {viewState}
        onNavigateToPerson={navigateToPerson}
        onNavigateToFamily={navigateToFamily}
        onNavigateToRepository={navigateToRepository}
      />
    {:else}
      <SourceList {appState} {viewState} />
    {/if}
  {:else if activeSegment === 'place'}
    {#if selectedPlaceId}
      <PlaceDetail
        {appState}
        {viewState}
        onNavigateToPerson={navigateToPerson}
        onNavigateToFamily={navigateToFamily}
      />
    {:else}
      <PlaceList {appState} {viewState} />
    {/if}
  {:else if activeSegment === 'hof'}
    {#if hofReviewOpen && !selectedHofId}
      <HofReview
        {appState}
        onNavigateToPerson={navigateToPerson}
        onNavigateToFamily={navigateToFamily}
      />
    {:else if selectedHofId}
      <HofDetail {appState} {viewState} onNavigateToPerson={navigateToPerson} />
    {:else}
      <HofList {appState} {viewState} />
    {/if}
  {/if}
</div>

<style>
  .entity-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .entity-tab__segments,
  .entity-tab__subsegments {
    display: flex;
    gap: 0.3rem;
    padding: 0.5rem 0.75rem;
    overflow-x: auto;
    border-bottom: 1px solid var(--stb-surface-3);
  }

  .entity-tab__subsegments {
    padding-top: 0;
    border-bottom-style: dashed;
  }

  .entity-tab__segment,
  .entity-tab__subsegment {
    background: var(--stb-surface-2);
    border: 1px solid var(--stb-surface-3);
    color: var(--stb-text-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    font-size: 0.78rem;
    white-space: nowrap;
    cursor: pointer;
  }

  .entity-tab__segment:disabled {
    cursor: not-allowed;
  }

  .entity-tab__segment--active,
  .entity-tab__subsegment--active {
    background: var(--stb-gold);
    color: var(--stb-bg);
    font-weight: 700;
    border-color: var(--stb-gold);
    cursor: default;
  }

  .entity-tab__detail-header {
    padding: 0.5rem 0.75rem 0;
  }

  .entity-tab__back {
    background: transparent;
    border: none;
    color: var(--stb-gold-light);
    cursor: pointer;
    font: inherit;
    padding: 0;
  }

  .entity-tab__review-toggle {
    background: var(--stb-surface-3);
    border: 1px solid var(--stb-gold-dim);
    color: var(--stb-text);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
    font-size: 0.8rem;
  }
</style>
