<script lang="ts">
  // app/App.svelte — App-Wurzel dieser Scheibe (Spec 21 §2 Mobile-Modell).
  // Verdrahtet die EINE ViewState-Instanz + den EINEN AppState mit BottomNav + Import
  // + Entitäten-Tab (Personen/Familien/Quellen, Segment-Umschalter in EntityTab.svelte).
  // Desktop-Sidebar/Multi-Pane (Spec 21 §3) ist NICHT Teil dieser Scheibe.
  import { createViewState } from '../ui/shell/view-state.svelte';
  import { createAppState } from '../ui/shell/app-state.svelte';
  import BottomNav, { type BottomNavTarget } from '../ui/shell/BottomNav.svelte';
  import ImportButton from '../ui/shell/ImportButton.svelte';
  import ComingSoonPanel from '../ui/shell/ComingSoonPanel.svelte';
  import EntityTab from '../ui/views/EntityTab.svelte';
  import TreeView from '../ui/views/tree/TreeView.svelte';
  import GlobalSearchView from '../ui/views/search/GlobalSearchView.svelte';

  const viewState = createViewState();
  const appState = createAppState();

  // Bottom-Nav-Ziele sind eine Teilmenge von ViewTarget (Spec 21 §2: 5 feste Slots;
  // Familien/Quellen/Archive/Orte/Höfe leben NICHT hier, sondern im Entitäten-Segment-
  // Umschalter innerhalb von EntityTab.svelte, s. Auftrag "kein Absturz beim Klick").
  let activeTarget = $state<BottomNavTarget>('person');

  function navigate(target: BottomNavTarget) {
    activeTarget = target;
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
    viewState.setCurrent('tree', personId);
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

  const comingSoonLabels: Record<Exclude<BottomNavTarget, 'person' | 'tree' | 'search'>, string> = {
    tasks: '☑ Aufgaben',
    more: '⋯ Mehr',
  };
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
      />
    {:else if activeTarget === 'search'}
      <GlobalSearchView
        {appState}
        onNavigateToPerson={openPersonFromSearch}
        onNavigateToFamily={openFamilyFromSearch}
        onNavigateToSource={openSourceFromSearch}
        onNavigateToPlace={openPlaceFromSearch}
      />
    {:else}
      <ComingSoonPanel label={comingSoonLabels[activeTarget]} />
    {/if}
  </main>

  <BottomNav active={activeTarget} onNavigate={navigate} />
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
