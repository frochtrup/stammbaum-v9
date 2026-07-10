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
  import PlaceDedupView from './place/PlaceDedupView.svelte';
  import HofList from './hof/HofList.svelte';
  import HofDetail from './hof/HofDetail.svelte';
  import HofReview from './hof/HofReview.svelte';
  import HofDedupView from './hof/HofDedupView.svelte';

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
  //
  // Toolbar-Ownership (Spec 21 §10c): die Buttons, die diese Overlays ÖFFNEN, leben
  // seit dem Listen-/Detail-Primitiven-Bauabschnitt in der jeweiligen Listen-eigenen
  // Toolbar (PlaceList/HofList) statt in dieser gemeinsamen EntityTab-Kopfzeile —
  // EntityTab bleibt aber die Stelle, die entscheidet, WELCHE Komponente rendert
  // (Liste vs. Overlay), sonst müsste jede Liste ihre eigene View-Swap-Logik kennen.
  let hofReviewOpen = $state(false);
  // "Massen-Dedup" (Spec 20 §1.7/§1.8 [K], Spec 11 §9.2) ist analog ein Overlay innerhalb
  // des jeweiligen Segments (Orte/Höfe), kein eigener Segment-Button — gleiche Begründung
  // wie beim Hof-Review-Toggle oben (INV-UI-2).
  let placeDedupOpen = $state(false);
  let hofDedupOpen = $state(false);

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

  /** "＋ Neue Person" (Spec 20 §2): PersonList hat die Person bereits per appState.savePerson
   *  angelegt — hier nur Auswahl + Editor-Sofort-Öffnung (createdPersonId markiert, welche
   *  id das ist, damit PersonDetail beim Mount direkt in den Editor startet). */
  let createdPersonId = $state<string | null>(null);

  function createPerson(id: string) {
    createdPersonId = id;
    navigateToPerson(id);
  }

  function navigateToFamily(id: string) {
    activeSegment = 'family';
    hofReviewOpen = false;
    viewState.setCurrent('family', id);
  }

  /** "＋ Neue Familie" (Spec 20 §2): FamilyList hat die Familie bereits per
   *  appState.saveFamily angelegt — hier nur Auswahl + Editor-Sofort-Öffnung. */
  let createdFamilyId = $state<string | null>(null);

  function createFamily(id: string) {
    createdFamilyId = id;
    navigateToFamily(id);
  }

  function navigateToSource(id: string) {
    activeSegment = 'source';
    sourceSubView = 'sources';
    viewState.setCurrent('repository', null);
    viewState.setCurrent('source', id);
  }

  /** "＋ Neue Quelle" (Spec 20 §2): SourceList hat die Quelle bereits per
   *  appState.saveSource angelegt — hier nur Auswahl + Editor-Sofort-Öffnung. */
  let createdSourceId = $state<string | null>(null);

  function createSource(id: string) {
    createdSourceId = id;
    navigateToSource(id);
  }

  function navigateToRepository(id: string) {
    activeSegment = 'source';
    sourceSubView = 'repositories';
    viewState.setCurrent('repository', id);
  }

  /** "＋ Neues Archiv" (Spec 20 §2): RepositoryList hat das Archiv bereits per
   *  appState.saveRepository angelegt — hier nur Auswahl + Editor-Sofort-Öffnung. */
  let createdRepositoryId = $state<string | null>(null);

  function createRepository(id: string) {
    createdRepositoryId = id;
    navigateToRepository(id);
  }

  function navigateToPlace(id: string) {
    activeSegment = 'place';
    placeDedupOpen = false;
    viewState.setCurrent('place', id);
  }

  function navigateToHof(id: string) {
    activeSegment = 'hof';
    hofReviewOpen = false;
    hofDedupOpen = false;
    viewState.setCurrent('hof', id);
  }

  /** Beide Höfe-Overlays (Review/Dedup) sind gegenseitig exklusiv — jeweils nur EIN
   *  Werkzeug gleichzeitig sichtbar (INV-VS-Analog: eine aktive Overlay-Auswahl).
   *  "open"/"close" statt "toggle", weil der öffnende Button jetzt in HofList sitzt
   *  (Toolbar-Ownership, Spec 21 §10c) — HofList verschwindet aus dem DOM, sobald das
   *  Overlay rendert, ein Toggle-Button könnte sich also nicht mehr selbst umschalten.
   *  Das Schließen übernimmt stattdessen der onClose der jeweiligen Overlay-Komponente
   *  (HofReview/HofDedupView/PlaceDedupView haben bereits einen eigenen "✕ Schließen"). */
  function openHofReview() {
    hofDedupOpen = false;
    hofReviewOpen = true;
  }

  function closeHofReview() {
    hofReviewOpen = false;
  }

  function openHofDedup() {
    hofReviewOpen = false;
    hofDedupOpen = true;
  }

  function closeHofDedup() {
    hofDedupOpen = false;
  }

  function openPlaceDedup() {
    placeDedupOpen = true;
  }

  function closePlaceDedup() {
    placeDedupOpen = false;
  }

  const selectedPersonId = $derived(viewState.getCurrent('person'));
  const selectedFamilyId = $derived(viewState.getCurrent('family'));
  const selectedSourceId = $derived(viewState.getCurrent('source'));
  const selectedRepositoryId = $derived(viewState.getCurrent('repository'));
  const selectedPlaceId = $derived(viewState.getCurrent('place'));
  const selectedHofId = $derived(viewState.getCurrent('hof'));

