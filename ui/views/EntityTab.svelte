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
  import type { ViewState } from '../shell/view-state.svelte';
  import type { LensId } from '../shell/lens-model';
  import { ENTITY_TARGETS, type EntityTargetId } from '../shell/nav-model';
  import type { Route } from '../shell/route.svelte';
  import { layout } from '../shell/layout.svelte';
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
  import PlaceReview from './place/PlaceReview.svelte';
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
    /** Cross-Tab-Navigation zur Karte-Lens (ADR-v9-78/80, `CoordIndicator`/`EventLine`)
     *  — optional, durchgereicht an PersonDetail/FamilyDetail/PlaceList/HofList, analog
     *  `onNavigateToTree` oben (echter Ziel-Umschalter sitzt in App.svelte, nicht hier). */
    onNavigateLens?: (lens: LensId) => void;
    /** Die EINE Routen-Quelle (INV-UI-15) — hält, welches Entitäts-Segment offen ist. */
    route: Route;
  }
  const { appState, viewState, route, onNavigateToTree, onNavigateLens }: Props = $props();

  // Die Segment-Liste steht seit BL-90 NICHT mehr hier: sie ist die Entitäten-Rolle des
  // einen Ziel-Registers (nav-model.ts, INV-UI-15). Vorher war sie die zweite von drei
  // unabhängigen Ziel-Listen — und weil die Desktop-Sidebar (Spec 21 §3) genau diese
  // Ziele flach neben Baum/Karte/Suche zeigt, hätte sie ohne Zusammenführung in einen
  // privaten Zustand dieser Komponente greifen müssen (ADR-v9-101).
  const segments = ENTITY_TARGETS;

  // Archive sind Teil des Quellen-Tabs (Spec 20 §1.6: "Quellen-Tab & Archive"), aber
  // kein eigener Segment-Button — Zugang über die Quellen-Detailseite (verlinktes
  // Archiv) bzw. den Archiv-Picker innerhalb des Quellen-Segments.
  //
  // Welches Segment offen ist, hält seit BL-90 die EINE Routen-Quelle (route.entityTarget)
  // statt eines komponenten-lokalen `activeSegment`. Die frühere Ableitung aus der
  // ViewState-Auswahl beim Mount (`initialSegment()`) ist damit entfallen: sie war nur
  // nötig, weil diese Komponente bei jedem Wechsel in Baum/Karte/Mehr unmountete und
  // ihren Zustand verlor. Die Route überlebt das — und behält das Segment auch dann,
  // wenn dort gar nichts ausgewählt war (was die alte Ableitung nicht konnte, s.
  // route.svelte.ts). Der Startwert nach App-Resume wird einmalig in App.svelte gesetzt.
  const activeSegment = $derived<EntityTargetId>(route.entityTarget);
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
  // "Orts-Zuweisungen prüfen" (Klasse P, Spec 11 §6) — dasselbe Overlay-Muster im
  // Orte-Segment. Eigene Ansicht, weil P eine Orts- und keine Hof-Mehrdeutigkeit ist:
  // die Hof-Aktionen passen darauf nicht (Befund 2026-07-16).
  let placeReviewOpen = $state(false);
  // "Massen-Dedup" (Spec 20 §1.7/§1.8 [K], Spec 11 §9.2) ist analog ein Overlay innerhalb
  // des jeweiligen Segments (Orte/Höfe), kein eigener Segment-Button — gleiche Begründung
  // wie beim Hof-Review-Toggle oben (INV-UI-2).
  let placeDedupOpen = $state(false);
  let hofDedupOpen = $state(false);

  function selectSegment(segment: (typeof segments)[number]) {
    if (!segment.implemented) return;
    route.setTarget(segment.id);
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
    route.setTarget('person');
    hofReviewOpen = false;
    placeReviewOpen = false;
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
    route.setTarget('family');
    hofReviewOpen = false;
    placeReviewOpen = false;
    viewState.setCurrent('family', id);
  }

  /** "＋ Neue Familie" (Spec 20 §2): FamilyList hat die Familie bereits per
   *  appState.saveFamily angelegt — hier nur Auswahl. Kein Editor-Sofort-Öffnen mehr
   *  nötig (ADR-v9-63): `FamilyDetail` hat kein Toggle-Formular mehr, ein frisches
   *  Familien-Gerüst ist direkt auf der Detail-Ansicht editierbar (Eltern-/Kind-Slots,
   *  Ereignis-Pills). */
  function createFamily(id: string) {
    navigateToFamily(id);
  }

  function navigateToSource(id: string) {
    route.setTarget('source');
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
    route.setTarget('source');
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
    route.setTarget('place');
    placeDedupOpen = false;
    placeReviewOpen = false;
    viewState.setCurrent('place', id);
  }

  function navigateToHof(id: string) {
    route.setTarget('hof');
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

  function openPlaceReview() {
    placeDedupOpen = false;
    placeReviewOpen = true;
  }

  function closePlaceReview() {
    placeReviewOpen = false;
  }

  function openPlaceDedup() {
    placeReviewOpen = false;
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

  /** Hat das aktive Segment gerade eine Auswahl? Entscheidet mobil Liste-ODER-Detail
   *  und auf Desktop, ob der Detail-Pane Inhalt oder Leerzustand zeigt. */
  const hasSelection = $derived.by(() => {
    if (activeSegment === 'person') return !!selectedPersonId;
    if (activeSegment === 'family') return !!selectedFamilyId;
    if (activeSegment === 'source')
      return sourceSubView === 'repositories' ? !!selectedRepositoryId : !!selectedSourceId;
    if (activeSegment === 'place') return !!selectedPlaceId;
    return !!selectedHofId;
  });

  /** Review-/Dedup-Werkzeuge sind breite Arbeitsflächen, keine Listen: sie belegen in
   *  BEIDEN Formfaktoren die volle Breite statt des schmalen Listen-Panes. Sonst
   *  quetschte man eine Kandidaten-Tabelle in ~22rem (Spec 11 §6/§9.2). */
  const overlayActive = $derived.by(() => {
    if (activeSegment === 'place') return (placeReviewOpen || placeDedupOpen) && !selectedPlaceId;
    if (activeSegment === 'hof') return (hofReviewOpen || hofDedupOpen) && !selectedHofId;
    return false;
  });

</script>

<div class="entity-tab">
  <!-- Die Entitäts-Segmentreihe ist die MOBILE Sub-Navigation (Spec 21 §2: "Familien /
       Quellen / Orte / Höfe über einen Segment-Umschalter oben"). Auf Desktop führt die
       Sidebar dieselben fünf Ziele beschriftet und dauerhaft (Spec 21 §3) — beides
       gleichzeitig wären ZWEI Wege zum selben Ziel und damit ein Bruch von INV-UI-2
       ("genau ein kanonischer Weg"), zusätzlich zu der Redundanz, die Spec 21 §9 B2 an
       v8 kritisiert. Die Reihe entfällt daher oberhalb der Layout-Grenze.
       Die Quellen/Archive-Unterreihe weiter unten bleibt: Archive sind KEIN
       Sidebar-Ziel, sondern eine Unteransicht des Quellen-Ziels (Spec 20 §1.6). -->
  {#if !layout.isDesktopLayout}
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
  {/if}

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

  <!-- Liste und Detail sind ab hier zwei SNIPPETS statt einer verschachtelten
       Liste-oder-Detail-Kette. Grund ist der Desktop-Multi-Pane (Spec 21 §3, BL-92): dort
       müssen BEIDE gleichzeitig rendern, nebeneinander. Mobil bleibt es bei
       entweder-oder — dieselbe Fläche, dieselbe Reihenfolge wie bisher.

       Bewusst zwei Snippets statt zweier Komponenten: die Auswahl-/Navigations-Callbacks
       (navigateToPerson, createPerson, die Overlay-Schalter …) gehören weiterhin dieser
       Komponente, und sie durch eine neue Zwischenschicht durchzureichen wäre Aufwand
       ohne Gewinn. -->
  {#snippet listPane()}
    {#if activeSegment === 'person'}
      <PersonList {appState} {viewState} onCreate={createPerson} />
    {:else if activeSegment === 'family'}
      <FamilyList {appState} {viewState} onCreate={createFamily} />
    {:else if activeSegment === 'source'}
      {#if sourceSubView === 'repositories'}
        <RepositoryList {appState} {viewState} onCreate={createRepository} />
      {:else}
        <SourceList {appState} {viewState} onCreate={createSource} />
      {/if}
    {:else if activeSegment === 'place'}
      <PlaceList {appState} {viewState} onOpenReview={openPlaceReview} onOpenDedup={openPlaceDedup} {onNavigateLens} />
    {:else if activeSegment === 'hof'}
      <HofList {appState} {viewState} onOpenReview={openHofReview} onOpenDedup={openHofDedup} {onNavigateLens} />
    {/if}
  {/snippet}

  {#snippet detailPane()}
    {#if activeSegment === 'person' && selectedPersonId}
      <PersonDetail
        {appState}
        {viewState}
        onNavigateToFamily={navigateToFamily}
        onNavigateToSource={navigateToSource}
        onNavigateToPlace={navigateToPlace}
        onNavigateToHof={navigateToHof}
        {onNavigateToTree}
        {onNavigateLens}
        onBack={backToList}
        startInEdit={selectedPersonId === createdPersonId}
      />
    {:else if activeSegment === 'family' && selectedFamilyId}
      <FamilyDetail
        {appState}
        {viewState}
        onNavigateToPerson={navigateToPerson}
        onNavigateToSource={navigateToSource}
        onNavigateToPlace={navigateToPlace}
        onNavigateToHof={navigateToHof}
        {onNavigateLens}
        onBack={backToList}
      />
    {:else if activeSegment === 'source' && sourceSubView === 'repositories' && selectedRepositoryId}
      <RepositoryDetail
        {appState}
        {viewState}
        onNavigateToSource={navigateToSource}
        onBack={backToList}
        startInEdit={selectedRepositoryId === createdRepositoryId}
      />
    {:else if activeSegment === 'source' && sourceSubView === 'sources' && selectedSourceId}
      <SourceDetail
        {appState}
        {viewState}
        onNavigateToPerson={navigateToPerson}
        onNavigateToFamily={navigateToFamily}
        onNavigateToRepository={navigateToRepository}
        onBack={backToList}
        startInEdit={selectedSourceId === createdSourceId}
      />
    {:else if activeSegment === 'place' && selectedPlaceId}
      <PlaceDetail
        {appState}
        {viewState}
        onNavigateToPerson={navigateToPerson}
        onNavigateToFamily={navigateToFamily}
        onBack={backToList}
      />
    {:else if activeSegment === 'hof' && selectedHofId}
      <HofDetail {appState} {viewState} onNavigateToPerson={navigateToPerson} onBack={backToList} />
    {:else}
      <!-- Leerzustand des Detail-Panes: existiert nur auf Desktop (mobil rendert bei
           fehlender Auswahl die Liste selbst). Bewusst neutral formuliert statt je
           Segment eigener Text — die Liste daneben sagt bereits, worum es geht. -->
      <p class="entity-tab__pane-empty">Kein Eintrag ausgewählt — links einen Eintrag aus der Liste wählen.</p>
    {/if}
  {/snippet}

  {#if overlayActive}
    <!-- Werkzeug-Overlays (Orts-/Hof-Review, Massen-Dedup) belegen die volle Breite,
         s. `overlayActive` oben. -->
    {#if activeSegment === 'place' && placeReviewOpen}
      <PlaceReview
        {appState}
        onNavigateToPerson={navigateToPerson}
        onNavigateToFamily={navigateToFamily}
        onClose={closePlaceReview}
      />
    {:else if activeSegment === 'place' && placeDedupOpen}
      <PlaceDedupView {appState} onClose={closePlaceDedup} />
    {:else if activeSegment === 'hof' && hofReviewOpen}
      <HofReview
        {appState}
        onNavigateToPerson={navigateToPerson}
        onNavigateToFamily={navigateToFamily}
        onClose={closeHofReview}
      />
    {:else if activeSegment === 'hof' && hofDedupOpen}
      <HofDedupView {appState} onClose={closeHofDedup} />
    {/if}
  {:else if layout.isDesktopLayout}
    <div class="entity-tab__panes">
      <div class="entity-tab__pane entity-tab__pane--list">{@render listPane()}</div>
      <div class="entity-tab__pane entity-tab__pane--detail">{@render detailPane()}</div>
    </div>
  {:else if hasSelection}
    {@render detailPane()}
  {:else}
    {@render listPane()}
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

  /* Multi-Pane (Spec 21 §3, BL-92). Die Umschaltung hängt an `layout.isDesktopLayout`
     (BL-91) im Markup, nicht an einer zweiten Media-Query hier — der Formfaktor wird an
     genau einer Stelle entschieden. */
  .entity-tab__panes {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .entity-tab__pane {
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    overflow-y: auto;
  }

  /* Feste Listenbreite, mitwachsender Detail-Bereich: die Liste ist ein Index zum
     Überfliegen (INV-UI-14-Kurznamen sind darauf ausgelegt), das Detail trägt den
     Inhalt und profitiert von jeder zusätzlichen Breite. */
  .entity-tab__pane--list {
    width: 22rem;
    flex-shrink: 0;
    border-right: 1px solid var(--stb-surface-3);
  }

  .entity-tab__pane--detail {
    flex: 1;
  }

  .entity-tab__pane-empty {
    margin: 0;
    padding: 1.5rem 1rem;
    color: var(--stb-text-dim);
    font-style: italic;
  }
</style>
