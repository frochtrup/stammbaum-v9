<script lang="ts" generics="T">
  // ui/shell/Picker.svelte — entitätsagnostische Picker-Shell (ADR-v9-40, generalisiert
  // ADR-v9-30 Punkt 2/PersonPicker.svelte, INV-UI-4: EIN Muster für JEDE Referenz auf eine
  // wachsende Entitätenliste — Person, Familie, Quelle, Archiv, Ort, Hof — statt an jeder
  // Stelle unabhängig ein flaches <select> oder eine Text+<select>-Handkonstruktion neu
  // zu bauen, s. Entscheidungslog).
  //
  // Diese Shell kennt KEINE konkrete Entität — sie bekommt Kandidaten + Anzeige-/Match-
  // Funktionen als Props (`items`/`getId`/`getLabel`/`getSubLabel`/`matches`) und rendert
  // nur die Mechanik: geschlossenes Feld -> Klick öffnet Panel mit Suchfeld + gefilterter,
  // gekappter Ergebnisliste (MAX_VISIBLE_RESULTS, TST-7-Überlauf-Fall) + optionaler
  // "keine Auswahl"-Zeile (allowNone) + optionaler "+ neu anlegen"-Zeile (createLabel/
  // onCreateRequested) + Schließen-Button.
  //
  // Inline-Neuanlage bewusst NICHT hier: die eigentliche Formular-Komponente (PersonForm/
  // FamilyForm/SourceForm/RepositoryForm) kennt die Shell nicht — der jeweilige dünne
  // Wrapper (PersonPicker/SourcePicker/RepositoryPicker/FamilyPicker) hält sein eigenes
  // `creating`/`draft`-State, rendert bei `creating` sein Formular ANSTELLE dieser Shell
  // und ruft bei Klick auf "+ neu anlegen" nur `onCreateRequested` (schließt das Panel,
  // der Wrapper übernimmt danach). Für Ort/Hof (ADR-v9-13/28/29, kuratierte Auflösung,
  // keine blanke Neuanlage) bleiben `createLabel`/`onCreateRequested` einfach weg.
  //
  // Feld-Optik wiederverwendet `.stb-person-box`/`.stb-person-box__name`/`__meta`
  // (design-system.css) statt eigener Klassen (INV-UI-4) — das ist exakt der Stil, den
  // PersonPicker.svelte bisher als `.person-picker__field` dupliziert hatte.
  import { untrack } from 'svelte';

  interface Props {
    items: T[];
    getId: (item: T) => string;
    getLabel: (item: T) => string;
    getSubLabel?: (item: T) => string;
    /** Such-Matcher — bewusst als Prop, NICHT hier neu erfunden: jede Entität hat/
     *  bekommt ihre eigene `matchesSearch`-Funktion im jeweiligen list-model.ts. */
    matches: (item: T, query: string) => boolean;
    value: string | null;
    onChange: (id: string | null) => void;
    /** Erlaubt die explizite "kein(e) X"-Auswahl (z. B. Elternteil entfernen). Default false. */
    allowNone?: boolean;
    /** Beschriftung der "keine Auswahl"-Option, nur relevant wenn allowNone. */
    noneLabel?: string;
    /** Kandidaten, die NICHT angeboten werden (z. B. bereits zugeordnete Kinder). */
    excludeIds?: string[];
    /** Platzhaltertext, wenn nichts ausgewählt ist und allowNone=false. */
    placeholder?: string;
    /** Für Formular-Labels (aria-label auf dem Such-/Anzeigefeld). */
    label?: string;
    /** Beschriftung der "+ neu anlegen"-Zeile. Nur sichtbar, wenn auch onCreateRequested gesetzt ist. */
    createLabel?: string;
    /** Wird aufgerufen, wenn der Nutzer "+ neu anlegen" klickt (schließt das Panel selbst;
     *  der Aufrufer übernimmt danach die Anzeige seines Inline-Formulars). */
    onCreateRequested?: () => void;
    /** Mountet die Shell direkt im offenen Panel-Zustand statt hinter dem geschlossenen
     *  Feld-Button (ADR-v9-42: `EventPlaceField`/`EventAddrField` betten diese Shell selbst
     *  hinter einem eigenen Auslöse-Icon ein — ein zweiter Klick auf einen redundanten
     *  geschlossenen Zustand wäre unnötige Reibung). Nur beim Mount gelesen (jede
     *  Sichtbarkeits-Änderung des Aufrufers mountet eine frische Picker-Instanz über
     *  `{#if}`) — kein fortlaufendes Re-Sync nötig. Default false (bestehende Aufrufer
     *  unverändert). */
    startOpen?: boolean;
  }
  const {
    items,
    getId,
    getLabel,
    getSubLabel,
    matches,
    value,
    onChange,
    allowNone = false,
    noneLabel = '— keine Auswahl —',
    excludeIds = [],
    placeholder = 'Auswählen…',
    label = 'Auswahl',
    createLabel,
    onCreateRequested,
    startOpen = false,
  }: Props = $props();

  /** Ergebnisliste wird ab dieser Anzahl gekappt (TST-7 Kapazitäts-Fall). Ein Hinweistext
   *  zeigt an, dass weitere Treffer durch engeres Tippen erreichbar sind. */
  const MAX_VISIBLE_RESULTS = 25;

  // TST-10-Muster (32-Testframework.md §1): startOpen ist nur der Mount-Anfangswert einer
  // frisch instanziierten Picker-Instanz (der Aufrufer mountet über {#if}/{#each} neu,
  // s. EventPlaceField/EventAddrField) — kein fortlaufendes Re-Sync bei Prop-Änderung.
  let open = $state(untrack(() => startOpen));
  let query = $state('');

  const selectedItem = $derived<T | undefined>(
    value != null ? items.find((it) => getId(it) === value) : undefined,
  );

  const filteredAll = $derived.by<T[]>(() => {
    const excluded = new Set(excludeIds);
    const q = query.trim();
    const base = items.filter((it) => !excluded.has(getId(it)));
    return q ? base.filter((it) => matches(it, q)) : base;
  });

  const candidates = $derived.by<T[]>(() =>
    filteredAll
      .slice()
      .sort((a, b) => getLabel(a).localeCompare(getLabel(b), 'de'))
      .slice(0, MAX_VISIBLE_RESULTS),
  );

  const hiddenCount = $derived(Math.max(0, filteredAll.length - MAX_VISIBLE_RESULTS));

  const showCreateRow = $derived(!!createLabel && !!onCreateRequested);

  function openPicker() {
    open = true;
    query = '';
  }

  function closePicker() {
    open = false;
    query = '';
  }

  function select(id: string) {
    onChange(id);
    closePicker();
  }

  function selectNone() {
    onChange(null);
    closePicker();
  }

  function requestCreate() {
    closePicker();
    onCreateRequested?.();
  }
