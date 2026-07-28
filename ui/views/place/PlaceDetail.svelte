<script lang="ts">
  // ui/views/place/PlaceDetail.svelte — Orts-Steckbrief + Bearbeitung (Spec 20 §1.7 [K]:
  // "Ereignisse nach Typ, Quellen, … Bearbeitung: Name, Koordinaten, Typ, pnames,
  // enclosedBy", "String→PlaceObject verknüpfen", "Dubletten-Merge (verlustfrei,
  // Herkunfts-Pille)"). Namensvarianten werden als `.stb-pill`-Reihe angezeigt (INV-UI-4:
  // gemeinsamer Pill-Stil aus design-system.css statt eigenem Chip-CSS) — nach einem
  // Merge erscheint der Titel/die Varianten des zusammengeführten Orts hier als neue
  // Pille (Verlustfreiheit sichtbar). Merge selbst läuft NUR über den Kern-Chokepoint
  // `appState.mergePlace(survivorId, mergedId)` (Spec 02 §3) — keine Merge-Logik hier.
  // Die Mini-Karte (BL-09) ist als `PlaceMiniMap` eingebettet (gemeinsamer SVG-Renderer,
  // INV-UI-4); Übersetzungen (BL-59, `translations`) sitzen in der Namens-Varianten-Sektion
  // (Sprachachse neben der pnames-Zeitachse). Der SVG-Namens-Zeitstrahl bleibt AUSSER SCOPE
  // (Spec 20 §1.9/§1.10, imperative Insel — anderer Bauabschnitt).
  //
  // Verwaltungsgeschichte (Bau-Auftrag "Orts-Detailansicht"): die LESE-Ansicht zeigt hier
  // NUR `detail.hierarchyTimeline` (volle Kette je Schlüsseljahr, `place-detail-model.ts`,
  // s. ADR-v9-75). Die BEARBEITUNG der direkten `enclosedBy`-Zuordnung (Picker + Von/Bis-
  // Jahr) lebt in `PlaceEnclosureEditModal.svelte` (eigenes Overlay, analog EventEditModal,
  // INV-UI-4).
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import { tooltip } from '../../shell/tooltip';
  import DetailHeader from '../../shell/DetailHeader.svelte';
  import PlaceMergeSection from './PlaceMergeSection.svelte';
  import SourceBadge from '../../shell/SourceBadge.svelte';
  import EventsByType from '../../shell/EventsByType.svelte';
  import type { PlaceId } from '../../../core/model/types';
  import type { PlaceObject } from '../../../core/places/types';
  import { withAddedPname, withRemovedPname, withAddedTranslation, withRemovedTranslation } from '../../../core/places';
  import PlaceEditForm from './PlaceEditForm.svelte';
  import PlaceMiniMap from './PlaceMiniMap.svelte';
  import {
    buildPlaceDetail,
    type ChainSegment,
    type PlaceEventRow,
  } from './place-detail-model';
  import PlaceEnclosureEditModal from './PlaceEnclosureEditModal.svelte';
  import PlaceContemporaries from './PlaceContemporaries.svelte';

  interface Props {
    appState: AppState;
    viewState: ViewState;
    /** Cross-Tab-Navigation zu einer Person (analog Familie/Quelle, ADR-v9-17-Muster). */
    onNavigateToPerson?: (personId: string) => void;
    /** Cross-Tab-Navigation zu einer Familie. */
    onNavigateToFamily?: (familyId: string) => void;
    /** Cross-Tab-Navigation zur Quellen-Detailseite (optional, analog Person-/FamilyDetail). */
    onNavigateToSource?: (sourceId: string) => void;
    /** "← Zur Liste" (Spec 21 §6b: EINE gemeinsame Kopfzeile statt EntityTabs eigener
     *  Zeile) — optional, damit isolierte Tests/Kontexte ohne EntityTab weiterlaufen. */
    onBack?: () => void;
  }
  const { appState, viewState, onNavigateToPerson, onNavigateToFamily, onNavigateToSource, onBack }: Props = $props();

  /** Info-Tooltip-Text für die Verwaltungszugehörigkeit (Spec 21 §10g): ersetzt einen
   *  permanenten Fließtext-Satz durch ein ⓘ neben der Überschrift statt ihn stets
   *  einzublenden. */
  const ENCLOSURE_INFO =
    'Zugehörigkeit nach Jahr: die volle Verwaltungskette (bearbeitbar über ' +
    '„Zugehörigkeit bearbeiten") zu jedem Jahr, in dem sich die Kette ändert — auch ' +
    'wenn nur eine übergeordnete Ebene wechselt, nicht die direkte Zugehörigkeit selbst.';

  const placeId = $derived(viewState.getCurrent('place'));
  const detail = $derived(placeId ? buildPlaceDetail(appState.db, appState.placeContext, placeId) : null);
  /** Sprachachse (BL-59) — `?? []` toleriert aus feldloser orte.json geladene Orte. */
  const translations = $derived(detail ? (detail.place.translations ?? []) : []);

  let editing = $state(false);
  let newPnameValue = $state('');
  let newPnameFrom = $state<number | null>(null);
  let newPnameTo = $state<number | null>(null);
  /** Sprachachse (BL-59): neue Übersetzung (Sprachkürzel + Zielsprachen-Name). */
  let newTransLang = $state('');
  let newTransValue = $state('');

  /** Steuert PlaceEnclosureEditModal.svelte (Bau-Auftrag "Orts-Detailansicht": die
   *  direkte enclosedBy-Zuordnung ist "Mittel zum Zweck" und wandert ins Modal, weg von
   *  der Lesefläche). Nicht an `editing` gekoppelt — ein eigener, unabhängiger
   *  Bearbeiten-Zugriff analog dem "✎ Bearbeiten"-Button der Kopfzeile. */
  let enclosureModalOpen = $state(false);

  function openEnclosureModal() {
    enclosureModalOpen = true;
  }

  function closeEnclosureModal() {
    enclosureModalOpen = false;
  }

  /** Speichert das von PlaceEditForm gebaute PlaceObject und verlässt den Bearbeiten-Modus. */
  function handleSaveEdit(updated: PlaceObject) {
    appState.savePlace(updated);
    editing = false;
  }

  function addPname() {
    if (!detail || !newPnameValue.trim()) return;
    const next = withAddedPname(detail.place, newPnameValue, newPnameFrom, newPnameTo);
    appState.savePlace(next);
    newPnameValue = '';
    newPnameFrom = null;
    newPnameTo = null;
  }

  function removePname(index: number) {
    if (!detail) return;
    appState.savePlace(withRemovedPname(detail.place, index));
  }

  /** Übersetzung anhängen (Sprachachse, BL-59) — gleicher Sofort-Speichern-Pfad wie addPname. */
  function addTranslation() {
    if (!detail || !newTransValue.trim()) return;
    appState.savePlace(withAddedTranslation(detail.place, newTransLang, newTransValue));
    newTransLang = '';
    newTransValue = '';
  }

  function removeTranslation(index: number) {
    if (!detail) return;
    appState.savePlace(withRemovedTranslation(detail.place, index));
  }

  function linkUnlinked(eventKey: string) {
    if (!detail || !placeId) return;
    const row = detail.unlinkedEvents.find((r) => r.key === eventKey);
    if (!row) return;
    appState.linkEventToPlace(row.event, placeId);
  }

  function navigateToOwner(kind: 'person' | 'family', id: string) {
    if (kind === 'person') onNavigateToPerson?.(id);
    else onNavigateToFamily?.(id);
  }

  /** Kettenglied-Navigation (ADR-v9-78 Punkt 3): gleicher Cross-Tab-Mechanismus wie
   *  INV-UI-6/`goToPerson` (PersonDetail.svelte) — genau EIN kanonischer Navigations-Weg. */
  function goToPlace(id: PlaceId) {
    viewState.setCurrent('place', id);
  }


  /**
   * Löschen (ADR-v9-78 Punkt 1): destruktiv, mit nativem `confirm()` (kein etabliertes
   * Bestätigungs-Dialog-Muster im Projekt gefunden — Vereinfachen-vor-Erfinden). Räumt
   * hängende Event-Referenzen kaskadierend auf (`appState.deletePlace` →
   * `deletePlaceCascade`, s. app-state.svelte.ts) — hier nur der UI-Trigger + Navigation
   * zurück zur Liste danach.
   */
  function handleDelete() {
    if (!detail) return;
    const label = detail.place.title || detail.place.id;
    if (!window.confirm(`Ort „${label}" wirklich löschen? Ereignis-Verknüpfungen zu diesem Ort werden dabei entfernt (nicht die Ereignisse selbst).`)) {
      return;
    }
    appState.deletePlace(detail.place.id);
    editing = false;
    onBack?.();
  }

