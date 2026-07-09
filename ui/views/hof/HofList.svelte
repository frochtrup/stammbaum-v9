<script lang="ts">
  // ui/views/hof/HofList.svelte — Höfe-Tab-Liste (Spec 20 §1.8 [K]: "Hof-Liste
  // (aus Events aufgelöst, numerisch sortiert), Zugehöriges Dorf anzeigen"). Anreicherungs-
  // Pille (ADR-v9-44) + Referenz-Filter (ADR-v9-46, Spec 11 §9.3) — analog PlaceList.svelte.
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import { collectAllEvents } from '../../shell/all-events';
  import { buildHofListSections } from './hof-list-model';

  interface Props {
    appState: AppState;
    viewState: ViewState;
  }
  const { appState, viewState }: Props = $props();

  let query = $state('');
  let section = $state<'referenced' | 'unreferenced'>('referenced');

  const events = $derived(collectAllEvents(appState.db));
  const sections = $derived(buildHofListSections(appState.db, appState.placeContext, events, query));
  const rows = $derived(section === 'referenced' ? sections.referenced : sections.unreferenced);
  const isEmpty = $derived(appState.db.hofObjects.size === 0);

  function selectHof(id: string) {
    viewState.setCurrent('hof', id);
  }

  function clearSearch() {
    query = '';
  }
</script>

<div class="hof-list">
  {#if isEmpty}
    <p class="hof-list__empty">Keine Höfe erfasst — werden aus RESI/PROP-Ereignissen automatisch aufgelöst.</p>
  {:else}
    <div class="hof-list__toolbar">
      <div class="hof-list__search">
        <input type="search" placeholder="Suche…" aria-label="Höfe durchsuchen" bind:value={query} />
        {#if query}
          <button type="button" class="hof-list__search-clear" aria-label="Suche löschen" onclick={clearSearch}>✕</button>
        {/if}
      </div>
    </div>

    <div class="stb-segment-row hof-list__sections" role="tablist" aria-label="Höfe-Abschnitt wählen">
      <button
        type="button"
        role="tab"
        aria-selected={section === 'referenced'}
        class="stb-segment-btn"
        class:stb-segment-btn--active={section === 'referenced'}
        onclick={() => (section = 'referenced')}
      >
        Höfe ({sections.referenced.length})
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={section === 'unreferenced'}
        class="stb-segment-btn"
        class:stb-segment-btn--active={section === 'unreferenced'}
        onclick={() => (section = 'unreferenced')}
      >
        Ohne Bezug ({sections.unreferenced.length})
      </button>
    </div>

    {#if rows.length === 0}
      <p class="hof-list__empty">
        {section === 'referenced' ? 'Keine Höfe gefunden.' : 'Keine referenzlosen Höfe.'}
      </p>
    {:else}
      <ul class="hof-list__rows">
        {#each rows as row (row.id)}
          <li>
            <button type="button" class="hof-list__row" onclick={() => selectHof(row.id)}>
              <span class="hof-list__addr">{row.addr || row.id}</span>
              {#if !row.enriched}
                <span class="stb-pill" title="Noch keine weiteren Angaben (Adress-Historie/Koordinaten/Notiz) erfasst.">ohne Zusatzangaben</span>
              {/if}
              <span class="hof-list__meta">
                <span>{row.villageTitle}</span>
                <span
                  class="hof-list__coord-indicator"
                  class:hof-list__coord-indicator--missing={!row.hasCoords}
                  title={row.hasCoords ? 'Koordinaten vorhanden' : 'Koordinaten fehlen'}
                >
                  {row.hasCoords ? '◎' : '◌'}
                </span>
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>

<style>
  .hof-list {
    overflow-y: auto;
  }

  .hof-list__empty {
    padding: 1.5rem;
    color: var(--stb-text-dim);
  }

  /* Segment-Pillen selbst kommen aus design-system.css (.stb-segment-row/-btn, INV-UI-4). */
  .hof-list__sections {
    border-bottom: 1px solid var(--stb-surface-3);
  }

  .hof-list__toolbar {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    padding: 0.5rem 1rem;
    background: var(--stb-surface-2);
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .hof-list__search {
    position: relative;
    flex: 1 1 160px;
    display: flex;
    align-items: center;
  }

  .hof-list__search input[type='search'] {
    width: 100%;
    background: var(--stb-surface-1);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 1.8rem 0.35rem 0.6rem;
    font-size: 0.85rem;
  }

  .hof-list__search-clear {
    position: absolute;
    right: 0.4rem;
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
  }

  .hof-list__rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .hof-list__row {
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

  .hof-list__row:hover,
  .hof-list__row:focus-visible {
    background: var(--stb-surface-2);
  }

  .hof-list__addr {
    font-weight: 600;
  }

  .hof-list__meta {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    font-size: 0.78rem;
    color: var(--stb-text-dim);
  }

  .hof-list__coord-indicator {
    color: var(--stb-quay-3);
  }

  .hof-list__coord-indicator--missing {
    color: var(--stb-text-muted);
  }
</style>
