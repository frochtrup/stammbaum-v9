<script lang="ts">
  // ui/shell/FamilyPicker.svelte — durchsuchbares Familien-Auswahlfeld (ADR-v9-40,
  // generalisiert ADR-v9-30 Punkt 2/PersonPicker.svelte, INV-UI-4, Spec 20 §2
  // "Entitäts-Picker"). Dünner Wrapper um die generische Shell `ui/shell/Picker.svelte` —
  // ersetzt die hand-gebaute "Textfeld + gefiltertes <select>"-Zielentität-Auswahl bei
  // Aufgabe/Forschungsprotokoll/Hypothese, wenn die Zielentität eine Familie ist.
  //
  // Wiederverwendung statt Neuerfindung: matchesSearch(db, f, query) (family-list-
  // model.ts, dieselbe Match-Logik wie die globale Suche), familyLabelFor (source/
  // family-label.ts — bewusst NICHT verschoben, s. Auftrag), allocatorFromDatabase/
  // nextId (core/model/ids.ts) + makeFamily (core/model/factory.ts) für die ID-Vergabe
  // (exakt das FamilyList.svelte-"＋ Neue Familie"-Muster), und FamilyForm.svelte selbst
  // für die Inline-Neuanlage.
  import type { AppState } from './app-state.svelte';
  import type { Family, FamilyId } from '../../core/model/types';
  import { makeFamily, allocatorFromDatabase, nextId } from '../../core/model';
  import { matchesSearch } from '../views/family/family-list-model';
  import { familyLabelFor } from '../views/source/family-label';
  import FamilyForm from '../views/family/FamilyForm.svelte';
  import Picker from './Picker.svelte';

  interface Props {
    appState: AppState;
    value: FamilyId | null;
    onChange: (id: FamilyId | null) => void;
    /** Erlaubt die explizite "keine Familie"-Auswahl. Default false. */
    allowNone?: boolean;
    /** Beschriftung der "keine Auswahl"-Option, nur relevant wenn allowNone. */
    noneLabel?: string;
    /** Platzhaltertext, wenn nichts ausgewählt ist und allowNone=false. */
    placeholder?: string;
    /** Für Formular-Labels (aria-label auf dem Such-/Anzeigefeld). */
    label?: string;
  }
  const {
    appState,
    value,
    onChange,
    allowNone = false,
    noneLabel = '— keine Familie —',
    placeholder = 'Familie wählen…',
    label = 'Familie auswählen',
  }: Props = $props();

  const items = $derived(Array.from(appState.db.families.values()));

  function getLabel(f: Family): string {
    return familyLabelFor(appState.db, f.id);
  }

  function matches(f: Family, query: string): boolean {
    return matchesSearch(appState.db, f, query);
  }

  /** Frisches Familien-Gerüst mit kollisionsfreier id — exakt das FamilyList.svelte-Muster. */
  function draftFamily(): Family {
    const alloc = allocatorFromDatabase(appState.db);
    const id = nextId(alloc, 'F');
    return makeFamily(id);
  }

  let creating = $state(false);
  let draft = $state<Family | null>(null);

  function beginCreate() {
    draft = draftFamily();
    creating = true;
  }

  function onFamilyCreated(id: string) {
    creating = false;
    draft = null;
    onChange(id);
  }

  function cancelCreate() {
    creating = false;
    draft = null;
  }
</script>

<div class="family-picker">
  {#if creating && draft}
    <div class="family-picker__create">
      <FamilyForm {appState} family={draft} onSaved={onFamilyCreated} onCancel={cancelCreate} />
    </div>
  {:else}
    <Picker
      {items}
      getId={(f) => f.id}
      {getLabel}
      {matches}
      {value}
      {onChange}
      {allowNone}
      {noneLabel}
      {placeholder}
      {label}
      createLabel="+ Neue Familie anlegen …"
      onCreateRequested={beginCreate}
    />
  {/if}
</div>

<style>
  .family-picker {
    min-width: 200px;
  }

  .family-picker__create {
    background: var(--stb-surface-1);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-card);
  }
</style>
