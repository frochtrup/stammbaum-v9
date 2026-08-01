<script lang="ts">
  // ui/views/research-log/LogForm.svelte — Formular zum Anlegen/Bearbeiten eines
  // Protokoll-Eintrags (Spec 12 §2, Spec 20 §1.11b). Aus LogView.svelte extrahiert, als
  // diese mit BL-56 (Timeline-Umschalter) die max-lines-Ratsche (BL-54) riss — das
  // Formular ist die größte in sich geschlossene Einheit dieser Ansicht (eigener Zustand,
  // eigene Felder, ein Ausgang `onSubmit`), exakt das Muster von TaskForm.svelte.
  //
  // Es SPEICHERT NICHT selbst: `onSubmit` liefert die fertigen Werte, der Aufrufer
  // (LogView) entscheidet zwischen appState.addLogEntry und appState.updateLogEntry
  // (Kommando-Chokepoint, Spec 02 §3 — wie TaskForm/EventEditModal).
  import type { AppState } from '../../shell/app-state.svelte';
  import PersonPicker from '../../shell/PersonPicker.svelte';
  import FamilyPicker from '../../shell/FamilyPicker.svelte';
  import SourcePicker from '../../shell/SourcePicker.svelte';
  import RepositoryPicker from '../../shell/RepositoryPicker.svelte';
  import Picker from '../../shell/Picker.svelte';
  import type { LogResult } from '../../../core/research/types';
  import type { TaskEntityKind } from '../tasks/tasks-model';

  export interface LogFormValues {
    date: string;
    repoRef: string;
    sourceRef: string;
    query: string;
    result: LogResult;
    note: string;
    taskId: string;
    kind: TaskEntityKind;
    entityId: string;
  }

  interface Props {
    appState: AppState;
    /** Startwerte; im Anlege-Modus die (ggf. aus einer Aufgabe vorbelegte) Vorbelegung. */
    initial: LogFormValues;
    /** true = Bearbeiten (Ziel-Entität steht fest und wird nicht mehr angeboten). */
    isEditing: boolean;
    onSubmit: (values: LogFormValues) => void;
    onCancel: () => void;
  }
  const { appState, initial, isEditing, onSubmit, onCancel }: Props = $props();

  // Arbeitskopie: das Formular wird bei jedem Öffnen neu montiert, der Startwert wird
  // deshalb bewusst nur einmal gelesen (analog TaskForm.svelte).
  // svelte-ignore state_referenced_locally
  let date = $state(initial.date);
  // svelte-ignore state_referenced_locally
  let repoRef = $state(initial.repoRef);
  // svelte-ignore state_referenced_locally
  let sourceRef = $state(initial.sourceRef);
  // svelte-ignore state_referenced_locally
  let query = $state(initial.query);
  // svelte-ignore state_referenced_locally
  let result = $state<LogResult>(initial.result);
  // svelte-ignore state_referenced_locally
  let note = $state(initial.note);
  // svelte-ignore state_referenced_locally
  let taskId = $state(initial.taskId);
  // svelte-ignore state_referenced_locally
  let kind = $state<TaskEntityKind>(initial.kind);
  // svelte-ignore state_referenced_locally
  let entityId = $state(initial.entityId);

  // Offene Aufgaben derselben Zielentität (Aufgaben-Bezug-Picker) — erst sinnvoll, sobald
  // eine Zielentität gewählt ist.
  const targetTasks = $derived.by(() => {
    if (!entityId) return [];
    const owner = kind === 'person' ? appState.db.individuals.get(entityId) : appState.db.families.get(entityId);
    return owner ? owner.tasks.filter((t) => t.status !== 'done') : [];
  });

  function submit() {
    onSubmit({ date, repoRef, sourceRef, query: query.trim(), result, note: note.trim(), taskId, kind, entityId });
  }
</script>

