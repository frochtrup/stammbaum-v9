<script lang="ts">
  // app/App.svelte — App-Wurzel dieser Scheibe (Spec 21 §2 Mobile-Modell).
  // Verdrahtet die EINE ViewState-Instanz + den EINEN AppState mit BottomNav + Import
  // + Personen-Tab. Desktop-Sidebar/Multi-Pane (Spec 21 §3) ist NICHT Teil dieser Scheibe.
  import { createViewState, type ViewTarget } from '../ui/shell/view-state.svelte';
  import { createAppState } from '../ui/shell/app-state.svelte';
  import BottomNav from '../ui/shell/BottomNav.svelte';
  import ImportButton from '../ui/shell/ImportButton.svelte';
  import ComingSoonPanel from '../ui/shell/ComingSoonPanel.svelte';
  import PersonTab from '../ui/views/person/PersonTab.svelte';

  const viewState = createViewState();
  const appState = createAppState();

  let activeTarget = $state<ViewTarget>('person');

  function navigate(target: ViewTarget) {
    activeTarget = target;
  }

  const comingSoonLabels: Record<Exclude<ViewTarget, 'person'>, string> = {
    tree: '⧖ Baum',
    search: '🔍 Suche',
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
      <PersonTab {appState} {viewState} />
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
