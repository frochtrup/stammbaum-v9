<script lang="ts">
  // ui/shell/EventAddrField.svelte — Ereignis-Adresse-Feld (Hof-relevante Ereignistypen,
  // `HOF_EVENT_TYPES`): Freitext BLEIBT Freitext, PLUS Auswahl eines bestehenden Hofs und
  // „+ neuen Hof anlegen …" (ADR-v9-42 Punkt 3). Verwendet in PersonForm.svelte UND
  // FamilyForm.svelte für JEDES `event.addr`-Vorkommen (INV-UI-4, ein Bauteil statt
  // duplizierter Logik).
  //
  // EIN Feld (ADR-v9-103, gleiche Umstellung wie EventPlaceField): tippen schreibt den
  // Freitext UND filtert die Hof-Vorschläge; die Anlage-Zeile mit dem getippten Text sitzt
  // als `footer`-Snippet unter der Trefferliste, statt als eigener Knopf unter einem
  // separaten Panel.
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
    /** Darf aus diesem Feld ein Hof ENTSTEHEN? Spiegelt die Kern-Regel `HOF_EVENT_TYPES`
     *  (ADR-v9-186): der Resolver bootstrappt einen Hof aus ADDR nur bei RESI/PROP/CENS
     *  (Pfad B′) — bei einem Non-Hof-Typ mit ADDR darf die UI das folglich auch nicht
     *  anbieten, sonst entstünde ein Hof aus einem Schul-/Behördennamen. Einen BESTEHENDEN
     *  Hof zu wählen bleibt erlaubt: Pfad B gilt typunabhängig (Spec 11 §4.3, Konvention 2).
     *  Default true — Hof-Typen sind der Regelfall. */
    allowCreate?: boolean;
    /** aria-label-Basis (mehrere gleichnamige "Adresse"-Felder je Formular). */
    label: string;
  }
  const { appState, value, onTextChange, onPick, villageId, allowCreate = true, label }: Props = $props();

  const hofRows = $derived(Array.from(appState.db.hofObjects.values()).map((h) => toRow(h, appState.db)));

  function rowLabel(row: HofRow): string {
    return row.addr || row.id;
  }

  function selectExisting(id: string | null) {
    if (id) onPick(id);
  }

  function createHofFromTypedAddr() {
    if (!villageId) return;
    const addrText = value.trim();
    if (!addrText) return;
    const result = findOrCreateHof(addrText, villageId, appState.db.hofObjects);
    if (!result) return;
    if (result.created) appState.saveHof(result.created);
    onPick(result.hofId);
  }
</script>

<Picker
  items={hofRows}
  getId={(r) => r.id}
  getLabel={rowLabel}
  getSubLabel={(r) => r.villageTitle}
  matches={matchesSearch}
  value={null}
  onChange={selectExisting}
  {label}
  placeholder="Adresse eingeben oder Hof wählen…"
  freeText
  textValue={value}
  {onTextChange}
>
  {#snippet footer()}
    {#if !allowCreate}
      <p class="event-addr-field__hint">
        Aus diesem Ereignistyp entsteht kein Hof — bestehenden Hof wählen oder Adresse leeren.
      </p>
    {:else if villageId}
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
  {/snippet}
</Picker>

<style>
  .event-addr-field__create-btn {
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
    margin: 0;
    color: var(--stb-text-dim);
    font-size: 0.8rem;
  }
</style>
