<script lang="ts">
  // ui/shell/RepositoryPicker.svelte — durchsuchbares Archiv-Auswahlfeld (ADR-v9-40,
  // generalisiert ADR-v9-30 Punkt 2/PersonPicker.svelte, INV-UI-4, Spec 20 §1.6 [K]
  // "Archive (Repository): Picker", §2 "Entitäts-Picker"). Dünner Wrapper um die
  // generische Shell `ui/shell/Picker.svelte` — ersetzt das flache Archiv-`<select>` im
  // Quelle-Formular sowie Archiv-Referenzen im Forschungsprotokoll.
  //
  // Wiederverwendung statt Neuerfindung: matchesSearch (repository-list-model.ts, neu
  // ergänzt analog source-list-model.ts), allocatorFromDatabase/nextId (core/model/ids.ts)
  // + makeRepository (core/model/factory.ts) für die ID-Vergabe (exakt das
  // RepositoryList.svelte-"＋ Neues Archiv"-Muster), und RepositoryForm.svelte selbst
  // für die Inline-Neuanlage.
  import type { AppState } from './app-state.svelte';
  import type { Repository, RepoId } from '../../core/model/types';
  import { makeRepository, allocatorFromDatabase, nextId } from '../../core/model';
  import { matchesSearch } from '../views/repository/repository-list-model';
  import RepositoryForm from '../views/repository/RepositoryForm.svelte';
  import Picker from './Picker.svelte';
  import { repoTypeLabel } from './repo-labels';

  interface Props {
    appState: AppState;
    value: RepoId | null;
    onChange: (id: RepoId | null) => void;
    /** Erlaubt die explizite "kein Archiv"-Auswahl. Default false. */
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
    noneLabel = '— kein Archiv —',
    placeholder = 'Archiv wählen…',
    label = 'Archiv auswählen',
  }: Props = $props();

  const items = $derived(Array.from(appState.db.repositories.values()));

  function getLabel(r: Repository): string {
    return r.name || r.id;
  }

  function getSubLabel(r: Repository): string {
    // BL-203: deutsches Label, nie der rohe GRAMPS-Wert (dieselbe eine Quelle wie
    // Liste/Steckbrief) — `Unknown`/kein Typ liefert '' und fällt weg.
    return [repoTypeLabel(r.type), r.address].filter(Boolean).join(' · ');
  }

  /** Frisches Archiv-Gerüst mit kollisionsfreier id — exakt das RepositoryList.svelte-Muster. */
  function draftRepository(): Repository {
    const alloc = allocatorFromDatabase(appState.db);
    const id = nextId(alloc, 'R');
    return makeRepository(id);
  }

  let creating = $state(false);
  let draft = $state<Repository | null>(null);

  function beginCreate() {
    draft = draftRepository();
    creating = true;
  }

  function onRepositoryCreated(id: string) {
    creating = false;
    draft = null;
    onChange(id);
  }

  function cancelCreate() {
    creating = false;
    draft = null;
  }
</script>

<div class="repository-picker">
  {#if creating && draft}
    <div class="repository-picker__create">
      <RepositoryForm {appState} repository={draft} onSaved={onRepositoryCreated} onCancel={cancelCreate} />
    </div>
  {:else}
    <Picker
      {items}
      getId={(r) => r.id}
      {getLabel}
      {getSubLabel}
      matches={matchesSearch}
      {value}
      {onChange}
      {allowNone}
      {noneLabel}
      {placeholder}
      {label}
      createLabel="+ Neues Archiv anlegen …"
      onCreateRequested={beginCreate}
    />
  {/if}
</div>

<style>
  .repository-picker {
    min-width: 200px;
  }

  .repository-picker__create {
    background: var(--stb-surface-1);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-card);
  }
</style>