</script>

{#snippet placeEventRow(row: PlaceEventRow)}
  <button type="button" class="place-detail__owner-link" onclick={() => navigateToOwner(row.ownerKind, row.ownerId)}>
    {row.ownerLabel}
  </button>
  {#if row.year}<span class="place-detail__muted">{row.year}</span>{/if}
  {#each row.citations as cit, i (i)}
    <SourceBadge citation={cit} source={appState.db.sources.get(cit.sourceId)} onSelect={onNavigateToSource} />
  {/each}
{/snippet}

<!-- Verwaltungsketten-Segmente klickbar (ADR-v9-78 Punkt 3): jedes Segment navigiert per
     goToPlace, außer dem Segment, das auf DIESEN Ort selbst zeigt (kein Selbst-Link) —
     das ist bei der "Aktuell:"-Kette das erste Segment, bei den Zeitleisten-Zeilen kommt
     die eigene Id gar nicht vor (bereits serverseitig .slice(1)). -->
{#snippet chainRow(chain: ChainSegment[], truncated: boolean)}
  {#each chain as seg, i (seg.id)}
    {#if i > 0}<span class="place-detail__chain-sep"> › </span>{/if}
    {#if seg.id === placeId}
      <span class="place-detail__chain-seg place-detail__chain-seg--self">{seg.label}</span>
    {:else}
      <button type="button" class="place-detail__chain-seg" onclick={() => goToPlace(seg.id)}>{seg.label}</button>
    {/if}
  {/each}
  {#if truncated}<span class="place-detail__chain-sep"> › </span><span class="place-detail__muted">?</span>{/if}
{/snippet}

<div class="place-detail">
  {#if !placeId}
    <p class="place-detail__empty">Kein Ort ausgewählt.</p>
  {:else if !detail}
    <p class="place-detail__empty">Ort nicht gefunden (evtl. gelöscht oder Datei gewechselt).</p>
  {:else}
    <DetailHeader title={detail.place.title || detail.place.id} onBack={onBack ?? (() => {})}>
      {#snippet actions()}
        {#if detail.place.type}<span class="place-detail__type-badge">{detail.place.type}</span>{/if}
        {#if !editing}
          <button type="button" class="place-detail__edit-btn" onclick={() => (editing = true)}>✎ Bearbeiten</button>
        {/if}
      {/snippet}
    </DetailHeader>

    {#if editing}
      <PlaceEditForm
        place={detail.place}
        onSave={handleSaveEdit}
        onCancel={() => (editing = false)}
        onDelete={handleDelete}
      />
    {/if}

    <section class="place-detail__section">
      <h3>
        Verwaltungszugehörigkeit
        <span class="place-detail__info-icon" role="note" aria-label={ENCLOSURE_INFO} use:tooltip={ENCLOSURE_INFO}>ⓘ</span>
      </h3>
      {#if detail.enclosureChain.length > 1}
        <p class="place-detail__hint">Aktuell:</p>
        <p class="place-detail__chain">{@render chainRow(detail.enclosureChain, false)}</p>
      {/if}
      {#if detail.hierarchyTimeline.length > 0}
        <p class="place-detail__hint">Zugehörigkeit nach Jahr (volle Kette):</p>
        <ul class="place-detail__timeline-list">
          {#each detail.hierarchyTimeline as row, i (i)}
            <li class="place-detail__timeline-row">
              <span class="place-detail__timeline-span">{row.year}</span>
              {#if row.chain}
                <span>{@render chainRow(row.chain, row.truncated)}</span>
              {:else}
                <span class="place-detail__muted">unbekannt</span>
              {/if}
            </li>
          {/each}
        </ul>
      {:else}
        <p class="place-detail__muted">Keine übergeordnete Zugehörigkeit erfasst.</p>
      {/if}
      <div class="place-detail__enclosure-edit-row">
        <button type="button" class="place-detail__enclosure-edit-btn" onclick={openEnclosureModal}>
          Zugehörigkeit bearbeiten
        </button>
      </div>
    </section>

    {#if enclosureModalOpen && placeId}
      <PlaceEnclosureEditModal {appState} {placeId} onClose={closeEnclosureModal} />
    {/if}

    {#if detail.variants.length > 0 || translations.length > 0 || editing}
      <section class="place-detail__section">
        <h3>Namens-Varianten</h3>
        {#if detail.variants.length > 0}
          <div class="stb-pill-row" aria-label="Namensvarianten">
            {#each detail.variants as v, i (i)}
              <span class="stb-pill" use:tooltip={v.from || v.to ? `${v.from ?? '…'}–${v.to ?? '…'}` : undefined}>
                {v.value}
                {#if editing}
                  <button type="button" class="stb-pill__remove" onclick={() => removePname(i)} aria-label={`Namensvariante „${v.value}" entfernen`}>✕</button>
                {/if}
              </span>
            {/each}
          </div>
        {/if}
        {#if editing}
          <div class="place-detail__add-row">
            <input type="text" placeholder="neue Schreibweise…" bind:value={newPnameValue} aria-label="Neue Namensvariante" />
            <input type="number" placeholder="von" bind:value={newPnameFrom} aria-label="Gültig von (Jahr)" />
            <input type="number" placeholder="bis" bind:value={newPnameTo} aria-label="Gültig bis (Jahr)" />
            <button type="button" onclick={addPname}>+ Hinzufügen</button>
          </div>
        {/if}

        <!-- Übersetzungen (Sprachachse, BL-59) — dieselbe Pill-/Add-Zeilen-Optik wie pnames
             (INV-UI-4), nur der Feld-Schnitt (Sprachkürzel + Text statt Zeitraum + Text)
             unterscheidet sich. Gleiches Bearbeitungs-Modus-Gating (kein Add/Remove außerhalb
             `editing`, ADR-v9-30) — kein zweiter Editier-Zustand, keine zweite Sektion. -->
        {#if translations.length > 0 || editing}
          <p class="place-detail__hint">Übersetzungen (Sprachen):</p>
          {#if translations.length > 0}
            <div class="stb-pill-row" aria-label="Übersetzungen">
              {#each translations as t, i (i)}
                <span class="stb-pill">
                  <span class="place-detail__trans-lang">{t.lang}</span> {t.value}
                  {#if editing}
                    <button type="button" class="stb-pill__remove" onclick={() => removeTranslation(i)} aria-label={`Übersetzung „${t.value}" entfernen`}>✕</button>
                  {/if}
                </span>
              {/each}
            </div>
          {/if}
          {#if editing}
            <div class="place-detail__add-row">
              <input type="text" class="place-detail__trans-lang-input" placeholder="Sprache (z. B. pl)" bind:value={newTransLang} aria-label="Sprachkürzel" />
              <input type="text" placeholder="Name in dieser Sprache…" bind:value={newTransValue} aria-label="Übersetzter Ortsname" />
              <button type="button" onclick={addTranslation}>+ Übersetzung</button>
            </div>
          {/if}
        {/if}
      </section>
    {/if}

    <PlaceMiniMap lat={detail.place.lat} long={detail.place.long} label={detail.place.title || detail.place.id} />

    {#if editing && placeId}
      <PlaceMergeSection {appState} {viewState} place={detail.place} {placeId} />
    {/if}

    {#if detail.unlinkedEvents.length > 0}
      <section class="place-detail__section place-detail__unlinked">
        <h3>Nicht verknüpfte Ereignisse ({detail.unlinkedEvents.length})</h3>
        <p class="place-detail__muted">
          Diese Ereignisse nennen „{detail.place.title}" nur als Text — noch ohne Verknüpfung zu diesem Ort.
        </p>
        <ul>
          {#each detail.unlinkedEvents as row (row.key)}
            <li>
              <span class="place-detail__unlinked-owner">{row.ownerLabel}</span>
              <span class="place-detail__muted">{row.eventType} · „{row.placeText}"</span>
              <button type="button" class="place-detail__link-btn" onclick={() => linkUnlinked(row.key)}>
                Verknüpfen
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <section class="place-detail__section">
      <h3>Ereignisse nach Typ</h3>
      {#if detail.eventsByType.length === 0}
        <p class="place-detail__muted">Keine Ereignisse an diesem Ort erfasst.</p>
      {:else}
        <!-- resetKey: PlaceDetail bleibt beim Ortswechsel GEMOUNTET (Kettenglied-Klick,
             ADR-v9-78 Punkt 3, setzt nur viewState) — ohne diesen Schlüssel trüge der
             neue Ort Einklapp-/Paginierungs-Zustand des vorherigen weiter (ADR-v9-78
             Punkt 6, EventsByType). -->
        <EventsByType groups={detail.eventsByType} row={placeEventRow} resetKey={placeId} />
      {/if}
    </section>

    <PlaceContemporaries {appState} {placeId} {onNavigateToPerson} />

    {#if detail.citations.length > 0}
      <section class="place-detail__section">
        <h3>Quellen ({detail.citations.length})</h3>
        <div class="place-detail__citations">
          {#each detail.citations as cit (cit.sourceId)}
            <SourceBadge citation={cit} source={appState.db.sources.get(cit.sourceId)} onSelect={onNavigateToSource} />
          {/each}
        </div>
      </section>
    {/if}
  {/if}
</div>

<style>
  .place-detail {
    padding: 1rem;
    overflow-y: auto;
  }

  .place-detail__empty {
    color: var(--stb-text-dim);
  }

  .place-detail__type-badge {
    font-size: 0.72rem;
    color: var(--stb-text-dim);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.1em 0.5em;
  }

  .place-detail__edit-btn {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
    font-size: 0.82rem;
  }

  .place-detail__section {
    margin-top: 1.25rem;
  }

  .place-detail__section h3 {
    font-size: 0.95rem;
    color: var(--stb-gold-light);
    margin-bottom: 0.4rem;
  }

  .place-detail__muted {
    color: var(--stb-text-dim);
    font-size: 0.85rem;
  }

  .place-detail__hint {
    color: var(--stb-text-dim);
    font-size: 0.78rem;
    margin: 0.6rem 0 0.2rem;
  }

  .place-detail__chain {
    font-size: 0.9rem;
  }

  /* Kettenglieder klickbar (ADR-v9-78 Punkt 3) — gleicher randlose-Text-Button-Stil wie
     .place-detail__owner-link (INV-UI-4: identisches Muster bereits in dieser Datei). */
  .place-detail__chain-seg {
    background: transparent;
    border: none;
    color: var(--stb-gold-light);
    cursor: pointer;
    padding: 0;
    font: inherit;
    font-size: inherit;
    text-decoration: underline;
  }

  /* Segment, das auf diesen Ort selbst zeigt — kein Link, reiner Text (kein Selbst-Link). */
  .place-detail__chain-seg--self {
    color: inherit;
    cursor: default;
    text-decoration: none;
  }

  .place-detail__chain-sep {
    color: var(--stb-text-dim);
  }


  .place-detail__link-btn {
    background: var(--stb-gold);
    color: var(--stb-bg);
    border: none;
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.8rem;
    cursor: pointer;
    font-weight: 600;
  }

  .place-detail__unlinked ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .place-detail__unlinked li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.3rem 0;
    border-bottom: 1px solid var(--stb-surface-2);
    flex-wrap: wrap;
  }

  /* Zugehörigkeit nach Jahr (Bau-Auftrag "Orts-Detailansicht", v8-Vorbild
     `_placeDetailHierarchyTimeline`): eine Zeile je Schlüsseljahr, an dem sich die volle
     Verwaltungskette ändert. Grid statt Flex-Wrap: das Jahr behält eine FESTE Spalte,
     die Kette bekommt eine eigene Spalte mit fester linker Kante — bricht die Kette
     über mehrere Zeilen um, bleiben ALLE Zeilen konsistent unter der Kette eingerückt,
     statt (wie bei Flex-Wrap) als eigene, am linken Rand beginnende Zeile umzubrechen. */
  .place-detail__timeline-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .place-detail__timeline-row {
    display: grid;
    grid-template-columns: 3.5rem 1fr;
    column-gap: 0.6rem;
    align-items: baseline;
    border-bottom: 1px solid var(--stb-surface-2);
    padding: 0.3rem 0;
  }

  .place-detail__timeline-span {
    color: var(--stb-text-dim);
    font-size: 0.8rem;
  }

  .place-detail__enclosure-edit-row {
    margin-top: 0.6rem;
  }

  .place-detail__enclosure-edit-btn {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
    font-size: 0.82rem;
  }

  .place-detail__citations {
    display: flex;
    gap: 0.3rem;
    flex-wrap: wrap;
  }

  /* Info-Affordance (Spec 21 §10g): ⓘ neben einer Überschrift statt permanenten
     Erklär-Fließtexts — native title-Tooltip, keine neue Abhängigkeit. */
  .place-detail__info-icon {
    color: var(--stb-text-dim);
    font-size: 0.8rem;
    cursor: help;
  }

  .place-detail__add-row {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    margin-top: 0.5rem;
  }

  .place-detail__add-row input {
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.5rem;
  }

  /* Sprachkürzel-Eingabe (BL-59) schmal — nur wenige Zeichen (ISO-639, z. B. „pl"). */
  .place-detail__add-row input.place-detail__trans-lang-input {
    max-width: 8rem;
  }

  /* Sprachkürzel-Badge vor dem übersetzten Namen in der Pille (BL-59). */
  .place-detail__trans-lang {
    font-size: 0.7rem;
    text-transform: uppercase;
    color: var(--stb-bg);
    background: var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.05em 0.35em;
    margin-right: 0.15em;
  }

  .place-detail__add-row button {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
  }

  .place-detail__add-row button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }


  .place-detail__unlinked-owner {
    font-weight: 600;
  }

  .place-detail__owner-link {
    background: transparent;
    border: none;
    color: var(--stb-gold-light);
    cursor: pointer;
    padding: 0;
    font: inherit;
    text-decoration: underline;
  }

</style>
