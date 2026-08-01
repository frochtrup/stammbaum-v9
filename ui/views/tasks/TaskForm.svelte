<script lang="ts">
  // ui/views/tasks/TaskForm.svelte — Formular zum Anlegen/Bearbeiten einer Aufgabe
  // (Spec 20 §1.11 [K]). Extrahiert aus TasksView.svelte, als diese die max-lines-Ratsche
  // (BL-54) riss: das Formular ist die grösste in sich geschlossene Einheit dieser
  // Ansicht — eigener Zustand, eigene Felder, ein einziger Ausgang (`onSubmit`).
  //
  // Es SPEICHERT NICHT selbst: `onSubmit` liefert die fertigen Werte, der Aufrufer
  // entscheidet zwischen appState.addTask und appState.updateTask (Spec 02 §3
  // Kommando-Chokepoint — dasselbe Muster wie EventEditModal.svelte).
  //
  // Ziel-Entitäts-Auswahl per Radio + PersonPicker/FamilyPicker (ADR-v9-40, INV-UI-4 —
  // EIN Entitäts-Picker-Muster statt einer eigenen Text+<select>-Handkonstruktion).
  import type { AppState } from '../../shell/app-state.svelte';
  import PersonPicker from '../../shell/PersonPicker.svelte';
  import FamilyPicker from '../../shell/FamilyPicker.svelte';
  import SourcePicker from '../../shell/SourcePicker.svelte';
  import type { TaskEntityKind } from './tasks-model';
  import { SOURCE_TEMPLATES } from '../../../core/model';

  export interface TaskFormValues {
    text: string;
    category: string;
    sourceRef: string;
    kind: TaskEntityKind;
    entityId: string;
  }

  interface Props {
    appState: AppState;
    /** Startwerte; im Anlege-Modus die leere Vorbelegung. */
    initial: TaskFormValues;
    /** true = Bearbeiten (Ziel-Entität steht fest und wird nicht mehr angeboten). */
    isEditing: boolean;
    onSubmit: (values: TaskFormValues) => void;
    onCancel: () => void;
  }
  const { appState, initial, isEditing, onSubmit, onCancel }: Props = $props();

  // v8-Presets als Vorschläge: KEIN geschlossenes Enum — Freitext bleibt immer möglich,
  // die drei Labels sind nur eine <datalist>-Hilfe (Spec 12 §1 hält `category` frei).
  const CATEGORY_PRESETS = ['Kirchenbuch', 'Urkunde/Standesamt', 'Online-Recherche'];

  // Die <datalist> führt zusätzlich die Quellen-Vorlagen-Gattungen (BL-128), weil der
  // Forschungsschritt-Vorschlag (BL-228, ADR-v9-165) GENAU dieses Vokabular in
  // `category` schreibt. Ohne sie böte der Editor beim Nachbearbeiten einer so
  // angelegten Aufgabe lauter Werte an, die neben dem tatsächlich gesetzten stehen —
  // zwei Listen für dieselbe Frage (INV-UI-4 auf Datenebene). Die drei breiten Presets
  // bleiben als Chips, weil sie auch Nicht-Quellen-Arbeit abdecken („Online-Recherche").
  const CATEGORY_OPTIONS = [...CATEGORY_PRESETS, ...SOURCE_TEMPLATES.map((t) => t.label)];

  // Arbeitskopie: das Formular wird bei jedem Öffnen neu montiert, der Startwert wird
  // deshalb bewusst nur einmal gelesen (analog ValConfigSheet.svelte).
  // svelte-ignore state_referenced_locally
  let text = $state(initial.text);
  // svelte-ignore state_referenced_locally
  let category = $state(initial.category);
  // svelte-ignore state_referenced_locally
  let sourceRef = $state(initial.sourceRef);
  // svelte-ignore state_referenced_locally
  let kind = $state<TaskEntityKind>(initial.kind);
  // svelte-ignore state_referenced_locally
  let entityId = $state(initial.entityId);

  function submit() {
    if (!text.trim()) return;
    // Im Anlege-Modus ist die Zielentität Pflicht — ohne sie hätte die Aufgabe keinen
    // Träger und ginge beim Speichern still verloren.
    if (!isEditing && !entityId) return;
    onSubmit({ text, category, sourceRef, kind, entityId });
  }
