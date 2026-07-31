<script lang="ts">
  // ui/views/search/GlobalSearchView.svelte — globale Suche als erstklassiges Nav-Ziel
  // (Spec 20 §1.1 [K], Spec 21 §2: "Suche ist erstklassig — das universelle 'finde
  // irgendwas'"). Ein Texteingabefeld + gruppierte Ergebnisse (Personen/Familien/
  // Quellen/Orte/Höfe, ADR-v9-24) + leichter Typ-Filter über Segment-Chips (ADR-v9-130,
  // ersetzt die frühere "bewusst keine Filterleiste"-Haltung): ein Tipp scopt die Treffer
  // auf einen Entitätstyp, minimale Klicks, kein Öffnen. Kern-Modell bleibt filterlos.
  //
  // Klick auf ein Ergebnis läuft über GENAU den ViewState-Mechanismus (INV-VS) + den
  // nach oben gereichten onNavigate*-Callback (analog `onNavigateToTree` in App.svelte)
  // — kein zweiter Navigationspfad neben dem, den EntityTab für seine eigenen
  // Cross-Entitäts-Sprünge nutzt.
  import type { AppState } from '../../shell/app-state.svelte';
  import { tooltip } from '../../shell/tooltip';
  import { globalSearch, totalResultCount, MIN_QUERY_LENGTH } from './global-search-model';
  import { sexSymbol } from '../../shell/person-display';

  /**
   * Soundex-Umschalter der globalen Suche (BL-10, ADR-v9-159): sichtbares Bedienelement
   * neben dem Suchfeld — anders als in der Personenliste (Filteroption hinter
   * `FilterBar`), weil diese Fläche keine `FilterBar` hat und heute erst EIN dauerhaftes
   * Bedienelement trägt (gemessen bei 375px, [21 §6h]). EIGENER Zustand, kein gemeinsamer
   * Topf mit `PersonFilters.soundex` (INV-VS).
   */

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
  let soundexEnabled = $state(false);

  const results = $derived(globalSearch(appState.db, appState.placeContext, query, soundexEnabled));

  // Typ-Filter der Ergebnisse (ADR-v9-130): Segment-Chips über den Treffern, ein Tipp
  // scopt auf einen Entitätstyp. Reiner UI-Zustand — das Such-Modell (`globalSearch`)
  // bleibt unverändert vollständig, damit die Command-Palette (⌘K) denselben Kern ohne
  // Filter-Semantik weiternutzt. `.stb-segment-row`/`.stb-segment-btn` (INV-UI-4), kein
  // eigenes Segment-Control.
  type SearchKind = 'persons' | 'families' | 'sources' | 'places' | 'hofs';
  let filter = $state<'all' | SearchKind>('all');

  const groupMeta = $derived(
    [
      { kind: 'persons', label: 'Personen', count: results.persons.length },
      { kind: 'families', label: 'Familien', count: results.families.length },
      { kind: 'sources', label: 'Quellen', count: results.sources.length },
      { kind: 'places', label: 'Orte', count: results.places.length },
      { kind: 'hofs', label: 'Höfe', count: results.hofs.length },
    ] as const,
  );
  const nonEmptyGroups = $derived(groupMeta.filter((g) => g.count > 0));
  // Chips nur, wenn mindestens zwei Typen Treffer haben — bei nur einem Typ ist ein
  // Filter sinnlos (schlank bleiben, Spec 21 §2).
  const showFilterChips = $derived(nonEmptyGroups.length > 1);
  // Fällt auf "Alle" zurück, sobald der gewählte Typ nach einem Query-Wechsel keine
  // Treffer mehr hat — sonst zeigte die Ansicht "leer", obwohl andere Typen Treffer haben.
  const activeFilter = $derived(filter !== 'all' && results[filter].length > 0 ? filter : 'all');
  function showGroup(kind: SearchKind): boolean {
    return activeFilter === 'all' || activeFilter === kind;
  }
  // Eigene Mindestlänge-Prüfung (statt "results leer?"), damit "zu kurz" und "kein
  // Treffer" unterschiedliche Hinweise zeigen (Spec-Auftrag: kein Full-Scan-Flackern-
  // Hinweis, wenn die Query schlicht noch zu kurz ist).
  const queryTooShort = $derived(query.trim().length < MIN_QUERY_LENGTH);
  const hasResults = $derived(totalResultCount(results) > 0);
  /** Anzahl der phonetischen Nachnamen-Treffer und ob eine Aufteilung überhaupt etwas
   *  erklärt (ADR-v9-169): trifft alles oder nichts über den Nachnamen, wären zwei
   *  Zwischenüberschriften nur Lärm. */
  const phonCount = $derived(results.persons.filter((r) => r.phonetic).length);
  const phonSplit = $derived(phonCount > 0 && phonCount < results.persons.length);

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
    <button
      type="button"
      class="stb-segment-btn global-search__soundex-toggle"
      class:stb-segment-btn--active={soundexEnabled}
      aria-pressed={soundexEnabled}
      use:tooltip={'Auch ähnlich klingende Namen finden (Soundex)'}
      onclick={() => (soundexEnabled = !soundexEnabled)}
    >
      ≈ Soundex
    </button>
  </div>

  {#if queryTooShort}
    <p class="global-search__hint">Mindestens {MIN_QUERY_LENGTH} Zeichen eingeben, um zu suchen.</p>
  {:else if !hasResults}
    <p class="global-search__hint">Keine Treffer für „{query}".</p>
  {:else}
    {#if showFilterChips}
      <div class="stb-segment-row global-search__filters" aria-label="Ergebnistyp filtern">
        <button
          type="button"
          class="stb-segment-btn"
          class:stb-segment-btn--active={activeFilter === 'all'}
          aria-pressed={activeFilter === 'all'}
          onclick={() => (filter = 'all')}
        >
          Alle <span class="global-search__filter-count">{totalResultCount(results)}</span>
        </button>
        {#each nonEmptyGroups as g (g.kind)}
          <button
            type="button"
            class="stb-segment-btn"
            class:stb-segment-btn--active={activeFilter === g.kind}
            aria-pressed={activeFilter === g.kind}
            onclick={() => (filter = g.kind)}
          >
            {g.label} <span class="global-search__filter-count">{g.count}</span>
          </button>
        {/each}
      </div>
    {/if}
    <div class="global-search__groups">
      {#if showGroup('persons') && results.persons.length > 0}
        <section class="global-search__group">
          <h2 class="global-search__group-title">Personen</h2>
          <ul class="global-search__rows">
            {#each results.persons as row, i (row.id)}
              <!-- Zwischenüberschriften wie in der Personenliste (ADR-v9-169): ohne sie
                   stünde die Soundex-Reihenfolge kommentarlos da. Nur im Soundex-Modus,
                   und nur wenn beide Mengen nicht leer sind. -->
              <!-- `role="separator"` am inneren `<span>`, nicht am `<li>` — Begründung
                   wie in `PlaceList.svelte` (BL-66/axe: ein `<ul>` besitzt nur
                   Listeneinträge). -->
              {#if phonSplit && i === 0}
                <li class="global-search__subhead">
                  <span role="separator" aria-label="Ähnlich klingender Nachname">
                    Ähnlicher Nachname <span class="global-search__subcount">{phonCount}</span>
                  </span>
                </li>
              {:else if phonSplit && i === phonCount}
                <li class="global-search__subhead">
                  <span role="separator" aria-label="Weitere Treffer">
                    Weitere Treffer <span class="global-search__subcount">{results.persons.length - phonCount}</span>
                  </span>
                </li>
              {/if}
              <li>
                <button type="button" class="global-search__row" onclick={() => onNavigateToPerson(row.id)}>
                  <span class="global-search__primary">
                    {#if row.sex}<span class="global-search__sex global-search__sex--{row.sex.toLowerCase()}" aria-hidden="true">{sexSymbol(row.sex)}</span>{/if}
                    {row.primary}
                  </span>
                  {#if row.secondary}
                    <span class="global-search__secondary" use:tooltip={row.secondaryFull || undefined}>{row.secondary}</span>
                  {/if}
                </button>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if showGroup('families') && results.families.length > 0}
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

      {#if showGroup('sources') && results.sources.length > 0}
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

      {#if showGroup('places') && results.places.length > 0}
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

      {#if showGroup('hofs') && results.hofs.length > 0}
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
    align-items: center;
    gap: 0.5rem;
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

  /* Zweites von fünf zulässigen Dauer-Elementen in dieser Toolbar (ADR-v9-159,
     gemessen bei 375px) — schrumpft nie (TST-11: das Suchfeld gibt nach, nicht der
     Schalter). */
  /* Trefferflächen-Kontrakt (Spec 21 §6i) + sichtbare Kontur: der Umschalter maß 73×26px
     und sah im Aus-Zustand nicht bedienbar aus (Design-Kritik 2026-07-31). Der
     Aktiv-Zustand kommt weiterhin aus `.stb-segment-btn--active`. */
  .global-search__soundex-toggle {
    flex-shrink: 0;
    min-height: var(--stb-touch-target);
    border: 1px solid var(--stb-gold-dim);
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

  /* Typ-Filter-Chips (ADR-v9-130) — nutzt die geteilte .stb-segment-row/.stb-segment-btn
     (INV-UI-4); hier nur der Zähler-Zusatz je Chip. */
  .global-search__filters {
    border-bottom: 1px solid var(--stb-surface-2);
  }

  .global-search__filter-count {
    font-size: 0.72rem;
    opacity: 0.75;
  }

  .global-search__groups {
    display: flex;
    flex-direction: column;
  }

  /* Zwischenüberschrift innerhalb der Personen-Gruppe (ADR-v9-169) — leiser als der
     Gruppentitel, damit die Hierarchie „Gruppe > Abschnitt" lesbar bleibt. */
  .global-search__subhead {
    font-size: 0.75rem;
    color: var(--stb-text-dim);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    padding: 0.35rem 1rem 0.15rem;
    list-style: none;
  }

  .global-search__subcount {
    text-transform: none;
    letter-spacing: 0;
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

  /* Geschlechts-Icon in Personen-Treffern (BL-211, geteilt mit PersonList — INV-UI-4). */
  .global-search__sex {
    font-weight: 400;
    color: var(--stb-text-dim);
  }
  .global-search__sex--m {
    color: var(--stb-sex-m);
  }
  .global-search__sex--f {
    color: var(--stb-sex-f);
  }

  .global-search__secondary {
    font-size: 0.78rem;
    color: var(--stb-text-dim);
  }
</style>
