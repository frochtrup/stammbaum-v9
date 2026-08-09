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
  //
  // Anfrage, Soundex-Schalter und Typ-Filter liegen NICHT hier, sondern im mitgegebenen
  // `GlobalSearchState` — sonst ist die Trefferliste nach dem Sprung auf den ersten
  // Treffer weg (Spec 21 §5, Begründung in `global-search-state.svelte.ts`).
  import { untrack } from 'svelte';
  import { PLAIN_FIELD } from '../../shell/plain-input';
  import type { AppState } from '../../shell/app-state.svelte';
  import { tooltip } from '../../shell/tooltip';
  import { globalSearch, totalResultCount, MIN_QUERY_LENGTH } from './global-search-model';
  import {
    createGlobalSearchState,
    type GlobalSearchState,
    type SearchKind,
  } from './global-search-state.svelte';
  import { sexSymbol } from '../../shell/person-display';
  import { createWindowed, type Windowed } from '../../shell/windowed.svelte';
  import { buildOffsets } from '../../shell/window-slice';

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
    /**
     * Anfrage-/Filterzustand von AUSSEN: er muss den Sprung auf einen Treffer und zurück
     * überleben, diese Fläche wird dabei abgebaut. Optional, damit Komponententests die
     * Suche ohne Umgebung montieren können — dann mit einer eigenen Instanz, die schlicht
     * so lange lebt wie die Komponente.
     */
    search?: GlobalSearchState;
    /**
     * Halter des virtuellen Scrollens (BL-311). Von AUSSEN, aus demselben Grund wie
     * `search`: die Scroll-Position soll den Sprung auf einen Treffer überleben (Spec 21
     * §5) — und weil happy-dom kein Layout hat, ist er der einzige Weg, die gemessenen
     * Höhen für einen Test zu stellen (`setSectionMetrics`, [32 TST-24](../../../specs/v9/32-Testframework.md)).
     * Fehlt er, lebt eine eigene Instanz genau so lange wie die Komponente.
     */
    windowed?: Windowed;
  }
  const {
    appState,
    onNavigateToPerson,
    onNavigateToFamily,
    onNavigateToSource,
    onNavigateToPlace,
    onNavigateToHof,
    search: searchProp,
    windowed: windowedProp,
  }: Props = $props();

  // Einmal beim Aufbau festgelegt (das `untrack` sagt genau das): die Hülle wird nie
  // ausgetauscht, der Zustand DARIN ist reaktiv.
  const search = untrack(() => searchProp ?? createGlobalSearchState());

  const query = $derived(search.query);
  const soundexEnabled = $derived(search.soundex);

  const results = $derived(globalSearch(appState.db, appState.placeContext, query, soundexEnabled));

  // Typ-Filter der Ergebnisse (ADR-v9-130): Segment-Chips über den Treffern, ein Tipp
  // scopt auf einen Entitätstyp. Reiner UI-Zustand — das Such-Modell (`globalSearch`)
  // bleibt unverändert vollständig, damit die Command-Palette (⌘K) denselben Kern ohne
  // Filter-Semantik weiternutzt. `.stb-segment-row`/`.stb-segment-btn` (INV-UI-4), kein
  // eigenes Segment-Control.
  const filter = $derived(search.filter);

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

  // --- Virtuelles Scrollen (BL-311, ADR-v9-235 in der Fassung von ADR-v9-236) --------------
  // EIN Fenster je GRUPPE im gemeinsamen Scroll-Container. Die Zeilen sind NICHT gleich hoch:
  // eine Trefferzeile misst 34,1px ohne Zweitzeile und 51,1px mit einer (am Realbestand
  // gemessen). Welche von beiden, steht in den DATEN (`row.secondary`), also wird je Zeile
  // eine HÖHENKLASSE gemeldet, je Klasse EINE Musterhöhe gemessen und daraus eine
  // Höhen-Präfixsumme gebaut — die binäre Suche darin ist NFR-1s „O(log n)" wörtlich.
  // Die Fenster stehen als `$derived` IM SKRIPT, nicht als `{@const}` im Template
  // (ADR-v9-235 Entscheidung 5, normativ und nicht Stilfrage).
  const KLASSEN = ['eins', 'zwei', 'kopf'] as const;
  const w = untrack(() => windowedProp ?? createWindowed());
  const secPersons = w.section('persons', KLASSEN);
  const secFamilies = w.section('families', KLASSEN);
  const secSources = w.section('sources', KLASSEN);
  const secPlaces = w.section('places', KLASSEN);
  const secHofs = w.section('hofs', KLASSEN);

  /** Höhenklasse einer Trefferzeile: mit Zweitzeile („* 1905, Vreden") oder ohne. */
  const klasseVon = (row: { secondary?: string | null }) => (row.secondary ? 'zwei' : 'eins');

  /**
   * Die Personen-Gruppe ist die einzige mit Zwischenüberschriften (ADR-v9-169, nur im
   * Soundex-Modus). Damit die Platzhalter-Zusicherung stimmt, wird sie als EINE flache
   * Zeilenliste gefenstert — Kopfzeilen sind Einträge darin (Klasse `kopf`), keine
   * Sonderfälle daneben.
   */
  type PersonZeile =
    | { art: 'kopf'; label: string; count: number }
    | { art: 'zeile'; row: (typeof results.persons)[number] };
  const personRows = $derived.by((): PersonZeile[] => {
    const rows = results.persons;
    if (!phonSplit) return rows.map((row): PersonZeile => ({ art: 'zeile', row }));
    const out: PersonZeile[] = [];
    rows.forEach((row, i) => {
      if (i === 0) out.push({ art: 'kopf', label: 'Ähnlicher Nachname', count: phonCount });
      else if (i === phonCount)
        out.push({ art: 'kopf', label: 'Weitere Treffer', count: rows.length - phonCount });
      out.push({ art: 'zeile', row });
    });
    return out;
  });

  // Die Präfixsummen. Sie werden neu gebaut, wenn sich die Treffer ändern ODER eine
  // Musterhöhe dazukommt — beides selten, und O(n) ist neben der Suche selbst nichts.
  const offPersons = $derived.by(() =>
    buildOffsets(
      personRows.map((e) => (e.art === 'kopf' ? secPersons.height('kopf') : secPersons.height(klasseVon(e.row)))),
    ),
  );
  const offFamilies = $derived.by(() => buildOffsets(results.families.map((r) => secFamilies.height(klasseVon(r)))));
  const offSources = $derived.by(() => buildOffsets(results.sources.map((r) => secSources.height(klasseVon(r)))));
  const offPlaces = $derived.by(() => buildOffsets(results.places.map((r) => secPlaces.height(klasseVon(r)))));
  const offHofs = $derived.by(() => buildOffsets(results.hofs.map((r) => secHofs.height(klasseVon(r)))));

  const winPersons = $derived(secPersons.slice(offPersons));
  const winFamilies = $derived(secFamilies.slice(offFamilies));
  const winSources = $derived(secSources.slice(offSources));
  const winPlaces = $derived(secPlaces.slice(offPlaces));
  const winHofs = $derived(secHofs.slice(offHofs));

  function clearSearch() {
    search.clearQuery();
  }
