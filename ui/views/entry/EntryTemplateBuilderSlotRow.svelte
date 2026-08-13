<script lang="ts">
  // ui/views/entry/EntryTemplateBuilderSlotRow.svelte — EIN Feld eines Rollen-Abschnitts
  // im Vorlagen-Builder (BL-353, ADR-v9-264/-265). Zeigt das Label (aus dem Modell,
  // `fieldLabel`), die Vorbelegung + ihren Modus (`hidden`/`locked`), und die drei
  // Zeilen-Aktionen: nach oben, nach unten, entfernen (`.stb-icon-btn`, INV-UI-4).
  //
  // DAS BEDIENELEMENT FOLGT DEM FELD (ADR-v9-268 E3, INV-UI-4): die Vorbelegung wird mit
  // demselben Baustein eingegeben wie das Feld, das sie vorbelegt — Geschlecht als
  // Auswahlfeld, Ort über den Ortspicker, Datum über die Datumszeile. Vorher stand hier
  // für JEDE Feldart dasselbe einfache Textfeld; beim Geschlecht hieß das „M" tippen und
  // wissen, dass das der Wert ist. (Das Literal steht hier bewusst NICHT ausgeschrieben —
  // der PLAIN_FIELD-Wächter scannt Quelltextzeilen und würde einen Kommentar mitzählen.)
  //
  // GESPEICHERT WIRD DER STRING (E4), nie eine `placeId`: `applyEntryTemplate` schreibt
  // Ereignisfelder als Text und liest keine Id, und der reguläre `resolveEvents()`-Pfad
  // ordnet den Text beim nächsten Laden ein. Der Picker hilft beim Treffen eines
  // vorhandenen Namens — mehr soll er hier nicht.
  import type { AppState } from '../../shell/app-state.svelte';
  import type { EntrySlot } from '../../../core/model/entry-templates';
  import { isEventSlot } from '../../../core/model/entry-templates';
  import { fieldLabel } from '../../shell/entry-template-capture-model';
  import { PLAIN_FIELD } from '../../shell/plain-input';
  import { editableDateFrom, computeDate, type EditableDate } from '../../shell/event-edit';
  import { placeDisplayName } from '../../../core/places';
  import { toRow as toHofRow } from '../hof/hof-list-model';
  import EventDateFields from '../../shell/EventDateFields.svelte';
  import EventPlaceField from '../../shell/EventPlaceField.svelte';
  import EventAddrField from '../../shell/EventAddrField.svelte';

  interface Props {
    appState: AppState;
    slot: EntrySlot;
    rowLabel: string;
    /** `undefined` = die Zeile ist die erste/letzte ihrer Gruppe — Knopf ausgeblendet. */
    onMoveUp?: () => void;
    onMoveDown?: () => void;
    onRemove: () => void;
    prefill: string;
    prefillMode: 'none' | 'hidden' | 'locked';
    onPrefillChange: (prefill: string, mode: 'none' | 'hidden' | 'locked') => void;
  }
  const { appState, slot, rowLabel, onMoveUp, onMoveDown, onRemove, prefill, prefillMode, onPrefillChange }: Props = $props();

  /** Ein gesetzter Wert ohne gewählten Modus wäre eine Vorbelegung ohne Aussage darüber,
   *  ob der Nutzer sie sehen soll — `locked` ist die sichtbare, also die harmlosere. */
  const setzeWert = (v: string) => onPrefillChange(v, prefillMode === 'none' ? 'locked' : prefillMode);

  const istDatum = $derived(isEventSlot(slot) && slot.field === 'date');
  const istOrt = $derived(isEventSlot(slot) && slot.field === 'place');
  const istAdresse = $derived(isEventSlot(slot) && slot.field === 'addr');
  const istGeschlecht = $derived(!isEventSlot(slot) && slot.field === 'sex');

  // Die Datumszeile mutiert ihr `EditableDate` selbst (ein Sprung von hier aus, wie in der
  // Erfassungs-Fläche). Nach jeder Änderung wird daraus wieder ein String — das ist es, was
  // die Vorlage speichert. `untrack`-frei: die Instanz hängt am Slot, nicht am Wert.
  let datum = $state<EditableDate>(editableDateFrom(prefill || null));
  // `EventDateFields` meldet nichts zurück, es MUTIERT sein `editable` (so nutzt es auch
  // der Ereignis-Editor). Der Effekt schreibt die Zerlegung wieder zu einem String
  // zusammen — das ist es, was die Vorlage speichert. Keine Schleife: `datum` wird EINMAL
  // aus `prefill` gesetzt und danach nicht mehr daraus abgeleitet.
  $effect(() => {
    if (!datum.dateDirty) return;
    const neu = computeDate(datum) ?? '';
    if (neu !== prefill) setzeWert(neu);
  });
