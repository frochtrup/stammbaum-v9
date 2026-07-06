<script lang="ts">
  // ui/shell/PersonPicker.svelte — durchsuchbares Personen-Auswahlfeld (ADR-v9-30 Punkt 2,
  // Spec 20 §2 "Personen-Picker": ersetzt ein flaches <select> über ALLE Personen, das ab
  // wenigen Dutzend Einträgen unpraktikabel wird). Geteiltes Struktureingabe-Element in
  // ui/shell/ (analog SourceBadge.svelte) — JEDE Person-Referenz in Formularen (Ehemann/
  // Ehefrau, Kind hinzufügen, künftig Assoziationen/Alias) nutzt DIESE eine Komponente,
  // kein zweiter Picker-Bau (INV-UI-4).
  //
  // Wiederverwendung statt Neuerfindung: matchesSearch (person-list-model.ts, dieselbe
  // Match-Logik wie die globale Suche), displayName/yearPlaceSummary (person-display.ts),
  // allocatorFromDatabase/nextId (core/model/ids.ts) + makePerson (core/model/factory.ts)
  // für die ID-Vergabe (exakt das PersonList.svelte-"＋ Neue Person"-Muster), und
  // PersonForm.svelte selbst für die Inline-Neuanlage (kein zweites Mini-Formular).
  //
  // KEIN MIN_QUERY_LENGTH wie bei der globalen Suche (global-search-model.ts): dort verhindert
  // die Mindestlänge einen App-weiten Full-Scan-Flacker bei jedem Tastendruck über potenziell
  // tausende Personen. Hier ist die Kandidatenmenge strukturell kleiner (eine Familie hat
  // typischerweise wenige relevante Personen) UND der Picker soll beim Öffnen (ohne Tippen)
  // bereits eine Vorschau/vollständige Liste zeigen können (Fokus-Vorschau) — eine erzwungene
  // Mindestlänge widerspräche genau diesem "sofort sehen, wen ich wählen kann"-Zweck. Bei sehr
  // großen Datenbanken (viele hundert Personen) rendert die Ergebnisliste ohnehin nur einen
  // begrenzten Ausschnitt (MAX_VISIBLE_RESULTS) statt aller Treffer.
  import type { AppState } from './app-state.svelte';
  import type { Person, PersonId } from '../../core/model/types';
  import { makePerson, allocatorFromDatabase, nextId } from '../../core/model';
  import { matchesSearch } from '../views/person/person-list-model';
  import { displayName, yearPlaceSummary } from './person-display';
  import PersonForm from '../views/person/PersonForm.svelte';

  interface Props {
    appState: AppState;
    value: PersonId | null;
    onChange: (id: PersonId | null) => void;
    /** Erlaubt die explizite "kein(e) X"-Auswahl (z. B. Elternteil entfernen). Default false. */
    allowNone?: boolean;
    /** Beschriftung der "keine Auswahl"-Option, nur relevant wenn allowNone. */
    noneLabel?: string;
    /** Personen, die als Kandidat NICHT angeboten werden (z. B. bereits zugeordnete Kinder). */
    excludeIds?: PersonId[];
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
    noneLabel = '— keine Auswahl —',
    excludeIds = [],
    placeholder = 'Person wählen…',
    label = 'Person auswählen',
  }: Props = $props();

  /** Ergebnisliste wird ab dieser Anzahl gekappt (TST-7 Kapazitäts-Fall: viele hundert
   *  Personen dürfen die Liste nicht unbegrenzt rendern). Ein Hinweistext zeigt an, dass
   *  weitere Treffer durch engeres Tippen erreichbar sind. */
  const MAX_VISIBLE_RESULTS = 25;

  let open = $state(false);
  let query = $state('');
  let creating = $state(false);

  const selectedPerson = $derived<Person | undefined>(value != null ? appState.db.individuals.get(value) : undefined);

  const candidates = $derived.by<Person[]>(() => {
    const excluded = new Set(excludeIds);
    const q = query.trim();
    const all = Array.from(appState.db.individuals.values()).filter((p) => !excluded.has(p.id));
    const filtered = q ? all.filter((p) => matchesSearch(p, q)) : all;
    return filtered
      .slice()
      .sort((a, b) => displayName(a).localeCompare(displayName(b), 'de'))
      .slice(0, MAX_VISIBLE_RESULTS);
  });

  const hiddenCount = $derived.by<number>(() => {
    const excluded = new Set(excludeIds);
    const q = query.trim();
    const all = Array.from(appState.db.individuals.values()).filter((p) => !excluded.has(p.id));
    const total = q ? all.filter((p) => matchesSearch(p, q)).length : all.length;
    return Math.max(0, total - MAX_VISIBLE_RESULTS);
  });

  function openPicker() {
    open = true;
    creating = false;
    query = '';
  }

  function closePicker() {
    open = false;
    creating = false;
    query = '';
  }

  function selectPerson(id: PersonId) {
    onChange(id);
    closePicker();
  }

  function selectNone() {
    onChange(null);
    closePicker();
  }

  /** Frisches Person-Gerüst mit kollisionsfreier id — exakt das PersonList.svelte-Muster
   *  ("＋ Neue Person": allocatorFromDatabase + nextId, kein Zufall/Wall-Clock, ADR-v9-11). */
  function draftPerson(): Person {
    const alloc = allocatorFromDatabase(appState.db);
    const id = nextId(alloc, 'I');
    return makePerson(id);
  }

  let draft = $state<Person | null>(null);

  function beginCreate() {
    draft = draftPerson();
    creating = true;
  }

  function onPersonCreated(id: string) {
    creating = false;
    draft = null;
    onChange(id);
    open = false;
    query = '';
  }

  function cancelCreate() {
    creating = false;
    draft = null;
  }
