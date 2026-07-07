<script lang="ts">
  // ui/views/research-log/LogView.svelte — globaler Forschungsprotokoll-Tab (Spec 12
  // §2, Spec 20 §1.11 [S] "Forschungsprotokoll (RLOG) ... globaler Protokoll-Tab +
  // Markdown-Export"). Stil-Vorbild: ui/views/tasks/TasksView.svelte (Filter, globale
  // Liste, Formular, MD-Export) — LogEntry ist aber index-adressiert (kein `id`,
  // Spec 12 §2), daher Bearbeiten/Löschen über {kind, entityId, index} statt {..., id}.
  //
  // Ziel-Entitäts-Auswahl beim Hinzufügen: identisches Muster wie TasksView (Person/
  // Familie per Radio, gefilterte <select>-Auswahlliste) — EIN kanonischer Weg für
  // "an welcher Entität hänge ich diesen Forschungsartefakt an" (INV-UI-2), nicht pro
  // Formular neu erfunden.
  import type { AppState } from '../../shell/app-state.svelte';
  import { displayName } from '../../shell/person-display';
  import { familyLabelFor } from '../source/family-label';
  import {
    collectAllLogEntries,
    filterLogEntries,
    resultLabel,
    exportLogMarkdown,
    type LogFilter,
    type LogEntryRow,
  } from './log-model';
  import { makeLogEntry } from '../../../core/research/index';
  import type { LogResult } from '../../../core/research/types';
  import type { TaskEntityKind } from '../tasks/tasks-model';
  import { AnchorDownloadAdapter } from '../../../services/file/download-adapter';

  interface Props {
    appState: AppState;
    onNavigateToPerson?: (id: string) => void;
    onNavigateToFamily?: (id: string) => void;
  }
  const { appState, onNavigateToPerson, onNavigateToFamily }: Props = $props();

  let filter = $state<LogFilter>('all');
  let showForm = $state(false);

  // Bearbeiten-Kontext: null = Hinzufügen-Modus. Index-Adressierung (kein id, s. Kopf).
  let editing = $state<{ kind: TaskEntityKind; entityId: string; index: number } | null>(null);

  let formDate = $state('');
  let formRepoRef = $state('');
  let formSourceRef = $state('');
  let formQuery = $state('');
  let formResult = $state<LogResult>('pending');
  let formNote = $state('');
  let formTaskId = $state('');
  let formKind = $state<TaskEntityKind>('person');
  let formEntityQuery = $state('');
  let formEntityId = $state('');

  const allEntries = $derived(collectAllLogEntries(appState.db));
  const filteredEntries = $derived(filterLogEntries(allEntries, filter));

  const repositories = $derived(Array.from(appState.db.repositories.values()));
  const sources = $derived(Array.from(appState.db.sources.values()));

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

  // Offene Aufgaben derselben Zielentität (Auftrags-Vorgabe: "ein einfaches <select>
  // über die offenen Aufgaben derselben Zielentität") — nur sinnvoll befüllt, sobald
  // eine Zielentität gewählt ist.
  const targetTasks = $derived.by(() => {
    if (!formEntityId) return [];
    const owner = formKind === 'person' ? appState.db.individuals.get(formEntityId) : appState.db.families.get(formEntityId);
    return owner ? owner.tasks.filter((t) => t.status !== 'done') : [];
  });

  const FILTERS: { key: LogFilter; label: string }[] = [
    { key: 'all', label: 'Alle' },
    { key: 'found', label: 'Gefunden' },
    { key: 'notfound', label: 'Nichts gefunden' },
    { key: 'pending', label: 'Ausstehend' },
  ];

  function switchFilter(f: LogFilter) {
    filter = f;
  }

  function resetForm() {
    formDate = new Date().toISOString().slice(0, 10);
    formRepoRef = '';
    formSourceRef = '';
    formQuery = '';
    formResult = 'pending';
    formNote = '';
    formTaskId = '';
    formKind = 'person';
    formEntityQuery = '';
    formEntityId = '';
  }

  function openAddForm() {
    editing = null;
    resetForm();
    showForm = true;
  }

  function openEditForm(row: LogEntryRow) {
    editing = { kind: row.kind, entityId: row.entityId, index: row.index };
    formDate = row.entry.date;
    formRepoRef = row.entry.repoRef;
    formSourceRef = row.entry.sourceRef;
    formQuery = row.entry.query;
    formResult = row.entry.result;
    formNote = row.entry.note;
    formTaskId = row.entry.taskId;
    formKind = row.kind;
    formEntityQuery = '';
    formEntityId = row.entityId;
    showForm = true;
  }

  function closeForm() {
    showForm = false;
    editing = null;
  }

  function saveForm() {
    const entry = makeLogEntry({
      date: formDate,
      repoRef: formRepoRef,
      sourceRef: formSourceRef,
      query: formQuery.trim(),
      result: formResult,
      note: formNote.trim(),
      taskId: formTaskId,
    });
    if (editing) {
      appState.updateLogEntry(editing.kind, editing.entityId, editing.index, entry);
    } else {
      if (!formEntityId) return;
      appState.addLogEntry(formKind, formEntityId, entry);
    }
    closeForm();
  }

  function remove(row: LogEntryRow) {
    appState.deleteLogEntry(row.kind, row.entityId, row.index);
  }

  function goToEntity(row: LogEntryRow) {
    if (row.kind === 'person') onNavigateToPerson?.(row.entityId);
    else onNavigateToFamily?.(row.entityId);
  }

  function repoName(repoId: string): string {
    return appState.db.repositories.get(repoId)?.name ?? repoId;
  }

  function sourceLabel(sourceId: string): string {
    const s = appState.db.sources.get(sourceId);
    return s ? s.abbr || s.title || s.id : sourceId;
  }

  function exportMd() {
    const today = new Date().toLocaleDateString('de-DE');
    const md = exportLogMarkdown(appState.db, filter, today);
    const adapter = new AnchorDownloadAdapter();
    const dateSlug = new Date().toISOString().slice(0, 10);
    adapter.download(md, `forschungsprotokoll_${dateSlug}.md`, 'text/markdown;charset=utf-8');
  }
