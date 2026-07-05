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
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import { linkEventToPlace, withAddedPname, withRemovedPname, withAddedEnclosedBy, withRemovedEnclosedBy } from '../../../core/places';
  import { buildPlaceDetail } from './place-detail-model';

  interface Props {
    appState: AppState;
    viewState: ViewState;
    /** Cross-Tab-Navigation zu einer Person (analog Familie/Quelle, ADR-v9-17-Muster). */
    onNavigateToPerson?: (personId: string) => void;
    /** Cross-Tab-Navigation zu einer Familie. */
    onNavigateToFamily?: (familyId: string) => void;
  }
  const { appState, viewState, onNavigateToPerson, onNavigateToFamily }: Props = $props();

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
  let newEnclosedParent = $state('');
  let newEnclosedFrom = $state<number | null>(null);
  let newEnclosedTo = $state<number | null>(null);
  let mergeTargetId = $state('');
  let mergeError = $state('');

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

  function addEnclosedBy() {
    if (!detail || !newEnclosedParent) return;
    const next = withAddedEnclosedBy(detail.place, newEnclosedParent, newEnclosedFrom, newEnclosedTo);
    appState.savePlace(next);
    newEnclosedParent = '';
    newEnclosedFrom = null;
    newEnclosedTo = null;
  }

  function removeEnclosedBy(index: number) {
    if (!detail) return;
    appState.savePlace(withRemovedEnclosedBy(detail.place, index));
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

  function placeTitleFor(id: string): string {
    return appState.db.placeObjects.get(id)?.title ?? id;
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

<div class="place-detail">
  {#if !placeId}
    <p class="place-detail__empty">Kein Ort ausgewählt.</p>
  {:else if !detail}
    <p class="place-detail__empty">Ort nicht gefunden (evtl. gelöscht oder Datei gewechselt).</p>
  {:else}
    <div class="place-detail__head">
      <h2 class="place-detail__title">{detail.place.title || detail.place.id}</h2>
      {#if detail.place.type}<span class="place-detail__type-badge">{detail.place.type}</span>{/if}
      {#if !editing}
        <button type="button" class="place-detail__edit-btn" onclick={startEdit}>✎ Bearbeiten</button>
      {/if}
    </div>

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
        <label>
          Breitengrad
          <input type="number" step="any" bind:value={formLat} />
        </label>
        <label>
          Längengrad
          <input type="number" step="any" bind:value={formLong} />
        </label>
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
      <h3>Verwaltungszugehörigkeit</h3>
      {#if detail.enclosureChain.length > 1}
        <p class="place-detail__chain">{detail.enclosureChain.join(' › ')}</p>
      {:else}
        <p class="place-detail__muted">Keine übergeordnete Zugehörigkeit erfasst.</p>
      {/if}
      <ul class="place-detail__enclosed-list">
        {#each detail.place.enclosedBy as enc, i (i)}
          <li>
            <span>{placeTitleFor(enc.placeId)}</span>
            {#if enc.from || enc.to}<span class="place-detail__muted">({enc.from ?? '…'}–{enc.to ?? '…'})</span>{/if}
            <button type="button" class="place-detail__remove-btn" onclick={() => removeEnclosedBy(i)} aria-label="Zugehörigkeit entfernen">✕</button>
          </li>
        {/each}
      </ul>
      {#if otherPlaces.length > 0}
        <div class="place-detail__add-row">
          <select bind:value={newEnclosedParent} aria-label="Übergeordneter Ort">
            <option value="">Übergeordneten Ort wählen…</option>
            {#each otherPlaces as p (p.id)}
              <option value={p.id}>{p.title || p.id}</option>
            {/each}
          </select>
          <input type="number" placeholder="von" bind:value={newEnclosedFrom} aria-label="Gültig von (Jahr)" />
          <input type="number" placeholder="bis" bind:value={newEnclosedTo} aria-label="Gültig bis (Jahr)" />
          <button type="button" onclick={addEnclosedBy}>+ Hinzufügen</button>
        </div>
      {/if}
    </section>

    <section class="place-detail__section">
      <h3>Namens-Varianten <span class="place-detail__muted">(Herkunfts-Pillen)</span></h3>
      {#if detail.variants.length === 0}
        <p class="place-detail__muted">Keine Namensvarianten erfasst.</p>
      {:else}
        <div class="stb-pill-row" aria-label="Namensvarianten">
          {#each detail.variants as v, i (i)}
            <span class="stb-pill" title={v.from || v.to ? `${v.from ?? '…'}–${v.to ?? '…'}` : undefined}>
              {v.value}
              <button type="button" class="stb-pill__remove" onclick={() => removePname(i)} aria-label={`Namensvariante „${v.value}" entfernen`}>✕</button>
            </span>
          {/each}
        </div>
      {/if}
      <div class="place-detail__add-row">
        <input type="text" placeholder="neue Schreibweise…" bind:value={newPnameValue} aria-label="Neue Namensvariante" />
        <input type="number" placeholder="von" bind:value={newPnameFrom} aria-label="Gültig von (Jahr)" />
        <input type="number" placeholder="bis" bind:value={newPnameTo} aria-label="Gültig bis (Jahr)" />
        <button type="button" onclick={addPname}>+ Hinzufügen</button>
      </div>
    </section>

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
          <select
            aria-label="Ziel-Ort für Merge"
            value={mergeTargetId}
            onchange={(e) => (mergeTargetId = (e.currentTarget as HTMLSelectElement).value)}
          >
            <option value="">Ziel-Ort wählen…</option>
            {#each otherPlaces as p (p.id)}
              <option value={p.id}>{p.title || p.id} ({p.id})</option>
            {/each}
          </select>
          <button type="button" class="place-detail__merge-btn" onclick={mergeIntoTarget} disabled={!mergeTargetId}>
            In Ziel-Ort zusammenführen
          </button>
        </div>
        {#if mergeError}
          <p class="place-detail__error">{mergeError}</p>
        {/if}
      {/if}
    </section>

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
        {#each detail.eventsByType as group (group.type)}
          <div class="place-detail__event-group">
            <h4>{group.type} ({group.rows.length})</h4>
            <ul>
              {#each group.rows as row (row.key)}
                <li>
                  <button
                    type="button"
                    class="place-detail__owner-link"
                    onclick={() => navigateToOwner(row.ownerKind, row.ownerId)}
                  >
                    {row.ownerLabel}
                  </button>
                  {#if row.summary}<span class="place-detail__muted">{row.summary}</span>{/if}
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      {/if}
    </section>

    {#if detail.citations.length > 0}
      <section class="place-detail__section">
        <h3>Quellen ({detail.citations.length})</h3>
        <ul class="place-detail__citation-list">
          {#each detail.citations as cit (cit.sourceId)}
            <li>{appState.db.sources.get(cit.sourceId)?.abbr || appState.db.sources.get(cit.sourceId)?.title || cit.sourceId}</li>
          {/each}
        </ul>
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

  .place-detail__head {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  .place-detail__title {
    margin: 0;
  }

  .place-detail__type-badge {
    font-size: 0.72rem;
    color: var(--stb-text-dim);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.1em 0.5em;
  }

  .place-detail__edit-btn {
    margin-left: auto;
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

  .place-detail__section h4 {
    font-size: 0.85rem;
    color: var(--stb-text-dim);
    margin: 0.6rem 0 0.2rem;
  }

  .place-detail__muted {
    color: var(--stb-text-dim);
    font-size: 0.85rem;
  }

  .place-detail__chain {
    font-size: 0.9rem;
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

  .place-detail__enclosed-list,
  .place-detail__citation-list,
  .place-detail__unlinked ul,
  .place-detail__event-group ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .place-detail__enclosed-list li,
  .place-detail__unlinked li,
  .place-detail__event-group li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.3rem 0;
    border-bottom: 1px solid var(--stb-surface-2);
    flex-wrap: wrap;
  }

  .place-detail__remove-btn {
    margin-left: auto;
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
  }

  .place-detail__add-row {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    margin-top: 0.5rem;
  }

  .place-detail__add-row input,
  .place-detail__add-row select {
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
