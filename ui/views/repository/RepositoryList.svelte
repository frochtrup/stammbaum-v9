<script lang="ts">
  // ui/views/repository/RepositoryList.svelte — Archiv-Picker (Spec 20 §1.6 [K]:
  // "Archive (Repository): Picker, Detail mit verlinkten Quellen, Signatur").
  //
  // "＋ Neues Archiv" (Spec 20 §2): legt ein leeres Archiv mit einer kollisionsfreien id
  // an (allocatorFromDatabase, Spec ADR-v9-11) und meldet die neue id über onCreate an
  // den Aufrufer (EntityTab), der Auswahl + Editor-Öffnung übernimmt.
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import { makeRepository, allocatorFromDatabase, nextId } from '../../../core/model';
  import { buildRepositoryRows } from './repository-list-model';
  import { noDataHint } from '../../shell/nav-model';
  import { untrack } from 'svelte';
  import { createWindowed, type Windowed } from '../../shell/windowed.svelte';
  import { layout } from '../../shell/layout.svelte';

  interface Props {
    appState: AppState;
    viewState: ViewState;
    /** Nach dem Anlegen eines neuen Archivs aufgerufen (Auswahl + Editor-Öffnung liegt beim Aufrufer). */
    onCreate?: (repoId: string) => void;
    /**
     * Halter des virtuellen Scrollens (BL-311), von AUSSEN: die Scroll-Position soll die
     * Navigation überleben (Spec 21 §5) — und weil happy-dom kein Layout hat, ist er der
     * einzige Weg, die gemessenen Höhen für einen Test zu stellen
     * ([32 TST-24](../../../specs/v9/32-Testframework.md)).
     */
    windowed?: Windowed;
  }
  const { appState, viewState, onCreate, windowed: windowedProp }: Props = $props();

  const rows = $derived(buildRepositoryRows(appState.db));

  // --- Virtuelles Scrollen (BL-311, ADR-v9-235/236) ---------------------------------------
  // EIN Fenster über die Liste: gerendert wird nur, was im Sichtbereich steht, plus Overscan.
  // Die Höhe jeder Zeile wird GEMESSEN, sobald sie einmal im Fenster stand; die Höhenklasse
  // ist nur die Schätzung für alles, was noch nie gerendert wurde (ADR-v9-236). Diese Liste
  // hat genau EINE Klasse — ihre Zeilen tragen immer beide Zeilen (Name + Meta).
  // Das Fenster steht als `$derived` IM SKRIPT, nicht als `{@const}` im Template
  // (ADR-v9-235 Entscheidung 5, normativ und nicht Stilfrage).
  const w = untrack(() => windowedProp ?? createWindowed());
  const sec = w.section('repositories');
  const off = $derived(sec.offsets(rows.length, () => 'zeile'));
  const win = $derived(sec.slice(off));

  const isEmpty = $derived(appState.db.repositories.size === 0);

  function selectRepository(id: string) {
    viewState.setCurrent('repository', id);
  }

  function createRepository() {
    const alloc = allocatorFromDatabase(appState.db);
    const id = nextId(alloc, 'R');
    appState.saveRepository(makeRepository(id));
    onCreate?.(id);
  }
</script>

<div class="repository-list" use:w.container>
  {#if isEmpty}
    <p class="repository-list__empty">{noDataHint('Archive', layout.isDesktopLayout)}</p>
    <div class="repository-list__toolbar repository-list__toolbar--empty">
      <button type="button" class="repository-list__new-btn" onclick={createRepository}>＋ Neues Archiv</button>
    </div>
  {:else}
    <div class="repository-list__toolbar">
      <button type="button" class="repository-list__new-btn" onclick={createRepository}>＋ Neues Archiv</button>
    </div>
    <ul class="repository-list__rows" use:sec.frame>
      {#if win.padTop > 0}
        <li class="stb-window-pad" style:height={win.padTop + 'px'} aria-hidden="true"></li>
      {/if}
      {#each rows.slice(win.start, win.end) as row, i (row.id)}
        <li use:sec.probe={{ klasse: 'zeile', index: win.start + i }}>
          <button type="button" class="repository-list__row" onclick={() => selectRepository(row.id)}>
            <span class="repository-list__name">{row.name}</span>
            <span class="repository-list__meta">
              {#if row.typeLabel}<span>{row.typeLabel}</span>{/if}
              <span class="repository-list__count">{row.sourceCount} Quelle{row.sourceCount === 1 ? '' : 'n'}</span>
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
  .repository-list {
    overflow-y: auto;
  }

  .repository-list__empty {
    padding: 1.5rem;
    color: var(--stb-text-dim);
  }

  .repository-list__toolbar {
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

  .repository-list__toolbar--empty {
    position: static;
    justify-content: flex-start;
  }

  .repository-list__new-btn {
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

  .repository-list__toolbar--empty .repository-list__new-btn {
    margin-left: 0;
  }

  .repository-list__rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .repository-list__row {
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

  .repository-list__row:hover,
  .repository-list__row:focus-visible {
    background: var(--stb-surface-2);
  }

  .repository-list__name {
    font-weight: 600;
  }

  .repository-list__meta {
    display: flex;
    gap: 0.75rem;
    font-size: 0.78rem;
    color: var(--stb-text-dim);
  }

  .repository-list__count {
    color: var(--stb-gold-light);
  }
</style>
