<script lang="ts">
  // ui/views/person/PersonAssociations.svelte — Assoziationen einer Person (Zeugen/Paten/
  // Informanten ohne Familienbindung, BL-127, Spec 20 §1.4 [S]). Geschwister von
  // PersonFamilies.svelte: eigene Datei, damit PersonDetail nicht weiter an die
  // max-lines-Ratsche wächst (BL-54).
  //
  // Kein neuer Mechanismus (INV-UI-4): Personenauswahl über den bestehenden PersonPicker,
  // Rollen-Auswahl über dieselbe Preset+Freitext-`<datalist>`-Mechanik wie die Aufgaben-
  // Kategorien (TaskForm.svelte `CATEGORY_PRESETS`), Rollen-Anzeige über `.stb-role-label`,
  // Zeilenform kompakt (INV-UI-5).
  //
  // Die Sektion bleibt AUCH leer sichtbar — anders als eine rein optionale Sektion
  // (Spec 21 §10f): sie trägt die einzige Affordanz zum Anlegen, ohne sie wäre die erste
  // Assoziation nicht erfassbar. Die „Keine X erfasst"-Zeile entfällt trotzdem, weil der
  // „+ Assoziation"-Knopf die Leere bereits ausspricht.
  import type { AppState } from '../../shell/app-state.svelte';
  import { PLAIN_FIELD } from '../../shell/plain-input';
  import type { AssociationRow, GodchildRow } from './person-detail-model';
  import PersonPicker from '../../shell/PersonPicker.svelte';
  import { tooltip } from '../../shell/tooltip';
  import { formEscape, formSubmit } from '../../shell/form-keys';

  interface Props {
    appState: AppState;
    rows: AssociationRow[];
    godchildren: GodchildRow[];
    /** Die betrachtete Person — sie taucht in ihrer eigenen Auswahl nicht auf. */
    selfId: string;
    onGoToPerson: (id: string) => void;
    onAdd: (personId: string, role: string, note: string) => void;
    onRemove: (index: number) => void;
  }
  const { appState, rows, godchildren, selfId, onGoToPerson, onAdd, onRemove }: Props = $props();

  // Freitext bleibt möglich — die Liste ist eine <datalist>-Hilfe, kein Enum (Spec 20 §1.4).
  const ROLE_PRESETS = ['Taufpate', 'Taufpatin', 'Zeuge', 'Zeugin', 'Informant', 'Freund', 'Freundin', 'Bekannte(r)'];

  let adding = $state(false);
  let pickedId = $state<string | null>(null);
  let role = $state('');
  let note = $state('');

  function reset() {
    adding = false;
    pickedId = null;
    role = '';
    note = '';
  }

  function submit() {
    if (!pickedId) return;
    onAdd(pickedId, role.trim(), note.trim());
    reset();
  }

  function remove(row: AssociationRow) {
    const wen = row.name || 'diesen Eintrag';
    if (!window.confirm(`Assoziation zu „${wen}" entfernen?`)) return;
    onRemove(row.index);
  }
</script>

