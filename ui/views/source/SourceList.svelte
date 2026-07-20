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
  import { buildSourceRows } from './source-list-model';
  import { noDataHint } from '../../shell/nav-model';
  import { layout } from '../../shell/layout.svelte';

  // "Notizen"-Badge (ADR-v9-79 Punkt 3, Spec 20 §1.6 [K]): `Source` hat kein eigenes
  // `noteRefs`/`noteText` (anders als Person/Family) — `text` (GEDCOM SOUR.TEXT,
  // zitierter Urtext) ist die einzige vorhandene Textablage und wurde als "Notizen"-
  // Abbildung gewählt (bewusst offen gelassene Feld-Frage, s. ADR-v9-79 Punkt 4/Spec
  // 20 §1.6). Falls eigentlich Zitat-Notizen (Citation.note) gemeint waren, gehört das
  // stattdessen zu SourceCitationRow (Spec 21 §10d), nicht zur Quellen-Liste.

  interface Props {
    appState: AppState;
    viewState: ViewState;
    /** Nach dem Anlegen einer neuen Quelle aufgerufen (Auswahl + Editor-Öffnung liegt beim Aufrufer). */
    onCreate?: (sourceId: string) => void;
  }
  const { appState, viewState, onCreate }: Props = $props();

  const rows = $derived(buildSourceRows(appState.db));
  const isEmpty = $derived(appState.db.sources.size === 0);

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

<div class="source-list">
  {#if isEmpty}
    <p class="source-list__empty">{noDataHint('Quellen', layout.isDesktopLayout)}</p>
    <div class="source-list__toolbar source-list__toolbar--empty">
      <button type="button" class="source-list__new-btn" onclick={createSource}>＋ Neue Quelle</button>
    </div>
  {:else}
    <div class="source-list__toolbar">
      <button type="button" class="source-list__new-btn" onclick={createSource}>＋ Neue Quelle</button>
    </div>
    <ul class="source-list__rows">
      {#each rows as row (row.id)}
        <li>
          <button type="button" class="source-list__row" onclick={() => selectSource(row.id)}>
            <span class="source-list__label">{row.label}</span>
            <span class="source-list__meta">
              {#if row.author}<span>{row.author}</span>{/if}
              {#if row.date}<span>{row.date}</span>{/if}
              <span class="stb-list-stat">{row.refCount}× zitiert</span>
              {#if row.hasNotes}<span class="stb-pill">Notizen</span>{/if}
            </span>
          </button>
        </li>
      {/each}
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
</style>
