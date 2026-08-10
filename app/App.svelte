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
  } from '../ui/shell/nav-model';
  import { createRoute } from '../ui/shell/route.svelte';
  import { createNavHistory } from '../ui/shell/nav-history.svelte';
  import type { RouteTarget } from '../ui/shell/nav-model';
  import EntityTab from '../ui/views/EntityTab.svelte';
  import { createEventClipboard } from '../ui/shell/event-clipboard.svelte';
  import TreeView from '../ui/views/tree/TreeView.svelte';
  import MapLensView from '../ui/views/map/MapLensView.svelte';
  import TimelineLensView from '../ui/views/timeline/TimelineLensView.svelte';
  import StoryLensView from '../ui/views/story/StoryLensView.svelte';
  import GlobalSearchView from '../ui/views/search/GlobalSearchView.svelte';
  import ResearchTab from '../ui/views/ResearchTab.svelte';
  import MoreView from '../ui/views/more/MoreView.svelte';
  import { createAppDataIO, createProjectsStore, createTourStore, type AppDataIO, type TourStore } from '../services/app-data';
  import {
    createMediaResolver,
    FsMediaFolderAdapter,
    IdbMediaFolderHandleStore,
    browserThumbnail,
    canMakeThumbnails,
    IdbMediaBytesStore,
    InputMediaFilePicker,
    type MediaResolver,
  } from '../services/media';
  import { openTaskCount, formatBadgeCount } from '../ui/views/tasks/tasks-model';
  import UndoControls from '../ui/shell/UndoControls.svelte';
  import StatusNotice from '../ui/shell/StatusNotice.svelte';
  import { createShortcutHandler } from '../ui/shell/shortcuts';
  import CommandPalette from '../ui/shell/CommandPalette.svelte';
  import { createAppNavigation } from '../ui/shell/app-navigation.svelte';
  import { saveCurrentDoc } from '../ui/shell/save-action';
  import UpdateBanner from '../ui/shell/UpdateBanner.svelte';
  import { swUpdate } from '../ui/shell/sw-update.svelte';
  import { applyUpdate } from './sw-register';
  import OfflineIndicator from '../ui/shell/OfflineIndicator.svelte';
  import OnboardingTour from '../ui/shell/OnboardingTour.svelte';
  import { createTourState } from '../ui/shell/onboarding-state.svelte';
  import { onlineStatus } from '../ui/shell/online-status.svelte';
  import { layout, type LayoutEnv } from '../ui/shell/layout.svelte';
  import { createViewHolders } from '../ui/shell/view-holders.svelte';

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
    /** Injizierbar für Tests (analog placesFileIO) — B1-Bündel `app-data.json` (BL-180):
     * dateiübergreifender app-privater Zustand, eigener Picker, eigener IDB-Spiegel. */
    appDataIO?: AppDataIO;
    /** Injizierbar für Tests (analog appDataIO) — Medien-Auflösung (BL-257): hält den
     * Verzeichnis-Handle des Medien-Ordners (Kategorie A) und löst relative Pfade auf. */
    mediaResolver?: MediaResolver;
    /** Injizierbar für Tests (analog appDataIO) — Merker „Erstnutzer-Rundgang gesehen"
     * im B1-Bündel (BL-213). Default ist die echte Instanz auf demselben Bündel. */
    tourStore?: TourStore;
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
    appDataIO = createAppDataIO(),
    mediaResolver = createMediaResolver({
      adapter: new FsMediaFolderAdapter(),
      store: new IdbMediaFolderHandleStore(),
      // Ohne `createImageBitmap`/`OffscreenCanvas` (ältere Browser, Testumgebung) bleibt
      // es beim Original — kleiner ist eine Optimierung, kein Anzeige-Vorbehalt.
      makeThumbnail: canMakeThumbnails() ? browserThumbnail : undefined,
      // Zweiter Zugangsweg (BL-259): einzeln importierte Dateien. Immer verdrahtet —
      // welcher Weg angeboten wird, entscheidet die Fläche anhand der Plattform.
      bytes: new IdbMediaBytesStore(),
      picker: new InputMediaFilePicker(),
    }),
    tourStore = createTourStore(appDataIO),
    layoutEnv,
  }: Props = $props();

  const viewState = createViewState();
  // Forschungsprojekte (BL-58): app-privat. Hier EINMAL erzeugt, damit die aktive
  // Projekt-Auswahl das Wegnavigieren aus der Forschungsfläche überlebt.
  //
  // Seit BL-239 liegen sie im B1-Bündel (`app-data.json`) statt im eigenen IDB-Store und
  // überleben damit den Gerätewechsel; der Altspeicher wird beim ersten Laden einmalig
  // übernommen (`createProjectsStore`). Derselbe `appDataIO` wie die Regel-Konfiguration —
  // eine Bündel-Instanz, nicht zwei.
  // `untrack`: der Bündel-IO wird genau einmal beim Start gebunden (er ist eine Instanz,
  // kein Wert, der sich ändert) — sonst warnt der Compiler zu Recht, dass hier nur der
  // Anfangswert eines Props gelesen wird.
  const projectsState = createProjectsState(untrack(() => createProjectsStore(appDataIO)));
  // Ereignis-Zwischenablage (BL-212): EINMAL hier erzeugt, damit sie den Wechsel zwischen
  // Personen überlebt — genau das ist ihr Zweck („bei der nächsten Person übernehmen").
  // Transient, nicht persistiert (Kategorie A, s. event-clipboard.svelte.ts).
  const clipboard = createEventClipboard();
  // Ansichts-Halter der Wurzel — Suche, Filter, Anzeige-Modus und Scroll-Position aller
  // Flächen, die beim Wegnavigieren abgebaut werden (Spec 21 §5). Warum sie hier liegen und
  // nicht in den Flächen selbst, steht in `view-holders.svelte.ts`.
  const holders = createViewHolders();
  const qualityState = holders.quality;
  const searchState = holders.search;
  const listStates = holders.lists;
  const windowStates = holders.windows;
  const tasksState = holders.tasks;
  const logState = holders.log;
  const hypothesesState = holders.hypotheses;
  // Der Hinweis-Kanal der Schale. Frist und Schließen trägt `StatusNotice` (BL-333) —
  // hier steht nur, WAS gemeldet wird, nicht wie lange.
  let placesEditNotice = $state('');
  const zeigeNotiz = (text: string): void => {
    placesEditNotice = text;
  };
  // FS-Handle der zuletzt geladenen/gespeicherten Datei (Tier-1-Export, Spec 14 §4) — lebt
  // außerhalb von AppState (reines Dateihandling-Detail, kein Genealogie-Domänenwissen).
  let fileHandle: unknown = $state(undefined);
  const appState = createAppState({
    persistPlaces: (places, hofs) => {
      // Fire-and-forget: die Edit-Kommandos bleiben synchron; die Persistenz läuft daneben.
      persister
        .persist(places, hofs)
        .then((r) => {
          // NUR eine echte Meldung überschreibt den Kanal. Das Speichern läuft
          // fire-and-forget neben den Kommandos und meldet im Normalfall '' — es kam
          // dadurch regelmäßig NACH einer anderen Meldung an und löschte sie (bei der
          // Angleichung aus ADR-v9-224 im Browser beobachtet: der Hinweis erschien nie).
          if (r.notice) zeigeNotiz(r.notice);
        })
        .catch((err) => {
          zeigeNotiz('Speichern des Orts-/Hofwissens fehlgeschlagen.');
          console.error('persistPlaces', err);
        });
    },
    onPlaceTextsAligned: (geaendert, luecken) => {
      // EIN Hinweis-Kanal für alles Orts-Bezogene (INV-UI-4) — derselbe, den die
      // orte.json-Persistenz nutzt. Er steht in der Schale und überlebt deshalb, dass die
      // Datei-Fläche nach dem Laden verlassen wird.
      const teile: string[] = [];
      if (geaendert > 0) {
        teile.push(
          `${geaendert} ${geaendert === 1 ? 'Ortsangabe' : 'Ortsangaben'} an den kuratierten Orts-Bestand angeglichen — rückgängig über „Rückgängig“`,
        );
      }
      if (luecken > 0) {
        teile.push(
          `${luecken} ${luecken === 1 ? 'Ereignis' : 'Ereignisse'} unverändert gelassen — eine genannte Ebene kennt der Bestand nicht; Einzelfälle im Qualitäts-Dashboard`,
        );
      }
      zeigeNotiz(teile.join(' · ') + '.');
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
      zeigeNotiz(result.placesNotice);
    })();

    // Forschungsprojekte laden (BL-58, fällt bei Speicherfehler auf leere Liste zurück).
    void projectsState.load();

    // Merker des Erstnutzer-Rundgangs (BL-213) — bis er gelesen ist, zeigt der Rundgang
    // nichts; ein Speicherfehler gilt als „schon gesehen".
    void tour.load();

    // Medien-Ordner wiederherstellen (BL-257): gespeicherter Verzeichnis-Handle +
    // Leserecht-Nachfrage, genau wie beim Arbeitskopie-Handle. Kein Ordner oder kein
    // erneut erteiltes Recht ist KEIN Fehler — die App läuft vollständig weiter, nur
    // ohne Medien-Vorschauen.
    void mediaResolver.restore().catch(() => {});

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

  // Erstnutzer-Rundgang (BL-213): die Bedingung lebt in `onboarding-state.svelte.ts`,
  // hier bleibt die Verdrahtung.
  // `untrack` wie bei `projectsState` darüber: der Merker-Store wird genau einmal beim
  // Start gebunden (eine Instanz, kein Wert, der sich ändert).
  const tour = createTourState(untrack(() => tourStore), () => appState.fileName);

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

  // Verlauf (BL-07, ADR-v9-177): Zurück/Vorwärts über die Routen-Quelle + die zugehörige
  // Auswahl. Der Stack wird BEOBACHTET, nicht an jeder Navigationsstelle gefüttert —
  // dieser eine Effekt ist der gesamte Aufzeichnungsweg (v8 rief `_beforeDetailNavigate()`
  // am Anfang jeder show*-Funktion, Altlast §10). `record()` liest Route + Auswahl
  // reaktiv; kehrt der Nutzer über `back()` zurück, ist der wiederhergestellte Punkt
  // bereits der aktuelle und der erneute Lauf verbucht nichts (idempotent).
  const navHistory = createNavHistory(route, viewState);
  $effect(() => {
    navHistory.record();
  });

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

  // Wohin es als Nächstes geht: Sidebar-/BottomNav-Slots, Lens-Wechsel, Entitäts-Sprünge
  // und der Proband liegen seit ADR-v9-194 als kohäsive Einheit daneben (app-navigation),
  // wie schon bei EntityTab. Hier bleibt, WELCHE Fläche zum aktuellen Ziel rendert.
  const nav = createAppNavigation(appState, viewState, route);
  const {
    navigateFromSidebar,
    navigate,
    navigateLens,
    openLensForPerson,
    openPerson,
    openFamily,
    openSource,
    openPlace,
    openPlaceList,
    openHof,
    openStoryFromFamilyDetail,
    runCommand,
  } = nav;
  // Befehlspalette (⌘K, BL-93) — Desktop-Pendant zur Suche (Spec 21 §3). Sie lebt hier
  // an der Schale, weil sie in JEDER Ansicht erreichbar sein muss.
  let paletteOpen = $state(false);


  async function runSave() {
    if (!appState.fileName) return;
    const outcome = await saveCurrentDoc(appState, fileService, fileHandle);
    zeigeNotiz(outcome.notice);
    // „Speichern unter" (Tier 1b) hat ein Handle erworben — ab jetzt schreibt ⌘S still
    // in dieselbe Datei. In der Arbeitskopie liegt es schon (save-action.ts).
    if (outcome.handle !== undefined) fileHandle = outcome.handle;
  }

  // Tastenkürzel der Schale (BL-01 Undo/Redo, BL-08 Speichern/Escape, BL-93 Palette).
  // An der Schale statt an einzelnen Leisten: die Kürzel sollen überall greifen,
  // unabhängig vom Fokus.
  //
  // `belongsToField` statt eines pauschalen "in Eingabefeldern gar nichts": ⌘Z gehört
  // dort dem Feld, Escape und ⌘S gerade NICHT — ein Escape, das ein Overlay nicht
  // schließt, weil der Fokus in dessen eigenem Suchfeld steht, wäre die Falle statt der
  // Rettung (LP-8, Spec 21 §6i).
  // Der Dispatch selbst liegt in `shortcuts.ts` neben der Taste→Aktion-Zuordnung
  // (createShortcutHandler): hier bleiben nur die Aktionen der Schale. Jede meldet, ob
  // sie wirklich etwas getan hat — nur dann beansprucht der Handler das Ereignis.
  const onWindowKeydown = createShortcutHandler({
    togglePalette: () => (paletteOpen = !paletteOpen),
    closePalette: () => {
      if (!paletteOpen) return false;
      paletteOpen = false;
      return true;
    },
    save: () => void runSave(),
    back: () => navHistory.back(),
    forward: () => navHistory.forward(),
    undo: () => appState.undo(),
    redo: () => appState.redo(),
  });
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if paletteOpen}
  <CommandPalette
    db={appState.db}
    ctx={appState.placeContext}
    proband={nav.probandCommand}
    onClose={() => (paletteOpen = false)}
    onRun={runCommand}
  />
{/if}

