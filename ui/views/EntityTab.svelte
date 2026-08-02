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
  import type { NavHistory } from '../shell/nav-history.svelte';
  import { swipeNav } from '../shell/swipe-nav';
  import { createEntityTabOverlays } from './entity-tab-overlays.svelte';
  import { createEntityTabNavigation } from './entity-tab-navigation.svelte';
  import { createMediaGalleryFilters } from './media/media-gallery-filters.svelte';
  import type { EventClipboard } from '../shell/event-clipboard.svelte';
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
  import PersonDedupView from './person/PersonDedupView.svelte';
  import RelationshipTool from './tools/RelationshipTool.svelte';
  import PlaceReview from './place/PlaceReview.svelte';
  import HofList from './hof/HofList.svelte';
  import HofDetail from './hof/HofDetail.svelte';
  import HofReview from './hof/HofReview.svelte';
  import HofDedupView from './hof/HofDedupView.svelte';
  import MediaGallery from './media/MediaGallery.svelte';
  import type { MediaResolver } from '../../services/media';
  import MediaDetail from './media/MediaDetail.svelte';

  interface Props {
    appState: AppState;
    viewState: ViewState;
    /** Ereignis-Zwischenablage der Sitzung (BL-212) — nur durchgereicht, s. PersonDetail. */
    clipboard?: EventClipboard;
    /** Medien-Auflösung (BL-258) — nur durchgereicht an Galerie und Medium-Detail. */
    mediaResolver?: MediaResolver;
    /**
     * Personen-Kontext-Sprung in eine Lens (PersonDetail -> Baum/Karte/Zeitleiste/Story,
     * BL-60/ADR-v9-153 — ersetzt die vormaligen Einzel-Callbacks `onNavigateToTree`/
     * `onOpenStoryForPerson`). Optional durchgereicht statt hier verdrahtet: `activeTarget`
     * (welcher Bottom-Nav-Slot aktiv ist) sitzt in App.svelte, nicht in EntityTab — das ist
     * bewusst KEIN EntityTab-Sub-Callback wie navigateToPerson/-Family/etc. (die bleiben
     * INNERHALB dieser Scheibe), sondern ein Durchreichen nach oben zum echten
     * Ziel-Umschalter.
     */
    onOpenLensForPerson?: (personId: string, lens: LensId) => void;
    /** "📖 Story" aus FamilyDetail → Story-Lens im Familien-Modus (BL-186). Bleibt ein
     *  eigener Callback: eine Familie ist KEIN Personen-Lens-Fokus (Karte/Zeitleiste/Baum
     *  kennen sie nicht), der Absprung hat dort also genau ein Ziel. */
    onOpenStoryForFamily?: (familyId: string) => void;
    /** Cross-Tab-Navigation zur Karte-Lens (ADR-v9-78/80, `CoordIndicator`/`EventLine`)
     *  — optional, durchgereicht an PersonDetail/FamilyDetail/PlaceList/HofList, analog
     *  `onNavigateToTree` oben (echter Ziel-Umschalter sitzt in App.svelte, nicht hier). */
    onNavigateLens?: (lens: LensId) => void;
    /** Die EINE Routen-Quelle (INV-UI-15) — hält, welches Entitäts-Segment offen ist. */
    route: Route;
    /**
     * Verlauf (BL-07). Optional, damit Komponententests diese Fläche weiterhin ohne
     * Schale montieren können — fehlt er, verhält sich „← Zurück" wie vor BL-07 und
     * führt zur Liste (der Fallback ist ohnehin der Rückweg, wenn nichts im Stack liegt).
     */
    navHistory?: NavHistory;
  }
  const {
    appState,
    viewState,
    route,
    navHistory,
    onOpenLensForPerson,
    onOpenStoryForFamily,
    onNavigateLens,
    clipboard,
    mediaResolver,
  }: Props = $props();

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
  // Welches WERKZEUG-Overlay offen ist (Massen-Dedup, Orts-/Hof-Review, Personen-
  // Dubletten, Verwandtschaft), lebt seit BL-07 in einer eigenen Datei — sechs Zustände
  // mit einer Regel, die sich sauber herauslöst (`entity-tab-overlays.svelte.ts`, dort
  // auch die Begründung, warum sie NICHT in der Routen-Quelle liegen).
  //
  // EntityTab bleibt die Stelle, die entscheidet, WELCHE Komponente rendert (Liste vs.
  // Overlay) — sonst müsste jede Liste ihre eigene View-Swap-Logik kennen.
  const overlays = createEntityTabOverlays();

  // Die Sprünge selbst (Familie → Person, Quelle → Archiv, …) liegen aus demselben Grund
  // daneben in `entity-tab-navigation.svelte.ts`: jeder wechselt Segment UND Auswahl UND
  // räumt ggf. ein Overlay — zusammen mit den „gerade angelegt"-Merkern und der
  // Quellen/Archive-Unteransicht eine eigene kohäsive Einheit.
  const nav = untrack(() => createEntityTabNavigation({ route, viewState, overlays }));
  const sourceSubView = $derived(nav.sourceSubView);

  // Facetten-/Suchzustand der Kachelgalerie (ADR-v9-192): liegt HIER, weil die Galerie
  // beim Öffnen eines Mediums abbaut (sie belegt die ganze Fläche) — eine eingegrenzte
  // Auswahl soll den Blick ins Medium überleben (Spec 21 §5). Derselbe Besitz-Gedanke wie
  // bei `overlays`/`nav`: der Zustand gehört dem Tab, nicht der Fläche darin.
  const mediaFilters = untrack(() => createMediaGalleryFilters());

  /**
   * Ein Werkzeug zu öffnen GIBT die Einzelauswahl des Segments auf (ADR-v9-184).
   *
   * Warum das nötig ist: `overlayActive` (unten) lässt ein Werkzeug nur die volle Breite
   * belegen, solange nichts ausgewählt ist — sonst gewönne ein vergessener Overlay-Zustand
   * gegen den gerade angesteuerten Datensatz. Diese Bedingung stammt aus dem MOBILEN
   * Entweder-oder-Modell, wo die Liste (und damit der Werkzeug-Auslöser) bei vorhandener
   * Auswahl gar nicht rendert. Mit dem Desktop-Multi-Pane (BL-92) bleibt die Listenspalte
   * samt „Werkzeuge"-Disclosure dauerhaft sichtbar: dort setzte der Klick nur den Zustand,
   * und nichts rendete — aus Nutzersicht „der Knopf tut nichts", bis zum Reload.
   *
   * Das Räumen ist die Gegenrichtung zu `closeForPlace()`/`closeForHof()`: dort weicht das
   * Werkzeug dem angesteuerten Datensatz, hier weicht die Auswahl dem Werkzeug. Ein
   * Review-/Dedup-Werkzeug IST eine ganzflächige Arbeitsfläche, keine zweite Detailansicht
   * — beides gleichzeitig zu zeigen war nie die Absicht (Spec 11 §6/§9.2).
   */
  function openTool(slot: 'person' | 'place' | 'hof', open: () => void) {
    viewState.setCurrent(slot, null);
    open();
  }

  /**
   * Segment-Klick. Auf das BEREITS AKTIVE Segment ist er der Rückweg zur Liste (BL-298).
   *
   * Seit BL-07 ist „← Zurück" herkunftsbewusst und geht EINEN Schritt zur Herkunft. Das
   * ist richtig — aber es war danach der einzige Rückweg: wer über mehrere Details
   * gewandert war, musste den ganzen Weg rückwärts ablaufen, um wieder eine Liste zu
   * sehen. Weder die Segmentreihe noch die Bottom-Nav führten dorthin (beide setzen nur
   * das Ziel, und das Ziel war schon richtig — die AUSWAHL verdeckte die Liste).
   *
   * Der aktive Tab ist die Wurzel seines eigenen Stapels (iOS-Konvention) — kein neues
   * Bedienelement, keine zweite Beschriftung, und `backToList()` gibt es bereits: es ist
   * der Boden, auf den `goBack()` fällt, wenn der Verlauf leer ist. Ein ANDERES Segment
   * räumt bewusst nichts ab: dessen Auswahl ist der Stand, zu dem es zurückkehrt
   * (INV-VS — je Ziel eine eigene Auswahl).
   */
  function selectSegment(segment: (typeof segments)[number]) {
    if (!segment.implemented) return;
    if (segment.id === activeSegment) {
      nav.backToList();
      return;
    }
    route.setTarget(segment.id);
  }

  /**
   * „← Zurück" im Detail-Kopf (BL-07, ADR-v9-177) — herkunftsbewusst.
   *
   * Vor BL-07 hieß dieser Knopf „← Zur Liste" und tat immer dasselbe. Wer von Person A
   * über eine Ereigniszeile zu Ort B und von dort zu Person C sprang, landete beim
   * Zurück in der Personenliste statt bei Person A. Jetzt führt der erste Schritt
   * dorthin, wo der Nutzer herkam; nur wenn der Verlauf leer ist (Detail direkt nach
   * App-Start aus einer erhaltenen Auswahl), bleibt der alte Weg als Boden.
   */
  function goBack() {
    if (navHistory?.back()) return;
    nav.backToList();
  }

  /** Gegenrichtung der Wisch-Geste (BL-07) — ohne Verlauf passiert nichts. */
  function goForward() {
    navHistory?.forward();
  }

  // Die Sprung-Ziele kommen aus `nav` (s. o.); hier stehen nur noch die Kurznamen, unter
  // denen die Kind-Komponenten sie als Callback bekommen.
  const navigateToPerson = (id: string) => nav.toPerson(id);
  const navigateToFamily = (id: string) => nav.toFamily(id);
  const navigateToSource = (id: string) => nav.toSource(id);
  const navigateToRepository = (id: string) => nav.toRepository(id);
  const navigateToPlace = (id: string) => nav.toPlace(id);
  const navigateToHof = (id: string) => nav.toHof(id);


  const selectedPersonId = $derived(viewState.getCurrent('person'));
  const selectedFamilyId = $derived(viewState.getCurrent('family'));
  const selectedSourceId = $derived(viewState.getCurrent('source'));
  const selectedRepositoryId = $derived(viewState.getCurrent('repository'));
  const selectedPlaceId = $derived(viewState.getCurrent('place'));
  const selectedHofId = $derived(viewState.getCurrent('hof'));
  const selectedMediaId = $derived(viewState.getCurrent('media'));

  /** Hat das aktive Segment gerade eine Auswahl? Entscheidet mobil Liste-ODER-Detail
   *  und auf Desktop, ob der Detail-Pane Inhalt oder Leerzustand zeigt. */
  const hasSelection = $derived.by(() => {
    if (activeSegment === 'person') return !!selectedPersonId;
    if (activeSegment === 'family') return !!selectedFamilyId;
    if (activeSegment === 'source')
      return sourceSubView === 'repositories' ? !!selectedRepositoryId : !!selectedSourceId;
    if (activeSegment === 'place') return !!selectedPlaceId;
    if (activeSegment === 'media') return !!selectedMediaId;
    return !!selectedHofId;
  });

  /** Review-/Dedup-Werkzeuge sind breite Arbeitsflächen, keine Listen: sie belegen in
   *  BEIDEN Formfaktoren die volle Breite statt des schmalen Listen-Panes. Sonst
   *  quetschte man eine Kandidaten-Tabelle in ~22rem (Spec 11 §6/§9.2). */
  const overlayActive = $derived.by(() => {
    if (activeSegment === 'person') return (overlays.personDedup || overlays.relationshipTool) && !selectedPersonId;
    if (activeSegment === 'place') return (overlays.placeReview || overlays.placeDedup) && !selectedPlaceId;
    if (activeSegment === 'hof') return (overlays.hofReview || overlays.hofDedup) && !selectedHofId;
    return false;
  });

  /**
   * Segmente, deren ÜBERSICHT eine Fläche ist statt einer Spalte (ADR-v9-192) — heute
   * genau die Medien-Kachelgalerie. Sie folgen dem Entweder-oder-Modell in BEIDEN
   * Formfaktoren: Übersicht über die ganze Fläche, Auswahl schaltet auf das Detail um.
   *
   * Warum das Multi-Pane hier nicht trägt: die Listenspalte ist 22rem breit und für einen
   * Index zum Überfliegen ausgelegt (INV-UI-14-Kurznamen). Ein Kachelraster (`auto-fill`,
   * 11rem-Kacheln) bekommt darin genau EINE Spalte — am Realbestand standen 641 Kacheln
   * untereinander in einem Drittel des Fensters, während zwei Drittel den Leerzustand
   * „Kein Eintrag ausgewählt" trugen. Das ist derselbe Gedanke, aus dem `overlayActive`
   * die Review-/Dedup-Werkzeuge ganzflächig zeigt (Spec 21 §10n): eine Arbeitsfläche ist
   * keine zweite Detailansicht neben einer Liste — nur hier gilt er für die Übersicht
   * selbst, nicht für ein Werkzeug daneben.
   *
   * Folge, die mitgezogen werden MUSS: ohne dauerhaft sichtbare Übersicht braucht das
   * Detail auch auf Desktop den Rückweg (`DetailHeader backAlways`, dort begründet).
   */
  const areaOverview = $derived(activeSegment === 'media');

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
    <div class="entity-tab__segments stb-segment-row stb-segment-row--full" role="tablist" aria-label="Entität wählen" data-tour="segments">
    {#each segments as segment (segment.id)}
      <button
        type="button"
        role="tab"
        aria-selected={segment.id === activeSegment}
        class="stb-segment-btn"
        class:stb-segment-btn--active={segment.id === activeSegment}
        disabled={!segment.implemented}
        aria-label={segment.label}
        onclick={() => selectSegment(segment)}
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
        onclick={() => {
          nav.setSourceSubView('sources');
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
          nav.setSourceSubView('repositories');
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
       (navigateToPerson, nav.createPerson, die Overlay-Schalter …) gehören weiterhin dieser
       Komponente, und sie durch eine neue Zwischenschicht durchzureichen wäre Aufwand
       ohne Gewinn. -->
  {#snippet listPane()}
    {#if activeSegment === 'person'}
      <PersonList
        {appState}
        {viewState}
        onCreate={(id) => nav.createPerson(id)}
        onOpenDedup={() => openTool('person', overlays.openPersonDedup)}
        onOpenRelationship={() => openTool('person', overlays.openRelationshipTool)}
      />
    {:else if activeSegment === 'family'}
      <FamilyList {appState} {viewState} onCreate={(id) => nav.createFamily(id)} />
    {:else if activeSegment === 'source'}
      {#if sourceSubView === 'repositories'}
        <RepositoryList {appState} {viewState} onCreate={(id) => nav.createRepository(id)} />
      {:else}
        <SourceList {appState} {viewState} onCreate={(id) => nav.createSource(id)} />
      {/if}
    {:else if activeSegment === 'place'}
      <PlaceList
        {appState}
        {viewState}
        onOpenReview={() => openTool('place', overlays.openPlaceReview)}
        onOpenDedup={() => openTool('place', overlays.openPlaceDedup)}
        {onNavigateLens}
      />
    {:else if activeSegment === 'hof'}
      <HofList
        {appState}
        {viewState}
        onOpenReview={() => openTool('hof', overlays.openHofReview)}
        onOpenDedup={() => openTool('hof', overlays.openHofDedup)}
        {onNavigateLens}
      />
    {:else if activeSegment === 'media'}
      <MediaGallery {appState} {viewState} {mediaResolver} filters={mediaFilters} />
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
        onOpenLens={onOpenLensForPerson}
        {onNavigateLens}
        onBack={goBack}
        {clipboard}
        {mediaResolver}
        startInEdit={selectedPersonId === nav.createdPersonId}
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
        onOpenStory={onOpenStoryForFamily}
        onBack={goBack}
        {mediaResolver}
      />
    {:else if activeSegment === 'source' && sourceSubView === 'repositories' && selectedRepositoryId}
      <RepositoryDetail
        {appState}
        {viewState}
        onNavigateToSource={navigateToSource}
        onBack={goBack}
        startInEdit={selectedRepositoryId === nav.createdRepositoryId}
      />
    {:else if activeSegment === 'source' && sourceSubView === 'sources' && selectedSourceId}
      <SourceDetail
        {appState}
        {viewState}
        onNavigateToPerson={navigateToPerson}
        onNavigateToFamily={navigateToFamily}
        onNavigateToRepository={navigateToRepository}
        onBack={goBack}
        startInEdit={selectedSourceId === nav.createdSourceId}
      />
    {:else if activeSegment === 'place' && selectedPlaceId}
      <PlaceDetail
        {appState}
        {viewState}
        onNavigateToPerson={navigateToPerson}
        onNavigateToFamily={navigateToFamily}
        onBack={goBack}
        {onNavigateLens}
      />
    {:else if activeSegment === 'hof' && selectedHofId}
      <HofDetail {appState} {viewState} onNavigateToPerson={navigateToPerson} onBack={goBack} {onNavigateLens} />
    {:else if activeSegment === 'media' && selectedMediaId}
      <MediaDetail
        {appState}
        {viewState}
        {mediaResolver}
        onNavigateToPerson={navigateToPerson}
        onNavigateToFamily={navigateToFamily}
        onNavigateToSource={navigateToSource}
        onBack={goBack}
      />
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
    {#if activeSegment === 'person' && overlays.personDedup}
      <PersonDedupView {appState} onClose={overlays.closePersonDedup} />
    {:else if activeSegment === 'person' && overlays.relationshipTool}
      <RelationshipTool {appState} {viewState} onClose={overlays.closeRelationshipTool} />
    {:else if activeSegment === 'place' && overlays.placeReview}
      <PlaceReview
        {appState}
        onNavigateToPerson={navigateToPerson}
        onNavigateToFamily={navigateToFamily}
        onClose={overlays.closePlaceReview}
      />
    {:else if activeSegment === 'place' && overlays.placeDedup}
      <PlaceDedupView {appState} onClose={overlays.closePlaceDedup} />
    {:else if activeSegment === 'hof' && overlays.hofReview}
      <HofReview
        {appState}
        onNavigateToPerson={navigateToPerson}
        onNavigateToFamily={navigateToFamily}
        onClose={overlays.closeHofReview}
      />
    {:else if activeSegment === 'hof' && overlays.hofDedup}
      <HofDedupView {appState} onClose={overlays.closeHofDedup} />
    {/if}
  {:else if layout.isDesktopLayout && areaOverview}
    <!-- Flächen-Übersicht auf Desktop (`areaOverview`, ADR-v9-192): Entweder-oder auf der
         GANZEN Fläche statt Liste-neben-Detail. Die Pane-Hülle stellt Höhe und
         Scroll-Container (geteilt mit dem Multi-Pane), aber eine EIGENE Modifier-Klasse:
         `--detail` steht für „die rechte Hälfte", und diese Fläche ist keine Hälfte —
         Tests wie `multi-pane.test.ts` prüfen genau daran. Keine Wisch-Geste: die ist
         ausdrücklich mobil (s. u.), hier tragen Zurück-Knopf und Tastenkürzel. -->
    <div class="entity-tab__pane entity-tab__pane--area">
      {#if hasSelection}{@render detailPane()}{:else}{@render listPane()}{/if}
    </div>
  {:else if layout.isDesktopLayout}
    <div class="entity-tab__panes">
      <div class="entity-tab__pane entity-tab__pane--list">{@render listPane()}</div>
      <div class="entity-tab__pane entity-tab__pane--detail">{@render detailPane()}</div>
    </div>
  {:else if hasSelection}
    <!-- Wisch-Geste NUR auf der mobilen Detail-Fläche (BL-07, Spec 21 §2): dort ersetzt
         das Detail die Liste, ein Rückweg ist also erwartbar. Die Lens-Inseln bekommen
         sie ausdrücklich NICHT — dort gehört die waagerechte Geste dem Karten-/Baum-Pan
         (v8 hielt es mit `_initDetailSwipe` genauso). Auf Desktop stehen beide Flächen
         nebeneinander; dort trägt das Tastenkürzel. -->
    <div class="entity-tab__swipe" use:swipeNav={{ onBack: goBack, onForward: goForward }}>
      {@render detailPane()}
    </div>
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

  /* KEIN `padding-top: 0` mehr (BL-299): die Trefferzone ist auf die PILLE zentriert, die
     Mindesthöhe der Reihe hält sie deshalb nur dann in ihren Grenzen, wenn die Pille auch
     mittig sitzt. Die asymmetrische Polsterung zog sie 2,8px nach oben — der Abstand zur
     Segment-Reihe darüber fiel damit auf 41,3px, und die untere Zone deckte den unteren
     Rand der oberen zu. Die Reihen bleiben trotzdem als Paar erkennbar: das leistet die
     gestrichelte Trennlinie, nicht die fehlende Polsterung. */
  .entity-tab__subsegments--dashed {
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

  /* Ganzflächige Übersicht statt Listenspalte (ADR-v9-192, `areaOverview`) — dieselbe
     Pane-Mechanik, nur ohne Nachbarn. */
  .entity-tab__pane--area {
    flex: 1;
  }

  .entity-tab__pane-empty {
    margin: 0;
    padding: 1.5rem 1rem;
    color: var(--stb-text-dim);
    font-style: italic;
  }
</style>