</script>

<div class="stb-picker">
  {#if !open}
    <button
      type="button"
      class="stb-person-box stb-picker__field"
      aria-label={label}
      onclick={openPicker}
    >
      {#if selectedItem}
        <span class="stb-person-box__name">{getLabel(selectedItem)}</span>
        {#if getSubLabel}
          <span class="stb-person-box__meta">{getSubLabel(selectedItem)}</span>
        {/if}
      {:else if value != null}
        <!-- value referenziert keinen Kandidaten aus `items` (z. B. Source.repo als
             Legacy-Freitext statt einer @Rxx@-Repository-id, Spec 10 §4/Roundtrip-
             Fidelity) — den Rohwert zeigen statt ihn stillschweigend wie "nichts
             ausgewählt" zu behandeln (TST-9: keine Information kommentarlos verlieren). -->
        <span class="stb-person-box__name">{value}</span>
      {:else if allowNone}
        <span class="stb-picker__placeholder">{noneLabel}</span>
      {:else}
        <span class="stb-picker__placeholder">{placeholder}</span>
      {/if}
    </button>
  {:else}
    <div class="stb-picker__panel">
      <input
        type="search"
        class="stb-picker__search"
        aria-label={`${label} durchsuchen`}
        placeholder="Eingeben zum Filtern…"
        bind:value={query}
      />
      <ul class="stb-picker__results">
        {#if allowNone}
          <li>
            <button type="button" class="stb-picker__result stb-picker__result--none" onclick={selectNone}>
              {noneLabel}
            </button>
          </li>
        {/if}
        {#if showCreateRow}
          <li>
            <button type="button" class="stb-picker__result stb-picker__result--create" onclick={requestCreate}>
              {createLabel}
            </button>
          </li>
        {/if}
        {#each candidates as item (getId(item))}
          <li>
            <button type="button" class="stb-picker__result" onclick={() => select(getId(item))}>
              <span class="stb-picker__result-name">{getLabel(item)}</span>
              {#if getSubLabel}
                <span class="stb-picker__result-meta">{getSubLabel(item)}</span>
              {/if}
            </button>
          </li>
        {/each}
        {#if candidates.length === 0}
          <li class="stb-picker__empty">Keine Treffer gefunden.</li>
        {/if}
        {#if hiddenCount > 0}
          <li class="stb-picker__more-hint">… {hiddenCount} weitere — enger tippen, um einzugrenzen.</li>
        {/if}
      </ul>
      <button type="button" class="stb-picker__close-btn" onclick={closePicker}>Schließen</button>
    </div>
  {/if}
</div>

<style>
  .stb-picker {
    position: relative;
    min-width: 200px;
  }

  .stb-picker__field {
    width: 100%;
  }

  .stb-picker__placeholder {
    color: var(--stb-text-dim);
  }

  .stb-picker__panel {
    background: var(--stb-surface-1);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-card);
    padding: 0.5rem;
  }

  .stb-picker__search {
    width: 100%;
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.5rem;
    font: inherit;
    margin-bottom: 0.4rem;
  }

  .stb-picker__results {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 16rem;
    overflow-y: auto;
  }

  .stb-picker__result {
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

  .stb-picker__result:hover,
  .stb-picker__result:focus-visible {
    background: var(--stb-surface-2);
  }

  .stb-picker__result-name {
    font-weight: 600;
  }

  .stb-picker__result-meta {
    font-size: 0.75rem;
    color: var(--stb-text-dim);
  }

  .stb-picker__result--none,
  .stb-picker__result--create {
    color: var(--stb-gold-light);
    font-weight: 600;
  }

  .stb-picker__empty,
  .stb-picker__more-hint {
    padding: 0.4rem 0.5rem;
    color: var(--stb-text-dim);
    font-size: 0.8rem;
  }

  .stb-picker__close-btn {
    margin-top: 0.4rem;
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
    font-size: 0.82rem;
  }
</style>