</script>

<div class="log-view">
  <div class="log-view__toolbar">
    <div class="log-view__filters stb-segment-row">
      {#each FILTERS as f (f.key)}
        <button
          type="button"
          class="stb-segment-btn"
          class:stb-segment-btn--active={filter === f.key}
          onclick={() => switchFilter(f.key)}
        >
          {f.label}
        </button>
      {/each}
    </div>
    <div class="log-view__actions">
      <button type="button" class="log-view__icon-btn" onclick={exportMd} title="Als Markdown exportieren">↓</button>
      <button type="button" class="log-view__add-btn" onclick={openAddForm}>+ Eintrag</button>
    </div>
  </div>

  {#if showForm}
    <form class="log-view__form" onsubmit={(e) => { e.preventDefault(); saveForm(); }}>
      <h3 class="log-view__form-title">{editing ? 'Eintrag bearbeiten' : 'Eintrag hinzufügen'}</h3>

      <div class="log-view__form-row">
        <label class="log-view__form-field">
          Datum
          <input type="date" bind:value={formDate} />
        </label>
        <label class="log-view__form-field">
          Ergebnis
          <select
            value={formResult}
            onchange={(e) => (formResult = e.currentTarget.value as LogResult)}
            aria-label="Ergebnis"
          >
            <option value="pending">Ausstehend</option>
            <option value="found">Gefunden</option>
            <option value="notfound">Nichts gefunden</option>
          </select>
        </label>
      </div>

      <label class="log-view__form-field">
        Archiv
        <select value={formRepoRef} onchange={(e) => (formRepoRef = e.currentTarget.value)} aria-label="Archiv">
          <option value="">– kein Archiv –</option>
          {#each repositories as r (r.id)}
            <option value={r.id}>{r.name}</option>
          {/each}
        </select>
      </label>

      <label class="log-view__form-field">
        Quelle
        <select value={formSourceRef} onchange={(e) => (formSourceRef = e.currentTarget.value)} aria-label="Quelle">
          <option value="">– keine Quelle –</option>
          {#each sources as s (s.id)}
            <option value={s.id}>{s.abbr || s.title || s.id}</option>
          {/each}
        </select>
      </label>

      <label class="log-view__form-field">
        Suchbegriff
        <input type="text" bind:value={formQuery} placeholder="Wonach wurde gesucht?" />
      </label>

      <label class="log-view__form-field">
        Notiz
        <textarea bind:value={formNote} rows="2" placeholder="Ergebnis / Beobachtungen"></textarea>
      </label>

      {#if !editing}
        <fieldset class="log-view__form-field log-view__entity-picker">
          <legend>Ziel</legend>
          <div class="log-view__kind-toggle">
            <label>
              <input
                type="radio"
                name="log-kind"
                value="person"
                checked={formKind === 'person'}
                onchange={() => { formKind = 'person'; formEntityId = ''; formTaskId = ''; }}
              />
              Person
            </label>
            <label>
              <input
                type="radio"
                name="log-kind"
                value="family"
                checked={formKind === 'family'}
                onchange={() => { formKind = 'family'; formEntityId = ''; formTaskId = ''; }}
              />
              Familie
            </label>
          </div>
          <input type="search" placeholder="Suchen…" aria-label="Ziel-Entität durchsuchen" bind:value={formEntityQuery} />
          <select
            value={formEntityId}
            onchange={(e) => { formEntityId = e.currentTarget.value; formTaskId = ''; }}
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

      {#if formEntityId}
        <label class="log-view__form-field">
          Aufgaben-Bezug (optional)
          <select value={formTaskId} onchange={(e) => (formTaskId = e.currentTarget.value)} aria-label="Aufgaben-Bezug">
            <option value="">– keine Aufgabe –</option>
            {#each targetTasks as t (t.id)}
              <option value={t.id}>{t.text}</option>
            {/each}
          </select>
        </label>
      {/if}

      <div class="log-view__form-actions">
        <button type="button" class="log-view__form-cancel" onclick={closeForm}>Abbrechen</button>
        <button type="submit" class="log-view__form-save">Speichern</button>
      </div>
    </form>
  {/if}

  {#if filteredEntries.length === 0}
    <p class="log-view__empty">
      {filter === 'all' ? 'Keine Protokoll-Einträge vorhanden' : `Keine Einträge mit Ergebnis "${resultLabel(filter as LogResult)}"`}
    </p>
  {:else}
    <div class="log-view__list">
      {#each filteredEntries as row (row.kind + row.entityId + row.index)}
        <div class="log-view__row" class:log-view__row--found={row.entry.result === 'found'}>
          <div class="log-view__row-head">
            <button type="button" class="log-view__entity-link" onclick={() => goToEntity(row)}>
              {row.entityLabel} ›
            </button>
            <span class="log-view__row-date">{row.entry.date || '(kein Datum)'}</span>
            <span class="log-view__row-result">{resultLabel(row.entry.result)}</span>
          </div>
          <p class="log-view__row-query">{row.entry.query || '(kein Suchbegriff)'}</p>
          {#if row.entry.note}<p class="log-view__row-note">{row.entry.note}</p>{/if}
          <div class="log-view__row-meta">
            {#if row.entry.repoRef}<span class="stb-pill">{repoName(row.entry.repoRef)}</span>{/if}
            {#if row.entry.sourceRef}<span class="stb-pill">{sourceLabel(row.entry.sourceRef)}</span>{/if}
          </div>
          <div class="log-view__row-actions">
            <button type="button" class="log-view__row-btn" onclick={() => openEditForm(row)} aria-label="Eintrag bearbeiten">✎</button>
            <button type="button" class="log-view__row-btn" onclick={() => remove(row)} aria-label="Eintrag löschen">×</button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .log-view {
    overflow-y: auto;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .log-view__toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: space-between;
    align-items: center;
    padding: 0.15rem 0.25rem 0.5rem;
    background: var(--stb-surface-2);
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .log-view__filters {
    padding: 0.35rem 0.5rem;
  }

  .log-view__actions {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    padding-right: 0.75rem;
  }

  .log-view__icon-btn {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.6rem;
    cursor: pointer;
    font-size: 0.9rem;
  }

  .log-view__add-btn {
    background: var(--stb-gold);
    color: var(--stb-bg);
    border: none;
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.8rem;
    font-weight: 700;
    cursor: pointer;
    font-size: 0.82rem;
  }

  .log-view__empty {
    padding: 1.5rem;
    color: var(--stb-text-dim);
  }

  .log-view__form {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.8rem 1rem;
    background: var(--stb-surface-1);
    border-bottom: 1px solid var(--stb-surface-3);
  }

  .log-view__form-title {
    margin: 0;
    font-size: 1rem;
    color: var(--stb-gold-light);
  }

  .log-view__form-row {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  .log-view__form-row .log-view__form-field {
    flex: 1 1 140px;
    min-width: 0;
  }

  .log-view__form-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.82rem;
    color: var(--stb-text-dim);
  }

  .log-view__form-field input[type='text'],
  .log-view__form-field input[type='search'],
  .log-view__form-field input[type='date'],
  .log-view__form-field select,
  .log-view__form-field textarea {
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.4rem 0.6rem;
    font-size: 0.9rem;
    font-family: inherit;
  }

  .log-view__entity-picker {
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-control);
    padding: 0.5rem;
  }

  .log-view__entity-picker legend {
    font-size: 0.78rem;
    color: var(--stb-gold-light);
    padding: 0 0.3rem;
  }

  .log-view__kind-toggle {
    display: flex;
    gap: 0.8rem;
    margin-bottom: 0.4rem;
    font-size: 0.85rem;
    color: var(--stb-text);
  }

  .log-view__entity-picker select {
    width: 100%;
    margin-top: 0.4rem;
  }

  .log-view__form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .log-view__form-cancel {
    background: transparent;
    border: 1px solid var(--stb-surface-3);
    color: var(--stb-text-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.8rem;
    cursor: pointer;
  }

  .log-view__form-save {
    background: var(--stb-gold);
    color: var(--stb-bg);
    border: none;
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.8rem;
    font-weight: 700;
    cursor: pointer;
  }

  .log-view__list {
    display: flex;
    flex-direction: column;
  }

  .log-view__row {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--stb-surface-2);
    position: relative;
  }

  .log-view__row--found {
    border-left: 3px solid var(--stb-quay-3);
  }

  .log-view__row-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

  .log-view__entity-link {
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    font-size: 0.72rem;
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
  }

  .log-view__row-date {
    font-size: 0.75rem;
    color: var(--stb-text-dim);
  }

  .log-view__row-result {
    font-size: 0.72rem;
    color: var(--stb-gold-light);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.05em 0.4em;
  }

  .log-view__row-query {
    margin: 0;
    font-weight: 600;
  }

  .log-view__row-note {
    margin: 0;
    color: var(--stb-text-dim);
    font-size: 0.85rem;
  }

  .log-view__row-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .log-view__row-actions {
    display: flex;
    gap: 0.3rem;
    position: absolute;
    top: 0.5rem;
    right: 1rem;
  }

  .log-view__row-btn {
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
    font-size: 0.95rem;
  }
</style>
