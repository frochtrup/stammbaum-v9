<script lang="ts">
  // ui/views/place/PlaceList.svelte — Orte-Tab-Liste (Spec 20 §1.7 [K]). Typ-Badge,
  // Koordinaten-Indikator, Typ-Filter, Admin-Filter, Gruppen-Modus (pnames-Varianten
  // unter dem Titel). Suche über Titel + pnames. Anreicherungs-Pille (ADR-v9-44) +
  // Referenz-Filter (ADR-v9-46, Spec 11 §9.3): die Hauptliste zeigt nur referenzierte
  // Orte, ein Segment-Umschalter (`.stb-segment-row`, INV-UI-4) wechselt zum separaten
  // "Ohne Bezug"-Abschnitt — dort bleiben Orte voll editierbar/löschbar (Klick navigiert
  // wie gewohnt zu PlaceDetail), nur die Hauptlisten-Sichtbarkeit ändert sich.
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import type { LensId } from '../../shell/lens-model';
  import { collectAllEvents } from '../../shell/all-events';
  import FilterBar from '../../shell/FilterBar.svelte';
  import CoordIndicator from '../../shell/CoordIndicator.svelte';
  import { countActiveFilters } from '../../shell/count-active-filters';
  import { placeTypeLabel } from '../../shell/place-labels';
  import {
    buildPlaceListSections,
    defaultPlaceFilters,
    knownPlaceTypes,
    type PlaceFilters,
  } from './place-list-model';
  import { buildPlaceDedupGroups } from './place-dedup-model';
  import { buildPlaceReview } from './place-review-model';
  import { batchGeocodePlaces, browserGeocodeDeps } from '../../../services/places';

  interface Props {
    appState: AppState;
    viewState: ViewState;
    /** "Massen-Dedup" (Spec 20 §1.7 [K], Spec 21 §10c): der Button lebt in der eigenen
     *  Toolbar dieser Liste (Toolbar-Ownership), die eigentliche Ansichts-Umschaltung
     *  bleibt bei EntityTab (das entscheidet, ob PlaceList oder PlaceDedupView rendert). */
    /** "Orts-Zuweisungen prüfen" (Klasse P, Spec 11 §6) — Overlay-Öffner, analog
     *  HofList's onOpenReview. EntityTab entscheidet, welche Komponente rendert. */
    onOpenReview?: () => void;
    onOpenDedup?: () => void;
    /** Cross-Tab-Navigation zur Karte-Lens (ADR-v9-78/80, `CoordIndicator`) — optional,
     *  damit isolierte Tests/Kontexte ohne Lens-Umschalter weiterlaufen. */
    onNavigateLens?: (lens: LensId) => void;
  }
  const { appState, viewState, onOpenReview, onOpenDedup, onNavigateLens }: Props = $props();

  let query = $state('');
  let filters = $state<PlaceFilters>(defaultPlaceFilters());
  /** Blendet die pnames-Varianten unter dem Titel ein (Anzeige, kein Filter — s. Markup).
   *  Der v8-Name „Gruppen-Modus" trug noch die string-basierte Liste im Rücken; in v9 ist
   *  die Liste ID-basiert, die Gruppierung also strukturell schon passiert — sichtbar
   *  gemacht werden nur noch die Varianten selbst (ADR-v9-149). */
  let groupMode = $state(false);
  let section = $state<'referenced' | 'unreferenced'>('referenced');
  /** Batch-Geocoding-Fortschritt (BL-130): `null` = nicht gelaufen. */
  let batch = $state<{ running: boolean; done: number; total: number; ok: number } | null>(null);

  /**
   * Geocodiert alle referenzierten Orte OHNE Koordinaten via Nominatim (ratenlimitiert,
   * ~1,1 s je Ort). Übernimmt fill-if-empty (vorhandene Kuration bleibt), zeigt Fortschritt.
   * Opt-in — nur auf Klick; kann bei vielen Orten Minuten dauern.
   */
  async function geocodeAllMissing() {
    const targets = sections.referenced
      .filter((r) => !r.hasCoords)
      .map((r) => appState.db.placeObjects.get(r.id))
      .filter((p): p is NonNullable<typeof p> => !!p);
    if (targets.length === 0) {
      batch = { running: false, done: 0, total: 0, ok: 0 };
      return;
    }
    batch = { running: true, done: 0, total: targets.length, ok: 0 };
    const hits = await batchGeocodePlaces(
      targets.map((p) => p.title),
      browserGeocodeDeps(),
      (p) => (batch = { running: true, done: p.done, total: p.total, ok: batch?.ok ?? 0 }),
    );
    let ok = 0;
    for (const p of targets) {
      const hit = hits.get(p.title);
      if (!hit) continue;
      appState.savePlace({
        ...p,
        lat: p.lat ?? hit.lat,
        long: p.long ?? hit.long,
        type: !p.type || p.type === 'Unknown' ? hit.type : p.type,
      });
      ok++;
    }
    batch = { running: false, done: targets.length, total: targets.length, ok };
  }

  const activeFilterCount = $derived(countActiveFilters(filters, defaultPlaceFilters()));
  const events = $derived(collectAllEvents(appState.db));

  // Kurations-Handlungsbedarf (BL-206, ADR-v9-148): der immer sichtbare „Werkzeuge"-
  // Trigger trägt einen Achtungs-Punkt, sobald ein Werkzeug offene Fälle hat. Nur von
  // appState.db abhängig (nicht von query/filters) — rechnet daher bei Datenänderung, nicht
  // pro Tastendruck. GOV-Platzhalter fehlen bewusst: GOV-Import ist [S] (Spec 20 §1.7), noch
  // kein gebautes Werkzeug — fällt in den Dot, sobald es existiert. Beschriftete Einzelzähler
  // erscheinen nur aufgeklappt (keine Glyphen, kein Badge auf verborgenem Button).
  const placeDedupCount = $derived(buildPlaceDedupGroups(appState.db, appState.placeContext, events).length);
  const placeReviewCount = $derived(buildPlaceReview(appState.db, appState.placeContext).rows.length);
  const toolsAttention = $derived(placeDedupCount > 0 || placeReviewCount > 0);
  const sections = $derived(buildPlaceListSections(appState.db, appState.placeContext, events, query, filters));
  const rows = $derived(section === 'referenced' ? sections.referenced : sections.unreferenced);
  const types = $derived(knownPlaceTypes(appState.db));

  // Alphabet-Trenner (BL-204): erster Buchstabe des Titels, Nicht-Buchstaben → „#".
  function placeInitial(title: string): string {
    const ch = title.trim().charAt(0).toUpperCase();
    return /[A-ZÄÖÜ0-9]/.test(ch) ? ch : '#';
  }
  const isEmpty = $derived(appState.db.placeObjects.size === 0);

  function selectPlace(id: string) {
    viewState.setCurrent('place', id);
  }

  function clearSearch() {
    query = '';
  }

  function resetFilters() {
    filters = defaultPlaceFilters();
  }