</script>

<form class="task-form" onsubmit={(e) => { e.preventDefault(); submit(); }}>
  <h3 class="task-form__title">{isEditing ? 'Aufgabe bearbeiten' : 'Aufgabe hinzufügen'}</h3>

  <label class="task-form__field">
    Text
    <input type="text" bind:value={text} placeholder="Was ist zu tun?" required />
  </label>

  <label class="task-form__field">
    Kategorie
    <input type="text" bind:value={category} list="tasks-category-presets" placeholder="frei wählbar…" />
    <datalist id="tasks-category-presets">
      {#each CATEGORY_OPTIONS as preset (preset)}
        <option value={preset}></option>
      {/each}
    </datalist>
  </label>
  <div class="task-form__chips">
    {#each CATEGORY_PRESETS as preset (preset)}
      <button type="button" class="task-form__chip" onclick={() => (category = preset)}>{preset}</button>
    {/each}
  </div>

  <div class="task-form__field stb-field">
    <span class="stb-field__caption">Quelle (optional)</span>
    <SourcePicker
      {appState}
      value={sourceRef || null}
      onChange={(id) => (sourceRef = id ?? '')}
      allowNone={true}
      noneLabel="– keine Quelle –"
      label="Quelle"
    />
  </div>

  {#if !isEditing}
    <fieldset class="task-form__field task-form__entity-picker">
      <legend>Ziel</legend>
      <div class="task-form__kind-toggle">
        <label>
          <input
            type="radio"
            name="tasks-kind"
            value="person"
            checked={kind === 'person'}
            onchange={() => { kind = 'person'; entityId = ''; }}
          />
          Person
        </label>
        <label>
          <input
            type="radio"
            name="tasks-kind"
            value="family"
            checked={kind === 'family'}
            onchange={() => { kind = 'family'; entityId = ''; }}
          />
          Familie
        </label>
      </div>
      {#if kind === 'person'}
        <PersonPicker
          {appState}
          value={entityId || null}
          onChange={(id) => (entityId = id ?? '')}
          label="Ziel-Person"
          placeholder="Person wählen…"
        />
      {:else}
        <FamilyPicker
          {appState}
          value={entityId || null}
          onChange={(id) => (entityId = id ?? '')}
          label="Ziel-Familie"
          placeholder="Familie wählen…"
        />
      {/if}
    </fieldset>
  {/if}

  <div class="task-form__actions">
    <button type="button" class="task-form__cancel" onclick={onCancel}>Abbrechen</button>
    <button type="submit" class="task-form__save">Speichern</button>
  </div>
</form>

<style>
  .task-form {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.8rem 1rem;
    background: var(--stb-surface-1);
    border-bottom: 1px solid var(--stb-surface-3);
  }

  .task-form__title {
    margin: 0;
    font-size: 1rem;
    color: var(--stb-gold-light);
  }

  .task-form__field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.82rem;
    color: var(--stb-text-dim);
  }

  .task-form__field input[type='text'] {
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.4rem 0.6rem;
    font-size: 0.9rem;
    font-family: inherit;
  }

  .task-form__chips {
    display: flex;
    gap: 0.3rem;
    flex-wrap: wrap;
  }

  .task-form__chip {
    background: var(--stb-surface-3);
    color: var(--stb-text-dim);
    border: 1px solid var(--stb-gold-dim);
    border-radius: 999px;
    padding: 0.15rem 0.6rem;
    font-size: 0.72rem;
    cursor: pointer;
  }

  .task-form__entity-picker {
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-control);
    padding: 0.5rem;
  }

  .task-form__entity-picker legend {
    font-size: 0.78rem;
    color: var(--stb-gold-light);
    padding: 0 0.3rem;
  }

  .task-form__kind-toggle {
    display: flex;
    gap: 0.8rem;
    margin-bottom: 0.4rem;
    font-size: 0.85rem;
    color: var(--stb-text);
  }

  .task-form__actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .task-form__cancel {
    background: transparent;
    border: 1px solid var(--stb-surface-3);
    color: var(--stb-text-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.8rem;
    cursor: pointer;
  }

  .task-form__save {
    background: var(--stb-gold);
    color: var(--stb-bg);
    border: none;
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.8rem;
    font-weight: 700;
    cursor: pointer;
  }
</style>
