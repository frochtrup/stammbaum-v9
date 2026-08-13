<script lang="ts">
  // ui/views/entry/EntryTemplateBuilderRoleSection.svelte — EIN Rollen-Abschnitt im
  // Vorlagen-Builder (BL-353, ADR-v9-264/-265): zeigt die vorhandenen Felder dieser Rolle
  // (`EntryTemplateBuilderSlotRow`) und die Kontrollen, um weitere hinzuzufügen —
  // Identitätsfelder direkt (nur Personen-Rollen), Ereignisfelder über einen neuen ODER
  // bestehenden Ereignis-Tag. Der Ereignistyp kommt AUSSCHLIESSLICH aus
  // `EventTypeMenu.svelte` (INV-UI-8, keine zweite Typ-Liste) — Familien-Rollen sehen dort
  // ausschließlich MARR/ENGA (ADR-v9-264 E2, `eventTypeChoicesFor`).
  //
  // Die Gruppierung selbst (`group`) kommt vom Aufrufer über `groupTemplateSlots` —
  // derselbe Mechanismus, den auch die Erfassungs-Fläche für die LESE-Ansicht nutzt
  // (INV-UI-4: ein Gruppierungsweg für beide Richtungen).
  // `EntryPersonRole` statt `Exclude<EntryRole, 'parentFamily' | 'spouseFamily'>`: die
  // frühere Fassung leitete „Personen-Rolle" durch AUFZÄHLUNG der Familien-Rollen ab —
  // mit der dritten (`spouseParentFamily`, ADR-v9-268 E1) war sie still falsch. Der Typ
  // kennt die Antwort, eine Liste daneben muss man pflegen.
  import type { AppState } from '../../shell/app-state.svelte';
  import type { EntryPersonRole, EntryRole, EntrySlot, EventFieldName, IdentityFieldName, PrefillMode } from '../../../core/model/entry-templates';
  import { isFamilyRole } from '../../../core/model/entry-templates';
  import type { EntryRoleGroup } from '../../shell/entry-template-capture-model';
  import { fieldLabel } from '../../shell/entry-template-capture-model';
  import { slotKey } from '../../../core/model/entry-templates';
  import {
    addEventSlotField,
    addIdentitySlot,
    availableEventFields,
    availableIdentityFields,
    eventTagsUsed,
    eventTypeChoicesFor,
    removeSlot,
    setSlotPrefill,
    swapSlots,
  } from './entry-template-builder-model';
  import EventTypeMenu from '../../shell/EventTypeMenu.svelte';
  import EntryTemplateBuilderSlotRow from './EntryTemplateBuilderSlotRow.svelte';

  interface Props {
    appState: AppState;
    role: EntryRole;
    group: EntryRoleGroup;
    slots: EntrySlot[];
    onSlotsChange: (next: EntrySlot[]) => void;
    /** Den ganzen Block verschieben (ADR-v9-268 E5). `undefined` = am Rand oder noch
     *  ohne Feld — dann gibt es keine Position, die sich verschieben ließe. */
    onMoveUp?: () => void;
    onMoveDown?: () => void;
  }
  const { appState, role, group, slots, onSlotsChange, onMoveUp, onMoveDown }: Props = $props();

  const isFamily = $derived(isFamilyRole(role));

  function prefillModeOf(slot: EntrySlot): 'none' | 'hidden' | 'locked' | 'prefilled' {
    return slot.prefillMode ?? 'none';
  }

  function onPrefillChange(key: string, prefill: string, mode: 'none' | 'hidden' | 'locked' | 'prefilled') {
    onSlotsChange(
      mode === 'none' || prefill.trim() === ''
        ? setSlotPrefill(slots, key, null)
        : setSlotPrefill(slots, key, { prefill, prefillMode: mode as PrefillMode }),
    );
  }

  function addIdentity(field: IdentityFieldName) {
    onSlotsChange(addIdentitySlot(slots, role as EntryPersonRole, field));
  }

  function addField(event: string, field: EventFieldName) {
    onSlotsChange(addEventSlotField(slots, role, event, field));
  }

  function addNewEvent(event: string) {
    // Startfeld „Datum" — der häufigste erste Wert; weitere Felder kommen über die
    // „＋ Feld"-Zeile der neu entstandenen Gruppe.
    onSlotsChange(addEventSlotField(slots, role, event, 'date'));
  }

  const missingIdentity = $derived(isFamily ? [] : availableIdentityFields(slots, role as EntryPersonRole));
  const usedEvents = $derived(eventTagsUsed(slots, role));
  const newEventChoices = $derived(eventTypeChoicesFor(role, usedEvents));
