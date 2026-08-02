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
  // Personen-Auswahl über den gemeinsamen Entitäts-Picker (INV-UI-4, ADR-v9-40),
  // identisch zu MapLensView und zu jeder Formular-Personenreferenz — also mit
  // Geburtsjahr/-ort als Unterzeile (`yearPlaceSummary`) und derselben Match-Logik wie
  // die globale Suche (`matchesSearch`). Besonderheit hier: "Hinzufügen"-Semantik
  // (Mehrpersonen-Vergleich) statt "Ersetzen" — die bereits verglichenen Personen
  // gehen als `excludeIds` in denselben Picker, statt eine eigene Filterung zu bauen.
  import { onDestroy } from 'svelte';
  import '../../islands/timeline/timeline-view.css';
  import { mountTimelineView, type TimelineIslandHandle, type TimelineMode } from '../../islands/timeline/timeline-view';
  import { tooltip } from '../../shell/tooltip';
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
  import type { Route } from '../../shell/route.svelte';
  import LensViewHeader from '../../shell/LensViewHeader.svelte';
  import type { LensId } from '../../shell/lens-model';
  import { displayName } from '../../shell/person-display';
  import PersonPicker from '../../shell/PersonPicker.svelte';

  interface Props {
    appState: AppState;
    viewState: ViewState;
    route: Route;
    onNavigateLens?: (lens: LensId) => void;
  }
  const { appState, viewState, route, onNavigateLens }: Props = $props();

  const HIST_FILTER_LABELS: { cat: HistEventCategory; label: string }[] = [
    { cat: 'war', label: '⚔ Krieg' },
    { cat: 'disease', label: '☠ Seuche' },
    { cat: 'political', label: '⚑ Politik' },
    { cat: 'religion', label: '⛪ Religion' },
    { cat: 'natural', label: '⚡ Natur' },
  ];

  // Anzeige-Modus im Routen-Merker, nicht lokal — gleiche Begründung wie in
  // MapLensView.svelte (ADR-v9-102).
  const mode = $derived<TimelineMode>(route.timelineMode);
  // Plain Array statt Set im $state (svelte/prefer-svelte-reactivity — ein natives Set
  // als reaktiver Zustand bräuchte SvelteSet; ein Array reicht hier, `historicalEventsInRange`
  // nimmt ohnehin nur ein ReadonlySet entgegen -> Umwandlung an der Aufrufstelle).
  let histFilterList = $state<HistEventCategory[]>([...ALL_HIST_CATEGORIES]);
  let showHist = $state(true);

  // Mehrpersonen-Auswahl (Spec 20 §1.10 [S] "Mehrpersonen bis 5"). Liegt seit
  // ADR-v9-102 im ViewState (`setTimelinePersons`/`getTimelinePersons`), nicht mehr als
  // lokaler `$state` dieser Ansicht: App.svelte unmountet die Zeitleiste beim
  // Wegnavigieren, eine lokale Liste war danach verloren.
  //
  // Die Zeitleiste führt ihre EIGENE Liste (Nutzer-Entscheidung 2026-07-19, Variante A):
  // die geteilte Fokus-Person aus `lensFocus` ist nur noch die VORBELEGUNG einer leeren
  // Liste, nicht mehr ein erzwungener, nicht entfernbarer erster Eintrag. Vorher war die
  // primäre Person hier gar nicht wählbar — sie kam immer aus dem Baum, was die
  // Zeitleiste anders verhalten ließ als die Karte direkt daneben.
  const personIds = $derived(viewState.getTimelinePersons());
  const isMulti = $derived(personIds.length > 1);

  const focusId = $derived(viewState.getCurrent('lensFocus'));
  // `touched` verhindert, dass das Entfernen der LETZTEN Person sofort wieder die
  // Fokus-Person einsetzt (der Effekt würde sonst unmittelbar erneut greifen). Bewusst
  // mount-lokal: kommt der Nutzer später mit weiterhin leerer Liste zurück, ist das
  // wieder "diese Sicht hat noch keine Auswahl" und die Vorbelegung greift erneut.
  let touched = $state(false);
  $effect(() => {
    if (!touched && personIds.length === 0 && focusId) {
      viewState.setTimelinePersons([focusId]);
    }
  });

  let personPickerOpen = $state(false);

  function addPerson(id: string | null): void {
    if (!id) return;
    if (personIds.includes(id)) return;
    if (personIds.length >= MAX_TIMELINE_PERSONS) return;
    touched = true;
    viewState.setTimelinePersons([...personIds, id]);
    // Das Schließen übernimmt der Picker selbst über `onClose` (feuert auch beim
    // Abbrechen) — hier nicht doppelt setzen.
  }

  function removePerson(id: string): void {
    touched = true;
    viewState.setTimelinePersons(personIds.filter((x) => x !== id));
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
  // `800` ist der Fallback, den `swimLayout` (unten) vor dem ersten Mount/Resize liest —
  // kein toter Wert. Die Deklaration steht bewusst VOR `swimLayout`: stand sie darunter,
  // las ein $derived eine block-scoped Variable vor ihrer Deklaration (TDZ) — dank
  // Lazy-Evaluation der Runes bislang folgenlos, aber nur zufällig; svelte-check meldet
  // es zu Recht.
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

  <div class="timeline-lens-view__mode-row stb-segment-row stb-segment-row--full" role="tablist" aria-label="Zeitleiste-Modus wählen">
    <button
      type="button"
      role="tab"
      class="stb-segment-btn"
      class:stb-segment-btn--active={mode === 'swim'}
      aria-current={mode === 'swim' ? 'page' : undefined}
      onclick={() => route.setTimelineMode('swim')}
    >
      Swim-Lane
    </button>
    <button
      type="button"
      role="tab"
      class="stb-segment-btn"
      class:stb-segment-btn--active={mode === 'decade'}
      aria-current={mode === 'decade' ? 'page' : undefined}
      onclick={() => route.setTimelineMode('decade')}
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
        <button
          type="button"
          class="timeline-lens-view__person-rm"
          aria-label="Person aus Vergleich entfernen"
          onclick={() => removePerson(pid)}
        >
          ✕
        </button>
      </span>
    {/each}
    {#if personIds.length < MAX_TIMELINE_PERSONS}
      <button
        type="button"
        class="timeline-lens-view__person-add"
        use:tooltip={'Person vergleichen'}
        aria-label="Person hinzufügen"
        onclick={() => (personPickerOpen = true)}
      >
        ⊕ Person hinzufügen
      </button>
    {/if}
  </div>

  {#if personPickerOpen}
    <div class="timeline-lens-view__picker-slot">
      <PersonPicker
        {appState}
        value={null}
        onChange={addPerson}
        onClose={() => (personPickerOpen = false)}
        excludeIds={personIds}
        allowCreate={false}
        startOpen
        label="Person zum Vergleich hinzufügen"
      />
    </div>
  {/if}

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

  /* Der Picker selbst bringt seine Optik aus design-system.css/Picker.svelte mit
     (INV-UI-4) — hier nur die Einbettung in die Spalte. */
  .timeline-lens-view__picker-slot {
    padding: 0 0.75rem 0.5rem;
  }
</style>
