<script lang="ts">
  // ui/views/tasks/TasksView.svelte — globaler Aufgaben-Tab (Spec 20 §1.11 [K]
  // "Aufgaben-Tab mit Badge, Kanban-Status, Kategorien, globale Liste, MD-Export").
  // Verhaltens-Orakel: legacy-v8/ui-views-tasks.js (renderTasksView/_renderTaskBoard/
  // exportTasksMd) — Liste ⇄ Kanban-Board-Umschalter, Filter alle/offen/erledigt,
  // Kategorien-Gruppierung, Tap-to-Advance im Board, MD-Export.
  //
  // Ziel-Entitäts-Auswahl beim Hinzufügen (Design-Entscheidung, da die Spec hier keine
  // feste Form vorgibt): Person/Familie per Radio wählen, danach eine gefilterte
  // Auswahlliste (Textfeld + <select>) aus den bereits geladenen Personen/Familien —
  // bewusst keine neue Suchkomponente (die globale Suche ist für Navigation gedacht,
  // nicht für Formular-Zielauswahl); ein einfacher <select>, gefiltert per Textfeld,
  // reicht für die erwartete Datenmenge (kein Overengineering).
  import type { AppState } from '../../shell/app-state.svelte';
  import { displayName } from '../../shell/person-display';
  import { familyLabelFor } from '../source/family-label';
  import {
    collectAllTasks,
    filterTasks,
    groupByCategory,
    buildKanbanColumns,
    nextTaskStatus,
    exportTasksMarkdown,
    type TaskEntityKind,
    type TaskFilter,
    type TaskEntry,
  } from './tasks-model';
  import { newTaskId } from './tasks-commands';
  import type { TaskStatus } from '../../../core/research/types';
  import { AnchorDownloadAdapter } from '../../../services/file/download-adapter';

  interface Props {
    appState: AppState;
    /** Klick auf eine Aufgabenzeile -> zur Trägerentität navigieren (optional, analog
     * den übrigen onNavigate*-Callback-Mustern, Spec-Auftrag "kanonischer Weg"). */
    onNavigateToPerson?: (id: string) => void;
    onNavigateToFamily?: (id: string) => void;
  }
  const { appState, onNavigateToPerson, onNavigateToFamily }: Props = $props();

  // v8-Presets als Vorschläge (Auftrags-Vorgabe: KEIN geschlossenes Enum in der UI —
  // Freitext bleibt immer möglich, die drei Labels sind nur ein <datalist>-Vorschlag).
  const CATEGORY_PRESETS = ['Kirchenbuch', 'Urkunde/Standesamt', 'Online-Recherche'];

  let filter = $state<TaskFilter>('open');
  let viewMode = $state<'list' | 'board'>('list');
  let showAddForm = $state(false);

  // Bearbeiten-Kontext: null = Hinzufügen-Modus.
  let editing = $state<{ kind: TaskEntityKind; entityId: string; taskId: string } | null>(null);

  let formText = $state('');
  let formCategory = $state('');
  /** optionaler Quellen-Bezug (ResearchTask.sourceRef, ADR-v9-36 — v8-Parität `t.sid`). */
  let formSourceRef = $state('');
  let formKind = $state<TaskEntityKind>('person');
  let formEntityQuery = $state('');
  let formEntityId = $state('');

  const sources = $derived(Array.from(appState.db.sources.values()));

  const allTasks = $derived(collectAllTasks(appState.db));
  const filteredTasks = $derived(filterTasks(allTasks, filter));
  const categoryGroups = $derived(groupByCategory(filteredTasks));
  const kanbanColumns = $derived(buildKanbanColumns(filteredTasks));

  const personOptions = $derived(
    Array.from(appState.db.individuals.values())
      .filter((p) => !formEntityQuery.trim() || displayName(p).toLowerCase().includes(formEntityQuery.trim().toLowerCase()))
      .map((p) => ({ id: p.id, label: displayName(p) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'de'))
      .slice(0, 50),
  );
  const familyOptions = $derived(
    Array.from(appState.db.families.keys())
      .map((id) => ({ id, label: familyLabelFor(appState.db, id) }))
      .filter((row) => !formEntityQuery.trim() || row.label.toLowerCase().includes(formEntityQuery.trim().toLowerCase()))
      .sort((a, b) => a.label.localeCompare(b.label, 'de'))
      .slice(0, 50),
  );
  const entityOptions = $derived(formKind === 'person' ? personOptions : familyOptions);

  function switchFilter(f: TaskFilter) {
    filter = f;
  }

  function toggleBoard() {
    viewMode = viewMode === 'board' ? 'list' : 'board';
  }

  function openAddForm() {
    editing = null;
    formText = '';
    formCategory = '';
    formSourceRef = '';
    formKind = 'person';
    formEntityQuery = '';
    formEntityId = '';
    showAddForm = true;
  }

  function openEditForm(entry: TaskEntry) {
    editing = { kind: entry.kind, entityId: entry.entityId, taskId: entry.task.id };
    formText = entry.task.text;
    formCategory = entry.task.category;
    formSourceRef = entry.task.sourceRef;
    formKind = entry.kind;
    formEntityQuery = '';
    formEntityId = entry.entityId;
    showAddForm = true;
  }

  function closeForm() {
    showAddForm = false;
    editing = null;
  }

  function saveForm() {
    if (!formText.trim()) return;
    if (editing) {
      appState.updateTask(editing.kind, editing.entityId, editing.taskId, formText, formCategory, formSourceRef);
    } else {
      if (!formEntityId) return;
      const today = new Date().toISOString().slice(0, 10);
      appState.addTask(formKind, formEntityId, newTaskId(), formText, formCategory, today, formSourceRef);
    }
    closeForm();
  }

  function advance(entry: TaskEntry) {
    appState.setTaskStatus(entry.kind, entry.entityId, entry.task.id, nextTaskStatus(entry.task.status));
  }

  function setStatus(entry: TaskEntry, status: TaskStatus) {
    appState.setTaskStatus(entry.kind, entry.entityId, entry.task.id, status);
  }

  function remove(entry: TaskEntry) {
    appState.deleteTask(entry.kind, entry.entityId, entry.task.id);
  }

  function goToEntity(entry: TaskEntry) {
    if (entry.kind === 'person') onNavigateToPerson?.(entry.entityId);
    else onNavigateToFamily?.(entry.entityId);
  }

  function exportMd() {
    const today = new Date().toLocaleDateString('de-DE');
    const md = exportTasksMarkdown(appState.db, filter, today);
    const adapter = new AnchorDownloadAdapter();
    const dateSlug = new Date().toISOString().slice(0, 10);
    adapter.download(md, `aufgaben_${dateSlug}.md`, 'text/markdown;charset=utf-8');
  }

  const statusLabel: Record<TaskStatus, string> = { todo: 'Offen', doing: 'In Arbeit', done: 'Erledigt' };
</script>

<div class="tasks-view">
  <div class="tasks-view__toolbar">
    <div class="tasks-view__filters">
      <button
        type="button"
        class="tasks-view__filter-btn"
        class:tasks-view__filter-btn--active={filter === 'all'}
        onclick={() => switchFilter('all')}
      >
        Alle
      </button>
      <button
        type="button"
        class="tasks-view__filter-btn"
        class:tasks-view__filter-btn--active={filter === 'open'}
        onclick={() => switchFilter('open')}
      >
        Offen
      </button>
      <button
        type="button"
        class="tasks-view__filter-btn"
        class:tasks-view__filter-btn--active={filter === 'done'}
        onclick={() => switchFilter('done')}
      >
        Erledigt
      </button>
    </div>
    <div class="tasks-view__actions">
      <button
        type="button"
        class="tasks-view__icon-btn"
        class:tasks-view__icon-btn--active={viewMode === 'board'}
        onclick={toggleBoard}
        title={viewMode === 'board' ? 'Listenansicht' : 'Kanban-Board'}
      >
        {viewMode === 'board' ? '☰' : '▦'}
      </button>
      <button type="button" class="tasks-view__icon-btn" onclick={exportMd} title="Als Markdown exportieren">
        ↓
      </button>
      <button type="button" class="tasks-view__add-btn" onclick={openAddForm}>+ Aufgabe</button>
    </div>
  </div>

  {#if showAddForm}
    <form class="tasks-view__form" onsubmit={(e) => { e.preventDefault(); saveForm(); }}>
      <h3 class="tasks-view__form-title">{editing ? 'Aufgabe bearbeiten' : 'Aufgabe hinzufügen'}</h3>

      <label class="tasks-view__form-field">
        Text
        <input type="text" bind:value={formText} placeholder="Was ist zu tun?" required />
      </label>

      <label class="tasks-view__form-field">
        Kategorie
        <input type="text" bind:value={formCategory} list="tasks-category-presets" placeholder="frei wählbar…" />
        <datalist id="tasks-category-presets">
          {#each CATEGORY_PRESETS as preset (preset)}
            <option value={preset}></option>
          {/each}
        </datalist>
      </label>
      <div class="tasks-view__preset-chips">
        {#each CATEGORY_PRESETS as preset (preset)}
          <button type="button" class="tasks-view__chip" onclick={() => (formCategory = preset)}>{preset}</button>
        {/each}
      </div>

      <label class="tasks-view__form-field">
        Quelle (optional)
        <select value={formSourceRef} onchange={(e) => (formSourceRef = e.currentTarget.value)} aria-label="Quelle">
          <option value="">– keine Quelle –</option>
          {#each sources as s (s.id)}
            <option value={s.id}>{s.abbr || s.title || s.id}</option>
          {/each}
        </select>
      </label>

      {#if !editing}
        <fieldset class="tasks-view__form-field tasks-view__entity-picker">
          <legend>Ziel</legend>
          <div class="tasks-view__kind-toggle">
            <label>
              <input
                type="radio"
                name="tasks-kind"
                value="person"
                checked={formKind === 'person'}
                onchange={() => { formKind = 'person'; formEntityId = ''; }}
              />
              Person
            </label>
            <label>
              <input
                type="radio"
                name="tasks-kind"
                value="family"
                checked={formKind === 'family'}
                onchange={() => { formKind = 'family'; formEntityId = ''; }}
              />
              Familie
            </label>
          </div>
          <input
            type="search"
            placeholder="Suchen…"
            aria-label="Ziel-Entität durchsuchen"
            bind:value={formEntityQuery}
          />
          <select
            value={formEntityId}
            onchange={(e) => (formEntityId = e.currentTarget.value)}
            aria-label="Ziel-Entität wählen"
            required
            size="5"
          >
            {#each entityOptions as opt (opt.id)}
              <option value={opt.id}>{opt.label}</option>
            {/each}
          </select>
        </fieldset>
      {/if}

      <div class="tasks-view__form-actions">
        <button type="button" class="tasks-view__form-cancel" onclick={closeForm}>Abbrechen</button>
        <button type="submit" class="tasks-view__form-save">Speichern</button>
      </div>
    </form>
  {/if}

  {#if filteredTasks.length === 0}
    <p class="tasks-view__empty">
      {filter === 'open' ? 'Keine offenen Aufgaben' : filter === 'done' ? 'Keine erledigten Aufgaben' : 'Keine Aufgaben vorhanden'}
    </p>
  {:else if viewMode === 'board'}
    <div class="tasks-view__board">
      {#each kanbanColumns as col (col.status)}
        <div class="tasks-view__col">
          <div class="tasks-view__col-head">{col.label} <span class="tasks-view__col-count">{col.entries.length}</span></div>
          <div class="tasks-view__col-body">
            {#if col.entries.length === 0}
              <p class="tasks-view__col-empty">–</p>
            {:else}
              {#each col.entries as entry (entry.kind + entry.entityId + entry.task.id)}
                <div class="tasks-view__card">
                  <button type="button" class="tasks-view__card-entity" onclick={() => goToEntity(entry)}>
                    {entry.entityLabel} ›
                  </button>
                  <p class="tasks-view__card-text">{entry.task.text}</p>
                  <div class="tasks-view__card-foot">
                    {#if entry.task.category}<span class="tasks-view__card-cat">{entry.task.category}</span>{/if}
                    <button type="button" class="tasks-view__advance-btn" onclick={() => advance(entry)}>
                      → {statusLabel[nextTaskStatus(entry.task.status)]}
                    </button>
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="tasks-view__list">
      {#each categoryGroups as group (group.category)}
        <div class="tasks-view__cat-header">{group.category || '(ohne Kategorie)'}</div>
        {#each group.entries as entry (entry.kind + entry.entityId + entry.task.id)}
          <div class="tasks-view__row" class:tasks-view__row--done={entry.task.status === 'done'}>
            <button type="button" class="tasks-view__entity-link" onclick={() => goToEntity(entry)}>
              {entry.entityLabel} ›
            </button>
            <div class="tasks-view__row-main">
              <span class="tasks-view__row-text">{entry.task.text}</span>
              <select
                class="tasks-view__status-select"
                aria-label="Status"
                value={entry.task.status}
                onchange={(e) => setStatus(entry, (e.currentTarget as HTMLSelectElement).value as TaskStatus)}
              >
                <option value="todo">Offen</option>
                <option value="doing">In Arbeit</option>
                <option value="done">Erledigt</option>
              </select>
            </div>
            <div class="tasks-view__row-actions">
              <button type="button" class="tasks-view__row-btn" onclick={() => openEditForm(entry)} aria-label="Aufgabe bearbeiten">✎</button>
              <button type="button" class="tasks-view__row-btn" onclick={() => remove(entry)} aria-label="Aufgabe löschen">×</button>
            </div>
          </div>
        {/each}
      {/each}
    </div>
  {/if}
</div>

<style>
  .tasks-view {
    overflow-y: auto;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .tasks-view__toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 1rem;
    background: var(--stb-surface-2);
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .tasks-view__filters {
    display: flex;
    gap: 0.3rem;
  }

  .tasks-view__filter-btn {
    background: var(--stb-surface-3);
    color: var(--stb-text-dim);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
    font-size: 0.8rem;
  }

  .tasks-view__filter-btn--active {
    background: var(--stb-gold);
    color: var(--stb-bg);
    font-weight: 700;
    border-color: var(--stb-gold);
  }

  .tasks-view__actions {
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }

  .tasks-view__icon-btn {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.6rem;
    cursor: pointer;
    font-size: 0.9rem;
  }

  .tasks-view__icon-btn--active {
    background: var(--stb-gold);
    color: var(--stb-bg);
    border-color: var(--stb-gold);
  }

  .tasks-view__add-btn {
    background: var(--stb-gold);
    color: var(--stb-bg);
    border: none;
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.8rem;
    font-weight: 700;
    cursor: pointer;
    font-size: 0.82rem;
  }

  .tasks-view__empty {
    padding: 1.5rem;
    color: var(--stb-text-dim);
  }

  .tasks-view__form {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.8rem 1rem;
    background: var(--stb-surface-1);
    border-bottom: 1px solid var(--stb-surface-3);
  }

  .tasks-view__form-title {
    margin: 0;
    font-size: 1rem;
    color: var(--stb-gold-light);
  }

  .tasks-view__form-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.82rem;
    color: var(--stb-text-dim);
  }

  .tasks-view__form-field input[type='text'],
  .tasks-view__form-field input[type='search'],
  .tasks-view__form-field select {
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.4rem 0.6rem;
    font-size: 0.9rem;
    font-family: inherit;
  }

  .tasks-view__preset-chips {
    display: flex;
    gap: 0.3rem;
    flex-wrap: wrap;
  }

  .tasks-view__chip {
    background: var(--stb-surface-3);
    color: var(--stb-text-dim);
    border: 1px solid var(--stb-gold-dim);
    border-radius: 999px;
    padding: 0.15rem 0.6rem;
    font-size: 0.72rem;
    cursor: pointer;
  }

  .tasks-view__entity-picker {
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-control);
    padding: 0.5rem;
  }

  .tasks-view__entity-picker legend {
    font-size: 0.78rem;
    color: var(--stb-gold-light);
    padding: 0 0.3rem;
  }

  .tasks-view__kind-toggle {
    display: flex;
    gap: 0.8rem;
    margin-bottom: 0.4rem;
    font-size: 0.85rem;
    color: var(--stb-text);
  }

  .tasks-view__entity-picker select {
    width: 100%;
    margin-top: 0.4rem;
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
  }

  .tasks-view__form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .tasks-view__form-cancel {
    background: transparent;
    border: 1px solid var(--stb-surface-3);
    color: var(--stb-text-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.8rem;
    cursor: pointer;
  }

  .tasks-view__form-save {
    background: var(--stb-gold);
    color: var(--stb-bg);
    border: none;
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.8rem;
    font-weight: 700;
    cursor: pointer;
  }

  .tasks-view__cat-header {
    position: sticky;
    top: 0;
    margin: 0;
    background: var(--stb-surface-3);
    color: var(--stb-gold-light);
    font-family: var(--stb-font-title);
    font-size: 0.9rem;
    font-weight: 700;
    padding: 0.3rem 1rem;
  }

  .tasks-view__row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--stb-surface-2);
  }

  .tasks-view__row--done .tasks-view__row-text {
    text-decoration: line-through;
    color: var(--stb-text-dim);
  }

  .tasks-view__entity-link {
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    font-size: 0.72rem;
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
    flex-basis: 100%;
  }

  .tasks-view__row-main {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .tasks-view__row-text {
    flex: 1;
  }

  .tasks-view__status-select {
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    font-size: 0.78rem;
    padding: 0.15rem 0.3rem;
  }

  .tasks-view__row-actions {
    display: flex;
    gap: 0.3rem;
  }

  .tasks-view__row-btn {
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
    font-size: 0.95rem;
  }

  .tasks-view__board {
    display: flex;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    overflow-x: auto;
  }

  .tasks-view__col {
    flex: 1 1 240px;
    min-width: 220px;
    background: var(--stb-surface-1);
    border-radius: var(--stb-radius-card);
    display: flex;
    flex-direction: column;
  }

  .tasks-view__col-head {
    font-weight: 700;
    color: var(--stb-gold-light);
    padding: 0.5rem 0.7rem;
    border-bottom: 1px solid var(--stb-surface-3);
    display: flex;
    justify-content: space-between;
  }

  .tasks-view__col-count {
    color: var(--stb-text-dim);
    font-weight: 400;
  }

  .tasks-view__col-body {
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .tasks-view__col-empty {
    color: var(--stb-text-muted);
    text-align: center;
    margin: 0;
  }

  .tasks-view__card {
    background: var(--stb-surface-2);
    border-radius: var(--stb-radius-control);
    padding: 0.5rem 0.6rem;
  }

  .tasks-view__card-entity {
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    font-size: 0.72rem;
    padding: 0;
    cursor: pointer;
    text-decoration: underline;
  }

  .tasks-view__card-text {
    margin: 0.3rem 0;
    font-size: 0.88rem;
  }

  .tasks-view__card-foot {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.4rem;
  }

  .tasks-view__card-cat {
    font-size: 0.68rem;
    color: var(--stb-text-dim);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.05em 0.4em;
  }

  .tasks-view__advance-btn {
    background: var(--stb-surface-3);
    border: 1px solid var(--stb-gold-dim);
    color: var(--stb-text);
    border-radius: var(--stb-radius-control);
    padding: 0.2rem 0.5rem;
    font-size: 0.72rem;
    cursor: pointer;
  }
</style>