</script>

<section class="entry-builder-role">
  <div class="entry-builder-role__head">
    <h4 class="stb-section-title">{group.label}</h4>
    {#if onMoveUp || onMoveDown}
      <div class="entry-builder-role__move">
        <button
          type="button"
          class="stb-icon-btn"
          disabled={!onMoveUp}
          onclick={onMoveUp}
          aria-label={`${group.label}: Block nach oben`}
        >▲</button>
        <button
          type="button"
          class="stb-icon-btn"
          disabled={!onMoveDown}
          onclick={onMoveDown}
          aria-label={`${group.label}: Block nach unten`}
        >▼</button>
      </div>
    {/if}
  </div>

  {#if !isFamily}
    <div class="entry-builder-role__rows">
      {#each group.identitySlots as slot, i (slotKey(slot))}
        {@const key = slotKey(slot)}
        <EntryTemplateBuilderSlotRow
          {appState}
          {slot}
          rowLabel={`${group.label} ${fieldLabel(slot)}`}
          onMoveUp={i > 0 ? () => onSlotsChange(swapSlots(slots, key, slotKey(group.identitySlots[i - 1]))) : undefined}
          onMoveDown={i < group.identitySlots.length - 1 ? () => onSlotsChange(swapSlots(slots, key, slotKey(group.identitySlots[i + 1]))) : undefined}
          onRemove={() => onSlotsChange(removeSlot(slots, key))}
          prefill={slot.prefill ?? ''}
          prefillMode={prefillModeOf(slot)}
          onPrefillChange={(v, m) => onPrefillChange(key, v, m)}
        />
      {/each}
    </div>

    {#if missingIdentity.length > 0}
      <div class="entry-builder-role__add-row">
        <span class="entry-builder-role__add-label">＋ Identitätsfeld:</span>
        {#each missingIdentity as field (field)}
          <button type="button" class="stb-btn" data-variant="secondary" onclick={() => addIdentity(field)}>
            {fieldLabel({ role: role as EntryPersonRole, field })}
          </button>
        {/each}
      </div>
    {/if}
  {/if}

  {#each group.eventGroups as eg (eg.event)}
    {@const missingFields = availableEventFields(slots, role, eg.event)}
    <div class="entry-builder-role__event">
      <h5 class="entry-builder-role__event-title">{eg.label}</h5>
      <div class="entry-builder-role__rows">
        {#each eg.slots as slot, i (slotKey(slot))}
          {@const key = slotKey(slot)}
          <EntryTemplateBuilderSlotRow
            {appState}
            {slot}
            rowLabel={`${group.label} ${eg.label} ${fieldLabel(slot)}`}
            onMoveUp={i > 0 ? () => onSlotsChange(swapSlots(slots, key, slotKey(eg.slots[i - 1]))) : undefined}
            onMoveDown={i < eg.slots.length - 1 ? () => onSlotsChange(swapSlots(slots, key, slotKey(eg.slots[i + 1]))) : undefined}
            onRemove={() => onSlotsChange(removeSlot(slots, key))}
            prefill={slot.prefill ?? ''}
            prefillMode={prefillModeOf(slot)}
            onPrefillChange={(v, m) => onPrefillChange(key, v, m)}
          />
        {/each}
      </div>
      {#if missingFields.length > 0}
        <div class="entry-builder-role__add-row">
          <span class="entry-builder-role__add-label">＋ Feld:</span>
          {#each missingFields as field (field)}
            <button type="button" class="stb-btn" data-variant="secondary" onclick={() => addField(eg.event, field)}>
              {fieldLabel({ role, field, event: eg.event } as EntrySlot)}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/each}

  {#if newEventChoices.length > 0}
    <EventTypeMenu
      triggerLabel="＋ Ereignis"
      groups={[newEventChoices]}
      onSelect={addNewEvent}
    />
  {/if}
</section>

<style>
  .entry-builder-role {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.7rem;
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-card);
  }

  .entry-builder-role__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .entry-builder-role__move {
    display: flex;
    gap: 0.2rem;
  }

  .entry-builder-role__rows {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .entry-builder-role__event {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding-top: 0.35rem;
    border-top: 1px dashed var(--stb-surface-3);
  }

  .entry-builder-role__event-title {
    margin: 0;
    font-size: 0.8rem;
    color: var(--stb-text-dim);
  }

  .entry-builder-role__add-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
  }

  .entry-builder-role__add-label {
    font-size: 0.78rem;
    color: var(--stb-text-dim);
  }
</style>