</script>

<div class="place-list">
  {#if isEmpty}
    <p class="place-list__empty">
      Noch keine Orte — Orte werden beim Laden einer GEDCOM-Datei automatisch aus den
      Ereignissen übernommen. Lade eine Datei, oder die geladene Datei enthält keine Orte.
    </p>
  {:else}
    <div class="place-list__toolbar">
      <div class="place-list__search">
        <input type="search" placeholder="Suche…" aria-label="Orte durchsuchen" bind:value={query} />
        {#if query}
          <button type="button" class="place-list__search-clear" aria-label="Suche löschen" onclick={clearSearch}>✕</button>
        {/if}
      </div>
      <FilterBar activeCount={activeFilterCount}>
        <div class="place-list__filters">
          <label>
            Typ
            <select value={filters.type} onchange={(e) => (filters.type = e.currentTarget.value)}>
              <option value="">alle</option>
              <!-- `knownPlaceTypes` liefert bereits deutsche, auf dem Label deduplizierte
                   Kategorien (ADR-v9-149) — „Stadt" steht EINMAL und fängt `Town` wie
                   `City`. Gefiltert wird auf derselben Kategorie, die hier sichtbar ist. -->
              {#each types as t (t)}
                <option value={t}>{t}</option>
              {/each}
            </select>
          </label>
          <label class="place-list__checkbox">
            <input type="checkbox" bind:checked={filters.hideAdmin} />
            Verwaltungseinheiten ausblenden
          </label>
          <!-- Kurations-Arbeitsliste statt Zeilen-Pille (ADR-v9-149). Liegt hier in der
               FilterBar-Disclosure, nicht als Dauer-Element — dieselbe Zuordnungsregel wie
               INV-UI-11 („Filter → immer hinter FilterBar") und dieselbe Richtung wie
               ADR-v9-148 (Kurations-Handlungsbedarf aggregiert, nicht je Zeile verstreut). -->
          <label class="place-list__checkbox">
            <input type="checkbox" bind:checked={filters.onlyIncomplete} />
            nur unvollständige
          </label>
          <!-- Anzeige-Option, bewusst NICHT in `PlaceFilters` (ADR-v9-149): sie filtert
               nichts, sie blendet die pnames-Varianten unter dem Titel ein. Läge sie in
               `filters`, zählte `countActiveFilters` sie mit und der Trigger meldete
               „Filter · 1", obwohl die Liste vollständig ist — ein unehrliches Signal.
               Sie sitzt trotzdem hier, weil sie als Dauer-Element im Kopf eine dritte
               Toolbar-Zeile erzwang (bei 375px gemessen: 81px/3 Zeilen → INV-UI-11-Bruch). -->
          <label class="place-list__checkbox">
            <input type="checkbox" bind:checked={groupMode} />
            Namensvarianten anzeigen
          </label>
          <button type="button" class="place-list__filter-reset" onclick={resetFilters}>Filter zurücksetzen</button>
        </div>
      </FilterBar>
      {#if onOpenReview || onOpenDedup}
        <!-- Kuratierungs-Werkzeuge hinter EINEM Einstiegspunkt (Spec 21 §6h: "seltene/
             schwere Konfiguration → hinter EINEM Einstiegspunkt, niemals ein Dauer-Icon
             in der Kopfzeile"). Vorher standen beide dauerhaft in der Toolbar — auf der
             Desktop-Listenspalte (352px, also SCHMALER als die mobile Zielbreite) ergab
             das drei Umbruchzeilen und 161px Kopfbereich, gemessen (BL-96).
             Dieselbe Disclosure-Mechanik wie die Filter, nur mit anderer Beschriftung —
             kein zweiter Mechanismus (INV-UI-4). -->
        <FilterBar label="Werkzeuge" attention={toolsAttention}>
          <div class="place-list__tools">
            {#if onOpenReview}
              <button type="button" class="place-list__dedup-btn" onclick={onOpenReview}>Orts-Zuweisungen prüfen{placeReviewCount > 0 ? ` · ${placeReviewCount}` : ''}</button>
            {/if}
            {#if onOpenDedup}
              <button type="button" class="place-list__dedup-btn" onclick={onOpenDedup}>Massen-Dedup{placeDedupCount > 0 ? ` · ${placeDedupCount} ${placeDedupCount === 1 ? 'Gruppe' : 'Gruppen'}` : ''}</button>
            {/if}
            <button
              type="button"
              class="place-list__dedup-btn"
              onclick={geocodeAllMissing}
              disabled={batch?.running}
            >
              📍 Alle ohne Koordinaten geocodieren
            </button>
            {#if batch}
              <span class="place-list__geocode-status">
                {#if batch.running}Geocodiere… {batch.done}/{batch.total}
                {:else if batch.total === 0}Alle referenzierten Orte haben bereits Koordinaten.
                {:else}✓ {batch.ok} von {batch.total} geocodiert.{/if}
              </span>
            {/if}
          </div>
        </FilterBar>
      {/if}
    </div>

    <div class="stb-segment-row place-list__sections" role="tablist" aria-label="Orte-Abschnitt wählen">
      <button
        type="button"
        role="tab"
        aria-selected={section === 'referenced'}
        class="stb-segment-btn"
        class:stb-segment-btn--active={section === 'referenced'}
        onclick={() => (section = 'referenced')}
      >
        Orte ({sections.referenced.length})
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

    {#if rows.length === 0}
      <p class="place-list__empty">
        {section === 'referenced' ? 'Keine Orte gefunden.' : 'Keine referenzlosen Orte.'}
      </p>
    {:else}
      <ul class="place-list__rows">
        {#each rows as row, i (row.id)}
          <!-- Alphabetischer Trenner (BL-204): beim ersten Buchstabenwechsel des Titels. -->
          {#if i === 0 || placeInitial(row.title) !== placeInitial(rows[i - 1].title)}
            <li class="place-list__letter" role="separator">{placeInitial(row.title)}</li>
          {/if}
          <li>
            <button type="button" class="place-list__row" onclick={() => selectPlace(row.id)}>
              <span class="place-list__title-line">
                <span class="place-list__title">{row.title}</span>
                <!-- Deutsches Label über DIE EINE Quelle (ADR-v9-149); `Unknown`/leer
                     liefert '' → kein Chip, statt „Unbekannt" auf der Mehrheit der Zeilen. -->
                {#if placeTypeLabel(row.type)}<span class="stb-pill">{placeTypeLabel(row.type)}</span>{/if}
                {#if row.hasHierarchy}<span class="stb-pill">Hierarchie</span>{/if}
                <!-- Die frühere „ohne Zusatzangaben"-Pille ist entfallen (ADR-v9-149):
                     `enriched === false` ist nach dem Import der Regelfall, die Pille stand
                     also auf der Mehrheit der Zeilen und trug die höchste Wortlast für den
                     informationsärmsten Zustand. Dieselbe Information liegt jetzt im Filter
                     „nur unvollständige" (Kurations-Abfrage statt Zeilen-Label) —
                     Zeilen tragen nur noch POSITIVE Fakten. -->
                <CoordIndicator coords={row.coords} focusId={row.id} {viewState} {onNavigateLens} />
              </span>
              {#if row.personCount > 0}
                <span class="place-list__meta">{row.personCount} {row.personCount === 1 ? 'Person' : 'Personen'}</span>
              {/if}
              {#if groupMode && row.variants.length > 0}
                <span class="place-list__variants">{row.variants.join(' · ')}</span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>

<style>
  .place-list {
    overflow-y: auto;
  }

  .place-list__empty {
    padding: 1.5rem;
    color: var(--stb-text-dim);
  }

  /* Segment-Pillen selbst kommen aus design-system.css (.stb-segment-row/-btn, INV-UI-4)
     — hier nur die lokale Trennlinie unter der Reihe. */
  .place-list__sections {
    border-bottom: 1px solid var(--stb-surface-3);
  }

  .place-list__toolbar {
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

  .place-list__filter-reset,
  .place-list__dedup-btn {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.7rem;
    cursor: pointer;
    font-size: 0.85rem;
  }

  .place-list__filter-reset:hover,
  .place-list__dedup-btn:hover {
    border-color: var(--stb-gold);
  }

  /* Bulk-Aktionen (Massen-Dedup) rechtsbündig, sofern Platz in der Zeile ist. margin-left:
     auto ist hier sicher (TST-11), weil dieser Block IMMER das letzte Element der
     Toolbar-Zeile ist, wenn er überhaupt gerendert wird (kein Geschwister danach). */
  .place-list__tools {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .place-list__geocode-status {
    font-size: 0.8rem;
    color: var(--stb-text-dim);
  }

  .place-list__search {
    position: relative;
    flex: 1 1 160px;
    display: flex;
    align-items: center;
  }

  .place-list__search input[type='search'] {
    width: 100%;
    background: var(--stb-surface-1);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 1.8rem 0.35rem 0.6rem;
    font-size: 0.85rem;
  }

  .place-list__search-clear {
    position: absolute;
    right: 0.4rem;
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
  }

  .place-list__filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: flex-end;
  }

  .place-list__filters label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.78rem;
    color: var(--stb-text-dim);
  }

  .place-list__filters select {
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.5rem;
  }

  .place-list__checkbox {
    flex-direction: row !important;
    align-items: center;
    gap: 0.4rem !important;
  }

  .place-list__rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  /* Alphabetischer Trenner (BL-204) — dieselbe Optik wie die Personenliste-Trenner. */
  .place-list__letter {
    padding: 0.3rem 1rem 0.1rem;
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--stb-gold-light);
    text-transform: uppercase;
  }

  /* Personen-Zähler je Ort (BL-204). */
  .place-list__meta {
    font-size: 0.78rem;
    color: var(--stb-text-dim);
  }

  .place-list__row {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--stb-surface-2);
    padding: 0.55rem 1rem;
    text-align: left;
    cursor: pointer;
    color: var(--stb-text);
  }

  .place-list__row:hover,
  .place-list__row:focus-visible {
    background: var(--stb-surface-2);
  }

  /* flex-wrap (Nutzer-Fund-Analog HofList.svelte, TST-11): mit Hierarchie-Badge PLUS
     Anreicherungs-Pille PLUS CoordIndicator kann diese Zeile auf 375px (primäre
     mobile Zielbreite, Spec 21 §2) mehr Inhalt tragen, als in eine Zeile passt. */
  .place-list__title-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

  .place-list__title {
    font-weight: 600;
  }

  .place-list__variants {
    font-size: 0.78rem;
    color: var(--stb-text-dim);
  }
</style>