</script>

<div class="entry-builder-slot">
  <div class="entry-builder-slot__head">
    <span class="entry-builder-slot__label">{fieldLabel(slot)}</span>
    <div class="entry-builder-slot__actions">
      <button
        type="button"
        class="stb-icon-btn"
        disabled={!onMoveUp}
        onclick={onMoveUp}
        aria-label={`${rowLabel}: nach oben`}
      >▲</button>
      <button
        type="button"
        class="stb-icon-btn"
        disabled={!onMoveDown}
        onclick={onMoveDown}
        aria-label={`${rowLabel}: nach unten`}
      >▼</button>
      <button type="button" class="stb-icon-btn" data-variant="danger" onclick={onRemove} aria-label={`${rowLabel}: entfernen`}>🗑</button>
    </div>
  </div>

  <div class="entry-builder-slot__prefill">
    {#if istDatum}
      <!-- Kein `<label>` um Picker/Datumszeile: `.stb-field` + Caption ist das Muster
           (TST-18 verbietet einen Picker im Label, und die Datumszeile trägt ihre
           eigenen sieben Beschriftungen). -->
      <div class="stb-field entry-builder-slot__prefill-value">
        <span class="stb-field__caption">Vorbelegung (optional)</span>
        <EventDateFields editable={datum} ariaPrefix={rowLabel} />
      </div>
    {:else if istOrt}
      <div class="stb-field entry-builder-slot__prefill-value">
        <span class="stb-field__caption">Vorbelegung (optional)</span>
        <!-- Dieselbe Auflösung Id → Anzeigename wie in der Erfassungs-Fläche
             (`EntryTemplateRoleSection`): über `placeDisplayName`, nicht über
             `byId(id).title` (INV-UI-14). Gespeichert wird der NAME, nicht die Id. -->
        <EventPlaceField
          {appState}
          value={prefill}
          onTextChange={setzeWert}
          onPick={(placeId) => {
            const place = appState.db.placeObjects.get(placeId);
            if (place) setzeWert(placeDisplayName(place));
          }}
          label={`${rowLabel}: Vorbelegung`}
        />
      </div>
    {:else if istAdresse}
      <div class="stb-field entry-builder-slot__prefill-value">
        <span class="stb-field__caption">Vorbelegung (optional)</span>
        <EventAddrField
          {appState}
          value={prefill}
          onTextChange={setzeWert}
          onPick={(hofId) => {
            const hof = appState.db.hofObjects.get(hofId);
            if (hof) setzeWert(toHofRow(hof, appState.db).addr || hofId);
          }}
          villageId={null}
          label={`${rowLabel}: Vorbelegung`}
        />
      </div>
    {:else if istGeschlecht}
      <label class="entry-builder-slot__prefill-value">
        Vorbelegung (optional)
        <select
          value={prefill || 'U'}
          aria-label={`${rowLabel}: Vorbelegung`}
          onchange={(e) => setzeWert((e.currentTarget as HTMLSelectElement).value)}
        >
          <option value="U">Unbekannt</option>
          <option value="M">Männlich</option>
          <option value="F">Weiblich</option>
        </select>
      </label>
    {:else}
      <label class="entry-builder-slot__prefill-value">
        Vorbelegung (optional)
        <input
          type="text" {...PLAIN_FIELD}
          value={prefill}
          aria-label={`${rowLabel}: Vorbelegung`}
          onchange={(e) => setzeWert((e.currentTarget as HTMLInputElement).value)}
        />
      </label>
    {/if}
    <label class="entry-builder-slot__prefill-mode">
      Modus
      <select
        value={prefillMode}
        aria-label={`${rowLabel}: Vorbelegungs-Modus`}
        onchange={(e) => onPrefillChange(prefill, (e.currentTarget as HTMLSelectElement).value as 'none' | 'hidden' | 'locked')}
      >
        <option value="none">Keine Vorbelegung</option>
        <option value="locked">Sichtbar, gesperrt</option>
        <option value="hidden">Versteckt</option>
      </select>
    </label>
  </div>
</div>

<style>
  .entry-builder-slot {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.5rem;
    background: var(--stb-surface-2);
    border-radius: var(--stb-radius-control);
  }

  .entry-builder-slot__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .entry-builder-slot__label {
    font-weight: 600;
    color: var(--stb-text);
  }

  .entry-builder-slot__actions {
    display: flex;
    gap: 0.15rem;
  }

  .entry-builder-slot__prefill {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .entry-builder-slot__prefill label {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    font-size: 0.78rem;
    color: var(--stb-text-dim);
    flex: 1 1 10rem;
  }
</style>
