<script lang="ts">
  // ui/views/repository/RepositoryList.svelte — Archiv-Picker (Spec 20 §1.6 [K]:
  // "Archive (Repository): Picker, Detail mit verlinkten Quellen, Signatur").
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import { buildRepositoryRows } from './repository-list-model';

  interface Props {
    appState: AppState;
    viewState: ViewState;
  }
  const { appState, viewState }: Props = $props();

  const rows = $derived(buildRepositoryRows(appState.db));
  const isEmpty = $derived(appState.db.repositories.size === 0);

  function selectRepository(id: string) {
    viewState.setCurrent('repository', id);
  }
</script>

<div class="repository-list">
  {#if isEmpty}
    <p class="repository-list__empty">Keine Archive geladen — Datei öffnen, um zu starten.</p>
  {:else}
    <ul class="repository-list__rows">
      {#each rows as row (row.id)}
        <li>
          <button type="button" class="repository-list__row" onclick={() => selectRepository(row.id)}>
            <span class="repository-list__name">{row.name}</span>
            <span class="repository-list__meta">
              {#if row.type}<span>{row.type}</span>{/if}
              <span class="repository-list__count">{row.sourceCount} Quelle{row.sourceCount === 1 ? '' : 'n'}</span>
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .repository-list {
    overflow-y: auto;
  }

  .repository-list__empty {
    padding: 1.5rem;
    color: var(--stb-text-dim);
  }

  .repository-list__rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .repository-list__row {
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

  .repository-list__row:hover,
  .repository-list__row:focus-visible {
    background: var(--stb-surface-2);
  }

  .repository-list__name {
    font-weight: 600;
  }

  .repository-list__meta {
    display: flex;
    gap: 0.75rem;
    font-size: 0.78rem;
    color: var(--stb-text-dim);
  }

  .repository-list__count {
    color: var(--stb-gold-light);
  }
</style>
