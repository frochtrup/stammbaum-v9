<script lang="ts">
  // ui/views/hypotheses/HypothesisForm.svelte — Formular zum Anlegen/Bearbeiten einer
  // Hypothese (Spec 12 §4, Spec 20 §1.11d). Aus HypothesesView.svelte extrahiert (wie
  // TaskForm/LogForm) — das Formular ist die größte in sich geschlossene Einheit dieser
  // Ansicht (eigener Zustand inkl. Evidenz-Zeilen, ein Ausgang `onSubmit`).
  //
  // Es SPEICHERT NICHT selbst: `onSubmit` liefert die Werte, der Aufrufer entscheidet
  // zwischen appState.addHypothesis und appState.updateHypothesis (Chokepoint, Spec 02 §3).
  import type { AppState } from '../../shell/app-state.svelte';
  import { PLAIN_FIELD, PROSE_FIELD } from '../../shell/plain-input';
  import PersonPicker from '../../shell/PersonPicker.svelte';
  import FamilyPicker from '../../shell/FamilyPicker.svelte';
  import SourcePicker from '../../shell/SourcePicker.svelte';
  import type { EvidenceRef, HypothesisStatus, HypothesisWeight } from '../../../core/research/types';
  import type { TaskEntityKind } from '../tasks/tasks-model';
  import { formEscape, formSubmit } from '../../shell/form-keys';

  export interface HypothesisFormValues {
    text: string;
    status: HypothesisStatus;
    weight: HypothesisWeight;
    evidence: EvidenceRef[];
    rationale: string;
    conclusion: string;
    kind: TaskEntityKind;
    entityId: string;
  }

  interface Props {
    appState: AppState;
    initial: HypothesisFormValues;
    /** true = Bearbeiten (Titel + Kommando-Wahl beim Aufrufer). */
    isEditing: boolean;
    /**
     * Steht die Ziel-Entität schon fest? Dann entfällt der Entitäts-Picker (BL-341).
     *
     * Bis dahin beantwortete  BEIDE Fragen zugleich — Titel UND Zielwahl. Das
     * trug, solange Forschungseinträge ausschließlich in den drei Forschungsansichten
     * entstanden, wo man das Ziel erst wählen muss. Wer sie am Personen-/Familien-
     * Steckbrief anlegt, legt NEU an (kein Bearbeiten) und hat das Ziel trotzdem schon:
     * die Person, auf deren Seite er steht. Ohne die Trennung böte das Formular dort
     * einen Picker an, der nur wieder dasselbe auswählen könnte.
     *
     * Vorgabe  — für die drei Ansichten ändert sich damit nichts.
     */
    zielFest?: boolean;
    onSubmit: (values: HypothesisFormValues) => void;
    onCancel: () => void;
  }
  const { appState, initial, isEditing, zielFest = isEditing, onSubmit, onCancel }: Props = $props();

  // Arbeitskopie: einmal aus `initial` gelesen (analog TaskForm/LogForm).
  // svelte-ignore state_referenced_locally
  let text = $state(initial.text);
  // svelte-ignore state_referenced_locally
  let status = $state<HypothesisStatus>(initial.status);
  // svelte-ignore state_referenced_locally
  let weight = $state<HypothesisWeight>(initial.weight);
  // svelte-ignore state_referenced_locally
  let evidence = $state<EvidenceRef[]>(initial.evidence.map((e) => ({ ...e })));
  // svelte-ignore state_referenced_locally
  let rationale = $state(initial.rationale);
  // svelte-ignore state_referenced_locally
  let conclusion = $state(initial.conclusion);
  // svelte-ignore state_referenced_locally
  let kind = $state<TaskEntityKind>(initial.kind);
  // svelte-ignore state_referenced_locally
  let entityId = $state(initial.entityId);

  function addEvidenceRow() {
    evidence = [...evidence, { sourceId: '', page: '' }];
  }
  function removeEvidenceRow(index: number) {
    evidence = evidence.filter((_, i) => i !== index);
  }
  function setEvidenceSource(index: number, sourceId: string) {
    evidence = evidence.map((e, i) => (i === index ? { ...e, sourceId } : e));
  }
  function setEvidencePage(index: number, page: string) {
    evidence = evidence.map((e, i) => (i === index ? { ...e, page } : e));
  }

  function submit() {
    if (!text.trim()) return;
    onSubmit({
      text: text.trim(),
      status,
      weight,
      evidence: evidence.filter((e) => e.sourceId),
      rationale: rationale.trim(),
      conclusion: conclusion.trim(),
      kind,
      entityId,
    });
  }
</script>

