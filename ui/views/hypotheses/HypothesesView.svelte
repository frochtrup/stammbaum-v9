<script lang="ts">
  // ui/views/hypotheses/HypothesesView.svelte — globaler Hypothesen-Tab (Spec 12 §4,
  // Spec 20 §1.11 [S] "Hypothesen (GPS)"). Stil-Vorbild: ui/views/tasks/TasksView.svelte
  // (Filter, globale Liste, Formular) — KEIN Markdown-Export (Spec verlangt es hier
  // nicht, im Gegensatz zu Log, Spec 12 §4/Auftrag).
  //
  // Evidenz-Liste (sourceId+page, INV-H2): +/×-Zeilen analog den Citation-Listen in
  // PersonForm.svelte (addCitation/removeCitation-Muster) — die UI baut das finale
  // evidence[]-Array selbst zusammen und übergibt es beim Speichern als vollständiges
  // Patch-Objekt (Kommando-Muster "vollständige Objekte", nicht Feld-für-Feld-Setter).
  //
  // Befehlsflächen-Budget (INV-UI-11, Spec 21 §6h): EINE Toolbar-Zeile mit zwei
  // Elementen — [Filter · N] [+ Hypothese]; die vierstufige Status-Auswahl liegt hinter
  // `FilterBar` statt als Dauer-Pillenreihe (Zuordnungsregel "Filter → immer hinter
  // FilterBar, nie als Dauer-Pillenreihe mit mehr als einem sichtbaren Element").
  import type { AppState } from '../../shell/app-state.svelte';
  import HypothesisForm, { type HypothesisFormValues } from './HypothesisForm.svelte';
  import FilterBar from '../../shell/FilterBar.svelte';
  import ConfirmDialog from '../../shell/ConfirmDialog.svelte';
  import { untrack } from 'svelte';
  import { countActiveFilters } from '../../shell/count-active-filters';
  import { sourceLabel } from '../../shell/source-label';
  import { PLAIN_FIELD } from '../../shell/plain-input';
  import type { PersonId } from '../../../core/model/types';
  import {
    createHypothesesViewState,
    DEFAULT_HYPO_FILTER,
    type HypothesesViewState,
  } from '../research-segment-state.svelte';
  import {
    collectAllHypotheses,
    filterHypotheses,
    matchesHypothesisQuery,
    statusLabel,
    weightLabel,
    type HypothesisFilter,
    type HypothesisEntry,
  } from './hypothesis-model';
  import { newHypothesisId } from './hypothesis-commands';
  import type { HypothesisStatus, ProjectScope } from '../../../core/research/types';
  import type { TaskEntityKind } from '../tasks/tasks-model';

  interface Props {
    appState: AppState;
    onNavigateToPerson?: (id: string) => void;
    onNavigateToFamily?: (id: string) => void;
    /** Aktiver Projekt-Scope (BL-58) — null = keine Einschränkung. */
    scope?: ProjectScope | null;
    /** Personenmenge der Verwandtschafts-Relevanz (BL-375) — `null` = keine
     *  Einschränkung; EINMAL auf der Umbrella-Ebene gerechnet (Spec 20 §1.11i). */
    allowed?: ReadonlySet<PersonId> | null;
    /**
     * Filterzustand von AUSSEN (BL-320): dieses Segment wird beim Wechsel des Nav-Ziels
     * abgebaut, ein gesetzter Filter war danach weg (Spec 21 §5).
     */
    hypotheses?: HypothesesViewState;
  }
  const {
    appState,
    onNavigateToPerson,
    onNavigateToFamily,
    scope = null,
    allowed = null,
    hypotheses: hypothesesProp,
  }: Props = $props();

  const hypotheses = untrack(() => hypothesesProp ?? createHypothesesViewState());

  /** Status-Auswahl. `all` ist der Default — davon abweichend zeigt FilterBar "· 1". */
  const DEFAULT_FILTER = DEFAULT_HYPO_FILTER;

  let showForm = $state(false);

  // Bearbeiten-Kontext: null = Hinzufügen-Modus.
  let editing = $state<{ kind: TaskEntityKind; entityId: string; id: string } | null>(null);

  // Startwerte des Formulars — HypothesisForm.svelte hält den Eingabe-Zustand selbst.
  function emptyForm(): HypothesisFormValues {
    return { text: '', status: 'open', weight: 'medium', evidence: [], rationale: '', conclusion: '', kind: 'person', entityId: '' };
  }
  let formInitial = $state<HypothesisFormValues>(emptyForm());

  const allEntries = $derived(collectAllHypotheses(appState.db, appState.placeContext, scope, allowed));
  const filteredEntries = $derived(
    filterHypotheses(allEntries, hypotheses.filter).filter((e) =>
      matchesHypothesisQuery(e, hypotheses.query),
    ),
  );

  const FILTERS: { key: HypothesisFilter; label: string }[] = [
    { key: 'all', label: 'Alle' },
    { key: 'open', label: 'Offen' },
    { key: 'confirmed', label: 'Bestätigt' },
    { key: 'rejected', label: 'Verworfen' },
  ];

  const activeFilterCount = $derived(
    // Die Suchanfrage zählt MIT (BL-374): sie liegt hinter derselben Disclosure wie
    // der Status-Filter, und eine wirksame Einschränkung, die von außen kein Signal
    // gibt, ist unauffindbar — dieselbe Sorge wie beim Achtungs-Punkt (ADR-v9-148).
    countActiveFilters({ filter: hypotheses.filter, query: hypotheses.query }, { filter: DEFAULT_FILTER, query: '' }),
  );

  function openAddForm() {
    editing = null;
    formInitial = emptyForm();
    showForm = true;
  }

  function openEditForm(entry: HypothesisEntry) {
    editing = { kind: entry.kind, entityId: entry.entityId, id: entry.hypothesis.id };
    const h = entry.hypothesis;
    formInitial = {
      text: h.text, status: h.status, weight: h.weight, evidence: h.evidence.map((e) => ({ ...e })),
      rationale: h.rationale, conclusion: h.conclusion, kind: entry.kind, entityId: entry.entityId,
    };
    showForm = true;
  }

  function closeForm() {
    showForm = false;
    editing = null;
  }

  function saveForm(v: HypothesisFormValues) {
    const patch = { text: v.text, status: v.status, weight: v.weight, evidence: v.evidence, rationale: v.rationale, conclusion: v.conclusion };
    if (editing) {
      appState.updateHypothesis(editing.kind, editing.entityId, editing.id, patch);
    } else {
      if (!v.entityId) return;
      const today = new Date().toISOString().slice(0, 10);
      appState.addHypothesis(v.kind, v.entityId, newHypothesisId(), patch, today);
    }
    closeForm();
  }

  // Rückfrage vor dem Löschen (BL-351) — dieselbe Form wie am Steckbrief, wo dieselbe
  // Hypothese ebenfalls löschbar ist.
  let frage = $state<HypothesisEntry | null>(null);

  function remove(entry: HypothesisEntry) {
    appState.deleteHypothesis(entry.kind, entry.entityId, entry.hypothesis.id);
    frage = null;
  }

  function goToEntity(entry: HypothesisEntry) {
    if (entry.kind === 'person') onNavigateToPerson?.(entry.entityId);
    else onNavigateToFamily?.(entry.entityId);
  }

