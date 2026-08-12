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
  import type { EntryRole, EntrySlot, EventFieldName, IdentityFieldName, PrefillMode } from '../../../core/model/entry-templates';
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
    role: EntryRole;
    group: EntryRoleGroup;
    slots: EntrySlot[];
    onSlotsChange: (next: EntrySlot[]) => void;
  }
  const { role, group, slots, onSlotsChange }: Props = $props();

  const isFamily = $derived(isFamilyRole(role));

  function prefillModeOf(slot: EntrySlot): 'none' | 'hidden' | 'locked' {
    return slot.prefillMode ?? 'none';
  }

  function onPrefillChange(key: string, prefill: string, mode: 'none' | 'hidden' | 'locked') {
    onSlotsChange(
      mode === 'none' || prefill.trim() === ''
        ? setSlotPrefill(slots, key, null)
        : setSlotPrefill(slots, key, { prefill, prefillMode: mode as PrefillMode }),
    );
  }

  function addIdentity(field: IdentityFieldName) {
    onSlotsChange(addIdentitySlot(slots, role as Exclude<EntryRole, 'parentFamily' | 'spouseFamily'>, field));
  }

  function addField(event: string, field: EventFieldName) {
    onSlotsChange(addEventSlotField(slots, role, event, field));
  }

  function addNewEvent(event: string) {
    // Startfeld „Datum" — der häufigste erste Wert; weitere Felder kommen über die
    // „＋ Feld"-Zeile der neu entstandenen Gruppe.
    onSlotsChange(addEventSlotField(slots, role, event, 'date'));
  }

  const missingIdentity = $derived(isFamily ? [] : availableIdentityFields(slots, role as Exclude<EntryRole, 'parentFamily' | 'spouseFamily'>));
  const usedEvents = $derived(eventTagsUsed(slots, role));
  const newEventChoices = $derived(eventTypeChoicesFor(role, usedEvents));
</script>

<section class="entry-builder-role">
  <h4 class="stb-section-title">{group.label}</h4>

  {#if !isFamily}
    <div class="entry-builder-role__rows">
      {#each group.identitySlots as slot, i (slotKey(slot))}
        {@const key = slotKey(slot)}
        <EntryTemplateBuilderSlotRow
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
            {fieldLabel({ role: role as Exclude<EntryRole, 'parentFamily' | 'spouseFamily'>, field })}
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
