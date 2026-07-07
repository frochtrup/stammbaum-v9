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
  import type { AppState } from '../../shell/app-state.svelte';
  import { displayName } from '../../shell/person-display';
  import { familyLabelFor } from '../source/family-label';
  import {
    collectAllHypotheses,
    filterHypotheses,
    statusLabel,
    weightLabel,
    type HypothesisFilter,
    type HypothesisEntry,
  } from './hypothesis-model';
  import { newHypothesisId } from './hypothesis-commands';
  import type { EvidenceRef, Hypothesis, HypothesisStatus, HypothesisWeight } from '../../../core/research/types';
  import type { TaskEntityKind } from '../tasks/tasks-model';

  interface Props {
    appState: AppState;
    onNavigateToPerson?: (id: string) => void;
    onNavigateToFamily?: (id: string) => void;
  }
  const { appState, onNavigateToPerson, onNavigateToFamily }: Props = $props();

  let filter = $state<HypothesisFilter>('all');
  let showForm = $state(false);

  // Bearbeiten-Kontext: null = Hinzufügen-Modus.
  let editing = $state<{ kind: TaskEntityKind; entityId: string; id: string } | null>(null);

  let formText = $state('');
  let formStatus = $state<HypothesisStatus>('open');
  let formWeight = $state<HypothesisWeight>('medium');
  let formEvidence = $state<EvidenceRef[]>([]);
  let formRationale = $state('');
  let formConclusion = $state('');
  let formKind = $state<TaskEntityKind>('person');
  let formEntityQuery = $state('');
  let formEntityId = $state('');

  const allEntries = $derived(collectAllHypotheses(appState.db));
  const filteredEntries = $derived(filterHypotheses(allEntries, filter));

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

  const FILTERS: { key: HypothesisFilter; label: string }[] = [
    { key: 'all', label: 'Alle' },
    { key: 'open', label: 'Offen' },
    { key: 'confirmed', label: 'Bestätigt' },
    { key: 'rejected', label: 'Verworfen' },
  ];

  function switchFilter(f: HypothesisFilter) {
    filter = f;
  }

  function resetForm() {
    formText = '';
    formStatus = 'open';
    formWeight = 'medium';
    formEvidence = [];
    formRationale = '';
    formConclusion = '';
    formKind = 'person';
    formEntityQuery = '';
    formEntityId = '';
  }

  function openAddForm() {
    editing = null;
    resetForm();
    showForm = true;
  }

  function openEditForm(entry: HypothesisEntry) {
    editing = { kind: entry.kind, entityId: entry.entityId, id: entry.hypothesis.id };
    formText = entry.hypothesis.text;
    formStatus = entry.hypothesis.status;
    formWeight = entry.hypothesis.weight;
    formEvidence = entry.hypothesis.evidence.map((e) => ({ ...e }));
    formRationale = entry.hypothesis.rationale;
    formConclusion = entry.hypothesis.conclusion;
    formKind = entry.kind;
    formEntityQuery = '';
    formEntityId = entry.entityId;
    showForm = true;
  }

  function closeForm() {
    showForm = false;
    editing = null;
  }

  function addEvidenceRow() {
    formEvidence = [...formEvidence, { sourceId: sources[0]?.id ?? '', page: '' }];
  }

  function removeEvidenceRow(index: number) {
    formEvidence = formEvidence.filter((_, i) => i !== index);
  }

  function setEvidenceSource(index: number, sourceId: string) {
    formEvidence = formEvidence.map((e, i) => (i === index ? { ...e, sourceId } : e));
  }

  function setEvidencePage(index: number, page: string) {
    formEvidence = formEvidence.map((e, i) => (i === index ? { ...e, page } : e));
  }

  const patch = (): Partial<Omit<Hypothesis, 'id'>> => ({
    text: formText.trim(),
    status: formStatus,
    weight: formWeight,
    evidence: formEvidence.filter((e) => e.sourceId),
    rationale: formRationale.trim(),
    conclusion: formConclusion.trim(),
  });

  function saveForm() {
    if (!formText.trim()) return;
    if (editing) {
      appState.updateHypothesis(editing.kind, editing.entityId, editing.id, patch());
    } else {
      if (!formEntityId) return;
      const today = new Date().toISOString().slice(0, 10);
      appState.addHypothesis(formKind, formEntityId, newHypothesisId(), patch(), today);
    }
    closeForm();
  }

  function remove(entry: HypothesisEntry) {
    appState.deleteHypothesis(entry.kind, entry.entityId, entry.hypothesis.id);
  }

  function goToEntity(entry: HypothesisEntry) {
    if (entry.kind === 'person') onNavigateToPerson?.(entry.entityId);
    else onNavigateToFamily?.(entry.entityId);
  }

  function sourceLabel(sourceId: string): string {
    const s = appState.db.sources.get(sourceId);
    return s ? s.abbr || s.title || s.id : sourceId;
  }
