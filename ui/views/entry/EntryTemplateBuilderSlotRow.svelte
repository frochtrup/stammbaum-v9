<script lang="ts">
  // ui/views/entry/EntryTemplateBuilderSlotRow.svelte — EIN Feld eines Rollen-Abschnitts
  // im Vorlagen-Builder (BL-353, ADR-v9-264/-265). Zeigt das Label (aus dem Modell,
  // `fieldLabel`), die Vorbelegung + ihren Modus (`hidden`/`locked`), und die drei
  // Zeilen-Aktionen: nach oben, nach unten, entfernen (`.stb-icon-btn`, INV-UI-4).
  import type { EntrySlot } from '../../../core/model/entry-templates';
  import { fieldLabel } from '../../shell/entry-template-capture-model';
  import { PLAIN_FIELD } from '../../shell/plain-input';

  interface Props {
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
  const { slot, rowLabel, onMoveUp, onMoveDown, onRemove, prefill, prefillMode, onPrefillChange }: Props = $props();
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
    <label class="entry-builder-slot__prefill-value">
      Vorbelegung (optional)
      <input
        type="text" {...PLAIN_FIELD}
        value={prefill}
        aria-label={`${rowLabel}: Vorbelegung`}
        onchange={(e) => onPrefillChange((e.currentTarget as HTMLInputElement).value, prefillMode === 'none' ? 'locked' : prefillMode)}
      />
    </label>
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
