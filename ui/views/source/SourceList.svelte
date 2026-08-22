<script lang="ts">
  // ui/views/source/SourceList.svelte — Quellen-Tab-Liste (Spec 20 §1.6 [K]).
  // Kurzname/Abbr, Autor, Datum, Referenzzähler pro Zeile.
  //
  // "＋ Neue Quelle" (Spec 20 §2): legt eine leere Quelle mit einer kollisionsfreien id an
  // (allocatorFromDatabase, Spec ADR-v9-11) und meldet die neue id über onCreate an den
  // Aufrufer (EntityTab), der Auswahl + Editor-Öffnung übernimmt — dieselbe Kommando-
  // Disziplin wie appState.savePerson(model)/PersonList.svelte.
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import { makeSource, allocatorFromDatabase, nextId } from '../../../core/model';
  import { buildSourceRows, defaultSourceFilters } from './source-list-model';
  import { SOURCE_KINDS, type SourceKind } from '../../../core/model/source-kinds';
  import FilterBar from '../../shell/FilterBar.svelte';
  import { countActiveFilters } from '../../shell/count-active-filters';
  import { PLAIN_FIELD } from '../../shell/plain-input';
  import { createSourceListState, type SourceListState } from '../list-view-state.svelte';
  import { tooltip } from '../../shell/tooltip';
  import { noDataHint } from '../../shell/nav-model';
  import { untrack } from 'svelte';
  import { createWindowed, type Windowed } from '../../shell/windowed.svelte';
  import { layout } from '../../shell/layout.svelte';

  // "Notizen"-Badge (ADR-v9-79 Punkt 3, Spec 20 §1.6 [K]): hängt seit BL-336 an `text`
  // (SOUR>TEXT, zitierter Wortlaut) UND `noteText` (SOUR>NOTE, Anmerkung) — die vormals
  // offene Feld-Frage ist damit beantwortet, s. `source-list-model.ts`.

  interface Props {
    appState: AppState;
    viewState: ViewState;
    /** Nach dem Anlegen einer neuen Quelle aufgerufen (Auswahl + Editor-Öffnung liegt beim Aufrufer). */
    onCreate?: (sourceId: string) => void;
    /**
     * Halter des virtuellen Scrollens (BL-311), von AUSSEN: die Scroll-Position soll die
     * Navigation überleben (Spec 21 §5) — und weil happy-dom kein Layout hat, ist er der
     * einzige Weg, die gemessenen Höhen für einen Test zu stellen
     * ([32 TST-24](../../../specs/v9/32-Testframework.md)).
     */
    windowed?: Windowed;
    /**
     * Suchanfrage + Gattungs-Filter von AUSSEN (BL-372, Spec 21 §5 Heimat ③): auf Mobil
     * ERSETZT der Steckbrief die Liste — komponenten-lokal gehalten wäre eine mühsam
     * eingegrenzte Suche nach dem ersten Blick auf eine Quelle weg. Dieselbe Ebene und
     * derselbe Grund wie bei den vier übrigen Entitätslisten (ADR-v9-230).
     */
    list?: SourceListState;
  }
  const {
    appState,
    viewState,
    onCreate,
    windowed: windowedProp,
    list: listProp,
  }: Props = $props();

  const list = untrack(() => listProp ?? createSourceListState());
  const filters = list.filters;

  const rows = $derived(buildSourceRows(appState.db, list.query, filters));
  const activeFilterCount = $derived(countActiveFilters(filters, defaultSourceFilters()));
  /** Leer NUR, weil Suche/Filter greifen — nicht zu verwechseln mit „keine Quellen
   *  erfasst": der Leerzustand darf nicht behaupten, der Bestand sei leer. */
  const leerDurchFilter = $derived(rows.length === 0 && appState.db.sources.size > 0);

  // --- Virtuelles Scrollen (BL-311, ADR-v9-235/236) ---------------------------------------
  // EIN Fenster über die Liste: gerendert wird nur, was im Sichtbereich steht, plus Overscan.
  // Die Höhe jeder Zeile wird GEMESSEN, sobald sie einmal im Fenster stand; die Höhenklasse
  // ist nur die Schätzung für alles, was noch nie gerendert wurde (ADR-v9-236). Diese Liste
  // hat genau EINE Klasse — ihre Zeilen tragen immer beide Zeilen (Name + Meta).
  // Das Fenster steht als `$derived` IM SKRIPT, nicht als `{@const}` im Template
  // (ADR-v9-235 Entscheidung 5, normativ und nicht Stilfrage).
  const w = untrack(() => windowedProp ?? createWindowed());
  const sec = w.section('sources');
  const off = $derived(sec.offsets(rows.length, () => 'zeile'));
  const win = $derived(sec.slice(off));

  const isEmpty = $derived(appState.db.sources.size === 0);

  function clearSearch() {
    list.query = '';
  }

  function selectSource(id: string) {
    viewState.setCurrent('source', id);
  }

  function createSource() {
    const alloc = allocatorFromDatabase(appState.db);
    const id = nextId(alloc, 'S');
    appState.saveSource(makeSource(id));
    onCreate?.(id);
  }
</script>