</script>

<div class="hyp-view">
  <div class="hyp-view__toolbar">
    <div class="hyp-view__filters stb-segment-row">
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
    <div class="hyp-view__actions">
      <button type="button" class="hyp-view__add-btn" onclick={openAddForm}>+ Hypothese</button>
    </div>
  </div>

  {#if showForm}
    <form class="hyp-view__form" onsubmit={(e) => { e.preventDefault(); saveForm(); }}>
      <h3 class="hyp-view__form-title">{editing ? 'Hypothese bearbeiten' : 'Hypothese hinzufügen'}</h3>

      <label class="hyp-view__form-field">
        Behauptung
        <textarea bind:value={formText} rows="2" placeholder="Was wird vermutet?" required></textarea>
      </label>

      <div class="hyp-view__form-row">
        <label class="hyp-view__form-field">
          Status
          <select
            value={formStatus}
            onchange={(e) => (formStatus = e.currentTarget.value as HypothesisStatus)}
            aria-label="Status"
          >
            <option value="open">Offen</option>
            <option value="confirmed">Bestätigt</option>
            <option value="rejected">Verworfen</option>
          </select>
        </label>
        <label class="hyp-view__form-field">
          Konfidenz
          <select
            value={formWeight}
            onchange={(e) => (formWeight = e.currentTarget.value as HypothesisWeight)}
            aria-label="Konfidenz"
          >
            <option value="low">Niedrig</option>
            <option value="medium">Mittel</option>
            <option value="high">Hoch</option>
          </select>
        </label>
      </div>

      <div class="hyp-view__evidence">
        <div class="hyp-view__evidence-head">
          <h5>Evidenz</h5>
          <button type="button" class="hyp-view__add-evidence-btn" onclick={addEvidenceRow} disabled={sources.length === 0}>
            + Beleg hinzufügen
          </button>
        </div>
        {#each formEvidence as ev, i (i)}
          <div class="hyp-view__evidence-row">
            <select
              aria-label={`Evidenz-Quelle ${i + 1}`}
              value={ev.sourceId}
              onchange={(e) => setEvidenceSource(i, (e.currentTarget as HTMLSelectElement).value)}
            >
              {#each sources as s (s.id)}
                <option value={s.id}>{s.abbr || s.title || s.id}</option>
              {/each}
            </select>
            <input
              type="text"
              placeholder="Seite"
              aria-label={`Evidenz-Seite ${i + 1}`}
              value={ev.page}
              onchange={(e) => setEvidencePage(i, (e.currentTarget as HTMLInputElement).value)}
            />
            <button type="button" class="hyp-view__remove-btn" onclick={() => removeEvidenceRow(i)} aria-label={`Beleg ${i + 1} entfernen`}>✕</button>
          </div>
        {/each}
      </div>

      <label class="hyp-view__form-field">
        Begründung
        <textarea bind:value={formRationale} rows="3" placeholder="Beweisführung"></textarea>
      </label>

      <label class="hyp-view__form-field">
        Auflösungsnotiz
        <textarea bind:value={formConclusion} rows="2" placeholder="Wie wurde die Hypothese geklärt?"></textarea>
      </label>

      {#if !editing}
        <fieldset class="hyp-view__form-field hyp-view__entity-picker">
          <legend>Ziel</legend>
          <div class="hyp-view__kind-toggle">
            <label>
              <input
                type="radio"
                name="hyp-kind"
                value="person"
                checked={formKind === 'person'}
                onchange={() => { formKind = 'person'; formEntityId = ''; }}
              />
              Person
            </label>
            <label>
              <input
                type="radio"
                name="hyp-kind"
                value="family"
                checked={formKind === 'family'}
                onchange={() => { formKind = 'family'; formEntityId = ''; }}
              />
              Familie
            </label>
          </div>
          <input type="search" placeholder="Suchen…" aria-label="Ziel-Entität durchsuchen" bind:value={formEntityQuery} />
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

      <div class="hyp-view__form-actions">
        <button type="button" class="hyp-view__form-cancel" onclick={closeForm}>Abbrechen</button>
        <button type="submit" class="hyp-view__form-save">Speichern</button>
      </div>
    </form>
  {/if}

  {#if filteredEntries.length === 0}
    <p class="hyp-view__empty">
      {filter === 'all' ? 'Keine Hypothesen vorhanden' : `Keine Hypothesen mit Status "${statusLabel(filter as HypothesisStatus)}"`}
    </p>
  {:else}
    <div class="hyp-view__list">
      {#each filteredEntries as entry (entry.kind + entry.entityId + entry.hypothesis.id)}
        <div class="hyp-view__row" class:hyp-view__row--confirmed={entry.hypothesis.status === 'confirmed'} class:hyp-view__row--rejected={entry.hypothesis.status === 'rejected'}>
          <div class="hyp-view__row-head">
            <button type="button" class="hyp-view__entity-link" onclick={() => goToEntity(entry)}>
              {entry.entityLabel} ›
            </button>
            <span class="hyp-view__row-status">{statusLabel(entry.hypothesis.status)}</span>
            <span class="hyp-view__row-weight">Konfidenz: {weightLabel(entry.hypothesis.weight)}</span>
          </div>
          <p class="hyp-view__row-text">{entry.hypothesis.text}</p>
          {#if entry.hypothesis.evidence.length > 0}
            <div class="hyp-view__row-meta">
              {#each entry.hypothesis.evidence as e (e.sourceId + e.page)}
                <span class="stb-pill">{sourceLabel(e.sourceId)}{e.page ? `, ${e.page}` : ''}</span>
              {/each}
            </div>
          {/if}
          {#if entry.hypothesis.rationale}<p class="hyp-view__row-rationale">{entry.hypothesis.rationale}</p>{/if}
          {#if entry.hypothesis.conclusion}<p class="hyp-view__row-conclusion">{entry.hypothesis.conclusion}</p>{/if}
          <div class="hyp-view__row-actions">
            <button type="button" class="hyp-view__row-btn" onclick={() => openEditForm(entry)} aria-label="Hypothese bearbeiten">✎</button>
            <button type="button" class="hyp-view__row-btn" onclick={() => remove(entry)} aria-label="Hypothese löschen">×</button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

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
    justify-content: space-between;
    align-items: center;
    padding: 0.15rem 0.25rem 0.5rem;
    background: var(--stb-surface-2);
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .hyp-view__filters {
    padding: 0.35rem 0.5rem;
  }

  .hyp-view__actions {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    padding-right: 0.75rem;
  }

  .hyp-view__add-btn {
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

  .hyp-view__form {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.8rem 1rem;
    background: var(--stb-surface-1);
    border-bottom: 1px solid var(--stb-surface-3);
  }

  .hyp-view__form-title {
    margin: 0;
    font-size: 1rem;
    color: var(--stb-gold-light);
  }

  .hyp-view__form-row {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  .hyp-view__form-row .hyp-view__form-field {
    flex: 1 1 140px;
    min-width: 0;
  }

  .hyp-view__form-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.82rem;
    color: var(--stb-text-dim);
  }

  .hyp-view__form-field input[type='search'],
  .hyp-view__form-field select,
  .hyp-view__form-field textarea {
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.4rem 0.6rem;
    font-size: 0.9rem;
    font-family: inherit;
  }

  .hyp-view__evidence {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .hyp-view__evidence-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .hyp-view__evidence-head h5 {
    margin: 0;
    font-size: 0.82rem;
    color: var(--stb-text-dim);
  }

  .hyp-view__add-evidence-btn {
    background: var(--stb-surface-3);
    border: 1px solid var(--stb-gold-dim);
    color: var(--stb-text);
    border-radius: var(--stb-radius-control);
    padding: 0.2rem 0.5rem;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .hyp-view__add-evidence-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .hyp-view__evidence-row {
    display: flex;
    gap: 0.3rem;
    align-items: center;
  }

  .hyp-view__evidence-row select {
    flex: 2;
    min-width: 0;
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.4rem;
    font-size: 0.85rem;
  }

  .hyp-view__evidence-row input {
    flex: 1;
    min-width: 0;
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.4rem;
    font-size: 0.85rem;
  }

  .hyp-view__remove-btn {
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
    font-size: 0.9rem;
    flex: 0 0 auto;
  }

  .hyp-view__entity-picker {
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-control);
    padding: 0.5rem;
  }

  .hyp-view__entity-picker legend {
    font-size: 0.78rem;
    color: var(--stb-gold-light);
    padding: 0 0.3rem;
  }

  .hyp-view__kind-toggle {
    display: flex;
    gap: 0.8rem;
    margin-bottom: 0.4rem;
    font-size: 0.85rem;
    color: var(--stb-text);
  }

  .hyp-view__entity-picker select {
    width: 100%;
    margin-top: 0.4rem;
  }

  .hyp-view__form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .hyp-view__form-cancel {
    background: transparent;
    border: 1px solid var(--stb-surface-3);
    color: var(--stb-text-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.8rem;
    cursor: pointer;
  }

  .hyp-view__form-save {
    background: var(--stb-gold);
    color: var(--stb-bg);
    border: none;
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.8rem;
    font-weight: 700;
    cursor: pointer;
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

  .hyp-view__row-btn {
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
    font-size: 0.95rem;
  }
</style>
