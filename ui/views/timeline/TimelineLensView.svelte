<script lang="ts">
  // ui/views/timeline/TimelineLensView.svelte — Zeitleiste-Lens (Spec 21 §4, Spec 20
  // §1.10 [S]). Dünner Svelte-Wrapper um die imperative Zeitleiste-Insel — kein
  // Layout-/Rendering-Code hier, das lebt in ui/islands/timeline/{timeline-model,
  // timeline-view}.ts (Spec 02 §5: "die reaktive Schale rendert nur einen leeren
  // Container und übergibt ihm Kern-Daten + Callbacks").
  //
  // Zwei Modi (Swim-Lane horizontal / Dekaden vertikal, Spec 20 §1.10) + Mehrpersonen-
  // Vergleich (bis 5, Orakel `_tlAddPerson`/`_tlPersonIds`) + ein-/ausblendbare
  // historische Kontext-Ereignisse (Orakel `_tlFilters`).
  //
  // INV-UI-4: Kopfzeile kommt AUSSCHLIESSLICH aus LensViewHeader (kein eigener
  // Titel-Text), der Modus-Umschalter nutzt dieselben `.stb-segment-row`/`.stb-segment-btn`
  // Klassen wie TreeView/MapLensView/EntityTab — keine eigene "sieht aus wie ein Tab"-CSS.
  //
  // Personen-Picker: analog dem Personen-Picker in MapLensView.svelte übernommen
  // (gleiches Overlay-Muster, Suchfeld + Liste), NICHT neu erfunden — hier zusätzlich
  // mit "Hinzufügen"-Semantik (Mehrpersonen-Auswahl) statt "Ersetzen".
  import { onDestroy } from 'svelte';
  import '../../islands/timeline/timeline-view.css';
  import { mountTimelineView, type TimelineIslandHandle, type TimelineMode } from '../../islands/timeline/timeline-view';
  import {
    ALL_HIST_CATEGORIES,
    MAX_TIMELINE_PERSONS,
    collectMultiPersonEvents,
    computeDecadeLayout,
    computeSwimLaneLayout,
    historicalEventsInRange,
    personColor,
  } from '../../islands/timeline/timeline-model';
  import type { HistEventCategory } from '../../islands/timeline/historical-events';
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import LensViewHeader from '../../shell/LensViewHeader.svelte';
  import type { LensId } from '../../shell/lens-model';
  import { displayName, sortKey } from '../../shell/person-display';

  interface Props {
    appState: AppState;
    viewState: ViewState;
    onNavigateLens?: (lens: LensId) => void;
  }
  const { appState, viewState, onNavigateLens }: Props = $props();

  const HIST_FILTER_LABELS: { cat: HistEventCategory; label: string }[] = [
    { cat: 'war', label: '⚔ Krieg' },
    { cat: 'disease', label: '☠ Seuche' },
    { cat: 'political', label: '⚑ Politik' },
    { cat: 'religion', label: '⛪ Religion' },
    { cat: 'natural', label: '⚡ Natur' },
  ];

  let mode = $state<TimelineMode>('swim');
  // Plain Array statt Set im $state (svelte/prefer-svelte-reactivity — ein natives Set
  // als reaktiver Zustand bräuchte SvelteSet; ein Array reicht hier, `historicalEventsInRange`
  // nimmt ohnehin nur ein ReadonlySet entgegen -> Umwandlung an der Aufrufstelle).
  let histFilterList = $state<HistEventCategory[]>([...ALL_HIST_CATEGORIES]);
  let showHist = $state(true);

  // Mehrpersonen-Auswahl (Spec 20 §1.10 [S] "Mehrpersonen bis 5") — rein lokaler
  // UI-Zustand dieser Ansicht (Auftrag: "KEIN neuer ViewState-Slot dafür nötig"). Die
  // Fokus-Person (geteilter ViewState-Slot `lensFocus`, wie bei Baum/Karte) ist IMMER
  // Startpunkt/erste der Auswahl.
  const focusId = $derived(viewState.getCurrent('lensFocus'));
  let extraPersonIds = $state<string[]>([]);
  const personIds = $derived(focusId ? [focusId, ...extraPersonIds.filter((id) => id !== focusId)] : extraPersonIds);
  const isMulti = $derived(personIds.length > 1);

  let personPickerOpen = $state(false);
  let personQuery = $state('');

  const personResults = $derived(
    Array.from(appState.db.individuals.values())
      .filter((p) => !personIds.includes(p.id))
      .filter((p) => !personQuery.trim() || displayName(p).toLowerCase().includes(personQuery.trim().toLowerCase()))
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b), 'de'))
      .slice(0, 50),
  );

  function addPerson(id: string): void {
    if (personIds.includes(id)) return;
    if (personIds.length >= MAX_TIMELINE_PERSONS) return;
    extraPersonIds = [...extraPersonIds, id];
    personPickerOpen = false;
    personQuery = '';
  }

  function removePerson(id: string): void {
    if (id === focusId) return; // Fokus-Person bleibt immer Startpunkt (Auftrag).
    extraPersonIds = extraPersonIds.filter((x) => x !== id);
  }

  function toggleHistCategory(cat: HistEventCategory): void {
    histFilterList = histFilterList.includes(cat)
      ? histFilterList.filter((c) => c !== cat)
      : [...histFilterList, cat];
  }

  const ctx = $derived(appState.placeContext);
  const events = $derived(personIds.length ? collectMultiPersonEvents(appState.db, ctx, personIds) : []);
  const datedYears = $derived(events.map((e) => e.year).filter((y): y is number => y !== null));
  const histEvents = $derived(
    showHist && datedYears.length
      ? historicalEventsInRange(Math.min(...datedYears), Math.max(...datedYears), new Set(histFilterList))
      : [],
  );
  const primaryBirthYear = $derived(
    !isMulti ? (events.find((e) => e.type === 'birth')?.year ?? null) : null,
  );

  let containerEl: HTMLDivElement | undefined = $state();
  // `800` ist der Fallback, den `swimLayout` (unten) vor dem ersten Mount/Resize liest
  // (kein toter Wert — false positive von no-useless-assignment mit Svelte-5-Runes,
  // die die spätere Neuzuweisung im ResizeObserver-Effect nicht als "Lesen dazwischen"
  // erkennt, analog svelte/prefer-svelte-reactivity-Ausnahmen in app-state.svelte.ts).
  // Deklaration steht bewusst VOR `swimLayout`: stand sie darunter, las ein $derived
  // eine block-scoped Variable vor ihrer Deklaration (TDZ) — dank Lazy-Evaluation der
  // Runes bislang folgenlos, aber nur zufällig; svelte-check meldet es zu Recht.
  // eslint-disable-next-line no-useless-assignment
  let containerWidth = $state(800);

  const swimLayout = $derived(mode === 'swim' ? computeSwimLaneLayout(events, histEvents, containerWidth) : null);
  const decadeLayout = $derived(
    mode === 'decade' ? computeDecadeLayout(events.filter((e) => e.personIdx === 0), histEvents) : null,
  );
  let handle: TimelineIslandHandle | null = null;

  function selectPersonFromChip(personId: string): void {
    // Klick auf einen Chip rezentriert NICHT die Zeitleiste selbst (anders als der
    // Baum) — er öffnet die Personen-Detailseite über denselben Cross-Tab-Callback-Pfad
    // wie der Personen-Picker im Baum (Spec: Callbacks nach oben, kein ViewState-Zugriff
    // hier). Diese Lens hat aktuell keinen eigenen "Detail öffnen"-Callback verdrahtet
    // (kein Prop dafür übergeben) — Klick ist ein no-op außer der Tooltip-Anzeige, bis
    // ein Aufrufer `onOpenPersonDetail` ergänzt. Bewusst minimal gehalten (Scope [S]).
    void personId;
  }

  function mountOrUpdate(): void {
    if (!containerEl) return;
    const data = {
      mode,
      swim: swimLayout,
      decade: decadeLayout,
      isMulti,
      primaryBirthYear,
    };
    if (!handle) {
      handle = mountTimelineView(containerEl, { onSelectPerson: selectPersonFromChip });
    }
    handle.update(data);
  }

  // Breite separat messen (ResizeObserver, analog zum Orakel-`window.resize`-Listener,
  // legacy-v8/ui-timeline.js) — ein eigener Effect statt in `mountOrUpdate()` zu
  // schreiben, damit die Zuweisung nicht im selben Durchlauf verpufft, in dem die
  // davon abhängigen $derived-Werte (`swimLayout`) bereits gelesen wurden.
  let resizeObserver: ResizeObserver | null = null;
  $effect(() => {
    if (!containerEl) return;
    if (containerEl.clientWidth > 0) containerWidth = containerEl.clientWidth;
    resizeObserver?.disconnect();
    resizeObserver = new ResizeObserver(() => {
      if (containerEl && containerEl.clientWidth > 0) containerWidth = containerEl.clientWidth;
    });
    resizeObserver.observe(containerEl);
  });

  $effect(() => {
    void mode;
    void swimLayout;
    void decadeLayout;
    void isMulti;
    void primaryBirthYear;
    mountOrUpdate();
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
    handle?.destroy();
    handle = null;
  });