</script>

<div class="hyp-view">
  <div class="hyp-view__toolbar">
    <FilterBar activeCount={activeFilterCount}>
        <label class="stb-filter-search">
          <span>Suche</span>
          <span class="stb-research-search">
            <input
              type="search" {...PLAIN_FIELD}
              placeholder="Suche…"
              aria-label="Hypothesen durchsuchen"
              bind:value={hypotheses.query}
            />
            {#if hypotheses.query}
              <button type="button" aria-label="Suche löschen" onclick={() => (hypotheses.query = '')}>✕</button>
            {/if}
          </span>
        </label>
      <fieldset class="stb-filter-set">
        <legend>Status</legend>
        {#each FILTERS as f (f.key)}
          <label class="stb-filter-opt">
            <!-- `checked` + `onchange` statt `bind:group`: der Wert lebt außerhalb der
                 Komponente (BL-320). -->
            <input
              type="radio"
              value={f.key}
              checked={hypotheses.filter === f.key}
              onchange={() => (hypotheses.filter = f.key)}
            />
            {f.label}
          </label>
        {/each}
      </fieldset>
    </FilterBar>
    <button type="button" class="hyp-view__add-btn" onclick={openAddForm}>+ Hypothese</button>
  </div>

  {#if showForm}
    <HypothesisForm {appState} initial={formInitial} isEditing={!!editing} onSubmit={saveForm} onCancel={closeForm} />
  {/if}

  {#if filteredEntries.length === 0}
    <p class="hyp-view__empty">
      {hypotheses.filter === 'all' ? 'Keine Hypothesen vorhanden' : `Keine Hypothesen mit Status "${statusLabel(hypotheses.filter as HypothesisStatus)}"`}
    </p>
  {:else}
    <div class="hyp-view__list">
      {#each filteredEntries as entry (entry.kind + entry.entityId + entry.hypothesis.id)}
        <div class="hyp-view__row" class:hyp-view__row--confirmed={entry.hypothesis.status === 'confirmed'} class:hyp-view__row--rejected={entry.hypothesis.status === 'rejected'}>
          <div class="hyp-view__row-head">
            <button type="button" class="hyp-view__entity-link" onclick={() => goToEntity(entry)}>
              {entry.entityLabel} ›
            </button>
            {#if entry.entitySummary}<span class="stb-entity-summary">{entry.entitySummary}</span>{/if}
            <span class="hyp-view__row-status">{statusLabel(entry.hypothesis.status)}</span>
            <span class="hyp-view__row-weight"
              >Konfidenz: <span
                class="stb-tone-label stb-tone-label--{entry.hypothesis.weight}"
                >{weightLabel(entry.hypothesis.weight)}</span
              ></span
            >
          </div>
          <p class="hyp-view__row-text">{entry.hypothesis.text}</p>
          {#if entry.hypothesis.evidence.length > 0}
            <div class="hyp-view__row-meta">
              {#each entry.hypothesis.evidence as e (e.sourceId + e.page)}
                <span class="stb-pill">{sourceLabel(appState.db, e.sourceId)}{e.page ? `, ${e.page}` : ''}</span>
              {/each}
            </div>
          {/if}
          {#if entry.hypothesis.rationale}<p class="hyp-view__row-rationale">{entry.hypothesis.rationale}</p>{/if}
          {#if entry.hypothesis.conclusion}<p class="hyp-view__row-conclusion">{entry.hypothesis.conclusion}</p>{/if}
          <div class="hyp-view__row-actions">
            <button type="button" class="stb-icon-btn" onclick={() => openEditForm(entry)} aria-label="Hypothese bearbeiten">✎</button>
            <button type="button" class="stb-icon-btn" data-variant="danger" onclick={() => (frage = entry)} aria-label="Hypothese löschen">🗑</button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>


{#if frage}
  <ConfirmDialog
    titel="Hypothese löschen?"
    text={`„${frage.hypothesis.text}" geht mit Begründung, Belegen und Schluss verloren.`}
    onConfirm={() => frage && remove(frage)}
    onCancel={() => (frage = null)}
  />
{/if}

<style>
  .hyp-view {
    overflow-y: auto;
    height: 100%;
    display: flex;
    flex-direction: column;
  }



  .hyp-view__toolbar {
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
  .hyp-view__add-btn {
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

  .hyp-view__empty {
    padding: 1.5rem;
    color: var(--stb-text-dim);
  }

  .hyp-view__list {
    display: flex;
    flex-direction: column;
  }

  .hyp-view__row {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--stb-surface-2);
    position: relative;
  }

  .hyp-view__row--confirmed {
    border-left: 3px solid var(--stb-quay-3);
  }

  .hyp-view__row--rejected {
    border-left: 3px solid var(--stb-danger);
  }

  .hyp-view__row-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

  .hyp-view__entity-link {
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    font-size: 0.72rem;
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
  }

  .hyp-view__row-status {
    font-size: 0.72rem;
    color: var(--stb-gold-light);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.05em 0.4em;
  }

  .hyp-view__row-weight {
    font-size: 0.72rem;
    color: var(--stb-text-dim);
    /* Abstand zum folgenden ✎ — ohne ihn stießen „HOCH" und das Icon zusammen
       („Konfidenz: HOCH✎", Design-Kritik 2026-07-31). */
    margin-right: 0.35rem;
  }

  .hyp-view__row-text {
    margin: 0;
    font-weight: 600;
  }

  .hyp-view__row-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .hyp-view__row-rationale,
  .hyp-view__row-conclusion {
    margin: 0;
    color: var(--stb-text-dim);
    font-size: 0.85rem;
    white-space: pre-wrap;
  }

  .hyp-view__row-actions {
    display: flex;
    gap: 0.3rem;
    position: absolute;
    top: 0.5rem;
    right: 1rem;
  }

  /* KEIN eigener Knopf-Stil mehr (BL-351): hier stand eine weitere lokale
     Knopf-Implementierung (transparent + gedimmt + 0,95rem) — also das, was
     `.stb-icon-btn` samt Trefferzone und Gefahren-Variante ohnehin liefert. */
</style>
