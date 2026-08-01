<script lang="ts">
  // ui/shell/SourcePicker.svelte — durchsuchbares Quellen-Auswahlfeld (ADR-v9-40,
  // generalisiert ADR-v9-30 Punkt 2/PersonPicker.svelte, INV-UI-4, Spec 20 §2
  // "Entitäts-Picker"). Dünner Wrapper um die generische Shell `ui/shell/Picker.svelte` —
  // ersetzt JEDES flache Quellen-`<select>` (Zitat-Auswahl in Person-/Familien-
  // Ereignissen, Evidenz-Quelle bei Hypothesen, Quelle bei Aufgabe/Forschungsprotokoll).
  //
  // Wiederverwendung statt Neuerfindung: matchesSearch (source-list-model.ts, dieselbe
  // Match-Logik wie die globale Suche), allocatorFromDatabase/nextId (core/model/ids.ts)
  // + makeSource (core/model/factory.ts) für die ID-Vergabe (exakt das SourceList.svelte-
  // "＋ Neue Quelle"-Muster), und SourceForm.svelte selbst für die Inline-Neuanlage.
  import type { AppState } from './app-state.svelte';
  import type { Source, SourceId } from '../../core/model/types';
  import { makeSource, allocatorFromDatabase, nextId } from '../../core/model';
  import { matchesSearch } from '../views/source/source-list-model';
  import SourceForm from '../views/source/SourceForm.svelte';
  import Picker from './Picker.svelte';

  interface Props {
    appState: AppState;
    value: SourceId | null;
    onChange: (id: SourceId | null) => void;
    /** Erlaubt die explizite "keine Quelle"-Auswahl (z. B. optionaler Quellen-Bezug). Default false. */
    allowNone?: boolean;
    /** Beschriftung der "keine Auswahl"-Option, nur relevant wenn allowNone. */
    noneLabel?: string;
    /** Platzhaltertext, wenn nichts ausgewählt ist und allowNone=false. */
    placeholder?: string;
    /** Für Formular-Labels (aria-label auf dem Such-/Anzeigefeld). */
    label?: string;
    /** Mountet die Shell direkt offen (Picker.svelte's `startOpen`, wie PersonPicker) —
     *  für Aufrufer, die den Picker hinter einem eigenen "+"-Trigger einblenden. */
    startOpen?: boolean;
    /** Reicht Picker.svelte's `onClose` durch (Aufrufer blenden den Picker per `{#if}` ein). */
    onClose?: () => void;
  }
  const {
    appState,
    value,
    onChange,
    allowNone = false,
    noneLabel = '— keine Quelle —',
    placeholder = 'Quelle wählen…',
    label = 'Quelle auswählen',
    startOpen = false,
    onClose,
  }: Props = $props();

  const items = $derived(Array.from(appState.db.sources.values()));

  function getLabel(s: Source): string {
    return s.abbr || s.title || s.id;
  }

  function getSubLabel(s: Source): string {
    return [s.author, s.createdDate].filter(Boolean).join(' · ');
  }

  /** Frisches Quellen-Gerüst mit kollisionsfreier id — exakt das SourceList.svelte-Muster. */
  function draftSource(): Source {
    const alloc = allocatorFromDatabase(appState.db);
    const id = nextId(alloc, 'S');
    return makeSource(id);
  }

  let creating = $state(false);
  let draft = $state<Source | null>(null);

  function beginCreate() {
    draft = draftSource();
    creating = true;
  }

  function onSourceCreated(id: string) {
    creating = false;
    draft = null;
    onChange(id);
  }

  function cancelCreate() {
    creating = false;
    draft = null;
  }
</script>

<div class="source-picker">
  {#if creating && draft}
    <div class="source-picker__create">
      <SourceForm {appState} source={draft} onSaved={onSourceCreated} onCancel={cancelCreate} />
    </div>
  {:else}
    <Picker
      {items}
      getId={(s) => s.id}
      {getLabel}
      {getSubLabel}
      matches={matchesSearch}
      {value}
      {onChange}
      {allowNone}
      {noneLabel}
      {placeholder}
      {label}
      createLabel="+ Neue Quelle anlegen …"
      onCreateRequested={beginCreate}
      {startOpen}
      {onClose}
    />
  {/if}
</div>

<style>
  .source-picker {
    min-width: 200px;
  }

  .source-picker__create {
    background: var(--stb-surface-1);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-card);
  }
</style>
