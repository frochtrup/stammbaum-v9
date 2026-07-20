<script lang="ts">
  // ui/shell/EventPlaceField.svelte — Ereignis-Ort-Feld: Freitext BLEIBT Freitext (Ort-
  // Eingabe darf immer frei weitergetippt werden), PLUS Auswahl eines bestehenden Orts und
  // „+ neuen Ort anlegen …" (ADR-v9-42 Punkt 3). Verwendet in PersonForm.svelte UND
  // FamilyForm.svelte für JEDES `event.place`-Vorkommen (Sonder-Ereignisse UND events[]) —
  // ein Bauteil statt duplizierter Logik in beiden Formularen (INV-UI-4).
  //
  // EIN Feld (ADR-v9-103): bis dahin standen hier ein Textfeld, eine 🔍-Lupe daneben und
  // dahinter ein aufklappendes Panel mit einem ZWEITEN Suchfeld — einen bestehenden Ort zu
  // wählen kostete vier Interaktionen. Jetzt trägt `Picker.svelte` im `freeText`-Modus
  // beides in einem Feld: tippen schreibt den Freitext UND filtert die Vorschläge.
  //
  // Auswahl/Neuanlage feuert NUR `onPick(placeId)` — die eigentliche Verknüpfung
  // (`linkEventToPlace`, ID + Text atomar reprojiziert) bleibt Sache des Aufrufers
  // (PersonForm/FamilyForm kennen das volle EditableEvent inkl. Datum für die
  // Jahres-Ableitung, dieses Feld kennt nur den Freitext-Wert). Freies Tippen läuft
  // weiterhin über `onTextChange` (placeDirty-Tracking bleibt beim Aufrufer).
  import type { AppState } from './app-state.svelte';
  import type { PlaceObject } from '../../core/places/types';
  import { placeDisplayName } from '../../core/places';
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

  let creating = $state(false);

  const places = $derived(Array.from(appState.db.placeObjects.values()));

  function placeLabel(p: PlaceObject): string {
    return placeDisplayName(p);
  }

  function selectExisting(id: string | null) {
    if (id) onPick(id);
  }

  function beginCreate() {
    creating = true;
  }

  function onPlaceCreated(id: string) {
    creating = false;
    onPick(id);
  }

  function cancelCreate() {
    creating = false;
  }
</script>

{#if creating}
  <div class="event-place-field__create">
    <PlaceForm {appState} onSaved={onPlaceCreated} onCancel={cancelCreate} />
  </div>
{:else}
  <Picker
    items={places}
    getId={(p) => p.id}
    getLabel={placeLabel}
    matches={matchesSearch}
    value={null}
    onChange={selectExisting}
    {label}
    placeholder="Ort eingeben oder wählen…"
    createLabel="+ neuen Ort anlegen …"
    onCreateRequested={beginCreate}
    freeText
    textValue={value}
    {onTextChange}
  />
{/if}

<style>
  .event-place-field__create {
    margin-top: 0.3rem;
  }
</style>
