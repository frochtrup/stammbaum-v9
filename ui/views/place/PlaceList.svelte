<script lang="ts">
  // ui/views/place/PlaceList.svelte — Orte-Tab-Liste (Spec 20 §1.7 [K]). Typ-Badge,
  // Koordinaten-Indikator, Typ-Filter, Admin-Filter, Gruppen-Modus (pnames-Varianten
  // unter dem Titel). Suche über Titel + pnames.
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import {
    buildPlaceRows,
    defaultPlaceFilters,
    knownPlaceTypes,
    type PlaceFilters,
  } from './place-list-model';

  interface Props {
    appState: AppState;
    viewState: ViewState;
  }
  const { appState, viewState }: Props = $props();

  let query = $state('');
  let filters = $state<PlaceFilters>(defaultPlaceFilters());
  let showFilters = $state(false);
  let groupMode = $state(false);

  const rows = $derived(buildPlaceRows(appState.db, query, filters));
  const types = $derived(knownPlaceTypes(appState.db));
  const isEmpty = $derived(appState.db.placeObjects.size === 0);

  function selectPlace(id: string) {
    viewState.setCurrent('place', id);
  }

  function clearSearch() {
    query = '';
  }

  function resetFilters() {
    filters = defaultPlaceFilters();
  }
</script>

<div class="place-list">
  {#if isEmpty}
    <p class="place-list__empty">Keine Orte erfasst — werden beim Laden einer Datei automatisch gesammelt.</p>
  {:else}
    <div class="place-list__toolbar">
      <div class="place-list__search">
        <input type="search" placeholder="Suche…" aria-label="Orte durchsuchen" bind:value={query} />
        {#if query}
          <button type="button" class="place-list__search-clear" aria-label="Suche löschen" onclick={clearSearch}>✕</button>
        {/if}
      </div>
      <label class="place-list__toggle">
        <input type="checkbox" bind:checked={groupMode} />
        Varianten gruppiert
      </label>
      <button
        type="button"
        class="place-list__filter-toggle"
        aria-expanded={showFilters}
        onclick={() => (showFilters = !showFilters)}
      >
        Filter
      </button>
    </div>

    {#if showFilters}
      <div class="place-list__filters">
        <label>
          Typ
          <select bind:value={filters.type}>
            <option value="">alle</option>
            {#each types as t (t)}
              <option value={t}>{t}</option>
            {/each}
          </select>
        </label>
        <label class="place-list__checkbox">
          <input type="checkbox" bind:checked={filters.hideAdmin} />
          Verwaltungseinheiten ausblenden
        </label>
        <button type="button" class="place-list__filter-reset" onclick={resetFilters}>Filter zurücksetzen</button>
      </div>
    {/if}

    {#if rows.length === 0}
      <p class="place-list__empty">Keine Orte gefunden.</p>
    {:else}
      <ul class="place-list__rows">
        {#each rows as row (row.id)}
          <li>
            <button type="button" class="place-list__row" onclick={() => selectPlace(row.id)}>
              <span class="place-list__title-line">
                <span class="place-list__title">{row.title}</span>
                {#if row.type}<span class="place-list__type-badge">{row.type}</span>{/if}
                <span
                  class="place-list__coord-indicator"
                  class:place-list__coord-indicator--missing={!row.hasCoords}
                  title={row.hasCoords ? 'Koordinaten vorhanden' : 'Koordinaten fehlen'}
                >
                  {row.hasCoords ? '◎' : '◌'}
                </span>
              </span>
              {#if groupMode && row.variants.length > 0}
                <span class="place-list__variants">{row.variants.join(' · ')}</span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>

<style>
  .place-list {
    overflow-y: auto;
  }

  .place-list__empty {
    padding: 1.5rem;
    color: var(--stb-text-dim);
  }

  .place-list__toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    padding: 0.5rem 1rem;
    background: var(--stb-surface-2);
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .place-list__filter-toggle,
  .place-list__filter-reset {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.7rem;
    cursor: pointer;
    font-size: 0.85rem;
  }

  .place-list__filter-toggle:hover,
  .place-list__filter-reset:hover {
    border-color: var(--stb-gold);
  }

  .place-list__toggle {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.8rem;
    color: var(--stb-text-dim);
  }

  .place-list__search {
    position: relative;
    flex: 1 1 160px;
    display: flex;
    align-items: center;
  }

  .place-list__search input[type='search'] {
    width: 100%;
    background: var(--stb-surface-1);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 1.8rem 0.35rem 0.6rem;
    font-size: 0.85rem;
  }

  .place-list__search-clear {
    position: absolute;
    right: 0.4rem;
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
  }

  .place-list__filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    padding: 0.6rem 1rem;
    background: var(--stb-surface-1);
    align-items: flex-end;
  }

  .place-list__filters label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.78rem;
    color: var(--stb-text-dim);
  }

  .place-list__filters select {
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.5rem;
  }

  .place-list__checkbox {
    flex-direction: row !important;
    align-items: center;
    gap: 0.4rem !important;
  }

  .place-list__rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .place-list__row {
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

  .place-list__row:hover,
  .place-list__row:focus-visible {
    background: var(--stb-surface-2);
  }

  .place-list__title-line {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .place-list__title {
    font-weight: 600;
  }

  .place-list__type-badge {
    font-size: 0.68rem;
    color: var(--stb-text-dim);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.05em 0.4em;
  }

  .place-list__coord-indicator {
    margin-left: auto;
    color: var(--stb-quay-3);
  }

  .place-list__coord-indicator--missing {
    color: var(--stb-text-muted);
  }

  .place-list__variants {
    font-size: 0.78rem;
    color: var(--stb-text-dim);
  }
</style>
