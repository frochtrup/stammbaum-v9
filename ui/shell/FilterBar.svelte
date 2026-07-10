<script lang="ts">
  // ui/shell/FilterBar.svelte — DIE EINE Filter-Container-Komponente für Listen-
  // Toolbars (Spec 21 §10a). Befund: PersonList/FamilyList/PlaceList implementierten
  // unabhängig voneinander denselben "showFilters"-Boolean + ein IMMER gerendertes
  // `{#if showFilters}`-Feld-Grid mit fast identischem CSS (roher flex-wrap-Block ohne
  // Platzbudget — "nimmt 50% des Bildschirms ein"). Diese Komponente übernimmt NUR die
  // Container-Mechanik (eingeklappt per Default, Trigger-Button mit "Filter"/"Filter · N",
  // Bottom-Sheet auf Mobile / Popover unterhalb des Buttons auf Desktop) — die Filter-
  // FELDER selbst bleiben unverändert bei der jeweiligen Liste (children-Snippet).
  //
  // "N aktive Filter" ist bewusst ein Prop, kein Component-internes Wissen: FilterBar
  // kennt die Feldstruktur der jeweiligen Liste nicht (Person/Familie/Ort haben
  // unterschiedliche PersonFilters/FamilyFilters/PlaceFilters-Typen) — die aufrufende
  // Liste zählt selbst (via count-active-filters.ts) und reicht nur die Zahl durch.
  import type { Snippet } from 'svelte';

  interface Props {
    /** Anzahl der vom Default abweichenden Filterfelder — 0 = "Filter", sonst "Filter · N". */
    activeCount?: number;
    children: Snippet;
  }
  const { activeCount = 0, children }: Props = $props();

  let open = $state(false);

  function toggle() {
    open = !open;
  }

  function close() {
    open = false;
  }
</script>

<div class="stb-filterbar">
  <button
    type="button"
    class="stb-filterbar__trigger"
    aria-expanded={open}
    onclick={toggle}
  >
    Filter{activeCount > 0 ? ` · ${activeCount}` : ''}
  </button>

  {#if open}
    <button type="button" class="stb-filterbar__backdrop" aria-label="Filter-Hintergrund schließen" onclick={close}></button>
    <div class="stb-filterbar__panel" role="dialog" aria-label="Filter">
      <div class="stb-filterbar__panel-head">
        <span>Filter</span>
        <button type="button" class="stb-filterbar__panel-close" aria-label="Filter schließen" onclick={close}>✕</button>
      </div>
      <div class="stb-filterbar__panel-body">
        {@render children()}
      </div>
    </div>
  {/if}
</div>

<style>
  .stb-filterbar {
    position: relative;
    display: inline-flex;
  }

  .stb-filterbar__trigger {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.7rem;
    cursor: pointer;
    font-size: 0.85rem;
    white-space: nowrap;
  }

  .stb-filterbar__trigger:hover,
  .stb-filterbar__trigger[aria-expanded='true'] {
    border-color: var(--stb-gold);
  }

  .stb-filterbar__backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    border: none;
    padding: 0;
    cursor: default;
    z-index: 20;
  }

  /* Mobile-first: Bottom-Sheet — feste Andockung an den unteren Viewport-Rand,
     volle Breite, begrenzte Höhe mit eigenem Scroll (375px Zielbreite, Spec 21 §2). */
  .stb-filterbar__panel {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 21;
    max-height: 70vh;
    overflow-y: auto;
    background: var(--stb-surface-2);
    border: 1px solid var(--stb-gold-dim);
    border-bottom: none;
    border-radius: var(--stb-radius-card) var(--stb-radius-card) 0 0;
    box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.4);
  }

  /* Desktop: Popover unterhalb des Trigger-Buttons statt Bottom-Sheet. */
  @media (min-width: 640px) {
    .stb-filterbar__panel {
      position: absolute;
      left: 0;
      right: auto;
      bottom: auto;
      top: calc(100% + 0.3rem);
      max-height: min(70vh, 420px);
      width: max-content;
      min-width: 260px;
      max-width: min(90vw, 480px);
      border-radius: var(--stb-radius-card);
      border-bottom: 1px solid var(--stb-gold-dim);
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.5);
    }

    .stb-filterbar__backdrop {
      background: transparent;
    }
  }

  .stb-filterbar__panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--stb-surface-3);
    font-size: 0.85rem;
    color: var(--stb-gold-light);
    font-weight: 600;
  }

  .stb-filterbar__panel-close {
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
    font-size: 0.9rem;
    padding: 0;
  }

  .stb-filterbar__panel-close:hover {
    color: var(--stb-text);
  }

  .stb-filterbar__panel-body {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    padding: 0.6rem 0.75rem;
    align-items: flex-end;
  }
</style>
