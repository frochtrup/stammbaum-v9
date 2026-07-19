<script lang="ts">
  // app/App.svelte — App-Wurzel dieser Scheibe (Spec 21 §2 Mobile-Modell).
  // Verdrahtet die EINE ViewState-Instanz + den EINEN AppState mit BottomNav +
  // Entitäten-Tab (Personen/Familien/Quellen, Segment-Umschalter in EntityTab.svelte).
  // Desktop-Sidebar/Multi-Pane (Spec 21 §3) ist NICHT Teil dieser Scheibe.
  //
  // Datei öffnen/Demo laden/Speichern (ImportButton/SaveButton) leben NICHT mehr als
  // permanent sichtbare Leiste hier, sondern im "Datei"-Menüpunkt von MoreView.svelte
  // (Spec 21 §2 Nachtrag 2026-07-07): das sind Session-Rand-Aktionen (Anfang/Ende einer
  // Bearbeitungssitzung), keine Aktionen, die während der Arbeit an Personen/Familien
  // dauerhaft sichtbar sein müssen — Nutzer-Fund per Screenshot, v8-Oracle bestätigt
  // dasselbe Muster (`legacy-v8/UI-DESIGN.md`: Speichern/Backup/neue Datei lagen im
  // `☰`-Menü, nicht permanent in der Topbar). App.svelte hält `fileService`/`persister`/
  // `fileHandle` weiterhin selbst (EINE Instanz, Auto-Load/Auto-Save brauchen sie beim
  // Start unabhängig davon, ob der Nutzer je den Mehr-Hub öffnet) und reicht sie nur
  // noch an MoreView durch, statt sie hier selbst zu rendern.
  import { onMount, untrack } from 'svelte';
  import { createViewState } from '../ui/shell/view-state.svelte';
  import { createAppState } from '../ui/shell/app-state.svelte';
  import { createPlacesSyncService, createPlacesFileIO, type PlacesFileIO } from '../services/places';
  import { createPlacesPersister, type PlacesPersister } from '../ui/shell/places-persister';
  import { createFileService, type FileService } from '../services/file';
  import { loadGedcomText } from '../ui/shell/load-gedcom-text';
  import BottomNav from '../ui/shell/BottomNav.svelte';
  import {
    bottomNavSlotFor,
    isEntityTarget,
    type BottomNavSlot,
    type EntityTargetId,
  } from '../ui/shell/nav-model';
  import { createRoute } from '../ui/shell/route.svelte';
  import EntityTab from '../ui/views/EntityTab.svelte';
  import TreeView from '../ui/views/tree/TreeView.svelte';
  import MapLensView from '../ui/views/map/MapLensView.svelte';
  import TimelineLensView from '../ui/views/timeline/TimelineLensView.svelte';
  import GlobalSearchView from '../ui/views/search/GlobalSearchView.svelte';
  import ResearchTab from '../ui/views/ResearchTab.svelte';
  import MoreView from '../ui/views/more/MoreView.svelte';
  import { openTaskCount, formatBadgeCount } from '../ui/views/tasks/tasks-model';
  import type { LensId } from '../ui/shell/lens-model';
  import UndoControls from '../ui/shell/UndoControls.svelte';
  import { matchShortcut, isEditableTarget } from '../ui/shell/shortcuts';
  import UpdateBanner from '../ui/shell/UpdateBanner.svelte';
  import { swUpdate } from '../ui/shell/sw-update.svelte';
  import { applyUpdate } from './sw-register';
  import OfflineIndicator from '../ui/shell/OfflineIndicator.svelte';
  import { onlineStatus } from '../ui/shell/online-status.svelte';

  interface Props {
    /** Injizierbar für Tests (analog `createMockAdapterSet`, s. tests/services/file-service.test.ts)
     * — Default ist die echte, plattform-adaptierte Instanz. App.svelte hält GENAU EINE
     * FileService-Instanz und reicht sie an ImportButton/SaveButton/Auto-Load/Auto-Save
     * durch (Auftrag Teil 1: vorher instanziierte ImportButton eine eigene, zweite Instanz). */
    fileService?: FileService;
    /** Injizierbar für Tests (die echte orte.json-IDB-Anbindung wäre in happy-dom ohne
     * IndexedDB-Polyfill nicht lauffähig, s. tests/ui/App.component.test.ts) — Default ist
     * die echte Instanz. */
    persister?: PlacesPersister;
    /** Injizierbar für Tests (analog fileService/persister) — eigener orte.json-Datei-IO
     * (eigenes FS-Handle, eigener Picker, ADR-v9-70). Default ist die echte Instanz. */
    placesFileIO?: PlacesFileIO;
  }
  const {
    fileService = createFileService(),
    persister = createPlacesPersister(createPlacesSyncService()),
    placesFileIO = createPlacesFileIO(),
  }: Props = $props();

  const viewState = createViewState();
  let placesEditNotice = $state('');
  // FS-Handle der zuletzt geladenen/gespeicherten Datei (Tier-1-Export, Spec 14 §4) — lebt
  // außerhalb von AppState (reines Dateihandling-Detail, kein Genealogie-Domänenwissen).
  let fileHandle: unknown = $state(undefined);
  const appState = createAppState({
    persistPlaces: (places, hofs) => {
      // Fire-and-forget: die Edit-Kommandos bleiben synchron; die Persistenz läuft daneben.
      persister
        .persist(places, hofs)
        .then((r) => {
          placesEditNotice = r.notice;
        })
        .catch((err) => {
          placesEditNotice = 'Speichern des Orts-/Hofwissens fehlgeschlagen.';
          console.error('persistPlaces', err);
        });
    },
    persistWorkingCopy: (text) => {
      // Stilles Auto-Save der Genealogie-Arbeitskopie (Spec 14 §3.1) — fire-and-forget,
      // analog persistPlaces oben. Ändert NICHT die echte Datei (das macht erst der
      // explizite "Speichern"-Button über exportViaOnePipe, s. SaveButton.svelte).
      fileService.saveWorkingCopy(text, appState.fileName, fileHandle).catch((err) => {
        console.error('persistWorkingCopy', err);
      });
    },
  });

  // Auto-Load der Arbeitskopie beim Start (Spec 20 §1.2 [K], Spec 14 §3.1/§8 Schritt 4).
  // Gibt es keine Arbeitskopie, bleibt der Startzustand wie bisher (leere DB, Import-
  // Buttons sichtbar). Nutzt DIESELBE Lade-Pipeline wie ImportButton/Demo (loadGedcomText)
  // — EIN Lade-Pfad (INV-UI-4-Lehre), nur die Text-Quelle ist hier die Arbeitskopie statt
  // Picker/fetch.
  onMount(() => {
    void (async () => {
      const copy = await fileService.loadWorkingCopy();
      if (!copy) return;
      fileHandle = copy.handle;
      const result = await loadGedcomText(copy.text, copy.name, appState, persister);
      placesEditNotice = result.placesNotice;
    })();

    // Online-/Offline-Listener der Schale (BL-03). Rückgabewert von onMount ist die
    // Aufräumfunktion — der Zustand lebt zwar so lange wie die App, aber ein
    // Listener-Leck in Komponententests (mehrfaches Mounten) wäre real.
    return onlineStatus.start();
  });

  // Badge am Bottom-Nav-Ziel "Aufgaben" (Spec 20 §1.11 [K], Orakel `_updateTasksBadge`) —
  // $derived liest appState.db über den Chokepoint neu, sobald ein Aufgaben-Kommando
  // db reassigned (Spec 02 §3, EIN Pfad). '' blendet das Badge in BottomNav aus.
  const openTasksBadge = $derived.by(() => {
    const n = openTaskCount(appState.db);
    return n > 0 ? formatBadgeCount(n) : '';
  });

  // DIE Routen-Quelle (Spec 21 §3, INV-UI-15, ADR-v9-101). Vor BL-90 lag der
  // Navigationszustand hier als `activeTarget` UND in EntityTab (`activeSegment`) UND in
  // MoreView (`openEntry`) — drei Ebenen, keine kannte die anderen. Die Desktop-Sidebar
  // (BL-06) zeigt genau deren Vereinigung als flache Liste und wäre ohne diese
  // Zusammenführung nur über eine zweite Navigationsquelle baubar gewesen (gegen
  // INV-UI-2). Genau EINE Instanz, durchgereicht — analog `viewState` darüber.
  //
  // Startziel aus einer bereits vorhandenen ViewState-Auswahl ableiten (Spec 21 §5
  // "Selektion überlebt App-Resume"): diese Ableitung lag vorher in EntityTab und lief
  // dort bei JEDEM Remount; hier läuft sie genau einmal beim App-Start, was sie immer
  // sein sollte.
  function initialEntityTarget(): EntityTargetId {
    if (viewState.getCurrent('family')) return 'family';
    if (viewState.getCurrent('source') || viewState.getCurrent('repository')) return 'source';
    if (viewState.getCurrent('place')) return 'place';
    if (viewState.getCurrent('hof')) return 'hof';
    return 'person';
  }
  const route = createRoute({ target: untrack(initialEntityTarget) });

  // BottomNav zeigt "Baum" als aktiv, auch wenn Karte/Zeitleiste offen ist, und "Mehr",
  // solange ein Hub-Ziel offen ist. Diese Zuordnung ist keine App-Besonderheit mehr,
  // sondern eine Funktion des Registers (nav-model.ts) — dort auch getestet.
  const bottomNavActive = $derived<BottomNavSlot>(bottomNavSlotFor(route.target));

  function navigate(slot: BottomNavSlot) {
    // "Personen" ist der Einstieg in die ENTITÄTEN (Spec 21 §2), nicht in die
    // Personenliste im engeren Sinn: der Slot führt auf das zuletzt offene
    // Entitäts-Segment zurück, nicht stur auf Personen.
    if (slot === 'person') route.openEntities();
    else route.setTarget(slot);
  }

  // Lens-Umschalter (Spec 21 §4, INV-UI-3) — EIN Callback für alle Lens-Wechsel aus
  // jeder Lens heraus (TreeView, MapLensView UND TimelineLensView reichen denselben
  // Callback-Namen durch). Der Fokus selbst wird NICHT hier verschoben: er lebt bereits
  // im geteilten ViewState-Slot `lensFocus` (view-state.svelte.ts) und bleibt beim
  // Wechsel automatisch erhalten, weil alle Lenses denselben Slot lesen/schreiben.
  function navigateLens(lens: LensId) {
    // Lens-Ids sind seit BL-90 zugleich Ziel-Ids des Registers — die frühere
    // if/else-Übersetzung entfällt. 'story' ist noch nicht implementiert, der
    // LensSwitcher verriegelt das bereits (Klick ruft onNavigate gar nicht erst auf).
    if (lens !== 'story') route.setTarget(lens);
  }

  // Klick auf die Zentrum-Karte im Baum -> Personen-Detail (die Route sitzt in
  // App.svelte, nicht in EntityTab — daher ein eigener Callback statt eines
  // EntityTab-Sub-Callbacks).
  function openPersonDetailFromTree(personId: string) {
    viewState.setCurrent('person', personId);
    route.setTarget('person');
  }

  // Umgekehrte Richtung: "Im Baum anzeigen" aus PersonDetail heraus (durchgereicht
  // via EntityTab.onNavigateToTree -> PersonDetail.onNavigateToTree).
  function openTreeFromPersonDetail(personId: string) {
    viewState.setCurrent('lensFocus', personId);
    route.setTarget('tree');
  }

  // Klick auf den ⚭-Badge im Baum (zwischen Proband und aktivem Ehepartner) ->
  // Familien-Detail (Spec 20 §1.3 [K]-Interaktion "Klick-Rezentrierung" ergänzende
  // Familien-Navigation, analog v8 `showFamilyDetail`). Wechselt in den Personen-Tab
  // (Familien-Segment), weil die Familien-Detailansicht dort lebt (EntityTab).
  function openFamilyFromTree(familyId: string) {
    viewState.setCurrent('family', familyId);
    route.setTarget('family');
  }

  // Globale Suche (Spec 20 §1.1 [K]) -> Detailseiten leben alle in der Entitäten-Fläche
  // (EntityTab-Umbrella, ADR-v9-17); ein Klick setzt GENAU die ViewState-Auswahl UND das
  // Routen-Ziel des Zielsegments.
  //
  // Das Ziel wird seit BL-90 EXPLIZIT genannt (`setTarget('place')`) statt wie vorher
  // implizit über einen EntityTab-Remount aus der ViewState-Auswahl abgeleitet zu
  // werden. Die alte Ableitung hatte eine Rangfolge (Familie vor Quelle vor Ort vor
  // Hof) und traf bei mehreren gleichzeitig gesetzten Auswahlen nicht zwingend das
  // gerade angeklickte Segment.
  function openPersonFromSearch(personId: string) {
    viewState.setCurrent('person', personId);
    route.setTarget('person');
  }

  function openFamilyFromSearch(familyId: string) {
    viewState.setCurrent('family', familyId);
    route.setTarget('family');
  }

  function openSourceFromSearch(sourceId: string) {
    viewState.setCurrent('repository', null);
    viewState.setCurrent('source', sourceId);
    route.setTarget('source');
  }

  function openPlaceFromSearch(placeId: string) {
    viewState.setCurrent('place', placeId);
    route.setTarget('place');
  }

  function openHofFromSearch(hofId: string) {
    viewState.setCurrent('hof', hofId);
    route.setTarget('hof');
  }
  // Undo/Redo per Tastatur (BL-01, Spec 20 §1.2). An der Schale statt an der Leiste:
  // das Kürzel soll überall greifen, unabhängig vom Fokus. In Eingabefeldern bewusst
  // NICHT — dort gehört ⌘Z dem Feld (s. shortcuts.ts).
  function onWindowKeydown(e: KeyboardEvent) {
    if (isEditableTarget(e.target)) return;
    const action = matchShortcut(e);
    if (!action) return;
    const handled = action === 'undo' ? appState.undo() : appState.redo();
    // Nur beanspruchen, wenn wirklich etwas passiert ist — sonst schluckt die App ein
    // Kürzel, das der Browser sinnvoller behandeln könnte.
    if (handled) e.preventDefault();
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="app-shell">
  <header class="app-shell__header">
    <h1 class="app-shell__title">Stammbaum<OfflineIndicator /></h1>
    <UndoControls {appState} />
  </header>

  <UpdateBanner visible={swUpdate.ready} onApply={applyUpdate} />

  {#if placesEditNotice}
    <p class="app-shell__notice" role="status">{placesEditNotice}</p>
  {/if}

  <main class="app-shell__main">
    {#if isEntityTarget(route.target)}
      <EntityTab
        {appState}
        {viewState}
        {route}
        onNavigateToTree={openTreeFromPersonDetail}
        onNavigateLens={navigateLens}
      />
    {:else if route.target === 'tree'}
      <TreeView
        {appState}
        {viewState}
        onOpenPersonDetail={openPersonDetailFromTree}
        onNavigateToFamily={openFamilyFromTree}
        onNavigateLens={navigateLens}
      />
    {:else if route.target === 'map'}
      <MapLensView {appState} {viewState} onNavigateLens={navigateLens} />
    {:else if route.target === 'timeline'}
      <TimelineLensView {appState} {viewState} onNavigateLens={navigateLens} />
    {:else if route.target === 'search'}
      <GlobalSearchView
        {appState}
        onNavigateToPerson={openPersonFromSearch}
        onNavigateToFamily={openFamilyFromSearch}
        onNavigateToSource={openSourceFromSearch}
        onNavigateToPlace={openPlaceFromSearch}
        onNavigateToHof={openHofFromSearch}
      />
    {:else if route.target === 'tasks'}
      <ResearchTab
        {appState}
        onNavigateToPerson={openPersonFromSearch}
        onNavigateToFamily={openFamilyFromSearch}
        onNavigateToPlace={openPlaceFromSearch}
        onNavigateToHof={openHofFromSearch}
      />
    {:else}
      <MoreView
        {appState}
        {fileService}
        {persister}
        {placesFileIO}
        {fileHandle}
        {route}
        onImported={(handle) => (fileHandle = handle)}
      />
    {/if}
  </main>

  <BottomNav active={bottomNavActive} onNavigate={navigate} openTaskBadge={openTasksBadge} />
</div>

<style>
  .app-shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  .app-shell__header {
    padding: 0.5rem 1rem 0;
    /* Titel links, Undo/Redo rechts — die Leiste soll den Titel nicht verschieben. */
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .app-shell__title {
    font-size: 1.1rem;
    margin: 0;
    color: var(--stb-gold-light);
  }

  .app-shell__notice {
    margin: 0;
    padding: 0.4rem 1rem;
    color: var(--stb-text-dim);
    font-size: 0.85rem;
    font-style: italic;
  }

  .app-shell__main {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    padding-bottom: 4.5rem; /* Platz für die fixed Bottom-Nav */
  }
</style>
