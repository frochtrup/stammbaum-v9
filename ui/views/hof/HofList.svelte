<script lang="ts">
  // ui/views/hof/HofList.svelte — Höfe-Tab-Liste (Spec 20 §1.8 [K]: "Hof-Liste
  // (aus Events aufgelöst, numerisch sortiert), Zugehöriges Dorf anzeigen"). Anreicherungs-
  // Pille (ADR-v9-44) + Referenz-Filter (ADR-v9-46, Spec 11 §9.3) — analog PlaceList.svelte.
  import type { PlacesHost, PlacesNav } from '../../shell/places-host';
  import { tooltip } from '../../shell/tooltip';
  import type { LensId } from '../../shell/lens-model';
  import { collectAllEvents } from '../../shell/all-events';
  import {
    buildHofListSections,
    groupHofRowsByVillage,
    defaultHofFilters,
    type HofRow,
    type HofFilters,
  } from './hof-list-model';
  import { countActiveFilters } from '../../shell/count-active-filters';
  import { enrichmentLabel } from '../../shell/place-labels';
  import { buildHofDedupGroups } from './hof-dedup-model';
  import { buildHofReview } from './hof-review-model';
  import EventsByType from '../../shell/EventsByType.svelte';
  import CoordIndicator from '../../shell/CoordIndicator.svelte';
  import FilterBar from '../../shell/FilterBar.svelte';

  interface Props {
    appState: PlacesHost;
    viewState: PlacesNav;
    /** "Hof-Zuweisungen prüfen"/"Massen-Dedup" (Spec 20 §1.8 [K], Spec 21 §10c): beide
     *  Buttons leben in der eigenen Toolbar dieser Liste (Toolbar-Ownership) — die
     *  Ansichts-Umschaltung (welches Overlay rendert) bleibt bei EntityTab. */
    onOpenReview?: () => void;
    onOpenDedup?: () => void;
    /** Cross-Tab-Navigation zur Karte-Lens (ADR-v9-78/80, `CoordIndicator`) — optional,
     *  damit isolierte Tests/Kontexte ohne Lens-Umschalter weiterlaufen. */
    onNavigateLens?: (lens: LensId) => void;
  }
  const { appState, viewState, onOpenReview, onOpenDedup, onNavigateLens }: Props = $props();

  let query = $state('');
  let section = $state<'referenced' | 'unreferenced'>('referenced');
  /** ADR-v9-149 — ersetzt die frühere „ohne Zusatzangaben"-Zeilenpille. */
  let filters = $state<HofFilters>(defaultHofFilters());

  const activeFilterCount = $derived(countActiveFilters(filters, defaultHofFilters()));
  const events = $derived(collectAllEvents(appState.db));
  const sections = $derived(buildHofListSections(appState.db, appState.placeContext, events, query, filters));

  // Kurations-Handlungsbedarf (BL-206, ADR-v9-148): analog PlaceList — der immer sichtbare
  // „Werkzeuge"-Trigger trägt einen Achtungs-Punkt bei offenen Hof-Dedup-Gruppen oder
  // Hof-Review-Fällen. Nur von appState.db abhängig (nicht von query), rechnet bei
  // Datenänderung, nicht pro Tastendruck.
  const hofDedupCount = $derived(buildHofDedupGroups(appState.db, appState.placeContext, events).length);
  const hofReviewCount = $derived(buildHofReview(appState.db).rows.length);
  const toolsAttention = $derived(hofDedupCount > 0 || hofReviewCount > 0);
  // D1 (Spec 22 §3.1) — Geschwister-Stelle zu PlaceList, identische Regel: ohne
  // Ereignis-Kontext trifft `hasReference` nie zu, die Hauptliste stünde leer da. Dann
  // zeigt die Liste alle Höfe; `referenced` ist in diesem Fall leer, die Verkettung
  // erhält also die Sortierung.
  const rows = $derived(
    !appState.caps.hasEventContext
      ? [...sections.referenced, ...sections.unreferenced]
      : section === 'referenced'
        ? sections.referenced
        : sections.unreferenced,
  );
  const groups = $derived(groupHofRowsByVillage(rows));
  const isEmpty = $derived(appState.db.hofObjects.size === 0);

  function selectHof(id: string) {
    viewState.setCurrent('hof', id);
  }

  function clearSearch() {
    query = '';
  }
</script>

