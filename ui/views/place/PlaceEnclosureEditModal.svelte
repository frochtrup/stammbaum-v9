<script lang="ts">
  // ui/views/place/PlaceEnclosureEditModal.svelte — Bearbeitungs-Modal für die direkte
  // Verwaltungszugehörigkeit (`place.enclosedBy`) eines Ortes (Bau-Auftrag "Orts-
  // Detailansicht": "die direkte Zuordnung … wandert in den Bearbeiten-Modal. der
  // Genealoge möchte die jeweilige Ortsketten über die Zeit verstehen, während die
  // direkte Zuordnung ein Mittel zum Zweck ist, um diese aufzubauen").
  //
  // Enthält NUR den enclosedBy-Editor (Picker + Von/Bis-Jahr + Hinzufügen/Entfernen +
  // "+ neuen Ort anlegen"-Unterfluss, ADR-v9-42) — vorher inline auf PlaceDetail.svelte
  // gerendert (Zeitraum-sortierte Lese-Ansicht bleibt dort, s. `enclosureTimeline`).
  // Andere Bearbeitungsfelder (Titel/Typ/Koordinaten/Notiz, Namensvarianten, Merge)
  // bleiben UNVERÄNDERT in PlaceDetail.svelte's bestehendem `editing`-Toggle.
  //
  // Modal-Schale (Backdrop + Panel + Escape/Backdrop-Klick schließt) ist aus
  // ui/shell/EventEditModal.svelte übernommen (INV-UI-4, dort als Vorbild markiert) —
  // eigene `.place-enclosure-modal__*`-Klassen statt `.event-edit-modal__*`
  // wiederzuverwenden, analog wie PersonForm/FamilyForm je einen eigenen, sehr
  // ähnlichen CSS-Block pflegen (s. EventEditModal-Kopfkommentar).
  //
  // Speichert über DENSELBEN Chokepoint wie die bisherige inline-Bearbeitung:
  // appState.savePlace(model) nach withAddedEnclosedBy/withRemovedEnclosedBy
  // (core/places) — kein zweiter Speicher-Mechanismus. Liest das PlaceObject reaktiv
  // über `placeId` (nicht als statisches Objekt-Prop), damit aufeinanderfolgende
  // Hinzufügen/Entfernen-Aktionen im selben Modal-Aufenthalt sofort sichtbar werden.
  import type { AppState } from '../../shell/app-state.svelte';
  import type { PlaceId } from '../../../core/model/types';
  import type { PlaceObject } from '../../../core/places/types';
  import Picker from '../../shell/Picker.svelte';
  import { withAddedEnclosedBy, withRemovedEnclosedBy } from '../../../core/places';
  import PlaceForm from './PlaceForm.svelte';

  interface Props {
    appState: AppState;
    placeId: PlaceId;
    onClose: () => void;
  }
  const { appState, placeId, onClose }: Props = $props();

  const place = $derived(appState.db.placeObjects.get(placeId));

  /** Nach Beginn-Jahr sortiert (v8-Vorbild `_renderEnclosedByList`: undatierte Einträge
   *  ans Ende, `null` sortiert wie "9999"). Trägt den ORIGINAL-Index mit, weil
   *  removeEnclosedBy/withAddedEnclosedBy über den Index im ROHEN `place.enclosedBy`-
   *  Array arbeiten, nicht über die sortierte Anzeige-Reihenfolge. */
  const sortedEnclosedBy = $derived(
    place
      ? place.enclosedBy
          .map((enc, originalIndex) => ({ enc, originalIndex }))
          .sort((a, b) => (a.enc.from ?? 9999) - (b.enc.from ?? 9999))
      : [],
  );

  let newEnclosedParent = $state('');
  let newEnclosedFrom = $state<number | null>(null);
  let newEnclosedTo = $state<number | null>(null);

  /** Inline-Neuanlage eines übergeordneten Ortes (ADR-v9-42 Punkt 4). */
  let creatingEnclosedParent = $state(false);

  function beginCreateEnclosedParent() {
    creatingEnclosedParent = true;
  }

  function onEnclosedParentCreated(id: string) {
    creatingEnclosedParent = false;
    newEnclosedParent = id;
  }

  function cancelCreateEnclosedParent() {
    creatingEnclosedParent = false;
  }

  function addEnclosedBy() {
    if (!place || !newEnclosedParent) return;
    const next = withAddedEnclosedBy(place, newEnclosedParent, newEnclosedFrom, newEnclosedTo);
    appState.savePlace(next);
    newEnclosedParent = '';
    newEnclosedFrom = null;
    newEnclosedTo = null;
  }

  function removeEnclosedBy(index: number) {
    if (!place) return;
    appState.savePlace(withRemovedEnclosedBy(place, index));
  }

  const otherPlaces = $derived(
    place ? Array.from(appState.db.placeObjects.values()).filter((p) => p.id !== place.id) : [],
  );

  function placeTitleFor(id: string): string {
    return appState.db.placeObjects.get(id)?.title ?? id;
  }

  function placeLabel(p: PlaceObject): string {
    return p.title || p.id;
  }

  function placeMatches(p: PlaceObject, query: string): boolean {
    return placeLabel(p).toLowerCase().includes(query.trim().toLowerCase());
  }

  function onBackdropKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={onBackdropKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="stb-modal-backdrop" onclick={onClose} role="presentation">
  <div
    class="place-enclosure-modal__panel"
    onclick={(e) => e.stopPropagation()}
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label="Verwaltungszugehörigkeit bearbeiten"
  >
    <div class="place-enclosure-modal__head">
      <h3>Verwaltungszugehörigkeit bearbeiten</h3>
      <button type="button" class="place-enclosure-modal__close-btn" onclick={onClose} aria-label="Schließen">✕</button>
    </div>

    {#if !place}
      <p class="place-enclosure-modal__muted">Ort nicht (mehr) gefunden.</p>
    {:else}
      <ul class="place-enclosure-modal__list">
        {#each sortedEnclosedBy as { enc, originalIndex } (originalIndex)}
          <li>
            <span>{placeTitleFor(enc.placeId)}</span>
            {#if enc.from || enc.to}<span class="place-enclosure-modal__muted">({enc.from ?? '…'}–{enc.to ?? '…'})</span>{/if}
            <button type="button" class="place-enclosure-modal__remove-btn" onclick={() => removeEnclosedBy(originalIndex)} aria-label="Zugehörigkeit entfernen">✕</button>
          </li>
        {/each}
        {#if place.enclosedBy.length === 0}
          <li class="place-enclosure-modal__muted">Noch keine Verwaltungszugehörigkeit erfasst.</li>
        {/if}
      </ul>

      <div class="place-enclosure-modal__add-row">
        {#if creatingEnclosedParent}
          <!-- ADR-v9-42: eine einzelne, bewusste Nutzerhandlung im Editier-Modus ist
               strukturell identisch zu "+ Neue Person/Familie/Quelle/Archiv anlegen". -->
          <PlaceForm {appState} onSaved={onEnclosedParentCreated} onCancel={cancelCreateEnclosedParent} />
        {:else}
          <Picker
            items={otherPlaces}
            getId={(p) => p.id}
            getLabel={placeLabel}
            matches={placeMatches}
            value={newEnclosedParent || null}
            onChange={(id) => (newEnclosedParent = id ?? '')}
            label="Übergeordneter Ort"
            placeholder="Übergeordneten Ort wählen…"
            createLabel="+ neuen Ort anlegen …"
            onCreateRequested={beginCreateEnclosedParent}
          />
          <input type="number" placeholder="von" bind:value={newEnclosedFrom} aria-label="Gültig von (Jahr)" />
          <input type="number" placeholder="bis" bind:value={newEnclosedTo} aria-label="Gültig bis (Jahr)" />
          <button type="button" onclick={addEnclosedBy}>+ Hinzufügen</button>
        {/if}
      </div>
    {/if}

    <div class="place-enclosure-modal__actions">
      <button type="button" class="place-enclosure-modal__done-btn" onclick={onClose}>Fertig</button>
    </div>
  </div>
</div>

<style>
  .place-enclosure-modal__panel {
    background: var(--stb-surface-1);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-card);
    padding: 1rem;
    max-width: 32rem;
    width: 100%;
  }

  .place-enclosure-modal__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .place-enclosure-modal__head h3 {
    margin: 0;
    font-size: 1rem;
    color: var(--stb-gold-light);
  }

  .place-enclosure-modal__close-btn {
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
    font-size: 1rem;
    padding: 0;
  }

  .place-enclosure-modal__muted {
    color: var(--stb-text-dim);
    font-size: 0.85rem;
  }

  .place-enclosure-modal__list {
    list-style: none;
    margin: 0.6rem 0 0;
    padding: 0;
  }

  .place-enclosure-modal__list li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.3rem 0;
    border-bottom: 1px solid var(--stb-surface-2);
    flex-wrap: wrap;
  }

  .place-enclosure-modal__remove-btn {
    margin-left: auto;
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
  }

  .place-enclosure-modal__add-row {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    margin-top: 0.6rem;
  }

  .place-enclosure-modal__add-row input {
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.5rem;
  }

  .place-enclosure-modal__add-row button {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
  }

  .place-enclosure-modal__actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 1.1rem;
  }

  .place-enclosure-modal__done-btn {
    background: var(--stb-gold);
    color: var(--stb-bg);
    border: none;
    border-radius: var(--stb-radius-control);
    padding: 0.45rem 1rem;
    cursor: pointer;
    font-weight: 600;
  }
</style>
