<script lang="ts">
  // ui/views/person/PersonList.svelte — Personen-Tab-Liste (Spec 20 §1.4 [K]).
  // Alphabetisch mit Buchstaben-Trenner, Geburts-/Sterbejahr + Ort pro Zeile.
  // Ortsdarstellung über core/places-Chokepoints (person-display.ts), nie ev.place roh.
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import { buildPersonGroups } from './person-list-model';

  interface Props {
    appState: AppState;
    viewState: ViewState;
  }
  const { appState, viewState }: Props = $props();

  const groups = $derived(buildPersonGroups(appState.db, appState.placeContext));
  const isEmpty = $derived(appState.db.individuals.size === 0);

  function selectPerson(id: string) {
    viewState.setCurrent('person', id);
  }
</script>

<div class="person-list">
  {#if isEmpty}
    <p class="person-list__empty">Keine Personen geladen — Datei öffnen, um zu starten.</p>
  {:else}
    {#each groups as group (group.letter)}
      <div class="person-list__group">
        <div class="person-list__letter" role="separator" aria-label="Buchstabe {group.letter}">
          {group.letter}
        </div>
        <ul class="person-list__rows">
          {#each group.rows as row (row.id)}
            <li>
              <button type="button" class="person-list__row" onclick={() => selectPerson(row.id)}>
                <span class="person-list__name">{row.name}</span>
                <span class="person-list__meta">
                  {#if row.birthSummary}<span>* {row.birthSummary}</span>{/if}
                  {#if row.deathSummary}<span>† {row.deathSummary}</span>{/if}
                </span>
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/each}
  {/if}
</div>

<style>
  .person-list {
    overflow-y: auto;
  }

  .person-list__empty {
    padding: 1.5rem;
    color: var(--stb-text-dim);
  }

  .person-list__letter {
    position: sticky;
    top: 0;
    background: var(--stb-surface-3);
    color: var(--stb-gold-light);
    font-weight: 700;
    padding: 0.2rem 1rem;
    font-family: var(--stb-font-title);
  }

  .person-list__rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .person-list__row {
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

  .person-list__row:hover,
  .person-list__row:focus-visible {
    background: var(--stb-surface-2);
  }

  .person-list__name {
    font-weight: 600;
  }

  .person-list__meta {
    display: flex;
    gap: 0.75rem;
    font-size: 0.78rem;
    color: var(--stb-text-dim);
  }
</style>
