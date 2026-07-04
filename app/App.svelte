<script lang="ts">
  // app/App.svelte — App-Wurzel dieser Scheibe (Spec 21 §2 Mobile-Modell).
  // Verdrahtet die EINE ViewState-Instanz + den EINEN AppState mit BottomNav + Import
  // + Entitäten-Tab (Personen/Familien/Quellen, Segment-Umschalter in EntityTab.svelte).
  // Desktop-Sidebar/Multi-Pane (Spec 21 §3) ist NICHT Teil dieser Scheibe.
  import { createViewState } from '../ui/shell/view-state.svelte';
  import { createAppState } from '../ui/shell/app-state.svelte';
  import BottomNav, { type BottomNavTarget } from '../ui/shell/BottomNav.svelte';
  import ImportButton from '../ui/shell/ImportButton.svelte';
  import EntityTab from '../ui/views/EntityTab.svelte';
  import TreeView from '../ui/views/tree/TreeView.svelte';
  import MapLensView from '../ui/views/map/MapLensView.svelte';
  import GlobalSearchView from '../ui/views/search/GlobalSearchView.svelte';
  import TasksView from '../ui/views/tasks/TasksView.svelte';
  import MoreView from '../ui/views/more/MoreView.svelte';
  import { openTaskCount, formatBadgeCount } from '../ui/views/tasks/tasks-model';
  import type { LensId } from '../ui/shell/lens-model';

  const viewState = createViewState();
  const appState = createAppState();

  // Badge am Bottom-Nav-Ziel "Aufgaben" (Spec 20 §1.11 [K], Orakel `_updateTasksBadge`) —
  // $derived liest appState.db über den Chokepoint neu, sobald ein Aufgaben-Kommando
  // db reassigned (Spec 02 §3, EIN Pfad). '' blendet das Badge in BottomNav aus.
  const openTasksBadge = $derived.by(() => {
    const n = openTaskCount(appState.db);
    return n > 0 ? formatBadgeCount(n) : '';
  });

  // Bottom-Nav-Ziele sind eine Teilmenge von ViewTarget (Spec 21 §2: 5 feste Slots;
  // Familien/Quellen/Archive/Orte/Höfe leben NICHT hier, sondern im Entitäten-Segment-
  // Umschalter innerhalb von EntityTab.svelte).
  //
  // MainRoute erweitert BottomNavTarget um 'map': die Karten-Lens hat KEINEN eigenen
  // Bottom-Nav-Slot (Baum bleibt der Signatur-Slot, Spec 21 §2) — sie wird nur über
  // den Lens-Umschalter (LensSwitcher, Spec 21 §4) erreicht, während man im Baum
  // steht. BottomNav.svelte bekommt weiterhin ausschließlich echte BottomNavTarget-
  // Werte (s. <BottomNav active={...}> unten) — der erweiterte Typ ist reines
  // App-internes Routing, kein neuer Bottom-Nav-Slot.
  type MainRoute = BottomNavTarget | 'map';
  let activeTarget = $state<MainRoute>('person');

  // BottomNav zeigt "Baum" als aktiv, auch wenn die Karte offen ist (Karte hängt
  // navigatorisch am Baum-Slot, s. Kommentar oben) — nie ein aria-current auf einem
  // Bottom-Nav-Ziel, das BottomNav selbst gar nicht kennt.
  const bottomNavActive = $derived<BottomNavTarget>(activeTarget === 'map' ? 'tree' : activeTarget);

  function navigate(target: BottomNavTarget) {
    activeTarget = target;
  }

  // Lens-Umschalter (Spec 21 §4, INV-UI-3) — EIN Callback für alle Lens-Wechsel aus
  // jeder Lens heraus (TreeView UND MapLensView reichen denselben Callback-Namen
  // durch). Der Fokus selbst wird NICHT hier verschoben: er lebt bereits im
  // geteilten ViewState-Slot `lensFocus` (view-state.svelte.ts) und bleibt beim
  // Wechsel automatisch erhalten, weil beide Lenses denselben Slot lesen/schreiben.
  function navigateLens(lens: LensId) {
    if (lens === 'tree') {
      activeTarget = 'tree';
    } else if (lens === 'map') {
      activeTarget = 'map';
    }
    // 'timeline'/'story' sind noch nicht implementiert (LensSwitcher selbst
    // verriegelt das bereits — Klick ruft onNavigate gar nicht erst auf).
  }

  // Klick auf die Zentrum-Karte im Baum -> Personen-Detail (activeTarget sitzt in
  // App.svelte, nicht in EntityTab — daher ein eigener Callback statt eines
  // EntityTab-Sub-Callbacks, s. Auftrag "IST aber kein EntityTab-Sub-Callback").
  function openPersonDetailFromTree(personId: string) {
    viewState.setCurrent('person', personId);
    activeTarget = 'person';
  }

  // Umgekehrte Richtung: "Im Baum anzeigen" aus PersonDetail heraus (durchgereicht
  // via EntityTab.onNavigateToTree -> PersonDetail.onNavigateToTree).
  function openTreeFromPersonDetail(personId: string) {
    viewState.setCurrent('lensFocus', personId);
    activeTarget = 'tree';
  }

  // Klick auf den ⚭-Badge im Baum (zwischen Proband und aktivem Ehepartner) ->
  // Familien-Detail (Spec 20 §1.3 [K]-Interaktion "Klick-Rezentrierung" ergänzende
  // Familien-Navigation, analog v8 `showFamilyDetail`). Wechselt in den Personen-Tab
  // (Familien-Segment), weil die Familien-Detailansicht dort lebt (EntityTab).
  function openFamilyFromTree(familyId: string) {
    viewState.setCurrent('family', familyId);
    activeTarget = 'person';
  }

  // Globale Suche (Spec 20 §1.1 [K]) -> Detailseiten leben alle im Personen-Tab
  // (EntityTab-Umbrella, Spec ADR-v9-17); ein Klick setzt GENAU die ViewState-Auswahl
  // des Zielsegments und wechselt activeTarget zurück auf 'person' — EntityTab liest
  // beim (Re-)Mount seinen initialen Segment-Zustand aus genau dieser ViewState-
  // Auswahl (s. EntityTab.svelte initialSegment()), also KEIN zweiter Segment-Prop nötig.
  function openPersonFromSearch(personId: string) {
    viewState.setCurrent('person', personId);
    activeTarget = 'person';
  }

  function openFamilyFromSearch(familyId: string) {
    viewState.setCurrent('family', familyId);
    activeTarget = 'person';
  }

  function openSourceFromSearch(sourceId: string) {
    viewState.setCurrent('repository', null);
    viewState.setCurrent('source', sourceId);
    activeTarget = 'person';
  }

  function openPlaceFromSearch(placeId: string) {
    viewState.setCurrent('place', placeId);
    activeTarget = 'person';
  }

  function openHofFromSearch(hofId: string) {
    viewState.setCurrent('hof', hofId);
    activeTarget = 'person';
  }
