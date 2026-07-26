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
  import { createProjectsState } from '../ui/shell/projects-state.svelte';
  import { IdbProjectsStore } from '../services/research/index';
  import { createAppState } from '../ui/shell/app-state.svelte';
  import { createPlacesSyncService, createPlacesFileIO, type PlacesFileIO } from '../services/places';
  import { createPlacesPersister, type PlacesPersister } from '../ui/shell/places-persister';
  import { createFileService, type FileService } from '../services/file';
  import { loadDocText } from '../ui/shell/load-doc-text';
  import BottomNav from '../ui/shell/BottomNav.svelte';
  import Sidebar from '../ui/shell/Sidebar.svelte';
  import {
    bottomNavSlotFor,
    isEntityTarget,
    isResearchTarget,
    type BottomNavSlot,
    type EntityTargetId,
    type NavTargetId,
  } from '../ui/shell/nav-model';
  import { createRoute } from '../ui/shell/route.svelte';
  import type { RouteTarget } from '../ui/shell/nav-model';
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
  import { matchShortcut, isEditableTarget, belongsToField } from '../ui/shell/shortcuts';
  import CommandPalette from '../ui/shell/CommandPalette.svelte';
  import { isNavCommand, type Command } from '../ui/shell/command-palette-model';
  import { saveCurrentDoc } from '../ui/shell/save-action';
  import UpdateBanner from '../ui/shell/UpdateBanner.svelte';
  import { swUpdate } from '../ui/shell/sw-update.svelte';
  import { applyUpdate } from './sw-register';
  import OfflineIndicator from '../ui/shell/OfflineIndicator.svelte';
  import { onlineStatus } from '../ui/shell/online-status.svelte';
  import { layout, type LayoutEnv } from '../ui/shell/layout.svelte';

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
    /** Injizierbar für Tests — Formfaktor-Quelle (BL-91). Default ist window.matchMedia.
     *
     * Nötig, weil `layout` ein Modul-Singleton ist und `start()` hier im onMount läuft:
     * ein Test, der den Formfaktor vorab festlegt, würde beim Mount überschrieben. Der
     * Formfaktor gehört damit in dieselbe Reihe injizierbarer Plattform-Zugänge wie
     * fileService/persister/placesFileIO — nicht in einen Sonderweg. */
    layoutEnv?: LayoutEnv;
  }
  const {
    fileService = createFileService(),
    persister = createPlacesPersister(createPlacesSyncService()),
    placesFileIO = createPlacesFileIO(),
    layoutEnv,
  }: Props = $props();

  const viewState = createViewState();
  // Forschungsprojekte (BL-58): app-privat, geräteweit in IndexedDB. Hier EINMAL erzeugt,
  // damit die aktive Projekt-Auswahl das Wegnavigieren aus der Forschungsfläche überlebt.
  const projectsState = createProjectsState(new IdbProjectsStore());
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
      fileService.saveWorkingCopy(text, appState.fileName, fileHandle, appState.docFormat).catch((err) => {
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
      const result = await loadDocText(copy.format ?? 'gedcom', copy.text, copy.name, appState, persister);
      placesEditNotice = result.placesNotice;
    })();

    // Forschungsprojekte laden (BL-58, fällt bei Speicherfehler auf leere Liste zurück).
    void projectsState.load();

    // Plattform-Listener der Schale, beide mit derselben Aufräum-Disziplin: der
    // Rückgabewert von onMount ist die Aufräumfunktion — die Zustände leben zwar so
    // lange wie die App, aber ein Listener-Leck in Komponententests (mehrfaches
    // Mounten) wäre real.
    //
    // `layout` (BL-91) ist der EINE Formfaktor-Zustand (Spec 21 §3): hier verdrahtet,
    // damit es genau ein `matchMedia` in der Schale gibt. Gelesen wird er erst von der
    // Sidebar (BL-06) und dem Multi-Pane (BL-92) — verdrahtet ist er trotzdem schon
    // hier, weil er sonst dort nachgezogen werden müsste und die eine Stelle, an der
    // Plattform-Listener der Schale starten, genau diese ist.
    const stopOnline = onlineStatus.start();
    const stopLayout = layout.start(layoutEnv);
    return () => {
      stopOnline();
      stopLayout();
    };
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

  // Der Mehr-Hub existiert nur im Mobile-Modell (Spec 21 §2): auf Desktop trägt die
  // Sidebar Datei/Statistik/Ausgaben/Einstellungen direkt, ein Hub-Menü wäre ein
  // zweiter Weg zu denselben Zielen (INV-UI-2). Wer beim Verbreitern des Fensters
  // gerade im Hub stand, darf aber nicht auf einer leeren Fläche landen (Spec 21 §5:
  // "nie ein stiller Abbruch") — er bekommt die Entitäten-Fläche, den Einstieg.
  //
  // Bewusst ein $derived statt eines $effect, der die Route umschreibt: der Hub-Zustand
  // bleibt erhalten und ist beim Verschmälern wieder da. Ein korrigierender Effekt
  // würde den Zustand zerstören und dabei mit der Routen-Quelle um die Wahrheit
  // konkurrieren — genau die zweite Quelle, die BL-90 beseitigt hat.
  const shownTarget = $derived<RouteTarget>(
    layout.isDesktopLayout && route.target === 'more' ? route.entityTarget : route.target,
  );

  function navigateFromSidebar(target: NavTargetId) {
    route.setTarget(target);
  }

  function navigate(slot: BottomNavSlot) {
    // "Personen" ist der Einstieg in die ENTITÄTEN (Spec 21 §2), nicht in die
    // Personenliste im engeren Sinn: der Slot führt auf das zuletzt offene
    // Entitäts-Segment zurück, nicht stur auf Personen.
    if (slot === 'person') route.openEntities();
    // "Baum" ist genauso der Einstieg in die LENSES, nicht in den Baum im engeren Sinn:
    // der Slot führt auf die zuletzt offene Ansicht zurück (Baum/Karte/Zeitleiste).
    // Bis ADR-v9-102 stand hier `setTarget('tree')` — der Slot sprang stur auf den Baum,
    // während der Slot direkt daneben sich sein Segment längst merkte.
    else if (slot === 'tree') route.openLens();
    // "Aufgaben" ist genauso der Einstieg in die FORSCHUNG (Spec 21 §2, ADR-v9-116), nicht
    // stur auf "Aufgaben": der Slot führt auf das zuletzt offene Forschungsziel zurück
    // (Aufgaben/Protokoll/Hypothesen/Dashboard) — dieselbe Merker-Logik wie Personen/Baum.
    else if (slot === 'tasks') route.openResearch();
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
  // Befehlspalette (⌘K, BL-93) — Desktop-Pendant zur Suche (Spec 21 §3). Sie lebt hier
  // an der Schale, weil sie in JEDER Ansicht erreichbar sein muss.
  let paletteOpen = $state(false);

  /** Ausführen eines Palette-Befehls: Navigationsziel ODER Sprung auf eine Entität.
   *  Die Entitäts-Sprünge nutzen exakt die Funktionen, die auch die Suchfläche
   *  bedienen (openPersonFromSearch & Co.) — kein zweiter Sprung-Pfad. */
  function runCommand(cmd: Command) {
    if (isNavCommand(cmd)) {
      route.setTarget(cmd.id);
      return;
    }
    if (cmd.kind === 'person') openPersonFromSearch(cmd.id);
    else if (cmd.kind === 'family') openFamilyFromSearch(cmd.id);
    else if (cmd.kind === 'source') openSourceFromSearch(cmd.id);
    else if (cmd.kind === 'place') openPlaceFromSearch(cmd.id);
    else openHofFromSearch(cmd.id);
  }

  async function runSave() {
    if (!appState.fileName) return;
    placesEditNotice = await saveCurrentDoc(appState, fileService, fileHandle);
  }

  // Tastenkürzel der Schale (BL-01 Undo/Redo, BL-08 Speichern/Escape, BL-93 Palette).
  // An der Schale statt an einzelnen Leisten: die Kürzel sollen überall greifen,
  // unabhängig vom Fokus.
  //
  // `belongsToField` statt eines pauschalen "in Eingabefeldern gar nichts": ⌘Z gehört
  // dort dem Feld, Escape und ⌘S gerade NICHT — ein Escape, das ein Overlay nicht
  // schließt, weil der Fokus in dessen eigenem Suchfeld steht, wäre die Falle statt der
  // Rettung (LP-8, Spec 21 §6i).
  function onWindowKeydown(e: KeyboardEvent) {
    const action = matchShortcut(e);
    if (!action) return;
    if (belongsToField(action) && isEditableTarget(e.target)) return;

    if (action === 'palette') {
      paletteOpen = !paletteOpen;
      e.preventDefault();
      return;
    }
    if (action === 'escape') {
      // Nur beanspruchen, wenn wirklich etwas zu schließen war — sonst nimmt die App
      // anderen Overlays (Modals, Menüs) ihr eigenes Escape weg.
      if (paletteOpen) {
        paletteOpen = false;
        e.preventDefault();
      }
      return;
    }
    if (action === 'save') {
      e.preventDefault();
      void runSave();
      return;
    }

    const handled = action === 'undo' ? appState.undo() : appState.redo();
    // Nur beanspruchen, wenn wirklich etwas passiert ist — sonst schluckt die App ein
    // Kürzel, das der Browser sinnvoller behandeln könnte.
    if (handled) e.preventDefault();
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if paletteOpen}
  <CommandPalette
    db={appState.db}
    ctx={appState.placeContext}
    onClose={() => (paletteOpen = false)}
    onRun={runCommand}
  />
{/if}

<div class="app-shell" class:app-shell--desktop={layout.isDesktopLayout}>
  {#if layout.isDesktopLayout}
    <Sidebar active={shownTarget} onNavigate={navigateFromSidebar} openTaskBadge={openTasksBadge} />
  {/if}

  <div class="app-shell__body">
    <header class="app-shell__header">
      <!-- Der Titel steht auf Desktop bereits in der Sidebar — hier bleibt nur, was
           dort NICHT hingehört: der Offline-Zustand (ein Zustand der laufenden
           Sitzung, kein Navigationsziel) und Rückgängig/Wiederherstellen. -->
      {#if !layout.isDesktopLayout}
        <h1 class="app-shell__title">Stammbaum<OfflineIndicator /></h1>
      {:else}
        <span class="app-shell__status"><OfflineIndicator /></span>
      {/if}
      <UndoControls {appState} />
    </header>

  <UpdateBanner visible={swUpdate.ready} onApply={applyUpdate} />

  {#if placesEditNotice}
    <p class="app-shell__notice" role="status">{placesEditNotice}</p>
  {/if}

  <main class="app-shell__main">
    {#if isEntityTarget(shownTarget)}
      <EntityTab
        {appState}
        {viewState}
        {route}
        onNavigateToTree={openTreeFromPersonDetail}
        onNavigateLens={navigateLens}
      />
    {:else if shownTarget === 'tree'}
      <TreeView
        {appState}
        {viewState}
        {route}
        {fileService}
        onOpenPersonDetail={openPersonDetailFromTree}
        onNavigateToFamily={openFamilyFromTree}
        onNavigateLens={navigateLens}
      />
    {:else if shownTarget === 'map'}
      <MapLensView {appState} {viewState} {route} onNavigateLens={navigateLens} />
    {:else if shownTarget === 'timeline'}
      <TimelineLensView {appState} {viewState} {route} onNavigateLens={navigateLens} />
    {:else if shownTarget === 'search'}
      <GlobalSearchView
        {appState}
        onNavigateToPerson={openPersonFromSearch}
        onNavigateToFamily={openFamilyFromSearch}
        onNavigateToSource={openSourceFromSearch}
        onNavigateToPlace={openPlaceFromSearch}
        onNavigateToHof={openHofFromSearch}
      />
    {:else if isResearchTarget(shownTarget)}
      <ResearchTab
        {appState}
        {route}
        projects={projectsState}
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

    {#if !layout.isDesktopLayout}
      <BottomNav active={bottomNavActive} onNavigate={navigate} openTaskBadge={openTasksBadge} />
    {/if}
  </div>
</div>

<style>
  /* Mobile: eine Spalte, Bottom-Nav fix am unteren Rand.
     Desktop (ab 900px, layout.svelte.ts): Sidebar links, Inhalt rechts. Die Umschaltung
     hängt an einer Klasse, NICHT an einer eigenen Media-Query — der Formfaktor wird an
     genau einer Stelle entschieden (BL-91), und eine zweite Query hier könnte von ihr
     abweichen. Das ist zugleich der "saubere Layout-Modus (eine State-Klasse) statt
     !important-Kaskade", den Spec 21 §3 fordert. */
  .app-shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  .app-shell--desktop {
    flex-direction: row;
  }

  .app-shell__body {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 0;
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

  /* Auf Desktop gibt es keine Bottom-Nav mehr — der reservierte Platz muss mit ihr
     verschwinden, sonst bleibt unten ein toter Streifen. */
  .app-shell--desktop .app-shell__main {
    padding-bottom: 0;
  }

  .app-shell__status {
    display: inline-flex;
    align-items: center;
  }
</style>