<form class="log-form" onsubmit={(e) => { e.preventDefault(); submit(); }}>
  <h3 class="log-form__title">{isEditing ? 'Eintrag bearbeiten' : 'Eintrag hinzufügen'}</h3>

  <div class="log-form__row">
    <label class="log-form__field">
      Datum
      <input type="date" bind:value={date} />
    </label>
    <label class="log-form__field">
      Ergebnis
      <select value={result} onchange={(e) => (result = e.currentTarget.value as LogResult)} aria-label="Ergebnis">
        <option value="pending">Ausstehend</option>
        <option value="found">Gefunden</option>
        <option value="partial">Teilweise</option>
        <option value="notfound">Nichts gefunden</option>
      </select>
    </label>
  </div>

  <div class="log-form__field stb-field">
    <span class="stb-field__caption">Archiv</span>
    <RepositoryPicker {appState} value={repoRef || null} onChange={(id) => (repoRef = id ?? '')} allowNone={true} noneLabel="– kein Archiv –" label="Archiv" />
  </div>

  <div class="log-form__field stb-field">
    <span class="stb-field__caption">Quelle</span>
    <SourcePicker {appState} value={sourceRef || null} onChange={(id) => (sourceRef = id ?? '')} allowNone={true} noneLabel="– keine Quelle –" label="Quelle" />
  </div>

  <label class="log-form__field">
    Suchbegriff
    <input type="text" bind:value={query} placeholder="Wonach wurde gesucht?" />
  </label>

  <label class="log-form__field">
    Notiz
    <textarea bind:value={note} rows="2" placeholder="Ergebnis / Beobachtungen"></textarea>
  </label>

  {#if !isEditing}
    <fieldset class="log-form__field log-form__entity-picker">
      <legend>Ziel</legend>
      <div class="log-form__kind-toggle">
        <label>
          <input type="radio" name="log-kind" value="person" checked={kind === 'person'} onchange={() => { kind = 'person'; entityId = ''; taskId = ''; }} />
          Person
        </label>
        <label>
          <input type="radio" name="log-kind" value="family" checked={kind === 'family'} onchange={() => { kind = 'family'; entityId = ''; taskId = ''; }} />
          Familie
        </label>
      </div>
      {#if kind === 'person'}
        <PersonPicker {appState} value={entityId || null} onChange={(id) => { entityId = id ?? ''; taskId = ''; }} label="Ziel-Person" placeholder="Person wählen…" />
      {:else}
        <FamilyPicker {appState} value={entityId || null} onChange={(id) => { entityId = id ?? ''; taskId = ''; }} label="Ziel-Familie" placeholder="Familie wählen…" />
      {/if}
    </fieldset>
  {/if}

  {#if entityId}
    <div class="log-form__field stb-field">
      <span class="stb-field__caption">Aufgaben-Bezug (optional)</span>
      <Picker
        items={targetTasks}
        getId={(t) => t.id}
        getLabel={(t) => t.text}
        matches={(t, q) => t.text.toLowerCase().includes(q.trim().toLowerCase())}
        value={taskId || null}
        onChange={(id) => (taskId = id ?? '')}
        allowNone={true}
        noneLabel="– keine Aufgabe –"
        label="Aufgaben-Bezug"
        placeholder="Aufgabe wählen…"
      />
    </div>
  {/if}

  <div class="log-form__actions">
    <button type="button" class="stb-btn" data-variant="secondary" onclick={onCancel}>Abbrechen</button>
    <button type="submit" class="stb-btn" data-variant="primary">Speichern</button>
  </div>
</form>

<style>
  .log-form {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.8rem 1rem;
    background: var(--stb-surface-1);
    border-bottom: 1px solid var(--stb-surface-3);
  }

  .log-form__title {
    margin: 0;
    font-size: 1rem;
    color: var(--stb-gold-light);
  }

  .log-form__row {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  .log-form__row .log-form__field {
    flex: 1 1 140px;
    min-width: 0;
  }

  .log-form__field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.82rem;
    color: var(--stb-text-dim);
  }

  .log-form__field input[type='text'],
  .log-form__field input[type='date'],
  .log-form__field select,
  .log-form__field textarea {
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.4rem 0.6rem;
    font-size: 0.9rem;
    font-family: inherit;
  }

  .log-form__entity-picker {
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-control);
    padding: 0.5rem;
  }

  .log-form__entity-picker legend {
    font-size: 0.78rem;
    color: var(--stb-gold-light);
    padding: 0 0.3rem;
  }

  .log-form__kind-toggle {
    display: flex;
    gap: 0.8rem;
    margin-bottom: 0.4rem;
    font-size: 0.85rem;
    color: var(--stb-text);
  }

  .log-form__actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }


</style>
