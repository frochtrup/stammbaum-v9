<script lang="ts" generics="T">
  // ui/shell/Picker.svelte — entitätsagnostische Picker-Shell (ADR-v9-40, generalisiert
  // ADR-v9-30 Punkt 2/PersonPicker.svelte, INV-UI-4: EIN Muster für JEDE Referenz auf eine
  // wachsende Entitätenliste — Person, Familie, Quelle, Archiv, Ort, Hof — statt an jeder
  // Stelle unabhängig ein flaches <select> oder eine Text+<select>-Handkonstruktion neu
  // zu bauen, s. Entscheidungslog).
  //
  // Diese Shell kennt KEINE konkrete Entität — sie bekommt Kandidaten + Anzeige-/Match-
  // Funktionen als Props (`items`/`getId`/`getLabel`/`getSubLabel`/`matches`) und rendert
  // nur die Mechanik.
  //
  // EIN Feld, kein zweites (ADR-v9-103, Nutzerbefund 2026-07-19: „der picker sollte direkt
  // im eingabefeld wirken"). Bis dahin war das Feld ein KNOPF, der ein Panel mit einem
  // ZWEITEN, eigenen Suchfeld aufklappte — eine bestehende Person/einen bestehenden Ort
  // zu wählen kostete damit Klick auf das Feld (bzw. auf eine 🔍-Lupe), Klick ins Suchfeld,
  // tippen, klicken. Jetzt ist das sichtbare Feld SELBST das Suchfeld (Combobox-Muster,
  // WAI-ARIA `combobox`+`listbox`): Fokus öffnet die Liste, Tippen filtert sie, ↓/↑/Enter/
  // Escape bedienen sie ohne Maus.
  //
  // Zwei Aufrufer-Arten, EIN Mechanismus (`freeText`):
  //  - Entitäts-Referenz (Person/Familie/Quelle/Archiv): gespeichert wird nur die id; das
  //    Feld zeigt das Label der Auswahl, beim Fokussieren wird es zum leeren Suchfeld und
  //    die bisherige Auswahl bleibt als Platzhalter sichtbar.
  //  - Freitext-Feld (Ereignis-Ort/-Adresse, `freeText`): der GETIPPTE TEXT ist der
  //    gespeicherte Wert (ADR-v9-42: „Freitext bleibt Freitext") und zugleich der
  //    Suchbegriff — jeder Tastendruck meldet `onTextChange`, eine Auswahl meldet
  //    zusätzlich `onChange(id)`. Ersetzt die vormalige Konstruktion aus Textfeld +
  //    🔍-Knopf + aufklappendem Panel mit eigenem Suchfeld in EventPlaceField/
  //    EventAddrField.
  //
  // Inline-Neuanlage bewusst NICHT hier: die eigentliche Formular-Komponente (PersonForm/
  // FamilyForm/SourceForm/RepositoryForm) kennt die Shell nicht — der jeweilige dünne
  // Wrapper (PersonPicker/SourcePicker/RepositoryPicker/FamilyPicker) hält sein eigenes
  // `creating`/`draft`-State, rendert bei `creating` sein Formular ANSTELLE dieser Shell
  // und ruft bei Klick auf "+ neu anlegen" nur `onCreateRequested` (schließt das Panel,
  // der Wrapper übernimmt danach). Für Ort/Hof (ADR-v9-13/28/29, kuratierte Auflösung,
  // keine blanke Neuanlage) bleiben `createLabel`/`onCreateRequested` einfach weg.
  //
  // Kein <label>-Wrapper um diese Komponente (TST-18, Lint-Gate in eslint.config.js): ein
  // <label> reicht jeden Klick in seinem Inneren an das zugehörige Feld weiter — seit die
  // Trefferliste INNERHALB der Komponente liegt, würde ein Klick auf einen Treffer damit
  // zusätzlich das Feld anklicken und die eben geschlossene Liste sofort wieder öffnen.
  // Ersatzmuster: `.stb-field` + `.stb-field__caption` (design-system.css).
  //
  // Die Trefferliste hängt per `use:anchoredTo` am <body>, nicht im eigenen Teilbaum
  // (INV-UI-13, [21 §6k]): jeder Aufrufer sitzt in einem Scroll-Container, der sie an
  // seiner Kante abschneidet. Gemessen an `FamilyDetail`s "Kind hinzufügen"-Picker
  // (1280×800): `.family-detail` (`overflow-y: auto`) endete bei y=333, das Panel reichte
  // bis 568 — sichtbar blieben 34 px, die erste Trefferzeile war angeschnitten, alle
  // weiteren unerreichbar. Derselbe Vorfahren-Typ, dieselbe Ursache wie beim Filter-Panel
  // (BL-85) und beim Ereignis-Menü; ein höherer z-index hilft dagegen nicht (ADR-v9-97).
  import { untrack } from 'svelte';
  import { anchoredTo } from './portal';

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
    excludeIds?: readonly string[];
    /** Platzhaltertext, wenn nichts ausgewählt ist und allowNone=false. */
    placeholder?: string;
    /** Für Formular-Labels (aria-label auf dem Such-/Anzeigefeld). */
    label?: string;
    /** Beschriftung der "+ neu anlegen"-Zeile. Nur sichtbar, wenn auch onCreateRequested gesetzt ist. */
    createLabel?: string;
    /** Wird aufgerufen, wenn der Nutzer "+ neu anlegen" klickt (schließt das Panel selbst;
     *  der Aufrufer übernimmt danach die Anzeige seines Inline-Formulars). */
    onCreateRequested?: () => void;
    /** Mountet die Shell mit bereits offener Trefferliste — für Aufrufer, die den Picker
     *  selbst hinter einem eigenen Auslöser einblenden (MapLensView/TimelineLensView:
     *  „⊕ Person hinzufügen" mountet ihn über `{#if}`), sodass die Liste ohne weiteren
     *  Klick dasteht. Nur beim Mount gelesen (jede Sichtbarkeits-Änderung mountet eine
     *  frische Instanz) — kein fortlaufendes Re-Sync nötig, TST-10. */
    startOpen?: boolean;
    /** Wird gerufen, wenn die Liste sich schließt — durch Auswahl, "keine Auswahl",
     *  Escape ODER Fokusverlust. Für Aufrufer, die die Shell mit `startOpen` selbst hinter
     *  einem eigenen Auslöser einblenden (`{#if offen}`) und dieses `offen` wieder
     *  zurücksetzen müssen, sonst bliebe ein leeres Panel stehen (MapLensView/
     *  TimelineLensView). Ohne Prop unverändertes Verhalten. */
    onClose?: () => void;
    /** Freitext-Modus: das Feld trägt den vom Aufrufer gehaltenen Text (`textValue`) als
     *  echten Wert, nicht nur als Suchbegriff. Jeder Tastendruck meldet `onTextChange`;
     *  eine Auswahl aus der Liste meldet ZUSÄTZLICH `onChange(id)`. Für Ereignis-Ort/
     *  -Adresse, wo freies Weitertippen erlaubt bleiben muss (ADR-v9-42). */
    freeText?: boolean;
    /** Nur mit `freeText`: der aktuelle Text. */
    textValue?: string;
    /** Nur mit `freeText`: jeder Tastendruck. */
    onTextChange?: (v: string) => void;
    /** Zusatzzeile unter der Ergebnisliste (z. B. „+ Hof ‚X' anlegen" mit dem getippten
     *  Text, oder ein Hinweis, warum die Neuanlage gerade nicht geht). */
    footer?: import('svelte').Snippet;
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
    onClose,
    freeText = false,
    textValue = '',
    onTextChange,
    footer,
  }: Props = $props();

  /** Ergebnisliste wird ab dieser Anzahl gekappt (TST-7 Kapazitäts-Fall). Ein Hinweistext
   *  zeigt an, dass weitere Treffer durch engeres Tippen erreichbar sind. */
  const MAX_VISIBLE_RESULTS = 25;

  // TST-10-Muster (32-Testframework.md §1): `startOpen` ist nur der Mount-Anfangswert einer
  // frisch instanziierten Instanz (der Aufrufer mountet über {#if}/{#each} neu) — kein
  // fortlaufendes Re-Sync bei Prop-Änderung.
  let open = $state(untrack(() => startOpen));
  /** Suchbegriff im Entitäts-Modus. Im Freitext-Modus IST der Text der Suchbegriff. */
  let typed = $state('');
  let activeIndex = $state(-1);
  /** Hat der Nutzer seit dem Öffnen getippt? Nur im Freitext-Modus relevant und dort
   *  wesentlich: der bereits im Feld stehende Text ist ein WERT, keine Suchabsicht. Ohne
   *  diese Unterscheidung filtert ein Ereignis-Ort wie „Steinwedel, Amt Burgdorf
   *  (Hannover), Kurfürstentum …" sich beim bloßen Hineinklicken selbst auf null Treffer —
   *  der Nutzer müsste erst alles löschen, um überhaupt etwas auswählen zu können, also
   *  genau die Reibung, die dieser Umbau beseitigen soll (beim Bau am echten Bestand
   *  aufgefallen, nicht in den Tests). */
  let hasTyped = $state(false);
  /** Stabile, instanz-eindeutige id für die aria-controls/activedescendant-Kopplung —
   *  mehrere Picker pro Formular sind der Normalfall (jedes Ereignis hat ein Ort-Feld). */
  const listId = `stb-picker-${crypto.randomUUID().slice(0, 8)}`;

  /** Feld = Bezugspunkt der Platzierung; Panel = der portalierte Teil. Beide als Referenz,
   *  weil sie nach dem Portal in ZWEI getrennten Teilbäumen liegen, aber EIN Bedienelement
   *  bilden — s. `istInnen`. */
  let fieldEl = $state<HTMLElement | undefined>(undefined);
  let rootEl = $state<HTMLElement | undefined>(undefined);
  let panelEl = $state<HTMLElement | undefined>(undefined);

  const selectedItem = $derived<T | undefined>(
    value != null ? items.find((it) => getId(it) === value) : undefined,
  );

  const selectedLabel = $derived(selectedItem ? getLabel(selectedItem) : null);

  /** Was im Feld steht. Freitext: der Wert des Aufrufers. Sonst: der Suchbegriff — das
   *  Label der Auswahl steht währenddessen als Platzhalter (s. `fieldPlaceholder`), damit
   *  die bisherige Auswahl beim Tippen sichtbar bleibt, ohne den Suchbegriff zu stören. */
  const fieldText = $derived(freeText ? textValue : open ? typed : (selectedLabel ?? ''));

  const fieldPlaceholder = $derived(
    freeText || !open
      ? (selectedLabel ? '' : allowNone ? noneLabel : placeholder)
      : (selectedLabel ?? placeholder),
  );

  const query = $derived(freeText ? (hasTyped ? textValue : '') : typed);

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

  /** Die per ↓/↑ ansteuerbaren Zeilen in Anzeigereihenfolge — Sonderzeilen zählen mit,
   *  sonst wäre "keine Auswahl"/"neu anlegen" nur mit der Maus erreichbar. */
  type Row = { kind: 'none' } | { kind: 'create' } | { kind: 'item'; id: string };
  const rows = $derived.by<Row[]>(() => [
    ...(allowNone ? [{ kind: 'none' } as Row] : []),
    ...(showCreateRow ? [{ kind: 'create' } as Row] : []),
    ...candidates.map((it) => ({ kind: 'item', id: getId(it) }) as Row),
  ]);

  function openList() {
    if (open) return;
    open = true;
    if (!freeText) typed = '';
    hasTyped = false;
    activeIndex = -1;
  }

  function closeList() {
    open = false;
    if (!freeText) typed = '';
    hasTyped = false;
    activeIndex = -1;
    onClose?.();
  }

  function onInput(e: Event) {
    const v = (e.currentTarget as HTMLInputElement).value;
    open = true;
    activeIndex = -1;
    hasTyped = true;
    if (freeText) onTextChange?.(v);
    else typed = v;
  }

  function select(id: string) {
    onChange(id);
    closeList();
  }

  function selectNone() {
    onChange(null);
    closeList();
  }

  function requestCreate() {
    // Bewusst OHNE `onClose`: der Aufrufer blendet jetzt sein Anlege-Formular AN STELLE
    // dieser Shell ein (PersonPicker & Co.) — ein `onClose` würde ihn dazu bringen, den
    // ganzen Bereich zuzuklappen, und das Formular verschwände sofort wieder.
    open = false;
    if (!freeText) typed = '';
    hasTyped = false;
    activeIndex = -1;
    onCreateRequested?.();
  }

  function activateRow(row: Row) {
    if (row.kind === 'none') selectNone();
    else if (row.kind === 'create') requestCreate();
    else select(row.id);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openList();
      if (!rows.length) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      activeIndex = (activeIndex + step + rows.length) % rows.length;
      return;
    }
    if (e.key === 'Enter') {
      if (!open || activeIndex < 0 || activeIndex >= rows.length) return;
      // Nur schlucken, wenn wirklich eine Zeile angesteuert ist — sonst gehört Enter dem
      // umgebenden Formular (Speichern), nicht diesem Feld.
      e.preventDefault();
      activateRow(rows[activeIndex]);
      return;
    }
    if (e.key === 'Escape') {
      if (!open) return;
      // Nicht bis zum Modal/Overlay durchreichen: das erste Escape schließt die Liste,
      // ein zweites darf dann das Overlay schließen (INV-UI-13-Nachbarschaft, BL-08).
      e.stopPropagation();
      // KEIN `inputEl.focus()` hier: der Tastendruck kam bereits aus dem Feld, der Fokus
      // liegt also schon richtig — und ein erneutes Fokussieren würde `onfocus` auslösen
      // und damit die eben geschlossene Liste sofort wieder öffnen (beim Bau genau so
      // passiert, aufgedeckt vom Escape-Test).
      closeList();
    }
  }

  /** Klick INNERHALB der Komponente (Feld, Zeile, Fußbereich) darf nicht als "nach außen
   *  geklickt" gelten — sonst schlösse der eigene Mausklick die Liste vor dem Treffer.
   *
   *  Seit das Panel am <body> hängt, ist "innerhalb" NICHT mehr `contains` eines einzigen
   *  Knotens: der Fokus wandert beim Klick auf einen Treffer aus dem Feld-Teilbaum in den
   *  Panel-Teilbaum. Ohne diese zweite Hälfte schlösse `focusout` die Liste noch vor dem
   *  `click` — der Treffer wäre nicht mehr auswählbar, also genau der Defekt, der hier
   *  behoben wird, nur eine Stufe später.
   *
   *  DIESE Prüfung reicht allein NICHT: sie setzt voraus, dass `relatedTarget` gesetzt
   *  ist, was nur in Chromium gilt (s. `haltFokusImFeld`, ADR-v9-182). */
  function istInnen(next: FocusEvent['relatedTarget']): boolean {
    if (!(next instanceof Node)) return false;
    return !!rootEl?.contains(next) || !!panelEl?.contains(next);
  }

  function onFocusOut(e: FocusEvent) {
    if (istInnen(e.relatedTarget)) return;
    if (!open) return;
    closeList();
  }

  /**
   * Hält den Fokus im Eingabefeld, während ein Listeneintrag angeklickt wird (ADR-v9-182,
   * BL-250). `istInnen` oben deckt nur den Fall ab, dass `relatedTarget` überhaupt GESETZT
   * ist — Chromium fokussiert einen `<button>` beim `mousedown`, **Safari und Firefox
   * nicht**. Dort ist `relatedTarget` `null`, `istInnen` sagt „außen", und `closeList()`
   * räumt das Panel ab, BEVOR das `click` seinen Treffer erreicht: der Nutzer klickt an,
   * und nichts geschieht (Nutzerbefund „Ortspicker wählt nicht aus", Safari).
   *
   * `preventDefault` am `mousedown` unterbindet genau die Fokus-Verschiebung, die diese
   * Kette auslöst — der Fokus bleibt im Feld, `focusout` feuert gar nicht, und die
   * Reihenfolge ist in jedem Browser dieselbe. Kein Browser-Sniffing, kein `setTimeout`,
   * kein zweiter Schließweg. Muss an JEDER Zeile hängen (Treffer, „keine Auswahl",
   * „+ neu anlegen", Fußbereich) — eine Zeile ohne sie wäre die Stelle, an der der Defekt
   * zurückkommt.
   */
  function haltFokusImFeld(e: MouseEvent) {
    e.preventDefault();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="stb-picker" bind:this={rootEl} onfocusout={onFocusOut} onkeydown={onKeydown}>
  <!-- Feld + Auswahl-Unterzeile teilen EINEN Rahmen (`__box`): die getroffene Auswahl liest
       sich als zusammenhängende Aussage „Name + Kenndaten" innerhalb der Box, nicht als
       Name-in-Box + darunter loser Zusatztext. Der Rahmen sitzt am Wrapper, das Feld selbst
       ist randlos/transparent — die Combobox-Mechanik (role/aria/anchoredTo am `fieldEl`)
       bleibt unverändert. -->
  <div class="stb-picker__box" class:stb-picker__box--has-value={!open && !!selectedLabel}>
    <input
      type="text"
      role="combobox"
      bind:this={fieldEl}
      class="stb-picker__field"
      class:stb-picker__field--has-value={!open && !!selectedLabel}
      aria-label={label}
      aria-expanded={open}
      aria-controls="{listId}"
      aria-autocomplete="list"
      aria-activedescendant={open && activeIndex >= 0 ? `${listId}-r${activeIndex}` : undefined}
      autocomplete="off"
      value={fieldText}
      placeholder={fieldPlaceholder}
      oninput={onInput}
      onfocus={openList}
      onclick={openList}
    />
    {#if !open && selectedItem && getSubLabel}
      <!-- Unterzeile der AUSWAHL (Geburtsjahr/-ort & Co.). Nur im Ruhezustand: während des
           Tippens gehört der Platz der Trefferliste, und die Unterzeile des Treffers steht
           dort ohnehin an jeder Zeile. -->
      <span class="stb-picker__field-meta">{getSubLabel(selectedItem)}</span>
    {/if}
  </div>

  {#if open}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- `onfocusout`/`onkeydown` hier ZUSÄTZLICH: portaliert ist das Panel kein Nachfahre
         der Wurzel mehr, Ereignisse aus ihm blubbern nicht mehr dorthin. Ohne das bliebe
         die Liste offen, wenn der Fokus von einem Treffer nach draußen geht, und Escape
         wäre bei fokussiertem Treffer wirkungslos. -->
    <div
      class="stb-picker__panel"
      bind:this={panelEl}
      use:anchoredTo={fieldEl}
      onfocusout={onFocusOut}
      onkeydown={onKeydown}
    >
      <!-- Eigener Name, NICHT derselbe wie am Feld: zwei Elemente mit identischem
           zugänglichen Namen sind für Screenreader-Nutzer nicht unterscheidbar. -->
      <ul class="stb-picker__results" role="listbox" id={listId} aria-label={`${label} — Treffer`}>
        {#each rows as row, i (row.kind === 'item' ? row.id : row.kind)}
          <!-- `role="presentation"` ist hier Pflicht, nicht Kosmetik (BL-66/axe): ein
               `listbox` MUSS `option`s besitzen, und ein dazwischenliegendes `<li>`
               (implizit `listitem`) unterbricht diese Eltern-Kind-Kette — Screenreader
               finden die Treffer dann nicht als Optionen der Liste. Das `<li>` bleibt
               trotzdem stehen: es trägt das Zeilen-Layout und hält das `<ul>` gültig. -->
          <li role="presentation">
            {#if row.kind === 'none'}
              <button
                type="button"
                id="{listId}-r{i}"
                role="option"
                aria-selected={activeIndex === i}
                class="stb-picker__result stb-picker__result--none"
                class:stb-picker__result--active={activeIndex === i}
                onmousedown={haltFokusImFeld}
                onclick={selectNone}
              >
                {noneLabel}
              </button>
            {:else if row.kind === 'create'}
              <button
                type="button"
                id="{listId}-r{i}"
                role="option"
                aria-selected={activeIndex === i}
                class="stb-picker__result stb-picker__result--create"
                class:stb-picker__result--active={activeIndex === i}
                onmousedown={haltFokusImFeld}
                onclick={requestCreate}
              >
                {createLabel}
              </button>
            {:else}
              {@const item = candidates.find((c) => getId(c) === row.id)}
              {#if item}
                <button
                  type="button"
                  id="{listId}-r{i}"
                  role="option"
                  aria-selected={activeIndex === i}
                  class="stb-picker__result"
                  class:stb-picker__result--active={activeIndex === i}
                  onmousedown={haltFokusImFeld}
                  onclick={() => select(row.id)}
                >
                  <span class="stb-picker__result-name">{getLabel(item)}</span>
                  {#if getSubLabel}
                    <span class="stb-picker__result-meta">{getSubLabel(item)}</span>
                  {/if}
                </button>
              {/if}
            {/if}
          </li>
        {/each}
        {#if candidates.length === 0}
          <li role="presentation" class="stb-picker__empty">Keine Treffer gefunden.</li>
        {/if}
        {#if hiddenCount > 0}
          <li role="presentation" class="stb-picker__more-hint">… {hiddenCount} weitere — enger tippen, um einzugrenzen.</li>
        {/if}
      </ul>
      {#if footer}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="stb-picker__footer" onmousedown={haltFokusImFeld}>{@render footer()}</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .stb-picker {
    position: relative;
    min-width: 200px;
  }

  /* Der Rahmen sitzt am Wrapper (Feld + Auswahl-Unterzeile teilen ihn), Optik wie die
     übrigen Formularfelder aus design-system.css. */
  .stb-picker__box {
    background: var(--stb-surface-2);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
  }

  /* Tastatur-/Maus-Fokus hebt die ganze Box hervor (das randlose Feld trägt keinen eigenen
     sichtbaren Rahmen mehr). */
  .stb-picker__box:focus-within {
    border-color: var(--stb-gold);
  }

  /* Das Feld IST das Suchfeld (ADR-v9-103) — randlos/transparent innerhalb der Box. */
  .stb-picker__field {
    width: 100%;
    background: transparent;
    color: var(--stb-text);
    border: none;
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.5rem;
    font: inherit;
  }

  .stb-picker__field:focus {
    outline: none;
  }

  /* Eine getroffene Auswahl liest sich als Aussage, ein leeres Feld als Aufforderung. */
  .stb-picker__field--has-value {
    font-weight: 600;
  }

  .stb-picker__field::placeholder {
    color: var(--stb-text-dim);
    font-weight: 400;
  }

  /* Innerhalb DERSELBEN Box direkt unter dem Feld (kein loser Text unter dem Rahmen). */
  .stb-picker__field-meta {
    display: block;
    font-size: 0.75rem;
    color: var(--stb-text-dim);
    padding: 0 0.5rem 0.3rem;
  }

  /* Über dem Folgeinhalt schwebend statt ihn wegzuschieben: das Feld sitzt oft mitten in
     einem Formular, ein aufschiebendes Panel ließe die darunterliegenden Zeilen bei jedem
     Tastendruck springen.

     Die Koordinaten kommen aus `anchoredTo` (ui/shell/portal.ts) als Viewport-Werte: nach
     dem Umhängen an den <body> gibt es keinen positionierten Vorfahren mehr, auf den sich
     `absolute` beziehen könnte. Die Breite kommt aus derselben Messung — ein Panel, das
     unter seinem Feld bündig steht, ist die einzige Breite, die hier je gewollt war
     (vorher `left: 0; right: 0` gegenüber dem Feld). */
  .stb-picker__panel {
    position: fixed;
    z-index: var(--stb-z-modal);
    left: var(--stb-anchor-left, 0);
    top: var(--stb-anchor-top, 0);
    width: var(--stb-anchor-width, 16rem);
    background: var(--stb-surface-1);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-card);
    padding: 0.35rem;
    box-shadow: 0 6px 18px rgb(0 0 0 / 45%);
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
  .stb-picker__result:focus-visible,
  .stb-picker__result--active {
    background: var(--stb-surface-2);
  }

  /* Tastatur-Ansteuerung muss ohne Farbe erkennbar sein (Spec 21 §2 „nie nur Farbe",
     WCAG 1.4.1/LP-8) — deshalb zusätzlich eine Kante. */
  .stb-picker__result--active {
    box-shadow: inset 3px 0 0 var(--stb-gold-light);
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

  .stb-picker__footer {
    border-top: 1px solid var(--stb-surface-2);
    margin-top: 0.35rem;
    padding-top: 0.35rem;
  }
</style>