{#if tour.visible}
  <!-- `onStart` führt auf die Datenfläche: gestartet wird der Rundgang dort, wo
       „Demo laden" steht (Mehr → Datei) — seine Ziele stehen woanders. -->
  <OnboardingTour onStart={() => route.openEntities()} onDone={() => tour.finish()} />
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

  <StatusNotice text={placesEditNotice} onDismiss={() => zeigeNotiz('')} />

  <main class="app-shell__main">
    {#if isEntityTarget(shownTarget)}
      <EntityTab
        {clipboard}
        {appState}
        {viewState}
        {mediaResolver}
        {route}
        {navHistory}
        {listStates}
        {windowStates}
        onOpenLensForPerson={openLensForPerson}
        onOpenStoryForFamily={openStoryFromFamilyDetail}
        onNavigateLens={navigateLens}
      />
    {:else if shownTarget === 'tree'}
      <TreeView
        {appState}
        {viewState}
        {route}
        {fileService}
        onOpenPersonDetail={openPerson}
        onNavigateToFamily={openFamily}
        onNavigateLens={navigateLens}
      />
    {:else if shownTarget === 'map'}
      <!-- Marker-Klick → Explorationspanel → Sprung (BL-210). Nutzt exakt die
           Sprung-Funktionen der Suchfläche (kein zweiter Sprung-Pfad, s. o.). -->
      <MapLensView
        {appState}
        {viewState}
        {route}
        onNavigateLens={navigateLens}
        onNavigateToPerson={openPerson}
        onNavigateToPlace={openPlace}
        onNavigateToHof={openHof}
        onOpenPlaceList={openPlaceList}
      />
    {:else if shownTarget === 'timeline'}
      <TimelineLensView {appState} {viewState} {route} onNavigateLens={navigateLens} />
    {:else if shownTarget === 'story'}
      <StoryLensView {appState} {viewState} {route} {mediaResolver} onNavigateLens={navigateLens} />
    {:else if shownTarget === 'search'}
      <GlobalSearchView
        {appState}
        search={searchState}
        windowed={windowStates.search}
        onNavigateToPerson={openPerson}
        onNavigateToFamily={openFamily}
        onNavigateToSource={openSource}
        onNavigateToPlace={openPlace}
        onNavigateToHof={openHof}
      />
    {:else if isResearchTarget(shownTarget)}
      <ResearchTab
        {appState}
        {route}
        {viewState}
        projects={projectsState}
        quality={qualityState}
        tasks={tasksState}
        log={logState}
        hypotheses={hypothesesState}
        onNavigateToPerson={openPerson}
        onNavigateToFamily={openFamily}
        onNavigateToPlace={openPlace}
        onNavigateToHof={openHof}
      />
    {:else}
      <MoreView
        {appState}
        {fileService}
        {persister}
        {placesFileIO}
        {appDataIO}
        {mediaResolver}
        {fileHandle}
        {route}
        {viewState}
        onFileHandleChanged={(handle) => (fileHandle = handle)}
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
    /* Oberste Fläche der App — und damit die, die unter der iOS-Statusleiste liegt
       (`viewport-fit=cover`, s. --stb-safe-top). Ohne das Inset überdeckte die Uhr den
       Titel und die Systemsymbole rechts lagen genau auf Rückgängig/Wiederherstellen:
       sichtbar UND nicht bedienbar (Nutzer-Fund per Screenshot 2026-08-01).
       Links/rechts ebenfalls, weil im Querformat der Notch hineinragt. */
    padding: calc(0.5rem + var(--stb-safe-top)) calc(1rem + var(--stb-safe-right)) 0
      calc(1rem + var(--stb-safe-left));
    /* Titel links, Undo/Redo rechts — die Leiste soll den Titel nicht verschieben. */
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  /* Auf Desktop liegt links die Sidebar, nicht der Bildschirmrand — dort trägt SIE das
     linke Inset (Sidebar.svelte), die Kopfzeile bekäme sonst eine zweite, falsche
     Einrückung. */
  .app-shell--desktop .app-shell__header {
    padding-left: 1rem;
  }

  .app-shell__title {
    font-size: 1.1rem;
    margin: 0;
    color: var(--stb-gold-light);
  }

  .app-shell__main {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    /* Platz für die fixed Bottom-Nav — inkl. des Home-Indikator-Insets, das die Nav sich
       selbst anpolstert (--stb-nav-total). Ohne das Inset verschwindet die letzte
       Listenzeile auf einem iPhone genau um diese 34px unter der Nav. */
    padding-bottom: calc(1.4rem + var(--stb-nav-total));
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
