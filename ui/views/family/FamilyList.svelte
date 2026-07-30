<script lang="ts">
  // ui/views/family/FamilyList.svelte — Familien-Tab-Liste (Spec 20 §1.5 [K]).
  // Elternpaar-Namen, Heiratsdatum, Kinderzahl pro Zeile. Zyklischer Sortier-Umschalter
  // mit drei Zuständen (Nachname Ehemann · Nachname Ehefrau · Heiratsdatum), Suche +
  // erweiterte Filter — konsistent zum Personen-Tab-Muster (PersonList.svelte).
  //
  // "＋ Neue Familie" (Spec 20 §2): legt eine leere Familie mit einer kollisionsfreien id
  // an (allocatorFromDatabase, Spec ADR-v9-11 — kein Zufall/Wall-Clock) und meldet die
  // neue id über onCreate an den Aufrufer (EntityTab), der Auswahl + Editor-Öffnung
  // übernimmt — dieselbe Kommando-Disziplin wie appState.saveFamily(model) überall sonst.
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import { makeFamily, allocatorFromDatabase, nextId } from '../../../core/model';
  import { tooltip } from '../../shell/tooltip';
  import FilterBar from '../../shell/FilterBar.svelte';
  import { countActiveFilters } from '../../shell/count-active-filters';
  import { noDataHint } from '../../shell/nav-model';
  import { layout } from '../../shell/layout.svelte';
  import { toCsv, type CsvColumn } from '../../shell/csv';
  import { AnchorDownloadAdapter } from '../../../services/file/download-adapter';
  import {
    buildFamilyRows,
    defaultFamilyFilters,
    type FamilyFilters,
    type FamilySortMode,
    type FamilyRow,
  } from './family-list-model';

  /** CSV-Export der gefilterten/sortierten Liste (BL-125, ADR-v9-159 — dieselbe `toCsv`
   *  wie PersonList, kein zweiter Rechenweg). Spalten = sichtbare Listenspalten +
   *  Entitäts-ID. */
  const csvColumns: CsvColumn<FamilyRow>[] = [
    { header: 'ID', value: (r) => r.id },
    { header: 'Eltern', value: (r) => r.parentsLabel },
    { header: 'Heirat', value: (r) => r.marriageSummary },
    { header: 'Kinderzahl', value: (r) => r.childCount },
  ];

  interface Props {
    appState: AppState;
    viewState: ViewState;
    /** Nach dem Anlegen einer neuen Familie aufgerufen (Auswahl + Editor-Öffnung liegt beim Aufrufer). */
    onCreate?: (familyId: string) => void;
  }
  const { appState, viewState, onCreate }: Props = $props();

  function createFamily() {
    const alloc = allocatorFromDatabase(appState.db);
    const id = nextId(alloc, 'F');
    appState.saveFamily(makeFamily(id));
    onCreate?.(id);
  }

  const SORT_CYCLE: FamilySortMode[] = ['husbandSurname', 'wifeSurname', 'marriageDate'];
  const SORT_LABEL: Record<FamilySortMode, string> = {
    husbandSurname: 'Nachname Ehemann',
    wifeSurname: 'Nachname Ehefrau',
    marriageDate: 'Heiratsdatum',
  };

  let sortMode = $state<FamilySortMode>('husbandSurname');
  let query = $state('');
  let filters = $state<FamilyFilters>(defaultFamilyFilters());

  const activeFilterCount = $derived(countActiveFilters(filters, defaultFamilyFilters()));
  const rows = $derived(buildFamilyRows(appState.db, appState.placeContext, sortMode, query, filters));
  const isEmpty = $derived(appState.db.families.size === 0);

  function selectFamily(id: string) {
    viewState.setCurrent('family', id);
  }

  function exportCsv() {
    const csv = toCsv(rows, csvColumns);
    const adapter = new AnchorDownloadAdapter();
    const dateSlug = new Date().toISOString().slice(0, 10);
    adapter.download(csv, `familien_${dateSlug}.csv`, 'text/csv;charset=utf-8');
  }

  function cycleSortMode() {
    const idx = SORT_CYCLE.indexOf(sortMode);
    sortMode = SORT_CYCLE[(idx + 1) % SORT_CYCLE.length];
  }

  function clearSearch() {
    query = '';
  }

  function resetFilters() {
    filters = defaultFamilyFilters();
  }
