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
  import type { AppState } from '../../shell/app-state.svelte';
  import { tooltip } from '../../shell/tooltip';
  import TaskForm, { type TaskFormValues } from './TaskForm.svelte';
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
  import ValidationPanel from '../validation/ValidationPanel.svelte';
  import ValConfigSheet from '../validation/ValConfigSheet.svelte';
  import {
    runValidation,
    withoutAlreadyTasked,
    configFromStored,
    configToStored,
    defaultConfig,
    type Finding,
    type ValidationConfig,
  } from '../../../core/validate/index';
  import { IdbValConfigStore, loadValConfig } from '../../../services/validate/index';

  interface Props {
    appState: AppState;
    /** Klick auf eine Aufgabenzeile -> zur Trägerentität navigieren (optional, analog
     * den übrigen onNavigate*-Callback-Mustern, Spec-Auftrag "kanonischer Weg"). */
    onNavigateToPerson?: (id: string) => void;
    onNavigateToFamily?: (id: string) => void;
  }
  const { appState, onNavigateToPerson, onNavigateToFamily }: Props = $props();

  let filter = $state<TaskFilter>('open');
  let viewMode = $state<'list' | 'board'>('list');
  let showAddForm = $state(false);

  // Bearbeiten-Kontext: null = Hinzufügen-Modus.
  let editing = $state<{ kind: TaskEntityKind; entityId: string; taskId: string } | null>(null);

  /** Startwerte des Formulars — TaskForm hält den Eingabe-Zustand selbst. */
  let formInitial = $state<TaskFormValues>({
    text: '', category: '', sourceRef: '', kind: 'person', entityId: '',
  });

  const allTasks = $derived(collectAllTasks(appState.db));
  const filteredTasks = $derived(filterTasks(allTasks, filter));
  const categoryGroups = $derived(groupByCategory(filteredTasks));
  const kanbanColumns = $derived(buildKanbanColumns(filteredTasks));

  function switchFilter(f: TaskFilter) {
    filter = f;
  }

  function toggleBoard() {
    viewMode = viewMode === 'board' ? 'list' : 'board';
  }

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

  // ─── Validierung (Spec 20 §1.11h) ──────────────────────────────────────────
  // Der Bericht ist flüchtig: `null` = noch nicht geprüft/ausgeblendet. Er wird NICHT
  // automatisch beim Öffnen des Tabs erzeugt — „✓ Daten prüfen" ist eine bewusste
  // Nutzer-Handlung, und bei mehreren tausend Personen ist der Bericht lang.
  let validationResults = $state<Finding[] | null>(null);
  let showValConfig = $state(false);
  let valConfig = $state<ValidationConfig>(defaultConfig());
  let valConfigLoaded = false;

  const valStore = new IdbValConfigStore();

  /** Konfiguration einmal je Sitzung nachladen — danach lebt sie in `valConfig`. */
  async function ensureValConfig() {
    if (valConfigLoaded) return;
    valConfig = configFromStored(await loadValConfig(valStore));
    valConfigLoaded = true;
  }

  async function runCheck() {
    await ensureValConfig();
    const findings = runValidation(appState.db, valConfig);
    // Befunde ausblenden, die bereits als Aufgabe übernommen wurden — sonst bietet
    // jede Prüfung dieselbe, längst erledigte Lücke erneut an.
    validationResults = withoutAlreadyTasked(findings, appState.db);
  }

  async function openValConfig() {
    await ensureValConfig();
    showValConfig = true;
  }

  async function saveValConfig(cfg: ValidationConfig) {
    valConfig = cfg;
    showValConfig = false;
    // Ein fehlgeschlagenes Speichern darf die Prüfung nicht abbrechen — die Änderung
    // gilt dann für diese Sitzung, nur eben nicht dauerhaft.
    try {
      await valStore.save(configToStored(cfg));
    } catch {
      /* app-lokaler Speicher nicht verfügbar — Konfiguration bleibt sitzungslokal. */
    }
    // Bereits angezeigte Befunde stammen aus der ALTEN Konfiguration und wären nach
    // dem Speichern irreführend: neu berechnen statt stehen lassen.
    if (validationResults !== null) await runCheck();
  }
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
        aria-label={viewMode === 'board' ? 'Listenansicht' : 'Kanban-Board'}
        use:tooltip={viewMode === 'board' ? 'Listenansicht' : 'Kanban-Board'}
      >
        {viewMode === 'board' ? '☰' : '▦'}
      </button>
      <button
        type="button"
        class="tasks-view__icon-btn"
        onclick={exportMd}
        aria-label="Als Markdown exportieren"
        use:tooltip={'Als Markdown exportieren'}
      >
        ↓
      </button>
      <button
        type="button"
        class="tasks-view__icon-btn"
        onclick={openValConfig}
        aria-label="Prüfregeln konfigurieren"
        use:tooltip={'Prüfregeln konfigurieren'}
      >
        ⚙
      </button>
      <button
        type="button"
        class="tasks-view__check-btn"
        onclick={runCheck}
        aria-label="Daten prüfen"
      >
        ✓ Daten prüfen
      </button>
      <button type="button" class="tasks-view__add-btn" onclick={openAddForm}>+ Aufgabe</button>
    </div>
  </div>

  {#if validationResults !== null}
    <ValidationPanel
      {appState}
      findings={validationResults}
      onClose={() => (validationResults = null)}
      {onNavigateToPerson}
      {onNavigateToFamily}
    />
  {/if}

  {#if showValConfig}
    <ValConfigSheet
      config={valConfig}
      onSave={saveValConfig}
      onClose={() => (showValConfig = false)}
    />
  {/if}

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

  /* Sekundär gegenüber „+ Aufgabe": Prüfen ist häufig, aber nicht die Hauptaktion
     des Tabs — Umriss statt Vollfläche (Spec 21 §3 Hierarchie der Aktionen). */
  .tasks-view__check-btn {
    background: transparent;
    color: var(--stb-gold-light);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.7rem;
    cursor: pointer;
    font-size: 0.82rem;
    white-space: nowrap;
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
