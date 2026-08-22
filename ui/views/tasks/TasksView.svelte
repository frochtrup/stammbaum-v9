<script lang="ts">
  // ui/views/tasks/TasksView.svelte — globaler Aufgaben-Tab (Spec 20 §1.11 [K]
  // "Aufgaben-Tab mit Badge, Kanban-Status, Kategorien, globale Liste, MD-Export").
  // Verhaltens-Orakel: legacy-v8/ui-views-tasks.js (renderTasksView/_renderTaskBoard/
  // exportTasksMd) — Liste ⇄ Kanban-Board-Umschalter, Filter alle/offen/erledigt,
  // Kategorien-Gruppierung, Tap-to-Advance im Board, MD-Export.
  //
  // Ziel-Entitäts-Auswahl beim Hinzufügen: Person/Familie per Radio wählen, danach
  // PersonPicker/FamilyPicker (ADR-v9-40, INV-UI-4 — EIN Entitäts-Picker-Muster statt
  // einer eigenen Text+<select>-Handkonstruktion). Quelle (optional) ebenso über
  // SourcePicker statt eines flachen <select>.
  //
  // Befehlsflächen-Budget (INV-UI-11, Spec 21 §6h): die Kopfzeile trägt genau drei
  // Elemente — [Filter · N] [Liste ⇄ Board] [+ Aufgabe]. Die Status-Auswahl liegt hinter
  // `FilterBar`, der MD-Export als Aktion IN dessen Panel ("Export einer gefilterten
  // Liste gehört fachlich zum Filter-Kontext"), der Ansichts-Umschalter kommt aus dem
  // geteilten `ViewModeToggle` statt eines view-eigenen Icon-Buttons. "✓ Daten prüfen"
  // ist mit dem Qualitäts-Dashboard dorthin gewandert (ADR-v9-98) — beide
  // Validierungs-Flächen liegen jetzt in EINEM Segment beieinander.
  import type { AppState } from '../../shell/app-state.svelte';
  import TaskForm, { type TaskFormValues } from './TaskForm.svelte';
  import {
    collectAllTasks,
    filterTasks,
    matchesTaskQuery,
    groupByCategory,
    buildKanbanColumns,
    nextTaskStatus,
    exportTasksMarkdown,
    type TaskEntityKind,
    type TaskFilter,
    type TaskEntry,
  } from './tasks-model';
  import { newTaskId } from './tasks-commands';
  import type { LogPrefill } from '../research-log/log-model';
  import type { TaskStatus, ProjectScope } from '../../../core/research/types';
  import { AnchorDownloadAdapter } from '../../../services/file/download-adapter';
  import FilterBar from '../../shell/FilterBar.svelte';
  import ConfirmDialog from '../../shell/ConfirmDialog.svelte';
  import { untrack } from 'svelte';
  import ViewModeToggle from '../../shell/ViewModeToggle.svelte';
  import type { Route } from '../../shell/route.svelte';
  import {
    createTasksViewState,
    DEFAULT_TASK_FILTER,
    type TasksViewState,
  } from '../research-segment-state.svelte';
  import { countActiveFilters } from '../../shell/count-active-filters';
  import { PLAIN_FIELD } from '../../shell/plain-input';
  import type { PersonId } from '../../../core/model/types';

  interface Props {
    appState: AppState;
    /** Klick auf eine Aufgabenzeile -> zur Trägerentität navigieren (optional, analog
     * den übrigen onNavigate*-Callback-Mustern, Spec-Auftrag "kanonischer Weg"). */
    onNavigateToPerson?: (id: string) => void;
    onNavigateToFamily?: (id: string) => void;
    /** UI-Kurzweg „→ Protokoll" (BL-65): ins Protokoll-Segment wechseln und das
     *  Formular aus dieser Aufgabe vorbelegen (ResearchTab verdrahtet das). */
    onStartLogFromTask?: (pf: LogPrefill) => void;
    /** Aktiver Projekt-Scope (BL-58) — null = keine Einschränkung. */
    scope?: ProjectScope | null;
    /**
     * Personenmenge der Verwandtschafts-Relevanz (BL-375) — `null` = Stufe „Alle" =
     * keine Einschränkung. Kommt von der Umbrella-Ebene, wo sie EINMAL für alle vier
     * Segmente gerechnet wird (Spec 20 §1.11i).
     */
    allowed?: ReadonlySet<PersonId> | null;
    /**
     * Routen-Quelle — trägt den Anzeige-Modus (Liste · Board) als Merker, wie sie es für
     * die Lens-Modi längst tut (BL-320, Spec 21 §5 Heimat ①). PFLICHT, nicht optional:
     * ein zweiter, komponenten-lokaler Modus-Zustand daneben wäre genau die Doppelquelle,
     * die INV-UI-15 ausschließt — der Compiler stellt die Frage lieber an jedem Aufrufer
     * (CLAUDE.md: der Zwang statt der Erinnerung).
     */
    route: Route;
    /**
     * Filterzustand von AUSSEN (BL-320): dieses Segment wird beim Wechsel des Nav-Ziels
     * abgebaut, ein gesetzter Filter war danach weg (Spec 21 §5).
     */
    tasks?: TasksViewState;
  }
  const {
    appState,
    onNavigateToPerson,
    onNavigateToFamily,
    onStartLogFromTask,
    scope = null,
    allowed = null,
    route,
    tasks: tasksProp,
  }: Props = $props();

  const tasks = untrack(() => tasksProp ?? createTasksViewState());
  const viewMode = $derived(route.tasksMode);

  /** Status-Auswahl. Die Vorgabe (`open`) steht im Halter — davon abweichend zählt
   *  `FilterBar` "· 1". */
  const DEFAULT_FILTER = DEFAULT_TASK_FILTER;
  const FILTERS: { key: TaskFilter; label: string }[] = [
    { key: 'all', label: 'Alle' },
    { key: 'open', label: 'Offen' },
    { key: 'done', label: 'Erledigt' },
  ];

  let showAddForm = $state(false);

  // Bearbeiten-Kontext: null = Hinzufügen-Modus.
  let editing = $state<{ kind: TaskEntityKind; entityId: string; taskId: string } | null>(null);

  /** Startwerte des Formulars — TaskForm hält den Eingabe-Zustand selbst. */
  let formInitial = $state<TaskFormValues>({
    text: '', category: '', sourceRef: '', kind: 'person', entityId: '',
  });

  const allTasks = $derived(collectAllTasks(appState.db, appState.placeContext, scope, allowed));
  // Suche NACH dem Status-Filter: beide grenzen ein, die Reihenfolge ist für das
  // Ergebnis gleichgültig — so herum bleibt die teurere Textprüfung auf der kleineren
  // Menge.
  const filteredTasks = $derived(
    filterTasks(allTasks, tasks.filter).filter((e) => matchesTaskQuery(e, tasks.query)),
  );
  const categoryGroups = $derived(groupByCategory(filteredTasks));
  const kanbanColumns = $derived(buildKanbanColumns(filteredTasks));
  const activeFilterCount = $derived(
    // Die Suchanfrage zählt NICHT mit: sie steht sichtbar in der Kopfzeile, und ein
    // Badge über einem sichtbaren Feld zeigte dieselbe Sache zweimal an.
    countActiveFilters({ filter: tasks.filter }, { filter: DEFAULT_FILTER }),
  );

  function openAddForm() {
    editing = null;
    formInitial = { text: '', category: '', sourceRef: '', kind: 'person', entityId: '' };
    showAddForm = true;
  }

  function openEditForm(entry: TaskEntry) {
    editing = { kind: entry.kind, entityId: entry.entityId, taskId: entry.task.id };
    formInitial = {
      text: entry.task.text,
      category: entry.task.category,
      sourceRef: entry.task.sourceRef,
      kind: entry.kind,
      entityId: entry.entityId,
    };
    showAddForm = true;
  }

  function closeForm() {
    showAddForm = false;
    editing = null;
  }

  function saveForm(v: TaskFormValues) {
    if (editing) {
      appState.updateTask(editing.kind, editing.entityId, editing.taskId, v.text, v.category, v.sourceRef);
    } else {
      const today = new Date().toISOString().slice(0, 10);
      appState.addTask(v.kind, v.entityId, newTaskId(), v.text, v.category, today, v.sourceRef);
    }
    closeForm();
  }

  function advance(entry: TaskEntry) {
    appState.setTaskStatus(entry.kind, entry.entityId, entry.task.id, nextTaskStatus(entry.task.status));
  }

  function setStatus(entry: TaskEntry, status: TaskStatus) {
    appState.setTaskStatus(entry.kind, entry.entityId, entry.task.id, status);
  }

  // Rückfrage vor dem Löschen (BL-351) — dieselbe Form wie am Steckbrief, wo dieselbe
  // Aufgabe ebenfalls löschbar ist.
  let frage = $state<TaskEntry | null>(null);

  function remove(entry: TaskEntry) {
    appState.deleteTask(entry.kind, entry.entityId, entry.task.id);
    frage = null;
  }

  function goToEntity(entry: TaskEntry) {
    if (entry.kind === 'person') onNavigateToPerson?.(entry.entityId);
    else onNavigateToFamily?.(entry.entityId);
  }

  /** BL-65: „→ Protokoll" — ins Protokoll-Segment wechseln, Formular aus dieser Aufgabe
   *  vorbelegt (Trägerentität + taskId + evtl. Quellenbezug). */
  function startLog(entry: TaskEntry) {
    onStartLogFromTask?.({ kind: entry.kind, entityId: entry.entityId, task: entry.task });
  }

  function exportMd() {
    const today = new Date().toLocaleDateString('de-DE');
    const md = exportTasksMarkdown(appState.db, tasks.filter, today);
    const adapter = new AnchorDownloadAdapter();
    const dateSlug = new Date().toISOString().slice(0, 10);
    adapter.download(md, `aufgaben_${dateSlug}.md`, 'text/markdown;charset=utf-8');
  }

  const statusLabel: Record<TaskStatus, string> = { todo: 'Offen', doing: 'In Arbeit', done: 'Erledigt' };