<div class="source-list" use:w.container>
  {#if isEmpty}
    <p class="source-list__empty">{noDataHint('Quellen', layout.isDesktopLayout)}</p>
    <div class="source-list__toolbar source-list__toolbar--empty">
      <button type="button" class="source-list__new-btn" onclick={createSource}>＋ Neue Quelle</button>
    </div>
  {:else}
    <div class="source-list__toolbar">
      <div class="source-list__search">
        <input
          type="search" {...PLAIN_FIELD}
          placeholder="Suche…"
          aria-label="Quellen durchsuchen"
          bind:value={list.query}
        />
        {#if list.query}
          <button type="button" class="source-list__search-clear" aria-label="Suche löschen" onclick={clearSearch}>✕</button>
        {/if}
      </div>
      <!-- Erster Filter dieser Liste (BL-373): die Gattung ist eine ABFRAGE, keine
           Zeilen-Pille — am Realbestand trügen 66 von 153 Zeilen dasselbe Etikett
           (dieselbe Messlatte wie ADR-v9-149, Spec 21 §10l). Hinter der Disclosure, damit
           das Kopf-Budget bei EINER Toolbar-Zeile bleibt (INV-UI-11).
           `onchange` statt `bind:value` — TST-12/ESLint-Regel (happy-dom-Falle). -->
      <FilterBar activeCount={activeFilterCount}>
        <div class="source-list__filters">
          <label class="stb-filter-opt stb-filter-opt--compact">
            Gattung
            <select
              value={filters.kind}
              onchange={(e) => (filters.kind = (e.currentTarget as HTMLSelectElement).value as SourceKind | '')}
            >
              <option value="">alle</option>
              {#each SOURCE_KINDS as k (k.key)}
                <option value={k.key}>{k.key === 'sonstiges' ? 'ohne erkennbare Gattung' : k.label}</option>
              {/each}
            </select>
          </label>
        </div>
      </FilterBar>
      <button type="button" class="source-list__new-btn" onclick={createSource}>＋ Neue Quelle</button>
    </div>
    {#if leerDurchFilter}
      <p class="source-list__empty">Keine Quelle passt zu Suche und Filter.</p>
    {/if}
    <ul class="source-list__rows" use:sec.frame>
      {#if win.padTop > 0}
        <li class="stb-window-pad" style:height={win.padTop + 'px'} aria-hidden="true"></li>
      {/if}
      {#each rows.slice(win.start, win.end) as row, i (row.id)}
        <li use:sec.probe={{ klasse: 'zeile', index: win.start + i }}>
          <button type="button" class="source-list__row" onclick={() => selectSource(row.id)}>
            <span class="source-list__label">{row.label}</span>
            <span class="source-list__meta">
              {#if row.repoName}<span class="stb-pill source-list__repo-badge" use:tooltip={`Archiv: ${row.repoName}`}>🏛 {row.repoName}</span>{/if}
              {#if row.author}<span>{row.author}</span>{/if}
              {#if row.createdDate}<span>{row.createdDate}</span>{/if}
              <span class="stb-list-stat">{row.refCount}× zitiert</span>
              {#if row.hasNotes}<span class="stb-pill">Notizen</span>{/if}
              {#if row.hasMedia}<span class="stb-pill" use:tooltip={'Medien vorhanden'}>📎</span>{/if}
            </span>
          </button>
        </li>
      {/each}
      {#if win.padBottom > 0}
        <li class="stb-window-pad" style:height={win.padBottom + 'px'} aria-hidden="true"></li>
      {/if}
    </ul>
  {/if}
</div>

<style>
  .source-list {
    overflow-y: auto;
  }

  .source-list__empty {
    padding: 1.5rem;
    color: var(--stb-text-dim);
  }

  .source-list__toolbar {
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

  .source-list__toolbar--empty {
    position: static;
    justify-content: flex-start;
  }

  .source-list__search {
    position: relative;
    flex: 1 1 8rem;
    min-width: 6rem;
    display: flex;
  }

  .source-list__search input {
    width: 100%;
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 1.8rem 0.35rem 0.6rem;
    font-size: 0.85rem;
  }

  .source-list__search-clear {
    position: absolute;
    right: 0.15rem;
    top: 50%;
    transform: translateY(-50%);
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
    font-size: 0.9rem;
    line-height: 1;
    padding: 0.25rem 0.35rem;
  }

  .source-list__filters {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.75rem 1rem;
  }

  .source-list__new-btn {
    margin-left: auto;
    background: var(--stb-gold);
    color: var(--stb-bg);
    font-weight: 600;
    border: 1px solid var(--stb-gold);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.7rem;
    cursor: pointer;
    font-size: 0.85rem;
  }

  .source-list__toolbar--empty .source-list__new-btn {
    margin-left: 0;
  }

  .source-list__rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .source-list__row {
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

  .source-list__row:hover,
  .source-list__row:focus-visible {
    background: var(--stb-surface-2);
  }

  .source-list__label {
    font-weight: 600;
  }

  .source-list__meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.78rem;
    color: var(--stb-text-dim);
  }

  /* Archiv-Badge: langer Archivname darf die Zeile nicht sprengen (Design-Kritik
     2026-07-29) — auf max. Breite kappen, voller Name bleibt im Tooltip. */
  .source-list__repo-badge {
    display: inline-block;
    max-width: 14rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    vertical-align: bottom;
  }
</style>
