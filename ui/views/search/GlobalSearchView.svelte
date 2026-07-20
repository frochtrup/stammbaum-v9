<script lang="ts">
  // ui/views/search/GlobalSearchView.svelte — globale Suche als erstklassiges Nav-Ziel
  // (Spec 20 §1.1 [K], Spec 21 §2: "Suche ist erstklassig — das universelle 'finde
  // irgendwas'"). Ein Texteingabefeld + gruppierte Ergebnisse (Personen/Familien/
  // Quellen/Orte/Höfe, ADR-v9-24). Bewusst KEINE Filterleiste (die bleibt lokale
  // Tab-Suche, Spec-Auftrag "globale Suche ist bewusst schlank").
  //
  // Klick auf ein Ergebnis läuft über GENAU den ViewState-Mechanismus (INV-VS) + den
  // nach oben gereichten onNavigate*-Callback (analog `onNavigateToTree` in App.svelte)
  // — kein zweiter Navigationspfad neben dem, den EntityTab für seine eigenen
  // Cross-Entitäts-Sprünge nutzt.
  import type { AppState } from '../../shell/app-state.svelte';
  import { tooltip } from '../../shell/tooltip';
  import { globalSearch, totalResultCount, MIN_QUERY_LENGTH } from './global-search-model';

  interface Props {
    appState: AppState;
    /**
     * Navigations-Callbacks (analog `onNavigateToTree` in App.svelte): die eigentliche
     * ViewState-Auswahl (INV-VS) setzt der Aufrufer (App.svelte) VOR dem Wechsel des
     * Bottom-Nav-Ziels — diese Komponente kennt weder ViewState noch `activeTarget`,
     * genau wie TreeView es für `onOpenPersonDetail`/`onNavigateToFamily` handhabt.
     */
    onNavigateToPerson: (id: string) => void;
    /** Navigiert zur Familien-Detailseite (EntityTab-Segment "family"). */
    onNavigateToFamily: (id: string) => void;
    /** Navigiert zur Quellen-Detailseite (EntityTab-Segment "source"). */
    onNavigateToSource: (id: string) => void;
    /** Navigiert zur Orte-Detailseite (EntityTab-Segment "place"). */
    onNavigateToPlace: (id: string) => void;
    /** Navigiert zur Hof-Detailseite (EntityTab-Segment "hof", ADR-v9-24). */
    onNavigateToHof: (id: string) => void;
  }
  const {
    appState,
    onNavigateToPerson,
    onNavigateToFamily,
    onNavigateToSource,
    onNavigateToPlace,
    onNavigateToHof,
  }: Props = $props();

  let query = $state('');

  const results = $derived(globalSearch(appState.db, appState.placeContext, query));
  // Eigene Mindestlänge-Prüfung (statt "results leer?"), damit "zu kurz" und "kein
  // Treffer" unterschiedliche Hinweise zeigen (Spec-Auftrag: kein Full-Scan-Flackern-
  // Hinweis, wenn die Query schlicht noch zu kurz ist).
  const queryTooShort = $derived(query.trim().length < MIN_QUERY_LENGTH);
  const hasResults = $derived(totalResultCount(results) > 0);

  function clearSearch() {
    query = '';
  }
</script>