</script>

<div class="global-search" use:w.container>
  <div class="global-search__toolbar">
    <div class="global-search__field">
      <input
        type="search" {...PLAIN_FIELD}
        placeholder="Suche über Personen, Familien, Quellen, Orte, Höfe…"
        aria-label="Global suchen"
        value={query}
        oninput={(e) => search.setQuery(e.currentTarget.value)}
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
      onclick={() => search.toggleSoundex()}
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
          onclick={() => search.setFilter('all')}
        >
          Alle <span class="global-search__filter-count">{totalResultCount(results)}</span>
        </button>
        {#each nonEmptyGroups as g (g.kind)}
          <button
            type="button"
            class="stb-segment-btn"
            class:stb-segment-btn--active={activeFilter === g.kind}
            aria-pressed={activeFilter === g.kind}
            onclick={() => search.setFilter(g.kind)}
          >
            {g.label} <span class="global-search__filter-count">{g.count}</span>
          </button>
        {/each}
      </div>
    {/if}
    <div class="global-search__groups">
      {#if showGroup('persons') && results.persons.length > 0}
        <section class="global-search__group" use:secPersons.frame>
          <h2 class="global-search__group-title">Personen</h2>
          <ul class="global-search__rows">
            {#if winPersons.padTop > 0}
              <li class="global-search__pad" style="height:{winPersons.padTop}px" aria-hidden="true"></li>
            {/if}
            {#each personRows.slice(winPersons.start, winPersons.end) as eintrag, i (eintrag.art === 'kopf' ? `k${winPersons.start + i}` : eintrag.row.id)}
              <!-- Zwischenüberschriften wie in der Personenliste (ADR-v9-169): ohne sie
                   stünde die Soundex-Reihenfolge kommentarlos da. Nur im Soundex-Modus,
                   und nur wenn beide Mengen nicht leer sind. -->
              <!-- `role="separator"` am inneren `<span>`, nicht am `<li>` — Begründung
                   wie in `PlaceList.svelte` (BL-66/axe: ein `<ul>` besitzt nur
                   Listeneinträge). -->
              {#if eintrag.art === 'kopf'}
                <li class="global-search__subhead" use:secPersons.probe={'kopf'}>
                  <span role="separator" aria-label={eintrag.label === 'Ähnlicher Nachname' ? 'Ähnlich klingender Nachname' : eintrag.label}>
                    {eintrag.label} <span class="global-search__subcount">{eintrag.count}</span>
                  </span>
                </li>
              {:else}
                <li use:secPersons.probe={klasseVon(eintrag.row)}>
                  <button type="button" class="global-search__row" onclick={() => onNavigateToPerson(eintrag.row.id)}>
                    <span class="global-search__primary">
                      {#if eintrag.row.sex}<span class="global-search__sex global-search__sex--{eintrag.row.sex.toLowerCase()}" aria-hidden="true">{sexSymbol(eintrag.row.sex)}</span>{/if}
                      {eintrag.row.primary}
                    </span>
                    {#if eintrag.row.secondary}
                      <span class="global-search__secondary" use:tooltip={eintrag.row.secondaryFull || undefined}>{eintrag.row.secondary}</span>
                    {/if}
                  </button>
                </li>
              {/if}
            {/each}
            {#if winPersons.padBottom > 0}
              <li class="global-search__pad" style="height:{winPersons.padBottom}px" aria-hidden="true"></li>
            {/if}
          </ul>
        </section>
      {/if}

      {#if showGroup('families') && results.families.length > 0}
        <section class="global-search__group" use:secFamilies.frame>
          <h2 class="global-search__group-title">Familien</h2>
          <ul class="global-search__rows">
            {#if winFamilies.padTop > 0}
              <li class="global-search__pad" style="height:{winFamilies.padTop}px" aria-hidden="true"></li>
            {/if}
            {#each results.families.slice(winFamilies.start, winFamilies.end) as row (row.id)}
              <li use:secFamilies.probe={klasseVon(row)}>
                <button type="button" class="global-search__row" onclick={() => onNavigateToFamily(row.id)}>
                  <span class="global-search__primary">{row.primary}</span>
                  {#if row.secondary}
                    <span class="global-search__secondary" use:tooltip={row.secondaryFull || undefined}>{row.secondary}</span>
                  {/if}
                </button>
              </li>
            {/each}
            {#if winFamilies.padBottom > 0}
              <li class="global-search__pad" style="height:{winFamilies.padBottom}px" aria-hidden="true"></li>
            {/if}
          </ul>
        </section>
      {/if}

      {#if showGroup('sources') && results.sources.length > 0}
        <section class="global-search__group" use:secSources.frame>
          <h2 class="global-search__group-title">Quellen</h2>
          <ul class="global-search__rows">
            {#if winSources.padTop > 0}
              <li class="global-search__pad" style="height:{winSources.padTop}px" aria-hidden="true"></li>
            {/if}
            {#each results.sources.slice(winSources.start, winSources.end) as row (row.id)}
              <li use:secSources.probe={klasseVon(row)}>
                <button type="button" class="global-search__row" onclick={() => onNavigateToSource(row.id)}>
                  <span class="global-search__primary">{row.primary}</span>
                  {#if row.secondary}<span class="global-search__secondary">{row.secondary}</span>{/if}
                </button>
              </li>
            {/each}
            {#if winSources.padBottom > 0}
              <li class="global-search__pad" style="height:{winSources.padBottom}px" aria-hidden="true"></li>
            {/if}
          </ul>
        </section>
      {/if}

      {#if showGroup('places') && results.places.length > 0}
        <section class="global-search__group" use:secPlaces.frame>
          <h2 class="global-search__group-title">Orte</h2>
          <ul class="global-search__rows">
            {#if winPlaces.padTop > 0}
              <li class="global-search__pad" style="height:{winPlaces.padTop}px" aria-hidden="true"></li>
            {/if}
            {#each results.places.slice(winPlaces.start, winPlaces.end) as row (row.id)}
              <li use:secPlaces.probe={klasseVon(row)}>
                <button type="button" class="global-search__row" onclick={() => onNavigateToPlace(row.id)}>
                  <span class="global-search__primary">{row.primary}</span>
                  {#if row.secondary}<span class="global-search__secondary">{row.secondary}</span>{/if}
                </button>
              </li>
            {/each}
            {#if winPlaces.padBottom > 0}
              <li class="global-search__pad" style="height:{winPlaces.padBottom}px" aria-hidden="true"></li>
            {/if}
          </ul>
        </section>
      {/if}

      {#if showGroup('hofs') && results.hofs.length > 0}
        <section class="global-search__group" use:secHofs.frame>
          <h2 class="global-search__group-title">Höfe</h2>
          <ul class="global-search__rows">
            {#if winHofs.padTop > 0}
              <li class="global-search__pad" style="height:{winHofs.padTop}px" aria-hidden="true"></li>
            {/if}
            {#each results.hofs.slice(winHofs.start, winHofs.end) as row (row.id)}
              <li use:secHofs.probe={klasseVon(row)}>
                <button type="button" class="global-search__row" onclick={() => onNavigateToHof(row.id)}>
                  <span class="global-search__primary">{row.primary}</span>
                  {#if row.secondary}<span class="global-search__secondary">{row.secondary}</span>{/if}
                </button>
              </li>
            {/each}
            {#if winHofs.padBottom > 0}
              <li class="global-search__pad" style="height:{winHofs.padBottom}px" aria-hidden="true"></li>
            {/if}
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

  /* Platzhalter für die nicht gerenderten Zeilen ober- und unterhalb des Fensters
     (ADR-v9-235 Entscheidung 3): sie halten Scrollbalken, Scroll-Position und Sprünge
     wahr — ohne sie wäre virtuelles Scrollen eine Täuschung über die Datenmenge. */
  .global-search__pad {
    list-style: none;
    pointer-events: none;
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