</script>

<div class="app-shell">
  <header class="app-shell__header">
    <h1 class="app-shell__title">Stammbaum</h1>
  </header>

  <ImportButton {appState} />

  <main class="app-shell__main">
    {#if activeTarget === 'person'}
      <EntityTab {appState} {viewState} onNavigateToTree={openTreeFromPersonDetail} />
    {:else if activeTarget === 'tree'}
      <TreeView
        {appState}
        {viewState}
        onOpenPersonDetail={openPersonDetailFromTree}
        onNavigateToFamily={openFamilyFromTree}
        onNavigateLens={navigateLens}
      />
    {:else if activeTarget === 'map'}
      <MapLensView {appState} {viewState} onNavigateLens={navigateLens} />
    {:else if activeTarget === 'search'}
      <GlobalSearchView
        {appState}
        onNavigateToPerson={openPersonFromSearch}
        onNavigateToFamily={openFamilyFromSearch}
        onNavigateToSource={openSourceFromSearch}
        onNavigateToPlace={openPlaceFromSearch}
        onNavigateToHof={openHofFromSearch}
      />
    {:else if activeTarget === 'tasks'}
      <TasksView {appState} onNavigateToPerson={openPersonFromSearch} onNavigateToFamily={openFamilyFromSearch} />
    {:else if activeTarget === 'more'}
      <MoreView {appState} />
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
    padding-bottom: 4.5rem; /* Platz für die fixed Bottom-Nav */
  }
</style>