</script>

<div class="entity-tab">
  <div class="entity-tab__segments stb-segment-row" role="tablist" aria-label="Entität wählen">
    {#each segments as segment (segment.id)}
      <button
        type="button"
        role="tab"
        aria-selected={segment.id === activeSegment}
        class="stb-segment-btn"
        class:stb-segment-btn--active={segment.id === activeSegment}
        disabled={!segment.implemented}
        onclick={() => selectSegment(segment)}
      >
        {segment.label}{segment.implemented ? '' : ' (folgt)'}
      </button>
    {/each}
  </div>

  {#if activeSegment === 'source'}
    <div
      class="entity-tab__subsegments stb-segment-row entity-tab__subsegments--dashed"
      role="tablist"
      aria-label="Quellen-Ansicht wählen"
    >
      <button
        type="button"
        role="tab"
        aria-selected={sourceSubView === 'sources'}
        class="stb-segment-btn"
        class:stb-segment-btn--active={sourceSubView === 'sources'}
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
        class="stb-segment-btn"
        class:stb-segment-btn--active={sourceSubView === 'repositories'}
        onclick={() => {
          sourceSubView = 'repositories';
        }}
      >
        Archive
      </button>
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
        onBack={backToList}
        startInEdit={selectedPersonId === createdPersonId}
      />
    {:else}
      <PersonList {appState} {viewState} onCreate={createPerson} />
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
        onBack={backToList}
        startInEdit={selectedFamilyId === createdFamilyId}
      />
    {:else}
      <FamilyList {appState} {viewState} onCreate={createFamily} />
    {/if}
  {:else if activeSegment === 'source'}
    {#if sourceSubView === 'repositories'}
      {#if selectedRepositoryId}
        <RepositoryDetail
          {appState}
          {viewState}
          onNavigateToSource={navigateToSource}
          onBack={backToList}
          startInEdit={selectedRepositoryId === createdRepositoryId}
        />
      {:else}
        <RepositoryList {appState} {viewState} onCreate={createRepository} />
      {/if}
    {:else if selectedSourceId}
      <SourceDetail
        {appState}
        {viewState}
        onNavigateToPerson={navigateToPerson}
        onNavigateToFamily={navigateToFamily}
        onNavigateToRepository={navigateToRepository}
        onBack={backToList}
        startInEdit={selectedSourceId === createdSourceId}
      />
    {:else}
      <SourceList {appState} {viewState} onCreate={createSource} />
    {/if}
  {:else if activeSegment === 'place'}
    {#if placeDedupOpen && !selectedPlaceId}
      <PlaceDedupView {appState} onClose={closePlaceDedup} />
    {:else if selectedPlaceId}
      <PlaceDetail
        {appState}
        {viewState}
        onNavigateToPerson={navigateToPerson}
        onNavigateToFamily={navigateToFamily}
        onBack={backToList}
      />
    {:else}
      <PlaceList {appState} {viewState} onOpenDedup={openPlaceDedup} />
    {/if}
  {:else if activeSegment === 'hof'}
    {#if hofReviewOpen && !selectedHofId}
      <HofReview
        {appState}
        onNavigateToPerson={navigateToPerson}
        onNavigateToFamily={navigateToFamily}
        onClose={closeHofReview}
      />
    {:else if hofDedupOpen && !selectedHofId}
      <HofDedupView {appState} onClose={closeHofDedup} />
    {:else if selectedHofId}
      <HofDetail {appState} {viewState} onNavigateToPerson={navigateToPerson} onBack={backToList} />
    {:else}
      <HofList {appState} {viewState} onOpenReview={openHofReview} onOpenDedup={openHofDedup} />
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

  /* Segment-Control-Pillen selbst kommen aus design-system.css (.stb-segment-row/
     .stb-segment-btn/--active) — hier bleibt nur das EntityTab-eigene Layout-Detail
     (Trennlinie unter der Segment-Reihe, gestrichelt unter der Subsegment-Reihe). */
  .entity-tab__segments,
  .entity-tab__subsegments {
    border-bottom: 1px solid var(--stb-surface-3);
  }

  .entity-tab__subsegments--dashed {
    padding-top: 0;
    border-bottom-style: dashed;
  }
</style>
