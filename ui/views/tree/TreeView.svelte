<script lang="ts">
  // ui/views/tree/TreeView.svelte — dünner Svelte-Wrapper um die imperative
  // Sanduhr-Insel (Spec 02 §5: "die reaktive Schale rendert nur einen leeren
  // Container und übergibt Kern-Daten + Callbacks"). Kein Layout/SVG-Code hier —
  // das lebt komplett in ui/islands/tree/hourglass-tree.ts (framework-frei).
  //
  // Mount/Unmount-Muster: `bind:this` + `$effect` (erster Präzedenzfall in dieser
  // Scheibe für eine imperative Insel — bisherige Views sind rein reaktiv/Svelte-
  // deklarativ). Bei jeder Änderung von personId/appState.db: kompletter Neu-Aufbau
  // über `handle.update(...)`, kein Fein-Diffing (Spec 02 §5).
  import { onDestroy } from 'svelte';
  import '../../islands/tree/hourglass-tree.css';
  import { mountHourglassTree, type TreeIslandHandle } from '../../islands/tree/hourglass-tree';
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';

  interface Props {
    appState: AppState;
    viewState: ViewState;
    /** Cross-Tab-Navigation zur Familien-Detailseite (⚭-Badge zwischen Proband/Ehepartner). */
    onNavigateToFamily?: (familyId: string) => void;
    /** Cross-Tab-Navigation: Klick auf die Zentrum-Karte öffnet die Personen-Detailseite. */
    onOpenPersonDetail?: (personId: string) => void;
  }
  const { appState, viewState, onNavigateToFamily, onOpenPersonDetail }: Props = $props();

  let containerEl: HTMLDivElement | undefined = $state();
  let handle: TreeIslandHandle | null = null;
  let fullscreen = $state(false);

  const focusId = $derived(viewState.getCurrent('tree') ?? firstAvailablePersonId());

  function firstAvailablePersonId(): string | null {
    const first = appState.db.individuals.keys().next();
    return first.done ? null : first.value;
  }

  function recenter(id: string): void {
    viewState.setCurrent('tree', id);
  }

  function toggleFullscreen(): void {
    fullscreen = !fullscreen;
    handle?.toggleFullscreen();
  }

  $effect(() => {
    const id = focusId;
    const db = appState.db;
    if (!containerEl || !id) return;
    if (!handle) {
      handle = mountHourglassTree(
        containerEl,
        db,
        id,
        {
          onSelect: recenter,
          onSelectCenter: (pid) => onOpenPersonDetail?.(pid),
          onSelectFamily: (fid) => onNavigateToFamily?.(fid),
        },
      );
    } else {
      handle.update(id);
    }
  });

  onDestroy(() => {
    handle?.destroy();
    handle = null;
  });
</script>

<div class="tree-view">
  <div class="tree-view__topbar">
    <span class="tree-view__title">Baum</span>
    <button type="button" class="tree-view__fs-btn" onclick={toggleFullscreen}>
      {fullscreen ? '⤡ Vollbild beenden' : '⤢ Vollbild'}
    </button>
  </div>
  {#if !focusId}
    <p class="tree-view__empty">Keine Person geladen.</p>
  {/if}
  <div class="tree-view__host" bind:this={containerEl}></div>
</div>

<style>
  .tree-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .tree-view__topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--stb-surface-3);
  }

  .tree-view__title {
    font-family: var(--stb-font-title);
    color: var(--stb-gold-light);
  }

  .tree-view__fs-btn {
    background: var(--stb-surface-2);
    border: 1px solid var(--stb-surface-3);
    color: var(--stb-text);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.6rem;
    font-size: 0.78rem;
    cursor: pointer;
  }

  .tree-view__empty {
    padding: 1rem;
    color: var(--stb-text-dim);
  }

  .tree-view__host {
    flex: 1;
    min-height: 0;
  }
</style>