</script>

<div class="timeline-lens-view">
  <LensViewHeader active="timeline" onNavigate={(lens) => onNavigateLens?.(lens)} />

  <div class="timeline-lens-view__mode-row stb-segment-row" role="tablist" aria-label="Zeitleiste-Modus wählen">
    <button
      type="button"
      role="tab"
      class="stb-segment-btn"
      class:stb-segment-btn--active={mode === 'swim'}
      aria-current={mode === 'swim' ? 'page' : undefined}
      onclick={() => (mode = 'swim')}
    >
      Swim-Lane
    </button>
    <button
      type="button"
      role="tab"
      class="stb-segment-btn"
      class:stb-segment-btn--active={mode === 'decade'}
      aria-current={mode === 'decade' ? 'page' : undefined}
      onclick={() => (mode = 'decade')}
    >
      Dekaden
    </button>
  </div>

  {#if mode === 'decade' && isMulti}
    <p class="timeline-lens-view__hint" role="status">Mehrpersonen-Vergleich nur im Swim-Lane-Modus.</p>
  {/if}

  <div class="timeline-lens-view__person-row">
    {#each personIds as pid, idx (pid)}
      <span class="timeline-lens-view__person-pill" style:--tl-pc={personColor(idx)}>
        <span class="timeline-lens-view__person-dot"></span>
        {displayName(appState.db.individuals.get(pid)!)}
        {#if idx > 0}
          <button
            type="button"
            class="timeline-lens-view__person-rm"
            aria-label="Person aus Vergleich entfernen"
            onclick={() => removePerson(pid)}
          >
            ✕
          </button>
        {/if}
      </span>
    {/each}
    {#if personIds.length < MAX_TIMELINE_PERSONS}
      <button
        type="button"
        class="timeline-lens-view__person-add"
        title="Person vergleichen"
        aria-label="Person hinzufügen"
        onclick={() => (personPickerOpen = true)}
      >
        ⊕ Person hinzufügen
      </button>
    {/if}
  </div>

  <div class="timeline-lens-view__filter-row">
    <label class="timeline-lens-view__hist-toggle">
      <input type="checkbox" bind:checked={showHist} />
      Historische Ereignisse
    </label>
    {#if showHist}
      {#each HIST_FILTER_LABELS as { cat, label } (cat)}
        <button
          type="button"
          class="timeline-lens-view__filter-btn"
          class:timeline-lens-view__filter-btn--active={histFilterList.includes(cat)}
          onclick={() => toggleHistCategory(cat)}
        >
          {label}
        </button>
      {/each}
    {/if}
  </div>

  {#if !personIds.length}
    <p class="timeline-lens-view__empty">Keine Person geladen.</p>
  {:else if !events.some((e) => e.year !== null)}
    <p class="timeline-lens-view__empty">Keine datierten Ereignisse vorhanden.</p>
  {/if}

  <div class="timeline-lens-view__host" bind:this={containerEl}></div>

  {#if personPickerOpen}
    <div class="timeline-lens-view__picker-overlay" role="dialog" aria-label="Person zum Vergleich hinzufügen">
      <div class="timeline-lens-view__picker">
        <div class="timeline-lens-view__picker-header">
          <input
            type="search"
            class="timeline-lens-view__picker-input"
            placeholder="Person suchen…"
            bind:value={personQuery}
          />
          <button type="button" class="timeline-lens-view__picker-close" onclick={() => (personPickerOpen = false)}>
            ✕
          </button>
        </div>
        <ul class="timeline-lens-view__picker-list">
          {#each personResults as p (p.id)}
            <li>
              <button type="button" class="timeline-lens-view__picker-item" onclick={() => addPerson(p.id)}>
                {displayName(p)}
              </button>
            </li>
          {:else}
            <li class="timeline-lens-view__picker-empty">Keine Person gefunden</li>
          {/each}
        </ul>
      </div>
    </div>
  {/if}
</div>

<style>
  .timeline-lens-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  /* Modus-Umschalter-Pillen selbst kommen aus design-system.css (.stb-segment-row/
     .stb-segment-btn/--active) — EntityTab-Kanon, INV-UI-4. */
  .timeline-lens-view__mode-row {
    padding: 0.5rem 0.75rem 0;
  }

  .timeline-lens-view__hint {
    margin: 0.3rem 0.75rem 0;
    padding: 0.4rem 0.6rem;
    background: var(--stb-surface-2);
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-control);
    color: var(--stb-text-dim);
    font-size: 0.8rem;
  }

  .timeline-lens-view__person-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0.75rem 0;
  }

  .timeline-lens-view__person-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    background: var(--stb-surface-2);
    border: 1px solid var(--stb-surface-3);
    border-left: 3px solid var(--tl-pc, var(--stb-gold));
    border-radius: var(--stb-radius-control);
    padding: 0.25rem 0.5rem;
    font-size: 0.8rem;
    color: var(--stb-text);
  }

  .timeline-lens-view__person-dot {
    display: none;
  }

  .timeline-lens-view__person-rm {
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
    font-size: 0.75rem;
    padding: 0;
  }

  .timeline-lens-view__person-add {
    background: var(--stb-surface-2);
    border: 1px dashed var(--stb-surface-3);
    color: var(--stb-text-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.25rem 0.6rem;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .timeline-lens-view__filter-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.75rem 0;
    font-size: 0.78rem;
  }

  .timeline-lens-view__hist-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    color: var(--stb-text-dim);
  }

  .timeline-lens-view__filter-btn {
    background: var(--stb-surface-2);
    border: 1px solid var(--stb-surface-3);
    color: var(--stb-text-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.2rem 0.5rem;
    font-size: 0.72rem;
    cursor: pointer;
  }

  .timeline-lens-view__filter-btn--active {
    color: var(--stb-text);
    border-color: var(--stb-gold-dim);
    background: var(--stb-surface-3);
  }

  .timeline-lens-view__empty {
    padding: 1rem 0.75rem;
    color: var(--stb-text-dim);
  }

  .timeline-lens-view__host {
    flex: 1;
    min-height: 0;
    margin: 0.5rem 0.75rem 0.75rem;
  }

  .timeline-lens-view__picker-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 3rem;
    z-index: 500;
  }

  .timeline-lens-view__picker {
    background: var(--stb-surface-1);
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-card);
    width: min(420px, 90vw);
    max-height: 70vh;
    display: flex;
    flex-direction: column;
  }

  .timeline-lens-view__picker-header {
    display: flex;
    gap: 0.5rem;
    padding: 0.6rem;
    border-bottom: 1px solid var(--stb-surface-3);
  }

  .timeline-lens-view__picker-input {
    flex: 1;
    background: var(--stb-surface-2);
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-control);
    color: var(--stb-text);
    padding: 0.4rem 0.6rem;
  }

  .timeline-lens-view__picker-close {
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
    font-size: 1rem;
  }

  .timeline-lens-view__picker-list {
    list-style: none;
    margin: 0;
    padding: 0.3rem;
    overflow-y: auto;
  }

  .timeline-lens-view__picker-item {
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    color: var(--stb-text);
    padding: 0.5rem 0.6rem;
    cursor: pointer;
    border-radius: var(--stb-radius-control);
  }

  .timeline-lens-view__picker-item:hover {
    background: var(--stb-surface-2);
  }

  .timeline-lens-view__picker-empty {
    padding: 0.6rem;
    color: var(--stb-text-dim);
  }
</style>
