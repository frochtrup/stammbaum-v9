<script lang="ts">
  // ui/views/person/PersonList.svelte — Personen-Tab-Liste (Spec 20 §1.4 [K]).
  // Alphabetisch mit Buchstaben-Trenner (Name-Modus) bzw. chronologisch ohne Trenner
  // (Geburtsdatum-Modus), Suche + erweiterte Filter. Ortsdarstellung über
  // core/places-Chokepoints (person-display.ts), nie ev.place roh.
  //
  // "＋ Neue Person" (Spec 20 §2): legt eine leere Person mit einer kollisionsfreien id
  // an (allocatorFromDatabase, Spec ADR-v9-11 — kein Zufall/Wall-Clock) und meldet die
  // neue id über onCreate an den Aufrufer (EntityTab), der Auswahl + Editor-Öffnung
  // übernimmt — dieselbe Kommando-Disziplin wie appState.savePerson(model) überall sonst.
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import { makePerson, allocatorFromDatabase, nextId } from '../../../core/model';
  import {
    buildPersonGroups,
    defaultPersonFilters,
    type PersonFilters,
    type PersonSortMode,
  } from './person-list-model';

  interface Props {
    appState: AppState;
    viewState: ViewState;
    /** Nach dem Anlegen einer neuen Person aufgerufen (Auswahl + Editor-Öffnung liegt beim Aufrufer). */
    onCreate?: (personId: string) => void;
  }
  const { appState, viewState, onCreate }: Props = $props();

  function createPerson() {
    const alloc = allocatorFromDatabase(appState.db);
    const id = nextId(alloc, 'I');
    appState.savePerson(makePerson(id));
    onCreate?.(id);
  }

  let sortMode = $state<PersonSortMode>('name');
  let query = $state('');
  let filters = $state<PersonFilters>(defaultPersonFilters());
  let showFilters = $state(false);

  const groups = $derived(buildPersonGroups(appState.db, appState.placeContext, sortMode, query, filters));
  const isEmpty = $derived(appState.db.individuals.size === 0);
  const hasResults = $derived(groups.some((g) => g.rows.length > 0));

  function selectPerson(id: string) {
    viewState.setCurrent('person', id);
  }

  function toggleSortMode() {
    sortMode = sortMode === 'name' ? 'birthDate' : 'name';
  }

  function clearSearch() {
    query = '';
  }

  function resetFilters() {
    filters = defaultPersonFilters();
  }
</script>

<div class="person-list">
  {#if isEmpty}
    <p class="person-list__empty">Keine Personen geladen — unter „Mehr" eine Datei öffnen, um zu starten.</p>
    <div class="person-list__toolbar person-list__toolbar--empty">
      <button type="button" class="person-list__new-btn" onclick={createPerson}>＋ Neue Person</button>
    </div>
  {:else}
    <div class="person-list__toolbar">
      <button type="button" class="person-list__sort-toggle" onclick={toggleSortMode}>
        ⇅ {sortMode === 'name' ? 'Name' : 'Geburtsdatum'}
      </button>
      <button type="button" class="person-list__new-btn" onclick={createPerson}>＋ Neue Person</button>
      <div class="person-list__search">
        <input
          type="search"
          placeholder="Suche…"
          aria-label="Personen durchsuchen"
          bind:value={query}
        />
        {#if query}
          <button type="button" class="person-list__search-clear" aria-label="Suche löschen" onclick={clearSearch}>✕</button>
        {/if}
      </div>
      <button
        type="button"
        class="person-list__filter-toggle"
        aria-expanded={showFilters}
        onclick={() => (showFilters = !showFilters)}
      >
        Filter
      </button>
    </div>

    {#if showFilters}
      <div class="person-list__filters">
        <fieldset class="person-list__sex-filter">
          <legend>Geschlecht</legend>
          <label class="person-list__checkbox">
            <input type="radio" bind:group={filters.sex} value="" />
            Alle
          </label>
          <label class="person-list__checkbox">
            <input type="radio" bind:group={filters.sex} value="M" />
            Männlich
          </label>
          <label class="person-list__checkbox">
            <input type="radio" bind:group={filters.sex} value="F" />
            Weiblich
          </label>
          <label class="person-list__checkbox">
            <input type="radio" bind:group={filters.sex} value="U" />
            Unbekannt
          </label>
        </fieldset>
        <label>
          Geburtsjahr von
          <input type="number" bind:value={filters.birthYearFrom} placeholder="von" />
        </label>
        <label>
          Geburtsjahr bis
          <input type="number" bind:value={filters.birthYearTo} placeholder="bis" />
        </label>
        <label>
          Geburtsort
          <input type="text" bind:value={filters.birthPlace} placeholder="Ort…" />
        </label>
        <label class="person-list__checkbox">
          <input type="checkbox" bind:checked={filters.noDeathDate} />
          kein Sterbedatum
        </label>
        <label class="person-list__checkbox">
          <input type="checkbox" bind:checked={filters.noSources} />
          keine Quellen
        </label>
        <label class="person-list__checkbox">
          <input type="checkbox" bind:checked={filters.noParents} />
          keine Eltern
        </label>
        <button type="button" class="person-list__filter-reset" onclick={resetFilters}>Filter zurücksetzen</button>
      </div>
    {/if}

    {#if !hasResults}
      <p class="person-list__empty">Keine Personen gefunden.</p>
    {:else}
      {#each groups as group (group.letter ?? '·')}
        <div class="person-list__group">
          {#if group.letter !== null}
            <div class="person-list__letter" role="separator" aria-label="Buchstabe {group.letter}">
              {group.letter}
            </div>
          {/if}
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

  .person-list__toolbar {
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

  .person-list__toolbar--empty {
    position: static;
    justify-content: flex-start;
  }

  .person-list__sort-toggle,
  .person-list__filter-toggle,
  .person-list__filter-reset,
  .person-list__new-btn {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.7rem;
    cursor: pointer;
    font-size: 0.85rem;
  }

  .person-list__new-btn {
    margin-left: auto;
    background: var(--stb-gold);
    color: var(--stb-bg);
    font-weight: 600;
    border-color: var(--stb-gold);
  }

  .person-list__sort-toggle:hover,
  .person-list__filter-toggle:hover,
  .person-list__filter-reset:hover {
    border-color: var(--stb-gold);
  }

  .person-list__search {
    position: relative;
    flex: 1 1 160px;
    display: flex;
    align-items: center;
  }

  .person-list__search input[type='search'] {
    width: 100%;
    background: var(--stb-surface-1);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 1.8rem 0.35rem 0.6rem;
    font-size: 0.85rem;
  }

  .person-list__search-clear {
    position: absolute;
    right: 0.4rem;
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
  }

  .person-list__filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    padding: 0.6rem 1rem;
    background: var(--stb-surface-1);
    align-items: flex-end;
  }

  .person-list__filters label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.78rem;
    color: var(--stb-text-dim);
  }

  .person-list__filters input[type='number'],
  .person-list__filters input[type='text'] {
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.5rem;
  }

  .person-list__checkbox {
    flex-direction: row !important;
    align-items: center;
    gap: 0.4rem !important;
  }

  .person-list__sex-filter {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    align-items: center;
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.6rem;
    margin: 0;
  }

  .person-list__sex-filter legend {
    font-size: 0.78rem;
    color: var(--stb-text-dim);
    padding: 0 0.3rem;
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
