<script lang="ts">
  // ui/views/research-log/LogView.svelte — globaler Forschungsprotokoll-Tab (Spec 12
  // §2, Spec 20 §1.11 [S] "Forschungsprotokoll (RLOG) ... globaler Protokoll-Tab +
  // Markdown-Export"). Stil-Vorbild: ui/views/tasks/TasksView.svelte (Filter, globale
  // Liste, Formular, MD-Export) — LogEntry ist aber index-adressiert (kein `id`,
  // Spec 12 §2), daher Bearbeiten/Löschen über {kind, entityId, index} statt {..., id}.
  //
  // Ziel-Entitäts-Auswahl beim Hinzufügen: identisches Muster wie TasksView — PersonPicker/
  // FamilyPicker (ADR-v9-40, INV-UI-4) statt einer eigenen Text+<select>-Handkonstruktion —
  // EIN kanonischer Weg für "an welcher Entität hänge ich diesen Forschungsartefakt an"
  // (INV-UI-2), nicht pro Formular neu erfunden. Archiv/Quelle ebenso über
  // RepositoryPicker/SourcePicker statt flacher <select>s. Der "Aufgaben-Bezug"
  // (ResearchTask der Zielentität) nutzt die generische Picker-Shell DIREKT (kein eigener
  // TaskPicker-Wrapper — die Kandidatenmenge ist strukturell klein: offene Aufgaben EINER
  // Entität, keine Inline-Neuanlage nötig, Aufgaben entstehen im Aufgaben-Tab).
  //
  // Befehlsflächen-Budget (INV-UI-11, Spec 21 §6h): EINE Toolbar-Zeile mit zwei
  // Elementen — [Filter · N] [+ Eintrag]. Die vierstufige Ergebnis-Auswahl (die bei
  // 375px ohne Restbreite endete) liegt hinter `FilterBar`, der MD-Export als Aktion in
  // dessen Panel. Der 🕒-Timeline-Umschalter (Spec 20 §1.11b, noch offen) bekommt später
  // den dritten Slot über `ViewModeToggle` — analog TasksView, nicht als eigenes Icon.
  import type { AppState } from '../../shell/app-state.svelte';
  import LogForm, { type LogFormValues } from './LogForm.svelte';
  import {
    buildResearchTimeline,
    groupLogByEntity,
    filterLogEntries,
    resultLabel,
    exportLogMarkdown,
    linkedTaskText,
    type LogFilter,
    type LogEntryRow,
  } from './log-model';
  import { untrack } from 'svelte';
  import ViewModeToggle from '../../shell/ViewModeToggle.svelte';
  import type { Route } from '../../shell/route.svelte';
  import {
    createLogViewState,
    DEFAULT_LOG_FILTER,
    type LogViewState,
  } from '../research-segment-state.svelte';
  import { makeLogEntry } from '../../../core/research/index';
  import type { LogResult, ProjectScope } from '../../../core/research/types';
  import type { TaskEntityKind } from '../tasks/tasks-model';
  import { AnchorDownloadAdapter } from '../../../services/file/download-adapter';
  import { sourceLabel } from '../../shell/source-label';
  import FilterBar from '../../shell/FilterBar.svelte';
  import ConfirmDialog from '../../shell/ConfirmDialog.svelte';
  import { countActiveFilters } from '../../shell/count-active-filters';

  interface Props {
    appState: AppState;
    onNavigateToPerson?: (id: string) => void;
    onNavigateToFamily?: (id: string) => void;
    /** Aktiver Projekt-Scope (BL-58) — null = keine Einschränkung. */
    scope?: ProjectScope | null;
    /**
     * Routen-Quelle — trägt den Anzeige-Modus (gruppiert · Zeitleiste) als Merker, wie sie
     * es für die Lens-Modi längst tut (BL-320, Spec 21 §5 Heimat ①). PFLICHT wie bei
     * TasksView: ein zweiter Modus-Zustand daneben wäre eine Doppelquelle (INV-UI-15).
     */
    route: Route;
    /**
     * Filterzustand von AUSSEN (BL-320): dieses Segment wird beim Wechsel des Nav-Ziels
     * abgebaut, ein gesetzter Filter war danach weg (Spec 21 §5).
     */
    log?: LogViewState;
  }
  const {
    appState,
    onNavigateToPerson,
    onNavigateToFamily,
    scope = null,
    route,
    log: logProp,
  }: Props = $props();

  const log = untrack(() => logProp ?? createLogViewState());
  // BL-56: personenweise gruppiert (Spec-Basis) ⇄ chronologische Research-Timeline —
  // über den geteilten ViewModeToggle, gleiche Daten, reine Darstellungsvariante. Der
  // Modus liegt seit BL-320 als Merker in der Routen-Quelle, nicht mehr hier.
  const logMode = $derived(route.logMode);

  /** Ergebnis-Auswahl. `all` ist der Default — davon abweichend zeigt FilterBar "· 1". */
  const DEFAULT_FILTER = DEFAULT_LOG_FILTER;

  let showForm = $state(false);

  // Bearbeiten-Kontext: null = Hinzufügen-Modus. Index-Adressierung (kein id, s. Kopf).
  let editing = $state<{ kind: TaskEntityKind; entityId: string; index: number } | null>(null);

  // Startwerte des Formulars — LogForm.svelte hält den Eingabe-Zustand selbst (Muster
  // wie TaskForm). Im Anlege-Modus die leere Vorbelegung (heutiges Datum).
  function emptyForm(): LogFormValues {
    return {
      date: new Date().toISOString().slice(0, 10),
      repoRef: '', sourceRef: '', query: '', result: 'pending', note: '', taskId: '',
      kind: 'person', entityId: '',
    };
  }
  let formInitial = $state<LogFormValues>(emptyForm());

  const allEntries = $derived(buildResearchTimeline(appState.db, appState.placeContext, scope));
  const filteredEntries = $derived(filterLogEntries(allEntries, log.filter));
  const groups = $derived(groupLogByEntity(filteredEntries));

  const FILTERS: { key: LogFilter; label: string }[] = [
    { key: 'all', label: 'Alle' },
    { key: 'found', label: 'Gefunden' },
    { key: 'partial', label: 'Teilweise' },
    { key: 'notfound', label: 'Nichts gefunden' },
    { key: 'pending', label: 'Ausstehend' },
  ];

  const activeFilterCount = $derived(
    countActiveFilters({ filter: log.filter }, { filter: DEFAULT_FILTER }),
  );

  function openAddForm() {
    editing = null;
    formInitial = emptyForm();
    showForm = true;
  }

  function openEditForm(row: LogEntryRow) {
    editing = { kind: row.kind, entityId: row.entityId, index: row.index };
    formInitial = { ...row.entry, kind: row.kind, entityId: row.entityId };
    showForm = true;
  }

  function closeForm() {
    showForm = false;
    editing = null;
  }

  function saveForm(values: LogFormValues) {
    const entry = makeLogEntry(values);
    if (editing) {
      appState.updateLogEntry(editing.kind, editing.entityId, editing.index, entry);
    } else {
      if (!values.entityId) return;
      appState.addLogEntry(values.kind, values.entityId, entry);
    }
    closeForm();
  }

  // Rückfrage vor dem Löschen (BL-351) — dieselbe Form wie am Steckbrief, wo derselbe
  // Eintrag ebenfalls löschbar ist: ein Eintrag darf nicht an zwei Stellen verschieden
  // verschwinden.
  let frage = $state<LogEntryRow | null>(null);

  function remove(row: LogEntryRow) {
    appState.deleteLogEntry(row.kind, row.entityId, row.index);
    frage = null;
  }

  function goToEntity(row: LogEntryRow) {
    if (row.kind === 'person') onNavigateToPerson?.(row.entityId);
    else onNavigateToFamily?.(row.entityId);
  }

  function repoName(repoId: string): string {
    return appState.db.repositories.get(repoId)?.name ?? repoId;
  }

  function exportMd() {
    const today = new Date().toLocaleDateString('de-DE');
    const md = exportLogMarkdown(appState.db, log.filter, today);
    const adapter = new AnchorDownloadAdapter();
    const dateSlug = new Date().toISOString().slice(0, 10);
    adapter.download(md, `forschungsprotokoll_${dateSlug}.md`, 'text/markdown;charset=utf-8');
  }