</script>

<div class="family-list">
  {#if isEmpty}
    <p class="family-list__empty">{noDataHint('Familien', layout.isDesktopLayout)}</p>
    <div class="family-list__toolbar family-list__toolbar--empty">
      <button type="button" class="family-list__new-btn" onclick={createFamily}>＋ Neue Familie</button>
    </div>
  {:else}
    <div class="family-list__toolbar">
      <button type="button" class="family-list__sort-toggle" onclick={cycleSortMode}>
        ⇅ {SORT_LABEL[sortMode]}
      </button>
      <button type="button" class="family-list__new-btn" onclick={createFamily}>＋ Neue Familie</button>
      <div class="family-list__search">
        <input
          type="search"
          placeholder="Suche…"
          aria-label="Familien durchsuchen"
          bind:value={query}
        />
        {#if query}
          <button type="button" class="family-list__search-clear" aria-label="Suche löschen" onclick={clearSearch}>✕</button>
        {/if}
      </div>
      <FilterBar activeCount={activeFilterCount}>
        <div class="family-list__filters">
          <label>
            Heiratsjahr von
            <input type="number" bind:value={filters.marriageYearFrom} placeholder="von" />
          </label>
          <label>
            Heiratsjahr bis
            <input type="number" bind:value={filters.marriageYearTo} placeholder="bis" />
          </label>
          <label>
            Heiratsort
            <input type="text" bind:value={filters.marriagePlace} placeholder="Ort…" />
          </label>
          <label class="family-list__checkbox">
            <input type="checkbox" bind:checked={filters.noMarriageDate} />
            kein Heiratsdatum
          </label>
          <label class="family-list__checkbox">
            <input type="checkbox" bind:checked={filters.noSources} />
            keine Quellen
          </label>
          <label class="family-list__checkbox">
            <input type="checkbox" bind:checked={filters.noChildren} />
            keine Kinder
          </label>
          <button type="button" class="family-list__filter-reset" onclick={resetFilters}>Filter zurücksetzen</button>
          <button type="button" class="stb-filter-export" onclick={exportCsv}>
            ↓ Als CSV exportieren
          </button>
        </div>
      </FilterBar>
    </div>

    {#if rows.length === 0}
      <p class="family-list__empty">Keine Familien gefunden.</p>
    {:else}
      <ul class="family-list__rows">
        {#each rows as row (row.id)}
          <li>
            <button type="button" class="family-list__row" onclick={() => selectFamily(row.id)}>
              <span class="family-list__parents">{row.parentsLabel}</span>
              <span class="family-list__meta">
                {#if row.marriageSummary}
                  <span use:tooltip={row.marriagePlaceFull || undefined}>⚭ {row.marriageSummary}</span>
                {/if}
                <span class="stb-list-stat">{row.childCount} {row.childCount === 1 ? 'Kind' : 'Kinder'}</span>
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
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

  .family-list__toolbar {
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

  .family-list__toolbar--empty {
    position: static;
    justify-content: flex-start;
  }

  .family-list__sort-toggle,
  .family-list__filter-reset,
  .family-list__new-btn {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.7rem;
    cursor: pointer;
    font-size: 0.85rem;
  }

  .family-list__new-btn {
    background: var(--stb-gold);
    color: var(--stb-bg);
    font-weight: 600;
    border-color: var(--stb-gold);
  }

  .family-list__sort-toggle:hover,
  .family-list__filter-reset:hover {
    border-color: var(--stb-gold);
  }

  .family-list__search {
    position: relative;
    flex: 1 1 160px;
    display: flex;
    align-items: center;
  }

  .family-list__search input[type='search'] {
    width: 100%;
    background: var(--stb-surface-1);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 1.8rem 0.35rem 0.6rem;
    font-size: 0.85rem;
  }

  .family-list__search-clear {
    position: absolute;
    right: 0.4rem;
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
  }

  .family-list__filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: flex-end;
  }

  .family-list__filters label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.78rem;
    color: var(--stb-text-dim);
  }

  .family-list__filters input {
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.5rem;
  }

  .family-list__checkbox {
    flex-direction: row !important;
    align-items: center;
    gap: 0.4rem !important;
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
