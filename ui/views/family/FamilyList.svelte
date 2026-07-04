<script lang="ts">
  // ui/views/family/FamilyList.svelte — Familien-Tab-Liste (Spec 20 §1.5 [K]).
  // Elternpaar-Namen, Heiratsdatum, Kinderzahl pro Zeile.
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import { buildFamilyRows } from './family-list-model';

  interface Props {
    appState: AppState;
    viewState: ViewState;
  }
  const { appState, viewState }: Props = $props();

  const rows = $derived(buildFamilyRows(appState.db, appState.placeContext));
  const isEmpty = $derived(appState.db.families.size === 0);

  function selectFamily(id: string) {
    viewState.setCurrent('family', id);
  }
</script>

<div class="family-list">
  {#if isEmpty}
    <p class="family-list__empty">Keine Familien geladen — Datei öffnen, um zu starten.</p>
  {:else}
    <ul class="family-list__rows">
      {#each rows as row (row.id)}
        <li>
          <button type="button" class="family-list__row" onclick={() => selectFamily(row.id)}>
            <span class="family-list__parents">{row.parentsLabel}</span>
            <span class="family-list__meta">
              {#if row.marriageSummary}<span>⚭ {row.marriageSummary}</span>{/if}
              <span>{row.childCount} {row.childCount === 1 ? 'Kind' : 'Kinder'}</span>
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .family-list {
    overflow-y: auto;
  }

  .family-list__empty {
    padding: 1.5rem;
    color: var(--stb-text-dim);
  }

  .family-list__rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .family-list__row {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--stb-surface-2);
    padding: 0.55rem 1rem;
    text-align: left;
    cursor: pointer;
    color: var(--stb-text);
  }

  .family-list__row:hover,
  .family-list__row:focus-visible {
    background: var(--stb-surface-2);
  }

  .family-list__parents {
    font-weight: 600;
  }

  .family-list__meta {
    display: flex;
    gap: 0.75rem;
    font-size: 0.78rem;
    color: var(--stb-text-dim);
  }
</style>