<!-- Der Escape-Handler gehört der GANZEN Formularfläche, nicht einem einzelnen
     Feld (BL-276, `form-keys.ts`) — ein Rollen-Attribut daran wäre eine
     Falschaussage. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form class="hyp-form" onsubmit={formSubmit(submit)} onkeydown={formEscape(onCancel)}>
  <h3 class="hyp-form__title">{isEditing ? 'Hypothese bearbeiten' : 'Hypothese hinzufügen'}</h3>

  <label class="hyp-form__field">
    Behauptung
    <textarea {...PROSE_FIELD} bind:value={text} rows="2" placeholder="Was wird vermutet?" required></textarea>
  </label>

  <div class="hyp-form__row">
    <label class="hyp-form__field">
      Status
      <select value={status} onchange={(e) => (status = e.currentTarget.value as HypothesisStatus)} aria-label="Status">
        <option value="open">Offen</option>
        <option value="confirmed">Bestätigt</option>
        <option value="rejected">Verworfen</option>
      </select>
    </label>
    <label class="hyp-form__field">
      Konfidenz
      <select value={weight} onchange={(e) => (weight = e.currentTarget.value as HypothesisWeight)} aria-label="Konfidenz">
        <option value="low">Niedrig</option>
        <option value="medium">Mittel</option>
        <option value="high">Hoch</option>
      </select>
    </label>
  </div>

  <div class="hyp-form__evidence">
    <div class="hyp-form__evidence-head">
      <h5>Evidenz</h5>
      <button type="button" class="hyp-form__add-evidence-btn" onclick={addEvidenceRow}>+ Beleg hinzufügen</button>
    </div>
    {#each evidence as ev, i (i)}
      <div class="hyp-form__evidence-row">
        <SourcePicker {appState} value={ev.sourceId || null} onChange={(id) => setEvidenceSource(i, id ?? '')} label={`Evidenz-Quelle ${i + 1}`} />
        <input type="text" {...PLAIN_FIELD} placeholder="Seite" aria-label={`Evidenz-Seite ${i + 1}`} value={ev.page} onchange={(e) => setEvidencePage(i, (e.currentTarget as HTMLInputElement).value)} />
        <button type="button" class="hyp-form__remove-btn" onclick={() => removeEvidenceRow(i)} aria-label={`Beleg ${i + 1} entfernen`}>✕</button>
      </div>
    {/each}
  </div>

  <label class="hyp-form__field">
    Begründung
    <textarea {...PROSE_FIELD} bind:value={rationale} rows="3" placeholder="Beweisführung"></textarea>
  </label>

  <label class="hyp-form__field">
    Auflösungsnotiz
    <textarea {...PROSE_FIELD} bind:value={conclusion} rows="2" placeholder="Wie wurde die Hypothese geklärt?"></textarea>
  </label>

  {#if !zielFest}
    <fieldset class="hyp-form__field hyp-form__entity-picker">
      <legend>Ziel</legend>
      <div class="hyp-form__kind-toggle">
        <label>
          <input type="radio" name="hyp-kind" value="person" checked={kind === 'person'} onchange={() => { kind = 'person'; entityId = ''; }} />
          Person
        </label>
        <label>
          <input type="radio" name="hyp-kind" value="family" checked={kind === 'family'} onchange={() => { kind = 'family'; entityId = ''; }} />
          Familie
        </label>
      </div>
      {#if kind === 'person'}
        <PersonPicker {appState} value={entityId || null} onChange={(id) => (entityId = id ?? '')} label="Ziel-Person" placeholder="Person wählen…" />
      {:else}
        <FamilyPicker {appState} value={entityId || null} onChange={(id) => (entityId = id ?? '')} label="Ziel-Familie" placeholder="Familie wählen…" />
      {/if}
    </fieldset>
  {/if}

  <div class="hyp-form__actions">
    <button type="button" class="stb-btn" data-variant="secondary" onclick={onCancel}>Abbrechen</button>
    <button type="submit" class="stb-btn" data-variant="primary">Speichern</button>
  </div>
</form>

<style>
  .hyp-form {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.8rem 1rem;
    background: var(--stb-surface-1);
    border-bottom: 1px solid var(--stb-surface-3);
  }

  .hyp-form__title {
    margin: 0;
    font-size: 1rem;
    color: var(--stb-gold-light);
  }

  .hyp-form__row {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  .hyp-form__row .hyp-form__field {
    flex: 1 1 140px;
    min-width: 0;
  }

  .hyp-form__field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.82rem;
    color: var(--stb-text-dim);
  }

  .hyp-form__field select,
  .hyp-form__field textarea {
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.4rem 0.6rem;
    font-size: 0.9rem;
    font-family: inherit;
  }

  .hyp-form__evidence {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .hyp-form__evidence-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .hyp-form__evidence-head h5 {
    margin: 0;
    font-size: 0.82rem;
    color: var(--stb-text-dim);
  }

  .hyp-form__add-evidence-btn {
    background: var(--stb-surface-3);
    border: 1px solid var(--stb-gold-dim);
    color: var(--stb-text);
    border-radius: var(--stb-radius-control);
    padding: 0.2rem 0.5rem;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .hyp-form__evidence-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    align-items: center;
  }

  .hyp-form__evidence-row input {
    flex: 1;
    min-width: 0;
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.4rem;
    font-size: 0.85rem;
  }

  .hyp-form__remove-btn {
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
    font-size: 0.9rem;
    flex: 0 0 auto;
  }

  .hyp-form__entity-picker {
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-control);
    padding: 0.5rem;
  }

  .hyp-form__entity-picker legend {
    font-size: 0.78rem;
    color: var(--stb-gold-light);
    padding: 0 0.3rem;
  }

  .hyp-form__kind-toggle {
    display: flex;
    gap: 0.8rem;
    margin-bottom: 0.4rem;
    font-size: 0.85rem;
    color: var(--stb-text);
  }

  .hyp-form__actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }


</style>
