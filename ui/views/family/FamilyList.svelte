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
  import { PLAIN_FIELD } from '../../shell/plain-input';
  import type { ViewState } from '../../shell/view-state.svelte';
  import { makeFamily, allocatorFromDatabase, nextId } from '../../../core/model';
  import { tooltip } from '../../shell/tooltip';
  import FilterBar from '../../shell/FilterBar.svelte';
  import { countActiveFilters } from '../../shell/count-active-filters';
  import { noDataHint } from '../../shell/nav-model';
  import { untrack } from 'svelte';
  import { createWindowed, type Windowed } from '../../shell/windowed.svelte';
  import { layout } from '../../shell/layout.svelte';
  import { createFamilyListState, type FamilyListState } from '../list-view-state.svelte';
  import { toCsv, type CsvColumn } from '../../shell/csv';
  import { AnchorDownloadAdapter } from '../../../services/file/download-adapter';
  import {
    buildFamilyRows,
    defaultFamilyFilters,
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
    /**
     * Suche, Filter und Sortier-Modus von AUSSEN (BL-320): auf Mobil ersetzt das Detail diese Liste,
     * komponenten-lokal wäre die Eingrenzung nach jedem Blick auf einen Treffer weg
     * (Spec 21 §5). Optional, damit Komponententests die Liste ohne Umgebung montieren
     * können — dann mit einer eigenen, komponenten-langen Instanz.
     */
    list?: FamilyListState;
    /**
     * Halter des virtuellen Scrollens (BL-311). Von AUSSEN, aus demselben Grund wie
     * `list`: die Scroll-Position soll die Navigation überleben (Spec 21 §5) — und
     * weil happy-dom kein Layout hat, ist er der einzige Weg, die gemessenen Höhen für
     * einen Test zu stellen ([32 TST-24](../../../specs/v9/32-Testframework.md)).
     */
    windowed?: Windowed;
  }
  const { appState, viewState, onCreate, list: listProp, windowed: windowedProp }: Props = $props();

  const list = untrack(() => listProp ?? createFamilyListState());


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

  // `filters` ist ein Alias auf das Filter-Objekt IM Halter — es wird nie ersetzt,
  // sondern nur in seinen Feldern verändert (`bind:` schreibt durch den $state-Proxy).
  const filters = list.filters;

  const activeFilterCount = $derived(countActiveFilters(filters, defaultFamilyFilters()));
  const rows = $derived(buildFamilyRows(appState.db, appState.placeContext, list.sortMode, list.query, filters));

  // --- Virtuelles Scrollen (BL-311, ADR-v9-235/236) ---------------------------------------
  // EIN Fenster über die Liste: gerendert wird nur, was im Sichtbereich steht, plus Overscan.
  // Die Höhe jeder Zeile wird GEMESSEN, sobald sie einmal im Fenster stand; die Höhenklasse
  // ist nur die Schätzung für alles, was noch nie gerendert wurde (ADR-v9-236). Diese Liste
  // hat genau EINE Klasse — ihre Zeilen tragen immer beide Zeilen (Name + Meta).
  // Das Fenster steht als `$derived` IM SKRIPT, nicht als `{@const}` im Template
  // (ADR-v9-235 Entscheidung 5, normativ und nicht Stilfrage).
  const w = untrack(() => windowedProp ?? createWindowed());
  const sec = w.section('families');
  const off = $derived(sec.offsets(rows.length, () => 'zeile'));
  const win = $derived(sec.slice(off));
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
    const idx = SORT_CYCLE.indexOf(list.sortMode);
    list.sortMode = SORT_CYCLE[(idx + 1) % SORT_CYCLE.length];
  }

  function clearSearch() {
    list.query = '';
  }

  function resetFilters() {
    Object.assign(filters, defaultFamilyFilters());
  }
</script>

<div class="family-list" use:w.container>
  {#if isEmpty}
    <p class="family-list__empty">{noDataHint('Familien', layout.isDesktopLayout)}</p>
    <div class="family-list__toolbar family-list__toolbar--empty">
      <button type="button" class="family-list__new-btn" onclick={createFamily}>＋ Neue Familie</button>
    </div>
  {:else}
    <div class="family-list__toolbar">
      <button type="button" class="family-list__sort-toggle" onclick={cycleSortMode}>
        ⇅ {SORT_LABEL[list.sortMode]}
      </button>
      <button type="button" class="family-list__new-btn" onclick={createFamily}>＋ Neue Familie</button>
      <div class="family-list__search">
        <input
          type="search" {...PLAIN_FIELD}
          placeholder="Suche…"
          aria-label="Familien durchsuchen"
          bind:value={list.query}
        />
        {#if list.query}
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
            <input type="text" {...PLAIN_FIELD} bind:value={filters.marriagePlace} placeholder="Ort…" />
          </label>
          <label class="stb-filter-opt stb-filter-opt--compact">
            <input type="checkbox" bind:checked={filters.noMarriageDate} />
            kein Heiratsdatum
          </label>
          <label class="stb-filter-opt stb-filter-opt--compact">
            <input type="checkbox" bind:checked={filters.noSources} />
            keine Quellen
          </label>
          <label class="stb-filter-opt stb-filter-opt--compact">
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
      <ul class="family-list__rows" use:sec.frame>
        {#if win.padTop > 0}
          <li class="stb-window-pad" style:height={win.padTop + 'px'} aria-hidden="true"></li>
        {/if}
        {#each rows.slice(win.start, win.end) as row, i (row.id)}
          <li use:sec.probe={{ klasse: 'zeile', index: win.start + i }}>
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
        {#if win.padBottom > 0}
          <li class="stb-window-pad" style:height={win.padBottom + 'px'} aria-hidden="true"></li>
        {/if}
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

  /* Nur die Feld-Beschriftungen (Text ÜBER dem Eingabefeld) sind eine Spalte. Die
     Filteroptionen tragen `.stb-filter-opt` und bleiben eine Zeile — vorher traf diese
     Regel ALLE Labels des Panels und musste per `!important` zurückgenommen werden. */
  .family-list__filters label:not(.stb-filter-opt) {
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
