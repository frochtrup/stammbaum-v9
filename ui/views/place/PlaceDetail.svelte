<script lang="ts">
  // ui/views/place/PlaceDetail.svelte — Orts-Steckbrief + Bearbeitung (Spec 20 §1.7 [K]:
  // "Ereignisse nach Typ, Quellen, … Bearbeitung: Name, Koordinaten, Typ, pnames,
  // enclosedBy", "String→PlaceObject verknüpfen", "Dubletten-Merge (verlustfrei,
  // Herkunfts-Pille)"). Namensvarianten werden als `.stb-pill`-Reihe angezeigt (INV-UI-4:
  // gemeinsamer Pill-Stil aus design-system.css statt eigenem Chip-CSS) — nach einem
  // Merge erscheint der Titel/die Varianten des zusammengeführten Orts hier als neue
  // Pille (Verlustfreiheit sichtbar). Merge selbst läuft NUR über den Kern-Chokepoint
  // `appState.mergePlace(survivorId, mergedId)` (Spec 02 §3) — keine Merge-Logik hier.
  // SVG-Namens-Zeitstrahl + Mini-Karte sind AUSSER SCOPE (Spec 20 §1.9/§1.10, imperative
  // Inseln — anderer Bauabschnitt).
  //
  // Verwaltungsgeschichte (Bau-Auftrag "Orts-Detailansicht", Nutzer-Zitat: "die
  // Herkunftsketten sortiert nach den Zeiträumen … die direkte Zuordnung … wandert in
  // den Bearbeiten-Modal"; Nachtrag nach Ansicht des ersten Ergebnisses: "die komplette
  // Verwaltungshierarchie inkl. zeitlicher Abgrenzungen, die sich aus den übergeordneten
  // Ebenen ergeben"): die LESE-Ansicht zeigt hier NUR `detail.hierarchyTimeline` (volle
  // Kette je Schlüsseljahr, `place-detail-model.ts`) — die zunächst zusätzlich gebaute,
  // nur-direkter-Elternteil-Zeitraum-Ansicht war dazu redundant und wurde wieder entfernt
  // (zweiter Nachtrag). Die BEARBEITUNG der direkten `enclosedBy`-Zuordnung (Picker +
  // Von/Bis-Jahr) lebt in `PlaceEnclosureEditModal.svelte` (eigenes Overlay, analog
  // EventEditModal, INV-UI-4).
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import DetailHeader from '../../shell/DetailHeader.svelte';
  import Picker from '../../shell/Picker.svelte';
  import SourceBadge from '../../shell/SourceBadge.svelte';
  import EventsByType from '../../shell/EventsByType.svelte';
  import type { PlaceObject } from '../../../core/places/types';
  import { linkEventToPlace, withAddedPname, withRemovedPname } from '../../../core/places';
  import { buildPlaceDetail, type PlaceEventRow } from './place-detail-model';
  import PlaceEnclosureEditModal from './PlaceEnclosureEditModal.svelte';

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

  let editing = $state(false);
  let formTitle = $state('');
  let formType = $state('');
  let formLat = $state<number | null>(null);
  let formLong = $state<number | null>(null);
  let formNote = $state('');
  let newPnameValue = $state('');
  let newPnameFrom = $state<number | null>(null);
  let newPnameTo = $state<number | null>(null);
  let mergeTargetId = $state('');
  let mergeError = $state('');

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

  function startEdit() {
    if (!detail) return;
    formTitle = detail.place.title;
    formType = detail.place.type;
    formLat = detail.place.lat;
    formLong = detail.place.long;
    formNote = detail.place.note;
    editing = true;
  }

  function cancelEdit() {
    editing = false;
  }

  function saveEdit() {
    if (!detail) return;
    appState.savePlace({
      ...detail.place,
      title: formTitle.trim(),
      type: formType.trim(),
      lat: formLat,
      long: formLong,
      note: formNote,
    });
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

  function linkUnlinked(eventKey: string) {
    if (!detail || !placeId) return;
    const row = detail.unlinkedEvents.find((r) => r.key === eventKey);
    if (!row) return;
    linkEventToPlace(row.event, placeId, appState.placeContext);
    appState.touch();
  }

  function navigateToOwner(kind: 'person' | 'family', id: string) {
    if (kind === 'person') onNavigateToPerson?.(id);
    else onNavigateToFamily?.(id);
  }

  const otherPlaces = $derived(
    detail ? Array.from(appState.db.placeObjects.values()).filter((p) => p.id !== detail.place.id) : [],
  );

  function placeLabel(p: PlaceObject): string {
    return p.title || p.id;
  }

  function placeMatches(p: PlaceObject, query: string): boolean {
    return placeLabel(p).toLowerCase().includes(query.trim().toLowerCase());
  }

  /**
   * Dubletten-Merge (Spec 20 §1.7 [K] "Dubletten-Merge, verlustfrei"): der aktuell
   * gezeigte Ort (die Dublette) wird IN den gewählten Ziel-Ort (Überlebenden) gefaltet.
   * `appState.mergePlace` ist der EINE Chokepoint (INV-ARCH-1) — keine Merge-Logik hier.
   * Ziel darf nicht der aktuelle Ort sein (Selbst-Merge ausgeschlossen); danach Navigation
   * zum Überlebenden, der jetzt Titel + pnames der Dublette als Varianten hält.
   */
  function mergeIntoTarget() {
    if (!detail || !placeId) return;
    if (!mergeTargetId || mergeTargetId === placeId) {
      mergeError = 'Bitte einen anderen Ziel-Ort wählen.';
      return;
    }
    appState.mergePlace(mergeTargetId, placeId);
    viewState.setCurrent('place', mergeTargetId);
    mergeTargetId = '';
    mergeError = '';
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
          <button type="button" class="place-detail__edit-btn" onclick={startEdit}>✎ Bearbeiten</button>
        {/if}
      {/snippet}
    </DetailHeader>

    {#if editing}
      <section class="place-detail__section place-detail__form">
        <h3>Grunddaten</h3>
        <label>
          Name
          <input type="text" bind:value={formTitle} />
        </label>
        <label>
          Typ
          <input type="text" bind:value={formType} placeholder="z. B. Village, City, County…" />
        </label>
        <div class="place-detail__coord-row">
          <label>
            Breitengrad
            <input type="number" step="any" bind:value={formLat} />
          </label>
          <label>
            Längengrad
            <input type="number" step="any" bind:value={formLong} />
          </label>
        </div>
        <label>
          Notiz
          <textarea bind:value={formNote}></textarea>
        </label>
        <div class="place-detail__form-actions">
          <button type="button" class="place-detail__save-btn" onclick={saveEdit}>Speichern</button>
          <button type="button" class="place-detail__cancel-btn" onclick={cancelEdit}>Abbrechen</button>
        </div>
      </section>
    {/if}

    <section class="place-detail__section">
      <h3>
        Verwaltungszugehörigkeit
        <span class="place-detail__info-icon" title={ENCLOSURE_INFO}>ⓘ</span>
      </h3>
      {#if detail.enclosureChain.length > 1}
        <p class="place-detail__hint">Aktuell:</p>
        <p class="place-detail__chain">{detail.enclosureChain.join(' › ')}</p>
      {/if}
      {#if detail.hierarchyTimeline.length > 0}
        <p class="place-detail__hint">Zugehörigkeit nach Jahr (volle Kette):</p>
        <ul class="place-detail__timeline-list">
          {#each detail.hierarchyTimeline as row, i (i)}
            <li class="place-detail__timeline-row">
              <span class="place-detail__timeline-span">{row.year}</span>
              <span class:place-detail__muted={row.chainLabel == null}>{row.chainLabel ?? 'unbekannt'}</span>
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

    {#if detail.variants.length > 0 || editing}
      <section class="place-detail__section">
        <h3>Namens-Varianten</h3>
        {#if detail.variants.length > 0}
          <div class="stb-pill-row" aria-label="Namensvarianten">
            {#each detail.variants as v, i (i)}
              <span class="stb-pill" title={v.from || v.to ? `${v.from ?? '…'}–${v.to ?? '…'}` : undefined}>
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
      </section>
    {/if}

    {#if editing}
      <!-- Dubletten-Merge bewusst ebenfalls hinter den Bearbeiten-Modus gestellt (ADR-v9-30
           Punkt 5: "kein Add/Remove-Control … darf außerhalb des Bearbeitungs-Modus sichtbar
           sein" — Merge ist im selben visuellen Add-Row-Stil gebaut und destruktiv/mutierend
           wie pnames/enclosedBy, auch wenn der Spec-Wortlaut nur diese beiden explizit nennt.
           Konsistente, sicherere Default-Interpretation statt eines dritten Sonderfalls. -->
      <section class="place-detail__section">
        <h3>Dubletten-Merge</h3>
        <p class="place-detail__muted">
          Diesen Ort verlustfrei in einen anderen Ort zusammenführen — Titel und Namensvarianten
          von „{detail.place.title || detail.place.id}" erscheinen danach als Herkunfts-Pillen
          beim Ziel-Ort.
        </p>
        {#if otherPlaces.length === 0}
          <p class="place-detail__muted">Kein weiterer Ort vorhanden, um damit zusammenzuführen.</p>
        {:else}
          <div class="place-detail__add-row">
            <!-- Kein "+ neu anlegen"-Slot — bewusst die EINZIGE verbleibende Ausnahme
                 (ADR-v9-42, semantisch statt kategorisch: ein frisch angelegter leerer
                 Ort als Merge-Ziel ist bedeutungslos, man führt nichts in gerade erst
                 Erzeugtes zusammen). Andere Orts-/Hof-Picker (enclosedBy im
                 PlaceEnclosureEditModal, event.place/addr, HofDetail Vorgänger/Nachfolger)
                 haben die Anlage-Option inzwischen alle. -->
            <Picker
              items={otherPlaces}
              getId={(p) => p.id}
              getLabel={placeLabel}
              getSubLabel={(p) => p.id}
              matches={placeMatches}
              value={mergeTargetId || null}
              onChange={(id) => (mergeTargetId = id ?? '')}
              label="Ziel-Ort für Merge"
              placeholder="Ziel-Ort wählen…"
            />
            <button type="button" class="place-detail__merge-btn" onclick={mergeIntoTarget} disabled={!mergeTargetId}>
              In Ziel-Ort zusammenführen
            </button>
          </div>
          {#if mergeError}
            <p class="place-detail__error">{mergeError}</p>
          {/if}
        {/if}
      </section>
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
        <EventsByType groups={detail.eventsByType} row={placeEventRow} />
      {/if}
    </section>

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

  .place-detail__coord-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  .place-detail__form {
    background: var(--stb-surface-1);
    border-radius: var(--stb-radius-card);
    padding: 0.8rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .place-detail__form label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.8rem;
    color: var(--stb-text-dim);
  }

  .place-detail__form input,
  .place-detail__form textarea {
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.5rem;
    font: inherit;
  }

  .place-detail__form-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .place-detail__save-btn,
  .place-detail__cancel-btn,
  .place-detail__link-btn {
    background: var(--stb-gold);
    color: var(--stb-bg);
    border: none;
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.8rem;
    cursor: pointer;
    font-weight: 600;
  }

  .place-detail__cancel-btn {
    background: var(--stb-surface-3);
    color: var(--stb-text);
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

  .place-detail__error {
    color: var(--stb-danger);
    font-size: 0.82rem;
    margin-top: 0.3rem;
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
