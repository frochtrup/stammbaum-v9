<script lang="ts">
  // ui/shell/EntryTemplateRoleSection.svelte — EIN Rollen-Abschnitt der Erfassungs-Fläche
  // (BL-352, ADR-v9-264 Entscheidung 10): Identitätsfelder (nur Personen-Rollen) + je
  // Ereignis-Tag eine Feldgruppe (Datum/Ort/Adresse/Wert/Notiz — nur was die Vorlage
  // tatsächlich vorsieht). Jede Eingabefläche ist ein VORHANDENER Baustein, nichts neu
  // erfunden: `EventDateFields`/`EventPlaceField`/`EventAddrField`/`PLAIN_FIELD`.
  //
  // Der Entwurf (`textValues`/`dateStates`) bleibt AUSSCHLIESSLICH bei
  // `EntryTemplateCapture.svelte` — diese Komponente liest/schreibt ihn nur über die drei
  // Zugriffs-Funktionen (`textValue`/`setText`/`dateStateFor`), statt die Container selbst
  // als Prop zu halten und zu mutieren (Svelte 5 `ownership_invalid_mutation`: eine
  // Mutation an einem fremden `$state`-Container über mehr als einen Komponenten-Sprung
  // hinweg — hier Capture → RoleSection → EventDateFields — wird zur Laufzeit verworfen/
  // markiert. Callback statt Direkt-Mutation ist genau der von Svelte selbst vorgeschlagene
  // Ausweg). `dateStateFor` liefert weiterhin dieselbe Objekt-Referenz je Slot zurück —
  // `EventDateFields` mutiert SIE, aber das ist wieder nur EIN Sprung von hier aus gesehen.
  //
  // Vorbelegung (ADR-v9-264 E3): `hidden` wird HIER GAR NICHT gerendert (die Kopfzeile der
  // Fläche zeigt sie als Chip, s. `hiddenPrefillChips`) — `locked` wird sichtbar UND
  // `readonly` gerendert (kein Schloss-Icon neben einem weiterhin editierbaren Feld).
  import type { AppState } from './app-state.svelte';
  import type { EntryRoleGroup } from './entry-template-capture-model';
  import { fieldLabel, prefillValueLabel } from './entry-template-capture-model';
  import type { EditableDate } from './event-edit';
  import { slotKey } from '../../core/model/entry-templates';
  import type { PersonId } from '../../core/model/types';
  import { PLAIN_FIELD, PROSE_FIELD } from './plain-input';
  import { displayName } from './person-display';
  import { placeDisplayName } from '../../core/places';
  import { toRow as toHofRow } from '../views/hof/hof-list-model';
  import EventDateFields from './EventDateFields.svelte';
  import EventPlaceField from './EventPlaceField.svelte';
  import EventAddrField from './EventAddrField.svelte';
  import PersonPicker from './PersonPicker.svelte';

  interface Props {
    appState: AppState;
    group: EntryRoleGroup;
    textValue: (key: string) => string;
    setText: (key: string, v: string) => void;
    dateStateFor: (key: string) => EditableDate;
    /** Nur für Personen-Rollen relevant: eine vom Nutzer verknüpfte Bestandsperson —
     *  `undefined` = unverknüpft (die Rolle entsteht neu, falls befüllt). */
    linkedId: PersonId | undefined;
    /** Given/Nachname wurden geändert — der Aufrufer entprellt die Dubletten-Suche selbst. */
    onNameInput: () => void;
    onUnlink: () => void;
    /** Bestandspersonen, die zum getippten Namen passen könnten (Live-Dubletten-Suche).
     *  Ein VORSCHLAG — verknüpft wird erst durch die Wahl im Picker (s. u.). */
    suggestions?: readonly PersonId[];
    onLink?: (id: PersonId) => void;
  }
  const {
    appState,
    group,
    textValue,
    setText,
    dateStateFor,
    linkedId,
    onNameInput,
    onUnlink,
    suggestions = [],
    onLink,
  }: Props = $props();

  /** Der Picker steht auf Wunsch offen (Dubletten-Vorschlag) oder auf Klick; solange
   *  `nurVorschlaege` gilt, zeigt er genau die Kandidaten — „alle durchsuchen" hebt die
   *  Beschränkung auf, ohne den Picker zu wechseln (INV-UI-4: ein Mechanismus). */
  let pickerOffen = $state(false);
  let nurVorschlaege = $state(true);

  const linkedPerson = $derived(linkedId ? appState.db.individuals.get(linkedId) : undefined);

  function ariaPrefixFor(eventLabel: string): string {
    return `${group.label} ${eventLabel}`;
  }
