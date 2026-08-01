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
  import type { PlacesHost, PlacesNav } from '../../shell/places-host';
  import type { LensId } from '../../shell/lens-model';
  import { tooltip } from '../../shell/tooltip';
  import DetailHeader from '../../shell/DetailHeader.svelte';
  import ReviewedToggle from '../../shell/ReviewedToggle.svelte';
  import { markPlaceReviewed } from '../../../core/places';
  import { placeTypeLabel, placeHeading } from '../../shell/place-labels';
  import PlaceMergeSection from './PlaceMergeSection.svelte';
  import SourceBadge from '../../shell/SourceBadge.svelte';
  import EventsByType from '../../shell/EventsByType.svelte';
  import type { PlaceId } from '../../../core/model/types';
  import type { PlaceObject } from '../../../core/places/types';
  import PlaceEditForm from './PlaceEditForm.svelte';
  import PlaceNamesSection from './PlaceNamesSection.svelte';
  import PlaceMiniMap from './PlaceMiniMap.svelte';
  import {
    buildPlaceDetail,
    type ChainSegment,
    type PlaceEventRow,
  } from './place-detail-model';
  import PlaceEnclosureEditModal from './PlaceEnclosureEditModal.svelte';
  import GovImportSection from './GovImportSection.svelte';
  import PlaceContemporaries from './PlaceContemporaries.svelte';

  interface Props {
    appState: PlacesHost;
    viewState: PlacesNav;
    /** Cross-Tab-Navigation zu einer Person (analog Familie/Quelle, ADR-v9-17-Muster). */
    onNavigateToPerson?: (personId: string) => void;
    /** Cross-Tab-Navigation zu einer Familie. */
    onNavigateToFamily?: (familyId: string) => void;
    /** Cross-Tab-Navigation zur Quellen-Detailseite (optional, analog Person-/FamilyDetail). */
    onNavigateToSource?: (sourceId: string) => void;
    /** "← Zur Liste" (Spec 21 §6b: EINE gemeinsame Kopfzeile statt EntityTabs eigener
     *  Zeile) — optional, damit isolierte Tests/Kontexte ohne EntityTab weiterlaufen. */
    onBack?: () => void;
    /** Sprung zur Karte-Lens über die Mini-Karte (ADR-v9-150, INV-UI-3). */
    onNavigateLens?: (lens: LensId) => void;
  }
  const { appState, viewState, onNavigateToPerson, onNavigateToFamily, onNavigateToSource, onBack, onNavigateLens }: Props = $props();

  /** Info-Tooltip-Text für die Verwaltungszugehörigkeit (Spec 21 §10g): ersetzt einen
   *  permanenten Fließtext-Satz durch ein ⓘ neben der Überschrift statt ihn stets
   *  einzublenden. */
  const ENCLOSURE_INFO =
    'Zugehörigkeit nach Jahr: die volle Verwaltungskette (bearbeitbar über ' +
    '„Zugehörigkeit bearbeiten") zu jedem Jahr, in dem sich die Kette ändert — auch ' +
    'wenn nur eine übergeordnete Ebene wechselt, nicht die direkte Zugehörigkeit selbst.';

  /** ADR-v9-191: erklärt, WESSEN Geschichte der zweite Block zeigt — ohne diese Zuschreibung
   *  las sich eine geerbte Jahresreihe wie die Historie dieses Orts. */
  const ANCESTOR_INFO =
    'Für diesen Ort ist keine datierte Zugehörigkeit erfasst. Die folgenden Jahre sind ' +
    'die Verwaltungsgeschichte der übergeordneten Ebenen — sie sagen nichts darüber aus, ' +
    'wann sich die Zugehörigkeit dieses Orts selbst geändert hat.';

  const placeId = $derived(viewState.getCurrent('place'));
  const detail = $derived(placeId ? buildPlaceDetail(appState.db, appState.placeContext, placeId) : null);

  let editing = $state(false);

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
    const label = placeHeading(detail.place);
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
    <DetailHeader title={placeHeading(detail.place)} onBack={onBack ?? (() => {})}>
      {#snippet actions()}
        <!-- Deutsches Label über DIE EINE Quelle (ADR-v9-149). `Unknown`/leer liefert ''
             → gar kein Badge: ein nicht kategorisierter Ort ist der Regelfall direkt nach
             dem Import (ADR-v9-77 „der normale, unauffällige Fall"), kein Handlungssignal
             im Steckbrief-Kopf. -->
        {#if placeTypeLabel(detail.place.type)}<span class="place-detail__type-badge">{placeTypeLabel(detail.place.type)}</span>{/if}
        {#if !editing}
          <!-- ADR-v9-191: der EINZIGE Weg zum Prüf-Marker. Bewusst neben „Bearbeiten" und
               nicht darin: „angesehen, nichts zu ergänzen" ist gerade der Fall, in dem
               niemand den Editor öffnet. -->
          <ReviewedToggle
            reviewedAt={detail.place.reviewedAt}
            kind="Ort"
            onToggle={(at) => appState.savePlace(markPlaceReviewed(detail.place, at))}
          />
          <button type="button" class="place-detail__edit-btn" onclick={() => (editing = true)}>✎ Bearbeiten</button>
        {:else}
          <!-- Der Modus wird von dem Schalter geschlossen, der ihn geöffnet hat (INV-UI-16,
               ADR-v9-193). Vorher tat das „Abbrechen" des Grunddaten-Formulars mit — und
               weil `editing` auch die sofort committenden Abschnitte sichtbar macht
               (Namensvarianten, Zugehörigkeit, GOV-Import, Merge), las sich dieser Klick
               als Rücknahme von allem seit dem Öffnen. Das war er nie. -->
          <button type="button" class="place-detail__edit-btn" onclick={() => (editing = false)}>Fertig</button>
        {/if}
      {/snippet}
    </DetailHeader>

    {#if editing}
      <PlaceEditForm
        place={detail.place}
        onSave={handleSaveEdit}
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
        <p class="place-detail__hint">
          {detail.hierarchyTimeline[0].year == null
            ? 'Eigene Zugehörigkeit:'
            : 'Zugehörigkeit nach Jahr (volle Kette):'}
        </p>
        <ul class="place-detail__timeline-list">
          {#each detail.hierarchyTimeline as row, i (i)}
            <li class="place-detail__timeline-row">
              <span class="place-detail__timeline-span">{row.label}</span>
              {#if row.chain}
                <span>{@render chainRow(row.chain, row.truncated)}</span>
              {:else}
                <span class="place-detail__muted">unbekannt</span>
              {/if}
            </li>
          {/each}
        </ul>
      {:else if detail.enclosureChain.length <= 1}
        <!-- Nur, wenn WIRKLICH nichts erfasst ist: bei einer undatierten Zuordnung steht die
             Kette bereits über „Aktuell:", und „keine erfasst" wäre falsch (ADR-v9-191). -->
        <p class="place-detail__muted">Keine übergeordnete Zugehörigkeit erfasst.</p>
      {/if}
      <!-- ADR-v9-191: geerbte Jahres-Zeilen sind Aussagen des ELTERNORTS und tragen
           deshalb eine eigene Überschrift, statt unter dem Namen dieses Orts zu stehen. -->
      {#if detail.ancestorHistory.length > 0}
        <p class="place-detail__hint">
          Geschichte der übergeordneten Ebenen
          <span
            class="place-detail__info-icon"
            role="note"
            aria-label={ANCESTOR_INFO}
            use:tooltip={ANCESTOR_INFO}>ⓘ</span
          >
        </p>
        <ul class="place-detail__timeline-list place-detail__timeline-list--ancestor">
          {#each detail.ancestorHistory as row, i (i)}
            <li class="place-detail__timeline-row">
              <span class="place-detail__timeline-span">{row.label}</span>
              {#if row.chain}
                <span>{@render chainRow(row.chain, row.truncated)}</span>
              {:else}
                <span class="place-detail__muted">unbekannt</span>
              {/if}
            </li>
          {/each}
        </ul>
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

    <!-- TST-14 (Spec 32 §1): Die Notiz war eingebbar, aber in KEINER Leseansicht sichtbar —
         Editor-Vollständigkeit und Anzeige-Vollständigkeit sind zwei unabhängige Kontrakte,
         und der erste allein macht ein Feld nicht nutzbar. Im Bearbeiten-Modus entfällt der
         Abschnitt: dort steht das Feld selbst (keine doppelte Fundstelle). -->
    {#if !editing && detail.place.note}
      <section class="place-detail__section">
        <h3>Notiz</h3>
        <p class="place-detail__note">{detail.place.note}</p>
      </section>
    {/if}

    <PlaceNamesSection place={detail.place} variants={detail.variants} {editing} onSave={(next) => appState.savePlace(next)} />

    <PlaceMiniMap
      lat={detail.place.lat}
      long={detail.place.long}
      label={placeHeading(detail.place)}
      context={{ kind: 'ort' }}
      {viewState}
      focusId={placeId}
      {onNavigateLens}
    />

    {#if editing && placeId}
      <!-- GOV-Import (BL-131): wie die Merge-Sektion ein Kurations-Werkzeug im
           Bearbeiten-Modus, kein Dauer-Inhalt der Lesefläche (ADR-v9-30). -->
      <GovImportSection {appState} {placeId} />
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

    <!-- D3 (Spec 22 §3.1) — auch dieser Abschnitt ist eine reine Ereignis-Auskunft. Ohne
         Kontext behauptete seine leere Fassung „keine Ereignisse an diesem Ort erfasst",
         also eine Aussage über die Daten, wo in Wahrheit die Grundlage fehlt. -->
    {#if appState.caps.hasEventContext}
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
    {/if}

    <!-- D3 (Spec 22 §3.1): Zeitgenossen sind eine reine Ereignis-Auskunft. Ohne Kontext
         ausgeblendet statt leer — eine leere Fläche behauptet, es gäbe niemanden. -->
    {#if appState.caps.hasEventContext}
      <PlaceContemporaries {appState} {placeId} {onNavigateToPerson} />
    {/if}

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
  .place-detail__note {
    margin: 0;
    white-space: pre-wrap;
    color: var(--stb-text);
    font-size: 0.85rem;
    line-height: 1.45;
  }

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
    /* Die Spalte trägt einen ZEITRAUM ("ab 1816" / "bis 1806"), keine nackte Jahreszahl
       (ADR-v9-181) — 3.5rem reichten dafür nicht und hätten sie umbrechen lassen. */
    grid-template-columns: 5.5rem 1fr;
    column-gap: 0.6rem;
    align-items: baseline;
    border-bottom: 1px solid var(--stb-surface-2);
    padding: 0.3rem 0;
  }

  .place-detail__timeline-span {
    color: var(--stb-text-dim);
    font-size: 0.8rem;
  }

  /* ADR-v9-191: fremde Aussage, sichtbar abgesetzt. Die Überschrift trägt die Bedeutung —
     der Einzug ist die Verstärkung, nicht der einzige Kanal (Spec 21 §2). */
  .place-detail__timeline-list--ancestor {
    border-left: 2px solid var(--stb-surface-2);
    padding-left: 0.6rem;
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



  /* Sprachkürzel-Eingabe (BL-59) schmal — nur wenige Zeichen (ISO-639, z. B. „pl"). */

  /* Sprachkürzel-Badge vor dem übersetzten Namen in der Pille (BL-59). */




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