</script>

<div class="tasks-view">
  <div class="tasks-view__toolbar">
    <div class="stb-research-search">
      <input
        type="search" {...PLAIN_FIELD}
        placeholder="Suche…"
        aria-label="Aufgaben durchsuchen"
        bind:value={tasks.query}
      />
      {#if tasks.query}
        <button type="button" aria-label="Suche löschen" onclick={() => (tasks.query = '')}>✕</button>
      {/if}
    </div>
    <FilterBar activeCount={activeFilterCount}>
      <fieldset class="stb-filter-set">
        <legend>Status</legend>
        {#each FILTERS as f (f.key)}
          <label class="stb-filter-opt">
            <!-- `checked` + `onchange` statt `bind:group`: der Wert lebt außerhalb der
                 Komponente (BL-320). -->
            <input
              type="radio"
              value={f.key}
              checked={tasks.filter === f.key}
              onchange={() => (tasks.filter = f.key)}
            />
            {f.label}
          </label>
        {/each}
      </fieldset>
      <button type="button" class="stb-filter-export" onclick={exportMd}>
        ↓ Als Markdown exportieren
      </button>
    </FilterBar>
    <ViewModeToggle
      modes={[
        { id: 'list', label: '☰ Liste' },
        { id: 'board', label: '▦ Board' },
      ]}
      value={viewMode}
      onChange={(id) => route.setTasksMode(id as 'list' | 'board')}
      ariaLabel="Aufgabenansicht wählen"
    />
    <button type="button" class="tasks-view__add-btn" onclick={openAddForm}>+ Aufgabe</button>
  </div>

  {#if showAddForm}
    <TaskForm
      {appState}
      initial={formInitial}
      isEditing={editing !== null}
      onSubmit={saveForm}
      onCancel={closeForm}
    />
  {/if}

  {#if filteredTasks.length === 0}
    <p class="tasks-view__empty">
      {tasks.filter === 'open' ? 'Keine offenen Aufgaben' : tasks.filter === 'done' ? 'Keine erledigten Aufgaben' : 'Keine Aufgaben vorhanden'}
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
                  {#if entry.entitySummary}<span class="stb-entity-summary tasks-view__entity-summary">{entry.entitySummary}</span>{/if}
                  <p class="tasks-view__card-text">{entry.task.text}</p>
                  <div class="tasks-view__card-foot">
                    {#if entry.task.category}<span class="tasks-view__card-cat">{entry.task.category}</span>{/if}
                    {#if onStartLogFromTask}
                      <button type="button" class="tasks-view__log-btn" onclick={() => startLog(entry)} title="Protokolleintrag aus dieser Aufgabe anlegen">🔍 Protokoll</button>
                    {/if}
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
            {#if entry.entitySummary}<span class="stb-entity-summary tasks-view__entity-summary">{entry.entitySummary}</span>{/if}
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
              {#if onStartLogFromTask}
                <button type="button" class="stb-icon-btn" onclick={() => startLog(entry)} aria-label="Protokolleintrag aus dieser Aufgabe anlegen" title="→ Protokoll">🔍</button>
              {/if}
              <button type="button" class="stb-icon-btn" onclick={() => openEditForm(entry)} aria-label="Aufgabe bearbeiten">✎</button>
              <button type="button" class="stb-icon-btn" data-variant="danger" onclick={() => (frage = entry)} aria-label="Aufgabe löschen">🗑</button>
            </div>
          </div>
        {/each}
      {/each}
    </div>
  {/if}
</div>


{#if frage}
  <ConfirmDialog
    titel="Aufgabe löschen?"
    text={`„${frage.task.text}" geht mit allen Angaben verloren.`}
    onConfirm={() => frage && remove(frage)}
    onCancel={() => (frage = null)}
  />
{/if}

<style>
  .tasks-view {
    overflow-y: auto;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  /* EINE Toolbar-Zeile mit drei Elementen (INV-UI-11): Filter · Ansicht · Neuanlage. */


  .tasks-view__toolbar {
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

  /* Die Hauptaktion sitzt rechtsbündig am Zeilenende; Filter und Ansichts-Umschalter
     bleiben links (Spec 21 §10c Slot-Reihenfolge). Kein eigener Wrapper-Container —
     der würde bei 375px eine zweite Toolbar-Zeile erzwingen (INV-UI-11). */
  .tasks-view__add-btn {
    margin-left: auto;
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

  /* Farbe/Größe kommen aus .stb-entity-summary (INV-UI-4); hier nur das Board-Layout-Detail. */
  .tasks-view__entity-summary {
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

  /* KEIN eigener Knopf-Stil mehr (BL-351): hier stand eine weitere lokale
     Knopf-Implementierung (transparent + gedimmt + 0,95rem) — also das, was
     `.stb-icon-btn` samt Trefferzone und Gefahren-Variante ohnehin liefert. */

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

  /* BL-65 „→ Protokoll" im Board-Karten-Fuß — dezenter als der Advance-Button. */
  .tasks-view__log-btn {
    background: transparent;
    border: 1px solid var(--stb-surface-3);
    color: var(--stb-text-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.2rem 0.5rem;
    font-size: 0.72rem;
    cursor: pointer;
  }
</style>