{#snippet hofRow(row: HofRow)}
<!-- Zeile und Koordinaten-Indikator sind Geschwister, nicht ineinander verschachtelt
     (BL-66/axe `nested-interactive`) — Begründung wörtlich wie in `PlaceList.svelte`;
     beide Listen ziehen mit, die Regel gilt nicht nur dort, wo sie auffiel. -->
<div class="hof-list__item">
  <button type="button" class="hof-list__row" onclick={() => selectHof(row.id)}>
    <span class="hof-list__title-line">
      <span class="hof-list__addr">{row.addr || row.id}</span>
      {#if row.hasNote}<span class="stb-pill" use:tooltip={'Notiz erfasst'}>📝</span>{/if}
      <!-- „ohne Zusatzangaben"-Pille entfallen (ADR-v9-149) — identische Begründung wie in
           PlaceList: Regelfall-Zustand, höchste Wortlast, jetzt Filter statt Zeilen-Label.
           Beide Geschwister-Listen ziehen mit (die Regel gilt nicht nur dort, wo sie
           aufgefallen ist). -->
    </span>
    <!-- Belegungs-Kennzahlen (BL-205): Bewohner/Eigentümer-Zähler + Jahres-Spanne. -->
    {#if row.residents > 0 || row.owners > 0 || row.yearSpan}
      <span class="hof-list__meta">
        {#if row.residents > 0}<span>{row.residents} {row.residents === 1 ? 'Bewohner' : 'Bewohner'}</span>{/if}
        {#if row.owners > 0}<span>{row.owners} {row.owners === 1 ? 'Eigentümer' : 'Eigentümer'}</span>{/if}
        {#if row.yearSpan}<span>{row.yearSpan}</span>{/if}
      </span>
    {/if}
  </button>
  <CoordIndicator coords={row.coords} focusId={row.id} {viewState} {onNavigateLens} />
</div>
{/snippet}

<div class="hof-list">
  {#if isEmpty}
    <p class="hof-list__empty">Keine Höfe erfasst — werden aus RESI/PROP-Ereignissen automatisch aufgelöst.</p>
    {#if onOpenReview || onOpenDedup}
      <div class="hof-list__toolbar hof-list__toolbar--empty">
        <div class="hof-list__bulk-actions">
          {#if onOpenReview}
            <button type="button" class="hof-list__review-btn" onclick={onOpenReview}>Hof-Zuweisungen prüfen</button>
          {/if}
          {#if onOpenDedup}
            <button type="button" class="hof-list__review-btn" onclick={onOpenDedup}>Massen-Dedup</button>
          {/if}
        </div>
      </div>
    {/if}
  {:else}
    <div class="hof-list__toolbar">
      <div class="hof-list__search">
        <input type="search" placeholder="Suche…" aria-label="Höfe durchsuchen" bind:value={query} />
        {#if query}
          <button type="button" class="hof-list__search-clear" aria-label="Suche löschen" onclick={clearSearch}>✕</button>
        {/if}
      </div>
      <!-- Erste Filter dieser Liste überhaupt (ADR-v9-149): die Höfe-Liste hatte bislang
           nur eine Suche, die Anreicherungs-Information stand als Pille auf jeder Zeile.
           Sie zieht jetzt denselben `FilterBar`-Mechanismus wie PlaceList (INV-UI-4) —
           kein listen-eigener Steuerungstyp, und das Kopf-Budget (INV-UI-11) bleibt bei
           EINER Toolbar-Zeile, weil der Filter hinter der Disclosure liegt. -->
      <FilterBar activeCount={activeFilterCount}>
        <div class="hof-list__filters">
          <!-- Kurations-Arbeitsliste statt Zeilen-Pille (ADR-v9-149), dreistufig seit
               ADR-v9-191: „leer" allein beantwortet nicht die Frage „was habe ich nur
               angefasst?". Liegt hier in der FilterBar-Disclosure, nicht als Dauer-Element
               (INV-UI-11 „Filter → immer hinter FilterBar"). `onchange` statt `bind:value`
               — TST-12/ESLint-Regel (happy-dom-Falle). -->
          <label class="stb-filter-opt stb-filter-opt--compact">
            Anreicherung
            <select
              value={filters.level}
              onchange={(e) => (filters = { ...filters, level: (e.currentTarget as HTMLSelectElement).value as HofFilters['level'] })}
            >
              <option value="">alle</option>
              <option value="none">{enrichmentLabel('none')}</option>
              <option value="sparse">{enrichmentLabel('sparse')}</option>
              <option value="rich">{enrichmentLabel('rich')}</option>
            </select>
          </label>
          <button type="button" class="hof-list__review-btn" onclick={() => (filters = defaultHofFilters())}>
            Filter zurücksetzen
          </button>
        </div>
      </FilterBar>
      {#if onOpenReview || onOpenDedup}
        <!-- Wie in PlaceList: Kuratierungs-Werkzeuge hinter EINEN Einstiegspunkt
             (Spec 21 §6h, BL-96). Dieselbe Rolle, derselbe Mechanismus — nicht je Liste
             neu entschieden (INV-UI-4).
             Der LEERZUSTAND oben behält die Knöpfe bewusst offen: dort sind sie das
             Einzige auf der Fläche, und eine Disclosure über einer leeren Liste würde
             das einzige Angebot verstecken statt Platz zu sparen. -->
        <FilterBar label="Werkzeuge" attention={toolsAttention}>
          <div class="hof-list__tools">
            {#if onOpenReview}
              <button type="button" class="hof-list__review-btn" onclick={onOpenReview}>Hof-Zuweisungen prüfen{hofReviewCount > 0 ? ` · ${hofReviewCount}` : ''}</button>
            {/if}
            {#if onOpenDedup}
              <button type="button" class="hof-list__review-btn" onclick={onOpenDedup}>Massen-Dedup{hofDedupCount > 0 ? ` · ${hofDedupCount} ${hofDedupCount === 1 ? 'Gruppe' : 'Gruppen'}` : ''}</button>
            {/if}
          </div>
        </FilterBar>
      {/if}
    </div>

    {#if appState.caps.hasEventContext}
    <div class="stb-segment-row stb-segment-row--full hof-list__sections" role="tablist" aria-label="Höfe-Abschnitt wählen">
      <button
        type="button"
        role="tab"
        aria-selected={section === 'referenced'}
        class="stb-segment-btn"
        class:stb-segment-btn--active={section === 'referenced'}
        onclick={() => (section = 'referenced')}
      >
        Höfe ({sections.referenced.length})
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={section === 'unreferenced'}
        class="stb-segment-btn"
        class:stb-segment-btn--active={section === 'unreferenced'}
        onclick={() => (section = 'unreferenced')}
      >
        Ohne Bezug ({sections.unreferenced.length})
      </button>
    </div>
    {/if}

    {#if rows.length === 0}
      <p class="hof-list__empty">
        {!appState.caps.hasEventContext || section === 'referenced' ? 'Keine Höfe gefunden.' : 'Keine referenzlosen Höfe.'}
      </p>
    {:else}
      <!-- Gruppiert nach Dorf (Nutzer-Vorgabe 2026-07-10) — DIE EINE Gruppen+Header-
           Darstellung (EventsByType.svelte, INV-UI-4), bereits für PlaceDetail/
           SourceDetail etabliert, hier wiederverwendet statt eigens neu gebaut. Der
           Dorf-Name steht dadurch nur noch im Gruppen-Header, nicht mehr redundant in
           jeder Zeile (analog der Eigene-Seite-Redundanz-Regel, Spec 21 §10h). -->
      <!-- resetKey={null}: bewusste Wahl, keine Unterlassung (EventsByType erzwingt die
           Entscheidung seit ADR-v9-78 Punkt 6). Diese Liste HAT keinen wechselnden
           Gegenstand — sie ist die Liste selbst; beim Sprung ins Hof-Detail und zurück
           mountet EntityTab sie ohnehin neu. Einklapp-Zustände sollen dagegen ein
           Filtern/Sortieren überleben (der Nutzer klappt „Dahlhausen" ein und filtert
           weiter) — genau das leistet ein konstanter Schlüssel. -->
      <EventsByType groups={groups} row={hofRow} resetKey={null} />
    {/if}
  {/if}
</div>

<style>
  .hof-list {
    overflow-y: auto;
  }

  .hof-list__empty {
    padding: 1.5rem;
    color: var(--stb-text-dim);
  }

  /* Segment-Pillen selbst kommen aus design-system.css (.stb-segment-row/-btn, INV-UI-4). */
  .hof-list__sections {
    border-bottom: 1px solid var(--stb-surface-3);
  }

  .hof-list__toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    padding: 0.5rem 1rem;
    background: var(--stb-surface-2);
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .hof-list__toolbar--empty {
    position: static;
    justify-content: flex-end;
  }

  .hof-list__search {
    position: relative;
    flex: 1 1 160px;
    display: flex;
    align-items: center;
  }

  /* Filter-Inhalt der Disclosure (ADR-v9-149) — analog .place-list__filters. */
  .hof-list__filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
  }


  /* Bulk-Aktionen (Hof-Zuweisungen prüfen/Massen-Dedup) rechtsbündig, sofern Platz in
     der Zeile ist. margin-left:auto ist hier sicher (TST-11), weil dieser Block IMMER
     das letzte Element der Toolbar-Zeile ist, wenn er überhaupt gerendert wird. */
  .hof-list__tools {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .hof-list__bulk-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-left: auto;
  }

  .hof-list__review-btn {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.7rem;
    cursor: pointer;
    font-size: 0.85rem;
    white-space: nowrap;
  }

  .hof-list__review-btn:hover {
    border-color: var(--stb-gold);
  }

  .hof-list__search input[type='search'] {
    width: 100%;
    background: var(--stb-surface-1);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 1.8rem 0.35rem 0.6rem;
    font-size: 0.85rem;
  }

  .hof-list__search-clear {
    position: absolute;
    right: 0.4rem;
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
  }

  /* .hof-list__rows entfällt — die Liste wird jetzt von EventsByType.svelte
     gerendert (gruppiert nach Dorf), kein eigenes <ul> mehr nötig. Kein eigener
     border-bottom mehr auf .hof-list__row: EventsByType's <li> zeichnet die
     Trennlinie bereits (sonst Doppel-Rand). */
  /* Nur noch horizontales Padding (Nutzer-Fund 2026-07-10: Zeilenabstände wirkten
     "immer noch groß") — vertikales Padding kam bisher DOPPELT zustande (dieses
     0.55rem PLUS EventsByType's <li> 0.3rem, macht zusammen ~27px), jetzt EINE
     Quelle (das <li>). */
  /* Geschwister-Anordnung wie in `PlaceList.svelte` (BL-66). */
  .hof-list__item {
    display: flex;
    align-items: center;
    /* Der Rahmen übernimmt die `width: 100%`, die vorher am Button stand — sonst
       schrumpft er im flex-`<li>` von EventsByType auf die Textbreite, und der Indikator
       klebte am Text statt am rechten Rand (im Browser gesehen). */
    width: 100%;
    min-width: 0;
    /* Abstand am Rahmen, nicht am Chip — sonst wächst der Chip statt der Abstand
       (Begründung wörtlich in `PlaceList.svelte`). */
    padding-right: 1rem;
  }

  .hof-list__item :global(.stb-coord-indicator) {
    flex-shrink: 0; /* eine Trefferfläche gibt nie nach (Spec 21 §6i) */
  }

  .hof-list__row {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    background: transparent;
    border: none;
    padding: 0.3rem 1rem;
    text-align: left;
    cursor: pointer;
    color: var(--stb-text);
  }

  /* Belegungs-Kennzahlen (BL-205) — dezente Meta-Zeile unter der Adresse. */
  .hof-list__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    font-size: 0.78rem;
    color: var(--stb-text-dim);
  }


  .hof-list__row:hover,
  .hof-list__row:focus-visible {
    background: var(--stb-surface-2);
  }

  /* EventsByType's Gruppen-Header (jetzt ein <button>, ADR-v9-78 Punkt 6 — vormals
     <h4>, geteilte Komponente) hat selbst kein horizontales Padding — in
     PlaceDetail/SourceDetail korrekt, weil deren Container bereits `padding: 1rem`
     trägt. .hof-list hat KEIN Container-Padding (Zeilen/Toolbar bringen ihr eigenes,
     für randlose Hover-Flächen) — ohne diese gezielte :global()-Ergänzung säße der
     Dorf-Name-Header exakt auf der linken Bildschirmkante (Nutzer-Fund 2026-07-10:
     "Ortsangabe genau auf dem Rand"), während die Zeilen darunter korrekt um 1rem
     eingerückt sind. */
  .hof-list :global(.events-by-type__group-header) {
    padding: 0 1rem;
  }

  /* Adresse/Pill/Ort+Koordinaten in EINEM flex-wrap-Fluss statt drei erzwungenen
     Zeilen (Nutzer-Fund 2026-07-10, INV-UI-5) — .hof-list__row's `flex-direction:
     column` stapelte bisher jedes Geschwisterelement einzeln, unabhängig davon, ob
     die Breite gereicht hätte. Analog PlaceList.svelte's bereits korrektem
     `.place-list__title-line`-Muster (INV-UI-4), hier zusätzlich mit explizitem
     `flex-wrap` (dort fehlt es, bislang folgenlos nur weil der Inhalt dort stets
     passte). */
  .hof-list__title-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
  }

  .hof-list__addr {
    font-weight: 600;
  }
</style>