<!-- „Personenbezüge" statt „Assoziationen": das Wort steht so in [20 §1.4] („sonstige
     Personenbezüge ohne Familienbindung") und benennt die Sache, statt sie zu latinisieren
     (Design-Kritik 2026-07-31). Der Code-Name bleibt `associations` — das ist der
     GEDCOM-Begriff. -->
<section class="person-detail__section person-assoc" class:person-assoc--empty={rows.length === 0 && godchildren.length === 0}>
  <h3>Personenbezüge <span class="person-assoc__subtitle">Paten · Zeugen · Informanten</span></h3>

  {#if rows.length > 0}
    <ul class="person-assoc__list">
      {#each rows as row (row.index)}
        <li class="person-assoc__row">
          {#if row.role}<span class="stb-role-label">{row.role}</span>{/if}
          {#if row.personId}
            <button type="button" class="person-assoc__link" onclick={() => onGoToPerson(row.personId!)}>
              {row.name}{#if row.summary}<span class="person-assoc__summary">({row.summary})</span>{/if}
            </button>
          {:else}
            <span
              class="person-assoc__unresolved"
              use:tooltip={'Die verknüpfte Person ist im geladenen Bestand nicht auffindbar.'}
            >{row.name}</span>
          {/if}
          {#if row.note}<span class="person-assoc__note">{row.note}</span>{/if}
          <button
            type="button"
            class="stb-icon-btn person-assoc__remove"
            data-variant="danger"
            onclick={() => remove(row)}
            aria-label="Assoziation entfernen"
            use:tooltip={'Entfernen'}
          >✕</button>
        </li>
      {/each}
    </ul>
  {/if}

  {#if adding}
    <!-- Der Escape-Handler gehört der GANZEN Formularfläche, nicht einem einzelnen
         Feld (BL-276, `form-keys.ts`) — ein Rollen-Attribut daran wäre eine
         Falschaussage. -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <form class="person-assoc__form" onsubmit={formSubmit(submit)} onkeydown={formEscape(reset)}>
      <div class="stb-field">
        <span class="stb-field__caption">Person</span>
        <PersonPicker
          {appState}
          value={pickedId}
          onChange={(id) => (pickedId = id)}
          excludeIds={[selfId]}
          label="Person der Assoziation"
          placeholder="Person wählen…"
        />
      </div>
      <label class="person-assoc__field">
        Rolle
        <input type="text" {...PLAIN_FIELD} bind:value={role} list="person-assoc-roles" placeholder="frei wählbar…" />
        <datalist id="person-assoc-roles">
          {#each ROLE_PRESETS as preset (preset)}
            <option value={preset}></option>
          {/each}
        </datalist>
      </label>
      <div class="person-assoc__chips">
        {#each ROLE_PRESETS as preset (preset)}
          <button type="button" class="person-assoc__chip" onclick={() => (role = preset)}>{preset}</button>
        {/each}
      </div>
      <label class="person-assoc__field">
        Notiz (optional)
        <input type="text" {...PLAIN_FIELD} bind:value={note} placeholder="z. B. Quelle der Angabe" />
      </label>
      <div class="person-assoc__actions">
        <button type="button" class="stb-btn" data-variant="secondary" onclick={reset}>Abbrechen</button>
        <button type="submit" class="stb-btn" data-variant="primary" disabled={!pickedId}>Hinzufügen</button>
      </div>
    </form>
  {:else}
    <div class="stb-activation-pill-row">
      <button type="button" class="stb-activation-pill" onclick={() => (adding = true)}>+ Assoziation</button>
    </div>
  {/if}

  {#if godchildren.length > 0}
    <!-- Berechnete Gegenrichtung (Spec 20 §1.4): die Wahrheit steht beim Patenkind, hier
         gibt es deshalb nichts zu entfernen — abgedunkelte, nur navigierbare Chips. -->
    <div class="person-assoc__godchildren">
      <span class="stb-role-label">Patenkinder</span>
      {#each godchildren as g (g.personId + g.role)}
        <button
          type="button"
          class="person-assoc__godchip"
          onclick={() => onGoToPerson(g.personId)}
          use:tooltip={`Eingetragen als „${g.role}" bei dieser Person`}
        >
          {g.name}{#if g.summary}<span class="person-assoc__summary">({g.summary})</span>{/if}
        </button>
      {/each}
    </div>
  {/if}
</section>

<style>
  /* Im Leerzustand zurückgenommen: die Sektion steht auf JEDER Person (der Bestand führt
     keine ASSO-Einträge), und eine Überschrift in „Familien"-Stärke für null Inhalt zog
     mehr Aufmerksamkeit als sie verdient (Design-Kritik 2026-07-31). Sie bleibt sichtbar —
     sie trägt die einzige Anlege-Affordanz —, aber leiser. */
  .person-assoc--empty :global(h3) {
    font-size: 0.95rem;
    color: var(--stb-text-dim);
  }

  .person-assoc__subtitle {
    font-family: var(--stb-font-body);
    font-size: 0.72rem;
    font-weight: 400;
    color: var(--stb-text-muted);
    text-transform: none;
    letter-spacing: 0;
    margin-left: 0.4rem;
  }

  .person-assoc__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  /* Kompakte Zeile (INV-UI-5): Rolle, Name, Notiz, ✕ in EINER Zeile, umbrechend. */
  .person-assoc__row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.4rem;
  }

  .person-assoc__link {
    background: transparent;
    border: none;
    padding: 0;
    color: var(--stb-gold-light);
    font-family: inherit;
    font-size: 0.95rem;
    cursor: pointer;
    text-align: left;
  }

  .person-assoc__link:hover,
  .person-assoc__link:focus-visible {
    text-decoration: underline;
  }

  .person-assoc__unresolved {
    color: var(--stb-text-muted);
    font-style: italic;
  }

  .person-assoc__summary {
    color: var(--stb-text-dim);
    font-size: 0.8rem;
    margin-left: 0.25rem;
  }

  .person-assoc__note {
    color: var(--stb-text-dim);
    font-size: 0.82rem;
  }

  .person-assoc__remove {
    margin-left: auto;
  }

  .person-assoc__form {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    background: var(--stb-surface-1);
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-control);
    padding: 0.6rem;
    margin-top: 0.4rem;
  }

  .person-assoc__field {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.78rem;
    color: var(--stb-text-dim);
  }

  .person-assoc__field input {
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.5rem;
    font-size: 0.9rem;
  }

  .person-assoc__chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .person-assoc__chip {
    background: var(--stb-surface-3);
    color: var(--stb-text-dim);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.2rem 0.5rem;
    font-size: 0.75rem;
    cursor: pointer;
    min-height: var(--stb-touch-target);
  }

  .person-assoc__actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }





  .person-assoc__godchildren {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.6rem;
  }

  /* Abgedunkelt: eine berechnete Rückverknüpfung, kein eigener Eintrag (Spec 20 §1.4). */
  .person-assoc__godchip {
    background: var(--stb-surface-2);
    color: var(--stb-text-dim);
    border: 1px dashed var(--stb-surface-3);
    border-radius: var(--stb-radius-control);
    padding: 0.2rem 0.5rem;
    font-size: 0.82rem;
    font-family: inherit;
    cursor: pointer;
  }

  .person-assoc__godchip:hover,
  .person-assoc__godchip:focus-visible {
    color: var(--stb-text);
    border-color: var(--stb-gold-dim);
  }
</style>
