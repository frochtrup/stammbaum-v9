<script lang="ts">
  // ui/views/source/SourceList.svelte — Quellen-Tab-Liste (Spec 20 §1.6 [K]).
  // Kurzname/Abbr, Autor, Datum, Referenzzähler pro Zeile.
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import { buildSourceRows } from './source-list-model';

  interface Props {
    appState: AppState;
    viewState: ViewState;
  }
  const { appState, viewState }: Props = $props();

  const rows = $derived(buildSourceRows(appState.db));
  const isEmpty = $derived(appState.db.sources.size === 0);

  function selectSource(id: string) {
    viewState.setCurrent('source', id);
  }
</script>

<div class="source-list">
  {#if isEmpty}
    <p class="source-list__empty">Keine Quellen geladen — Datei öffnen, um zu starten.</p>
  {:else}
    <ul class="source-list__rows">
      {#each rows as row (row.id)}
        <li>
          <button type="button" class="source-list__row" onclick={() => selectSource(row.id)}>
            <span class="source-list__label">{row.label}</span>
            <span class="source-list__meta">
              {#if row.author}<span>{row.author}</span>{/if}
              {#if row.date}<span>{row.date}</span>{/if}
              <span class="source-list__refcount">{row.refCount}× zitiert</span>
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .source-list {
    overflow-y: auto;
  }

  .source-list__empty {
    padding: 1.5rem;
    color: var(--stb-text-dim);
  }

  .source-list__rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .source-list__row {
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

  .source-list__row:hover,
  .source-list__row:focus-visible {
    background: var(--stb-surface-2);
  }

  .source-list__label {
    font-weight: 600;
  }

  .source-list__meta {
    display: flex;
    gap: 0.75rem;
    font-size: 0.78rem;
    color: var(--stb-text-dim);
  }

  .source-list__refcount {
    color: var(--stb-gold-light);
  }
</style>