</script>

<section class="entry-template-role">
  <h4 class="stb-section-title">{group.label}</h4>

  {#if !group.isFamily}
    {#if linkedPerson}
      <div class="entry-template-role__linked">
        <span class="stb-pill">🔗 Verknüpft: {displayName(linkedPerson)}</span>
        <button type="button" class="stb-icon-btn" onclick={onUnlink} aria-label={`${group.label}: Verknüpfung lösen`}>✕</button>
      </div>
    {:else}
      <div class="entry-template-role__identity">
        {#each group.identitySlots as slot (slotKey(slot))}
          {@const key = slotKey(slot)}
          {#if slot.prefillMode === 'hidden'}
            <!-- gar nicht gerendert — Kopfzeilen-Chip trägt den Wert (ADR-v9-264 E3). -->
          {:else if slot.prefillMode === 'locked'}
            <label>
              {fieldLabel(slot)}
              <input type="text" {...PLAIN_FIELD} value={prefillValueLabel(slot)} readonly aria-label={`${group.label} ${fieldLabel(slot)} (vorbelegt)`} />
            </label>
          {:else if slot.field === 'sex'}
            <label>
              {fieldLabel(slot)}
              <select
                value={textValue(key) || 'U'}
                aria-label={`${group.label} Geschlecht`}
                onchange={(e) => setText(key, (e.currentTarget as HTMLSelectElement).value)}
              >
                <option value="U">Unbekannt</option>
                <option value="M">Männlich</option>
                <option value="F">Weiblich</option>
              </select>
            </label>
          {:else}
            <label>
              {fieldLabel(slot)}
              <input
                type="text" {...PLAIN_FIELD}
                value={textValue(key)}
                aria-label={`${group.label} ${fieldLabel(slot)}`}
                onchange={(e) => {
                  setText(key, (e.currentTarget as HTMLInputElement).value);
                  onNameInput();
                }}
              />
            </label>
          {/if}
        {/each}
      </div>

      <!-- Vorschlagen, nicht binden: die Dubletten-Suche liefert Kandidaten, verknüpft
           wird durch die Wahl im gewohnten `PersonPicker` (INV-UI-4) — derselbe Grundsatz
           wie bei der Familienwahl (ADR-v9-264 E6) und der Ortsauflösung (ADR-v9-29).
           „+ Neue Person anlegen" bleibt darin verfügbar; wer nichts wählt, bekommt die
           Person ohnehin beim Speichern aus der Vorlage. -->
      <div class="entry-template-role__link">
        {#if suggestions.length > 0 && !pickerOffen}
          <button
            type="button"
            class="stb-btn entry-template-role__hint"
            data-variant="secondary"
            onclick={() => {
              nurVorschlaege = true;
              pickerOffen = true;
            }}
          >
            {suggestions.length} mögliche{suggestions.length === 1 ? 'r' : ''} Treffer — verknüpfen statt neu anlegen?
          </button>
        {:else if !pickerOffen}
          <button
            type="button"
            class="stb-btn"
            data-variant="secondary"
            onclick={() => {
              nurVorschlaege = false;
              pickerOffen = true;
            }}
          >
            Bestehende Person verknüpfen …
          </button>
        {/if}

        {#if pickerOffen}
          <PersonPicker
            {appState}
            value={null}
            onChange={(id) => {
              if (id && onLink) onLink(id);
              pickerOffen = false;
            }}
            onlyIds={nurVorschlaege ? suggestions : undefined}
            label={`${group.label}: bestehende Person verknüpfen`}
            startOpen
            onClose={() => (pickerOffen = false)}
          />
          {#if nurVorschlaege}
            <button
              type="button"
              class="stb-btn"
              data-variant="secondary"
              onclick={() => (nurVorschlaege = false)}
            >
              Alle Personen durchsuchen
            </button>
          {/if}
        {/if}
      </div>
    {/if}
  {/if}

  {#each group.eventGroups as eg (eg.event)}
    <div class="entry-template-role__event">
      <h5 class="entry-template-role__event-title">{eg.label}</h5>
      {#each eg.slots as slot (slotKey(slot))}
        {@const key = slotKey(slot)}
        {#if slot.prefillMode === 'hidden'}
          <!-- Kopfzeilen-Chip trägt den Wert. -->
        {:else if slot.prefillMode === 'locked'}
          {@const lockedLabel = `${ariaPrefixFor(eg.label)} ${fieldLabel(slot)} (vorbelegt)`}
          {#if slot.field === 'note'}
            <label>
              {fieldLabel(slot)}
              <textarea {...PROSE_FIELD} readonly aria-label={lockedLabel}>{prefillValueLabel(slot)}</textarea>
            </label>
          {:else}
            <label>
              {fieldLabel(slot)}
              <input type="text" {...PLAIN_FIELD} value={prefillValueLabel(slot)} readonly aria-label={lockedLabel} />
            </label>
          {/if}
        {:else if slot.field === 'date'}
          <EventDateFields editable={dateStateFor(key)} ariaPrefix={ariaPrefixFor(eg.label)} />
        {:else if slot.field === 'place'}
          <div class="stb-field">
            <span class="stb-field__caption">Ort</span>
            <EventPlaceField
              {appState}
              value={textValue(key)}
              onTextChange={(v) => setText(key, v)}
              onPick={(placeId) => {
                const place = appState.db.placeObjects.get(placeId);
                if (place) setText(key, placeDisplayName(place));
              }}
              label={`${ariaPrefixFor(eg.label)} Ort`}
            />
          </div>
        {:else if slot.field === 'addr'}
          <div class="stb-field">
            <span class="stb-field__caption">Adresse</span>
            <EventAddrField
              {appState}
              value={textValue(key)}
              onTextChange={(v) => setText(key, v)}
              onPick={(hofId) => {
                const hof = appState.db.hofObjects.get(hofId);
                if (hof) setText(key, toHofRow(hof, appState.db).addr || hofId);
              }}
              villageId={null}
              label={`${ariaPrefixFor(eg.label)} Adresse`}
            />
          </div>
        {:else if slot.field === 'note'}
          <label>
            {fieldLabel(slot)}
            <textarea {...PROSE_FIELD}
              aria-label={`${ariaPrefixFor(eg.label)} Notiz`}
              value={textValue(key)}
              onchange={(e) => setText(key, (e.currentTarget as HTMLTextAreaElement).value)}
            ></textarea>
          </label>
        {:else}
          <label>
            {fieldLabel(slot)}
            <input
              type="text" {...PLAIN_FIELD}
              value={textValue(key)}
              aria-label={`${ariaPrefixFor(eg.label)} Wert`}
              onchange={(e) => setText(key, (e.currentTarget as HTMLInputElement).value)}
            />
          </label>
        {/if}
      {/each}
    </div>
  {/each}
</section>

<style>
  .entry-template-role {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.6rem;
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-card);
  }

  .entry-template-role__event-title {
    margin: 0.4rem 0 0;
    font-size: 0.8rem;
    color: var(--stb-text-dim);
  }

  .entry-template-role__identity {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .entry-template-role__identity label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.8rem;
    color: var(--stb-text-dim);
    flex: 1 1 8rem;
  }

  .entry-template-role label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.8rem;
    color: var(--stb-text-dim);
  }

  .entry-template-role__linked {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .entry-template-role__event {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
</style>