</script>

<div class="person-picker">
  {#if !open}
    <button
      type="button"
      class="person-picker__field"
      aria-label={label}
      onclick={openPicker}
    >
      {#if selectedPerson}
        <span class="person-picker__selected-name">{displayName(selectedPerson)}</span>
        <span class="person-picker__selected-meta">{yearPlaceSummary(selectedPerson.birth, appState.placeContext)}</span>
      {:else if allowNone}
        <span class="person-picker__placeholder">{noneLabel}</span>
      {:else}
        <span class="person-picker__placeholder">{placeholder}</span>
      {/if}
    </button>
  {:else if creating && draft}
    <div class="person-picker__create">
      <PersonForm {appState} person={draft} onSaved={onPersonCreated} onCancel={cancelCreate} />
    </div>
  {:else}
    <div class="person-picker__panel">
      <input
        type="search"
        class="person-picker__search"
        aria-label={`${label} durchsuchen`}
        placeholder="Name eingeben zum Filtern…"
        bind:value={query}
      />
      <ul class="person-picker__results">
        {#if allowNone}
          <li>
            <button type="button" class="person-picker__result person-picker__result--none" onclick={selectNone}>
              {noneLabel}
            </button>
          </li>
        {/if}
        <li>
          <button type="button" class="person-picker__result person-picker__result--create" onclick={beginCreate}>
            + Neue Person anlegen …
          </button>
        </li>
        {#each candidates as p (p.id)}
          <li>
            <button type="button" class="person-picker__result" onclick={() => selectPerson(p.id)}>
              <span class="person-picker__result-name">{displayName(p)}</span>
              <span class="person-picker__result-meta">{yearPlaceSummary(p.birth, appState.placeContext)}</span>
            </button>
          </li>
        {/each}
        {#if candidates.length === 0}
          <li class="person-picker__empty">Keine Personen gefunden.</li>
        {/if}
        {#if hiddenCount > 0}
          <li class="person-picker__more-hint">… {hiddenCount} weitere — enger tippen, um einzugrenzen.</li>
        {/if}
      </ul>
      <button type="button" class="person-picker__close-btn" onclick={closePicker}>Schließen</button>
    </div>
  {/if}
</div>

<style>
  .person-picker {
    position: relative;
    min-width: 200px;
  }

  .person-picker__field {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.5rem;
    cursor: pointer;
    text-align: left;
    font: inherit;
  }

  .person-picker__field:hover,
  .person-picker__field:focus-visible {
    border-color: var(--stb-gold);
  }

  .person-picker__selected-name {
    font-weight: 600;
  }

  .person-picker__selected-meta {
    font-size: 0.75rem;
    color: var(--stb-text-dim);
  }

  .person-picker__placeholder {
    color: var(--stb-text-dim);
  }

  .person-picker__panel {
    background: var(--stb-surface-1);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-card);
    padding: 0.5rem;
  }

  .person-picker__search {
    width: 100%;
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.5rem;
    font: inherit;
    margin-bottom: 0.4rem;
  }

  .person-picker__results {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 16rem;
    overflow-y: auto;
  }

  .person-picker__result {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--stb-surface-2);
    padding: 0.4rem 0.5rem;
    text-align: left;
    cursor: pointer;
    color: var(--stb-text);
    font: inherit;
  }

  .person-picker__result:hover,
  .person-picker__result:focus-visible {
    background: var(--stb-surface-2);
  }

  .person-picker__result-name {
    font-weight: 600;
  }

  .person-picker__result-meta {
    font-size: 0.75rem;
    color: var(--stb-text-dim);
  }

  .person-picker__result--none,
  .person-picker__result--create {
    color: var(--stb-gold-light);
    font-weight: 600;
  }

  .person-picker__empty,
  .person-picker__more-hint {
    padding: 0.4rem 0.5rem;
    color: var(--stb-text-dim);
    font-size: 0.8rem;
  }

  .person-picker__close-btn {
    margin-top: 0.4rem;
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
    font-size: 0.82rem;
  }

  .person-picker__create {
    background: var(--stb-surface-1);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-card);
  }
</style>