</script>

<div class="log-view">
  <div class="log-view__toolbar">
    <FilterBar activeCount={activeFilterCount}>
      <fieldset class="stb-filter-set">
        <legend>Ergebnis</legend>
        {#each FILTERS as f (f.key)}
          <label class="stb-filter-opt">
            <!-- `checked` + `onchange` statt `bind:group`: der Wert lebt außerhalb der
                 Komponente (BL-320). -->
            <input
              type="radio"
              value={f.key}
              checked={log.filter === f.key}
              onchange={() => (log.filter = f.key)}
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
        { id: 'grouped', label: '👤 Personen' },
        { id: 'timeline', label: '🕒 Timeline' },
      ]}
      value={logMode}
      onChange={(id) => route.setLogMode(id as 'grouped' | 'timeline')}
      ariaLabel="Protokoll-Ansicht wählen"
    />
    <button type="button" class="log-view__add-btn" onclick={openAddForm}>+ Eintrag</button>
  </div>

  {#if showForm}
    <LogForm {appState} initial={formInitial} isEditing={!!editing} onSubmit={saveForm} onCancel={closeForm} />
  {/if}

  {#snippet logRow(row: LogEntryRow)}
    <div
      class="log-view__row"
      class:log-view__row--found={row.entry.result === 'found'}
      class:log-view__row--partial={row.entry.result === 'partial'}
      class:log-view__row--notfound={row.entry.result === 'notfound'}
      class:log-view__row--pending={row.entry.result === 'pending'}
    >
      <div class="log-view__row-head">
        {#if logMode === 'timeline'}
          <button type="button" class="log-view__entity-link" onclick={() => goToEntity(row)}>{row.entityLabel} ›</button>
          {#if row.entitySummary}<span class="stb-entity-summary">{row.entitySummary}</span>{/if}
        {/if}
        <span class="log-view__row-date">{row.entry.date || '(kein Datum)'}</span>
        <span class="log-view__row-result log-view__row-result--{row.entry.result}">{resultLabel(row.entry.result)}</span>
      </div>
      <p class="log-view__row-query">{row.entry.query || '(kein Suchbegriff)'}</p>
      {#if linkedTaskText(appState.db, row)}<p class="log-view__row-task">🔗 aus Aufgabe: {linkedTaskText(appState.db, row)}</p>{/if}
      {#if row.entry.note}<p class="log-view__row-note">{row.entry.note}</p>{/if}
      <div class="log-view__row-meta">
        {#if row.entry.repoRef}<span class="stb-pill">{repoName(row.entry.repoRef)}</span>{/if}
        {#if row.entry.sourceRef}<span class="stb-pill">{sourceLabel(appState.db, row.entry.sourceRef)}</span>{/if}
      </div>
      <div class="log-view__row-actions">
        <button type="button" class="stb-icon-btn" onclick={() => openEditForm(row)} aria-label="Eintrag bearbeiten">✎</button>
        <button type="button" class="stb-icon-btn" data-variant="danger" onclick={() => (frage = row)} aria-label="Eintrag löschen">🗑</button>
      </div>
    </div>
  {/snippet}

  {#if filteredEntries.length === 0}
    <p class="log-view__empty">
      {log.filter === 'all' ? 'Keine Protokoll-Einträge vorhanden' : `Keine Einträge mit Ergebnis "${resultLabel(log.filter as LogResult)}"`}
    </p>
  {:else if logMode === 'timeline'}
    <div class="log-view__list">
      {#each filteredEntries as row (row.kind + row.entityId + row.index)}
        {@render logRow(row)}
      {/each}
    </div>
  {:else}
    <div class="log-view__list">
      {#each groups as group (group.kind + group.entityId)}
        <div class="log-view__group-head">
          <button type="button" class="log-view__entity-link" onclick={() => goToEntity(group.rows[0])}>{group.entityLabel} ›</button>
          {#if group.entitySummary}<span class="stb-entity-summary">{group.entitySummary}</span>{/if}
        </div>
        {#each group.rows as row (row.kind + row.entityId + row.index)}
          {@render logRow(row)}
        {/each}
      {/each}
    </div>
  {/if}
</div>


{#if frage}
  <ConfirmDialog
    titel="Protokolleintrag löschen?"
    text={`„${frage.entry.query || '(kein Suchbegriff)'}" geht mit allen Angaben verloren.`}
    onConfirm={() => frage && remove(frage)}
    onCancel={() => (frage = null)}
  />
{/if}

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
    align-items: center;
    padding: 0.5rem 0.75rem;
    background: var(--stb-surface-2);
    position: sticky;
    top: 0;
    z-index: 1;
  }

  /* Hauptaktion rechtsbündig, Filter links — EINE Zeile, zwei Elemente (INV-UI-11). */
  .log-view__add-btn {
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

  .log-view__empty {
    padding: 1.5rem;
    color: var(--stb-text-dim);
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

  /* „Teilweise": Fund, aber unvollständig — amber, zwischen Fund (grün) und nichts. */
  .log-view__row--partial {
    border-left: 3px solid var(--stb-quay-1);
  }

  /* „Nichts gefunden" — negativ (BL-208, ADR-v9-157): vervollständigt dieselbe
     Linksbalken-Kodierung auf alle vier LogResult-Zustände, statt nur found/partial zu
     signalisieren. Redundant zum Text-Label (resultLabel), kein zusätzliches Badge. */
  .log-view__row--notfound {
    border-left: 3px solid var(--stb-danger);
  }

  /* „Ausstehend" — neutral/gedämpft, klar unterscheidbar von "nichts gefunden" (Rot):
     kein Ergebnis liegt vor, kein Befund. */
  .log-view__row--pending {
    border-left: 3px solid var(--stb-text-dim);
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

  /* Das Ergebnis-Pill trägt die Farbe SELBST (Design-Kritik 2026-07-31): vorher lag das
     Signal allein auf dem 3px-Randstreifen am Kartenrand, während das neutrale Pill den
     Blick zog — Farbe und Bedeutung standen an zwei verschiedenen Stellen. Der Randstreifen
     bleibt als zweite, gröbere Spur beim Überfliegen der Liste. Die Schrift bleibt in jedem
     Fall lesbar (keine Farbe-allein-Bedeutung, Spec 21 §6i). */
  .log-view__row-result--found {
    color: var(--stb-quay-3);
    border-color: var(--stb-quay-3);
  }

  .log-view__row-result--partial {
    color: var(--stb-quay-1);
    border-color: var(--stb-quay-1);
  }

  .log-view__row-result--notfound {
    color: var(--stb-danger);
    border-color: var(--stb-danger);
  }

  .log-view__row-result--pending {
    color: var(--stb-text-dim);
    border-color: var(--stb-text-dim);
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

  /* BL-65 „⇄": Rückverweis auf die auslösende Aufgabe. */
  .log-view__row-task {
    margin: 0;
    color: var(--stb-text-muted);
    font-size: 0.75rem;
  }

  /* BL-56: Personen-Kopfzeile der gruppierten Ansicht. */
  .log-view__group-head {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.6rem 1rem 0.1rem;
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

  /* KEIN eigener Knopf-Stil mehr (BL-351): hier stand die dritte Kopie derselben
     lokalen Implementierung (transparent + gedimmt + 0,95rem) — also das, was
     `.stb-icon-btn` samt Trefferzone und Gefahren-Variante liefert. */
</style>
