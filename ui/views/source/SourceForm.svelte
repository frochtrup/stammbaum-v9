<script lang="ts">
  // ui/views/source/SourceForm.svelte — Quellen-Editor (Spec 20 §2 Formular-Feldtabelle
  // "Quelle": Titel, Kurzname, Autor, Datum, Verlag, Archiv, Signatur, Notiz).
  //
  // Source ist ein FLACHES Modell (Spec 10 §4): date/text/… sind PLAIN STRINGS, keine
  // Event-Objekte — anders als PersonForm.svelte braucht es KEIN Dirty-Tracking/Tristate
  // fuer Datum/Ort. Einfache bind:value-Textfelder reichen (analog den Identitaetsfeldern
  // in PersonForm.svelte).
  //
  // Archiv (repo): Source.repo ist `RepoId | string` (Spec 10 §4) — entweder eine gueltige
  // @Rxx@-Referenz auf ein Repository ODER Legacy-Freitext (Roundtrip-Fidelity fuer Altbestand
  // ohne strukturiertes REPO, s. source-detail-model.ts `db.repositories.get(source.repo)`).
  // Das <select> bietet "— kein Archiv —" + alle bekannten Archive; ist der aktuelle Wert
  // ein Freitext (kein Treffer in appState.db.repositories), wird er als zusaetzliche,
  // vorausgewaehlte Option angehaengt, damit er beim OEFFNEN des Formulars nicht klammheimlich
  // verloren geht (er bleibt erhalten, bis der Nutzer aktiv ein anderes Archiv waehlt oder
  // "— kein Archiv —" waehlt). Ein durchsuchbarer Picker (wie PersonPicker) ist hier NICHT
  // gerechtfertigt (Spec-Auftrag: Archive sind eine Handvoll, keine hunderte Personen).
  import { untrack } from 'svelte';
  import type { AppState } from '../../shell/app-state.svelte';
  import type { Source } from '../../../core/model/types';

  interface Props {
    appState: AppState;
    /** Die zu bearbeitende Quelle (bereits existierend ODER frisch angelegtes Gerüst). */
    source: Source;
    /** Nach erfolgreichem Speichern (z. B. um zur Detailansicht zurückzukehren). */
    onSaved?: (sourceId: string) => void;
    /** Abbrechen ohne Speichern. */
    onCancel?: () => void;
  }
  const { appState, source, onSaved, onCancel }: Props = $props();

  // Formular-Zustand wird NUR beim Mount aus der übergebenen Source initialisiert
  // (untrack-Muster analog PersonForm.svelte/FamilyForm.svelte) — kein fortlaufendes
  // Re-Sync, falls appState.db sich während des Editierens ändert.
  let abbr = $state(untrack(() => source.abbr));
  let title = $state(untrack(() => source.title));
  let author = $state(untrack(() => source.author));
  let date = $state(untrack(() => source.date));
  let publisher = $state(untrack(() => source.publisher));
  let callNumber = $state(untrack(() => source.callNumber));
  let text = $state(untrack(() => source.text));

  const repositories = $derived(Array.from(appState.db.repositories.values()));

  /** Ist der aktuelle repo-Wert eine bekannte Repository-id? Wenn nicht (Freitext ODER
   *  leer), muss die Freitext-Option separat im <select> auftauchen, damit sie beim
   *  Öffnen nicht verschwindet (s. Kommentar oben). */
  const repoIsKnownId = $derived(source.repo !== '' && appState.db.repositories.has(source.repo));
  const repoIsFreetext = $derived(source.repo !== '' && !repoIsKnownId);

  let repo = $state(untrack(() => source.repo));

  function save() {
    const next: Source = {
      ...source,
      abbr: abbr.trim(),
      title: title.trim(),
      author: author.trim(),
      date: date.trim(),
      publisher: publisher.trim(),
      repo,
      callNumber: callNumber.trim(),
      text,
    };
    appState.saveSource(next);
    onSaved?.(next.id);
  }

  function cancel() {
    onCancel?.();
  }
</script>

<div class="source-form">
  <h3>{source.title || source.abbr ? 'Quelle bearbeiten' : 'Neue Quelle'}</h3>

  <div class="source-form__grid">
    <label>
      Titel
      <input type="text" bind:value={title} />
    </label>
    <label>
      Kurzname
      <input type="text" bind:value={abbr} />
    </label>
    <label>
      Autor
      <input type="text" bind:value={author} />
    </label>
    <label>
      Datum
      <input type="text" bind:value={date} />
    </label>
    <label>
      Verlag
      <input type="text" bind:value={publisher} />
    </label>
    <label>
      Signatur
      <input type="text" bind:value={callNumber} />
    </label>
    <label>
      Archiv
      <select value={repo} onchange={(e) => (repo = (e.currentTarget as HTMLSelectElement).value)}>
        <option value="">— kein Archiv —</option>
        {#if repoIsFreetext}
          <option value={source.repo}>{source.repo}</option>
        {/if}
        {#each repositories as r (r.id)}
          <option value={r.id}>{r.name || r.id}</option>
        {/each}
      </select>
    </label>
  </div>

  <label>
    Notiz
    <textarea bind:value={text}></textarea>
  </label>

  <div class="source-form__actions">
    <button type="button" class="source-form__save-btn" onclick={save}>Speichern</button>
    <button type="button" class="source-form__cancel-btn" onclick={cancel}>Abbrechen</button>
  </div>
</div>

<style>
  .source-form {
    padding: 1rem;
    overflow-y: auto;
    background: var(--stb-surface-1);
    border-radius: var(--stb-radius-card);
  }

  .source-form__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 0.5rem;
  }

  .source-form label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.8rem;
    color: var(--stb-text-dim);
    margin-top: 0.4rem;
  }

  .source-form input,
  .source-form select,
  .source-form textarea {
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.5rem;
    font: inherit;
  }

  .source-form__actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 1.25rem;
  }

  .source-form__save-btn,
  .source-form__cancel-btn {
    background: var(--stb-gold);
    color: var(--stb-bg);
    border: none;
    border-radius: var(--stb-radius-control);
    padding: 0.45rem 1rem;
    cursor: pointer;
    font-weight: 600;
  }

  .source-form__cancel-btn {
    background: var(--stb-surface-3);
    color: var(--stb-text);
  }
</style>
