<script lang="ts">
  // ui/views/repository/RepositoryForm.svelte — Archiv-Editor (Spec 20 §2 Formular-
  // Feldtabelle "Archiv": Name, Typ, Adresse, Telefon, Website, E-Mail, Findbuch-URL).
  //
  // Repository ist ein FLACHES Modell (Spec 10 §4) — reine bind:value-Textfelder,
  // kein Dirty-Tracking noetig (analog SourceForm.svelte).
  import { untrack } from 'svelte';
  import type { AppState } from '../../shell/app-state.svelte';
  import type { Repository } from '../../../core/model/types';
  import TypeSelect from '../../shell/TypeSelect.svelte';
  import { REPO_TYPE_OPTIONS } from '../../shell/repo-labels';

  interface Props {
    appState: AppState;
    /** Das zu bearbeitende Archiv (bereits existierend ODER frisch angelegtes Gerüst). */
    repository: Repository;
    /** Nach erfolgreichem Speichern (z. B. um zur Detailansicht zurückzukehren). */
    onSaved?: (repoId: string) => void;
    /** Abbrechen ohne Speichern. */
    onCancel?: () => void;
  }
  const { appState, repository, onSaved, onCancel }: Props = $props();

  // Formular-Zustand wird NUR beim Mount initialisiert (untrack-Muster analog
  // PersonForm.svelte/SourceForm.svelte) — kein fortlaufendes Re-Sync.
  let name = $state(untrack(() => repository.name));
  let type = $state(untrack(() => repository.type));
  let address = $state(untrack(() => repository.address));
  let phone = $state(untrack(() => repository.phone));
  let www = $state(untrack(() => repository.www));
  let email = $state(untrack(() => repository.email));
  let findingAid = $state(untrack(() => repository.findingAid));

  function save() {
    const next: Repository = {
      ...repository,
      name: name.trim(),
      type: type.trim(),
      address: address.trim(),
      phone: phone.trim(),
      www: www.trim(),
      email: email.trim(),
      findingAid: findingAid.trim(),
    };
    appState.saveRepository(next);
    onSaved?.(next.id);
  }

  function cancel() {
    onCancel?.();
  }
</script>

<div class="repository-form" data-no-swipe>
  <h3>{repository.name ? 'Archiv bearbeiten' : 'Neues Archiv'}</h3>

  <div class="repository-form__grid">
    <label>
      Name
      <input type="text" bind:value={name} />
    </label>
    <!-- BL-203: kuratiertes Vokabular statt Freitext. Die `stb-field`-Hülle statt eines
         <label>-Wrappers ist das etablierte Muster für zusammengesetzte Felder (TST-18) —
         die Beschriftung trägt die Caption, das Feld seinen `label`-Prop. -->
    <div class="stb-field">
      <span class="stb-field__caption">Typ</span>
      <TypeSelect value={type} options={REPO_TYPE_OPTIONS} onChange={(v) => (type = v)} label="Typ" />
    </div>
    <label>
      Adresse
      <input type="text" bind:value={address} />
    </label>
    <label>
      Telefon
      <input type="text" bind:value={phone} />
    </label>
    <label>
      Website
      <input type="url" bind:value={www} />
    </label>
    <label>
      E-Mail
      <input type="email" bind:value={email} />
    </label>
    <label>
      Findbuch-URL
      <input type="url" bind:value={findingAid} />
    </label>
  </div>

  <div class="repository-form__actions">
    <button type="button" class="repository-form__save-btn" onclick={save}>Speichern</button>
    <button type="button" class="repository-form__cancel-btn" onclick={cancel}>Abbrechen</button>
  </div>
</div>

<style>
  .repository-form {
    padding: 1rem;
    overflow-y: auto;
    background: var(--stb-surface-1);
    border-radius: var(--stb-radius-card);
  }

  .repository-form__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 0.5rem;
  }

  .repository-form label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.8rem;
    color: var(--stb-text-dim);
    margin-top: 0.4rem;
  }

  .repository-form input {
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.5rem;
    font: inherit;
  }

  .repository-form__actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 1.25rem;
  }

  .repository-form__save-btn,
  .repository-form__cancel-btn {
    background: var(--stb-gold);
    color: var(--stb-bg);
    border: none;
    border-radius: var(--stb-radius-control);
    padding: 0.45rem 1rem;
    cursor: pointer;
    font-weight: 600;
  }

  .repository-form__cancel-btn {
    background: var(--stb-surface-3);
    color: var(--stb-text);
  }
</style>