<div class="global-search">
  <div class="global-search__toolbar">
    <div class="global-search__field">
      <input
        type="search"
        placeholder="Suche über Personen, Familien, Quellen, Orte, Höfe…"
        aria-label="Global suchen"
        bind:value={query}
      />
      {#if query}
        <button type="button" class="global-search__clear" aria-label="Suche löschen" onclick={clearSearch}>✕</button>
      {/if}
    </div>
  </div>

  {#if queryTooShort}
    <p class="global-search__hint">Mindestens {MIN_QUERY_LENGTH} Zeichen eingeben, um zu suchen.</p>
  {:else if !hasResults}
    <p class="global-search__hint">Keine Treffer für „{query}".</p>
  {:else}
    <div class="global-search__groups">
      {#if results.persons.length > 0}
        <section class="global-search__group">
          <h2 class="global-search__group-title">Personen</h2>
          <ul class="global-search__rows">
            {#each results.persons as row (row.id)}
              <li>
                <button type="button" class="global-search__row" onclick={() => onNavigateToPerson(row.id)}>
                  <span class="global-search__primary">{row.primary}</span>
                  {#if row.secondary}
                    <span class="global-search__secondary" use:tooltip={row.secondaryFull || undefined}>{row.secondary}</span>
                  {/if}
                </button>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if results.families.length > 0}
        <section class="global-search__group">
          <h2 class="global-search__group-title">Familien</h2>
          <ul class="global-search__rows">
            {#each results.families as row (row.id)}
              <li>
                <button type="button" class="global-search__row" onclick={() => onNavigateToFamily(row.id)}>
                  <span class="global-search__primary">{row.primary}</span>
                  {#if row.secondary}
                    <span class="global-search__secondary" use:tooltip={row.secondaryFull || undefined}>{row.secondary}</span>
                  {/if}
                </button>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if results.sources.length > 0}
        <section class="global-search__group">
          <h2 class="global-search__group-title">Quellen</h2>
          <ul class="global-search__rows">
            {#each results.sources as row (row.id)}
              <li>
                <button type="button" class="global-search__row" onclick={() => onNavigateToSource(row.id)}>
                  <span class="global-search__primary">{row.primary}</span>
                  {#if row.secondary}<span class="global-search__secondary">{row.secondary}</span>{/if}
                </button>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if results.places.length > 0}
        <section class="global-search__group">
          <h2 class="global-search__group-title">Orte</h2>
          <ul class="global-search__rows">
            {#each results.places as row (row.id)}
              <li>
                <button type="button" class="global-search__row" onclick={() => onNavigateToPlace(row.id)}>
                  <span class="global-search__primary">{row.primary}</span>
                  {#if row.secondary}<span class="global-search__secondary">{row.secondary}</span>{/if}
                </button>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if results.hofs.length > 0}
        <section class="global-search__group">
          <h2 class="global-search__group-title">Höfe</h2>
          <ul class="global-search__rows">
            {#each results.hofs as row (row.id)}
              <li>
                <button type="button" class="global-search__row" onclick={() => onNavigateToHof(row.id)}>
                  <span class="global-search__primary">{row.primary}</span>
                  {#if row.secondary}<span class="global-search__secondary">{row.secondary}</span>{/if}
                </button>
              </li>
            {/each}
          </ul>
        </section>
      {/if}
    </div>
  {/if}
</div>

<style>
  .global-search {
    overflow-y: auto;
    height: 100%;
  }

  .global-search__toolbar {
    display: flex;
    padding: 0.5rem 1rem;
    background: var(--stb-surface-2);
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .global-search__field {
    position: relative;
    flex: 1;
    display: flex;
    align-items: center;
  }

  .global-search__field input[type='search'] {
    width: 100%;
    background: var(--stb-surface-1);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.45rem 1.8rem 0.45rem 0.6rem;
    font-size: 0.9rem;
  }

  .global-search__clear {
    position: absolute;
    right: 0.4rem;
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
  }

  .global-search__hint {
    padding: 1.5rem;
    color: var(--stb-text-dim);
  }

  .global-search__groups {
    display: flex;
    flex-direction: column;
  }

  .global-search__group-title {
    position: sticky;
    top: 0;
    margin: 0;
    background: var(--stb-surface-3);
    color: var(--stb-gold-light);
    font-family: var(--stb-font-title);
    font-size: 0.95rem;
    font-weight: 700;
    padding: 0.3rem 1rem;
  }

  .global-search__rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .global-search__row {
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

  .global-search__row:hover,
  .global-search__row:focus-visible {
    background: var(--stb-surface-2);
  }

  .global-search__primary {
    font-weight: 600;
  }

  .global-search__secondary {
    font-size: 0.78rem;
    color: var(--stb-text-dim);
  }
</style>
