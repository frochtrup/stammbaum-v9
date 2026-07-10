<script lang="ts">
  // ui/views/place/PlaceList.svelte — Orte-Tab-Liste (Spec 20 §1.7 [K]). Typ-Badge,
  // Koordinaten-Indikator, Typ-Filter, Admin-Filter, Gruppen-Modus (pnames-Varianten
  // unter dem Titel). Suche über Titel + pnames. Anreicherungs-Pille (ADR-v9-44) +
  // Referenz-Filter (ADR-v9-46, Spec 11 §9.3): die Hauptliste zeigt nur referenzierte
  // Orte, ein Segment-Umschalter (`.stb-segment-row`, INV-UI-4) wechselt zum separaten
  // "Ohne Bezug"-Abschnitt — dort bleiben Orte voll editierbar/löschbar (Klick navigiert
  // wie gewohnt zu PlaceDetail), nur die Hauptlisten-Sichtbarkeit ändert sich.
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import { collectAllEvents } from '../../shell/all-events';
  import FilterBar from '../../shell/FilterBar.svelte';
  import { countActiveFilters } from '../../shell/count-active-filters';
  import {
    buildPlaceListSections,
    defaultPlaceFilters,
    knownPlaceTypes,
    type PlaceFilters,
  } from './place-list-model';

  interface Props {
    appState: AppState;
    viewState: ViewState;
    /** "Massen-Dedup" (Spec 20 §1.7 [K], Spec 21 §10c): der Button lebt in der eigenen
     *  Toolbar dieser Liste (Toolbar-Ownership), die eigentliche Ansichts-Umschaltung
     *  bleibt bei EntityTab (das entscheidet, ob PlaceList oder PlaceDedupView rendert). */
    onOpenDedup?: () => void;
  }
  const { appState, viewState, onOpenDedup }: Props = $props();

  let query = $state('');
  let filters = $state<PlaceFilters>(defaultPlaceFilters());
  let groupMode = $state(false);
  let section = $state<'referenced' | 'unreferenced'>('referenced');

  const activeFilterCount = $derived(countActiveFilters(filters, defaultPlaceFilters()));
  const events = $derived(collectAllEvents(appState.db));
  const sections = $derived(buildPlaceListSections(appState.db, appState.placeContext, events, query, filters));
  const rows = $derived(section === 'referenced' ? sections.referenced : sections.unreferenced);
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
    <p class="place-list__empty">
      Noch keine Orte — Orte werden beim Laden einer GEDCOM-Datei automatisch aus den
      Ereignissen übernommen. Lade eine Datei, oder die geladene Datei enthält keine Orte.
    </p>
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
      <FilterBar activeCount={activeFilterCount}>
        <div class="place-list__filters">
          <label>
            Typ
            <select value={filters.type} onchange={(e) => (filters.type = e.currentTarget.value)}>
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
      </FilterBar>
      {#if onOpenDedup}
        <div class="place-list__bulk-actions">
          <button type="button" class="place-list__dedup-btn" onclick={onOpenDedup}>Massen-Dedup</button>
        </div>
      {/if}
    </div>

    <div class="stb-segment-row place-list__sections" role="tablist" aria-label="Orte-Abschnitt wählen">
      <button
        type="button"
        role="tab"
        aria-selected={section === 'referenced'}
        class="stb-segment-btn"
        class:stb-segment-btn--active={section === 'referenced'}
        onclick={() => (section = 'referenced')}
      >
        Orte ({sections.referenced.length})
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
      <p class="place-list__empty">
        {section === 'referenced' ? 'Keine Orte gefunden.' : 'Keine referenzlosen Orte.'}
      </p>
    {:else}
      <ul class="place-list__rows">
        {#each rows as row (row.id)}
          <li>
            <button type="button" class="place-list__row" onclick={() => selectPlace(row.id)}>
              <span class="place-list__title-line">
                <span class="place-list__title">{row.title}</span>
                {#if row.type}<span class="place-list__type-badge">{row.type}</span>{/if}
                {#if !row.enriched}
                  <span class="stb-pill" title="Nur der automatische Orts-Seed bzw. eine leere Neuanlage — noch keine weiteren Angaben erfasst.">ohne Zusatzangaben</span>
                {/if}
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

  /* Segment-Pillen selbst kommen aus design-system.css (.stb-segment-row/-btn, INV-UI-4)
     — hier nur die lokale Trennlinie unter der Reihe. */
  .place-list__sections {
    border-bottom: 1px solid var(--stb-surface-3);
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

  .place-list__filter-reset,
  .place-list__dedup-btn {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.7rem;
    cursor: pointer;
    font-size: 0.85rem;
  }

  .place-list__filter-reset:hover,
  .place-list__dedup-btn:hover {
    border-color: var(--stb-gold);
  }

  /* Bulk-Aktionen (Massen-Dedup) rechtsbündig, sofern Platz in der Zeile ist. margin-left:
     auto ist hier sicher (TST-11), weil dieser Block IMMER das letzte Element der
     Toolbar-Zeile ist, wenn er überhaupt gerendert wird (kein Geschwister danach). */
  .place-list__bulk-actions {
    display: flex;
    margin-left: auto;
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
