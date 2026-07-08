<script lang="ts">
  // ui/shell/EventPlaceField.svelte — Ereignis-Ort-Feld: Freitext BLEIBT Freitext (Ort-
  // Eingabe darf immer frei weitergetippt werden), PLUS ein Auslöser für die generische
  // Picker-Shell (`Picker.svelte`) mit „+ neuen Ort anlegen …" (ADR-v9-42 Punkt 3, ersetzt
  // ADR-v9-41s reines `TextSuggest`-Autocomplete komplett). Verwendet in PersonForm.svelte
  // UND FamilyForm.svelte für JEDES `event.place`-Vorkommen (Sonder-Ereignisse UND
  // events[]) — ein Bauteil statt duplizierter Logik in beiden Formularen (INV-UI-4).
  //
  // Auswahl/Neuanlage feuert NUR `onPick(placeId)` — die eigentliche Verknüpfung
  // (`linkEventToPlace`, ID + Text atomar reprojiziert) bleibt Sache des Aufrufers
  // (PersonForm/FamilyForm kennen das volle EditableEvent inkl. Datum für die
  // Jahres-Ableitung, dieses Feld kennt nur den Freitext-Wert). Freies Tippen im
  // Textfeld läuft weiterhin über `onTextChange` (placeDirty-Tracking bleibt beim
  // Aufrufer, analog dem bisherigen reinen <input>).
  import type { AppState } from './app-state.svelte';
  import type { PlaceObject } from '../../core/places/types';
  import { matchesSearch } from '../views/place/place-list-model';
  import PlaceForm from '../views/place/PlaceForm.svelte';
  import Picker from './Picker.svelte';

  interface Props {
    appState: AppState;
    /** Aktueller Freitext-Wert (ev.place). */
    value: string;
    /** Freies Weitertippen im Textfeld — NICHT gesperrt, auch wenn eine Auswahl existiert. */
    onTextChange: (v: string) => void;
    /** Ausgewählte/neu angelegte PlaceId — der Aufrufer verknüpft (linkEventToPlace). */
    onPick: (placeId: string) => void;
    /** aria-label-Basis (Formulare haben mehrere gleichnamige "Ort (Freitext)"-Felder). */
    label: string;
  }
  const { appState, value, onTextChange, onPick, label }: Props = $props();

  let panelOpen = $state(false);
  let creating = $state(false);

  const places = $derived(Array.from(appState.db.placeObjects.values()));

  function placeLabel(p: PlaceObject): string {
    return p.title || p.id;
  }

  function togglePanel() {
    panelOpen = !panelOpen;
    creating = false;
  }

  function selectExisting(id: string | null) {
    if (id) onPick(id);
    panelOpen = false;
  }

  function beginCreate() {
    creating = true;
  }

  function onPlaceCreated(id: string) {
    creating = false;
    panelOpen = false;
    onPick(id);
  }

  function cancelCreate() {
    creating = false;
  }
</script>

<div class="event-place-field">
  <input
    type="text"
    aria-label={label}
    value={value}
    onchange={(e) => onTextChange((e.currentTarget as HTMLInputElement).value)}
  />
  <button
    type="button"
    class="event-place-field__toggle-btn"
    aria-label={`${label} aus Liste wählen`}
    onclick={togglePanel}
  >
    🔍
  </button>
</div>
{#if panelOpen}
  <div class="event-place-field__panel">
    {#if creating}
      <PlaceForm {appState} onSaved={onPlaceCreated} onCancel={cancelCreate} />
    {:else}
      <Picker
        items={places}
        getId={(p) => p.id}
        getLabel={placeLabel}
        matches={matchesSearch}
        value={null}
        onChange={selectExisting}
        label={`${label} auswählen`}
        placeholder="Ort suchen…"
        createLabel="+ neuen Ort anlegen …"
        onCreateRequested={beginCreate}
        startOpen={true}
      />
    {/if}
  </div>
{/if}

<style>
  .event-place-field {
    display: flex;
    gap: 0.3rem;
    align-items: center;
  }

  .event-place-field input {
    flex: 1 1 auto;
    min-width: 0;
  }

  .event-place-field__toggle-btn {
    flex: 0 0 auto;
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.5rem;
    cursor: pointer;
    font-size: 0.85rem;
    line-height: 1;
  }

  .event-place-field__panel {
    margin-top: 0.3rem;
  }
</style>
