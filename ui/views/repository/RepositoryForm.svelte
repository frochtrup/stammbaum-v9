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
  import { formEscape, formSubmit } from '../../shell/form-keys';

  interface Props {
    appState: AppState;
    /** Das zu bearbeitende Archiv (bereits existierend ODER frisch angelegtes Gerüst). */
    repository: Repository;
    /** Nach erfolgreichem Speichern (z. B. um zur Detailansicht zurückzukehren). */
    onSaved?: (repoId: string) => void;
    /**
     * NUR für den Wegwerf-Entwurf: setzt der Aufrufer diese Prop, ist das Formular eine
     * transiente ANLAGE-Fläche (Picker „+ neu anlegen") ohne eigenen Ausgang — dann
     * schließt der Sekundär-Knopf sie („Abbrechen"), und Feldwerte zu verwerfen wäre
     * dasselbe wie sie wegzuwerfen. Auf einer Detailseite bleibt sie WEG: dort trägt die
     * Kopfzeile den Ausgang, und der Knopf verwirft nur die Feldwerte („Verwerfen",
     * INV-UI-16/ADR-v9-193). Ein Knopf, der beides täte, war genau der behobene Defekt.
     */
    onCancel?: () => void;
  }
  const { appState, repository, onSaved, onCancel }: Props = $props();

  // Formular-Zustand wird NUR beim Mount initialisiert (untrack-Muster analog
  // PersonForm.svelte/SourceForm.svelte) — kein fortlaufendes Re-Sync.
  let name = $state(untrack(() => repository.name));
  let type = $state(untrack(() => repository.type));
  // `address` ist Tristate (BL-292): `null` = kein ADDR-Tag, `''` = Tag ohne Wert (der
  // Bestand trägt darunter `CITY`/`POST` als Passthrough). Das Feld kennt nur Text —
  // `adresseZurueck` beim Speichern führt es wieder zurück.
  let address = $state(untrack(() => repository.address ?? ''));
  let phone = $state(untrack(() => repository.phone));
  let www = $state(untrack(() => repository.www));
  let email = $state(untrack(() => repository.email));
  let findingAid = $state(untrack(() => repository.findingAid));


  /**
   * Setzt die Feldwerte auf den GESPEICHERTEN Stand zurück (INV-UI-16, BL-270/274).
   * Liest `repository` frisch statt eines Mount-Snapshots — daneben können sofort committende
   * Abschnitte den Datensatz geändert haben, und ein Verwerfen darf deren Ergebnis nicht
   * mitnehmen. Es schließt den Modus NICHT: das tut der Schalter, der ihn geöffnet hat.
   */
  function discard() {
    name = repository.name;
    type = repository.type;
    address = repository.address ?? '';
    phone = repository.phone;
    www = repository.www;
    email = repository.email;
    findingAid = repository.findingAid;
  }

  /** Ein leeres Feld heißt nicht „kein ADDR": war die Zeile schon vorher leer, bleibt sie —
   *  sonst risse ein Namens-Edit die strukturierte Adresse darunter mit. Erst das Löschen
   *  eines VORHANDENEN Werts entfernt die Zeile. Spiegel zu `addrZurueck` (event-edit.ts). */
  function adresseZurueck(vorher: string | null, feld: string): string | null {
    if (feld !== '') return feld;
    return vorher === '' ? '' : null;
  }

  function save() {
    const next: Repository = {
      ...repository,
      name: name.trim(),
      type: type.trim(),
      address: adresseZurueck(repository.address, address.trim()),
      phone: phone.trim(),
      www: www.trim(),
      email: email.trim(),
      findingAid: findingAid.trim(),
    };
    appState.saveRepository(next);
    onSaved?.(next.id);
  }
</script>

<!-- `<form>`, nicht `<div>` (BL-276, §6i): Enter speichert, Escape ruft denselben
     Sekundär-Ausgang wie der Knopf unten — Regel und Fallen in `form-keys.ts`. -->
<!-- Der Escape-Handler gehört der GANZEN Formularfläche, nicht einem einzelnen
     Feld (BL-276, `form-keys.ts`) — ein Rollen-Attribut daran wäre eine
     Falschaussage. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form class="repository-form" data-no-swipe onsubmit={formSubmit(save)} onkeydown={formEscape(onCancel ?? discard)}>
  <!-- Nur im ANLAGE-Fall (BL-274, §10e Redundanter Hero-Titel): auf der Detailseite steht
       der Name bereits in der Kopfzeile, die seit BL-274 im Bearbeiten-Modus stehen bleibt
       — „Archiv bearbeiten" wäre dort ein zweiter, ärmerer Titel. Im Picker-Entwurf gibt
       es keine Kopfzeile, dort trägt diese Zeile die Einordnung. -->
  {#if !repository.name}
    <h3>Neues Archiv</h3>
  {/if}

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
    <button type="submit" class="stb-btn" data-variant="primary">Speichern</button>
    {#if onCancel}
      <button type="button" class="stb-btn" data-variant="secondary" onclick={onCancel}>Abbrechen</button>
    {:else}
      <button type="button" class="stb-btn" data-variant="secondary" onclick={discard}>Verwerfen</button>
    {/if}
  </div>
</form>

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


</style>
