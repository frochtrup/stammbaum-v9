<script lang="ts">
  // ui/shell/EventAddrField.svelte — Ereignis-Adresse-Feld (Hof-relevante Ereignistypen,
  // `HOF_EVENT_TYPES`): Freitext BLEIBT Freitext, PLUS Auslöser für die generische
  // Picker-Shell mit „+ neuen Hof anlegen …" (ADR-v9-42 Punkt 3). Verwendet in
  // PersonForm.svelte UND FamilyForm.svelte für JEDES `event.addr`-Vorkommen (INV-UI-4,
  // ein Bauteil statt duplizierter Logik).
  //
  // Hof-Identität braucht Adresse+Dorf-Kontext (`findOrCreateHof`, anders als Ort kein
  // blankes Namensfeld) — die Neuanlage nutzt DIREKT den bereits eingetippten Freitext
  // (`value`) als Adresse, kein zweites Adressfeld nötig. Fehlt der Dorf-Kontext
  // (`villageId` = `ev.placeId`, noch nicht gesetzt), ist "+ neuen Hof anlegen"
  // deaktiviert mit Hinweistext statt ins Leere zu laufen (Auftrags-Vorgabe).
  //
  // Auswahl/Neuanlage feuert NUR `onPick(hofId)` — die eigentliche Verknüpfung
  // (`linkEventToHof`, ID + Text/ADDR atomar reprojiziert) bleibt Sache des Aufrufers.
  import type { AppState } from './app-state.svelte';
  import type { HofRow } from '../views/hof/hof-list-model';
  import { toRow, matchesSearch } from '../views/hof/hof-list-model';
  import { findOrCreateHof } from '../../core/places';
  import Picker from './Picker.svelte';

  interface Props {
    appState: AppState;
    /** Aktueller Freitext-Wert (ev.addr). */
    value: string;
    /** Freies Weitertippen im Textfeld — NICHT gesperrt. */
    onTextChange: (v: string) => void;
    /** Ausgewählte/neu angelegte HofId — der Aufrufer verknüpft (linkEventToHof). */
    onPick: (hofId: string) => void;
    /** Dorf-Kontext für die Neuanlage (ev.placeId) — null: "+ neuen Hof anlegen" deaktiviert. */
    villageId: string | null;
    /** aria-label-Basis (mehrere gleichnamige "Adresse"-Felder je Formular). */
    label: string;
  }
  const { appState, value, onTextChange, onPick, villageId, label }: Props = $props();

  let panelOpen = $state(false);

  const hofRows = $derived(Array.from(appState.db.hofObjects.values()).map((h) => toRow(h, appState.db)));

  function rowLabel(row: HofRow): string {
    return row.addr || row.id;
  }

  function togglePanel() {
    panelOpen = !panelOpen;
  }

  function selectExisting(id: string | null) {
    if (id) onPick(id);
    panelOpen = false;
  }

  function createHofFromTypedAddr() {
    if (!villageId) return;
    const addrText = value.trim();
    if (!addrText) return;
    const result = findOrCreateHof(addrText, villageId, appState.db.hofObjects);
    if (!result) return;
    if (result.created) appState.saveHof(result.created);
    onPick(result.hofId);
    panelOpen = false;
  }
</script>

<div class="event-addr-field">
  <input
    type="text"
    aria-label={label}
    value={value}
    onchange={(e) => onTextChange((e.currentTarget as HTMLInputElement).value)}
  />
  <button
    type="button"
    class="event-addr-field__toggle-btn"
    aria-label={`${label} aus Liste wählen`}
    onclick={togglePanel}
  >
    🔍
  </button>
</div>
{#if panelOpen}
  <div class="event-addr-field__panel">
    <Picker
      items={hofRows}
      getId={(r) => r.id}
      getLabel={rowLabel}
      getSubLabel={(r) => r.villageTitle}
      matches={matchesSearch}
      value={null}
      onChange={selectExisting}
      label={`${label} auswählen`}
      placeholder="Hof suchen…"
      startOpen={true}
    />
    {#if villageId}
      <button
        type="button"
        class="event-addr-field__create-btn"
        onclick={createHofFromTypedAddr}
        disabled={!value.trim()}
      >
        + Hof „{value.trim() || '…'}" anlegen
      </button>
    {:else}
      <p class="event-addr-field__hint">Zuerst Ort zuordnen, um einen neuen Hof anzulegen.</p>
    {/if}
  </div>
{/if}

<style>
  .event-addr-field {
    display: flex;
    gap: 0.3rem;
    align-items: center;
  }

  .event-addr-field input {
    flex: 1 1 auto;
    min-width: 0;
  }

  .event-addr-field__toggle-btn {
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

  .event-addr-field__panel {
    margin-top: 0.3rem;
  }

  .event-addr-field__create-btn {
    margin-top: 0.3rem;
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.6rem;
    cursor: pointer;
    font-size: 0.82rem;
  }

  .event-addr-field__create-btn:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .event-addr-field__hint {
    margin-top: 0.3rem;
    color: var(--stb-text-dim);
    font-size: 0.8rem;
  }
</style>
