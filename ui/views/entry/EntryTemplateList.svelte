<script lang="ts">
  // ui/views/entry/EntryTemplateList.svelte — der Einstieg der Erfassungs-Fläche (BL-353,
  // ADR-v9-265 Entscheidung 2): je Zeile Vorlagenname + Rollen, Aktionen erfassen ·
  // bearbeiten · kopieren · löschen. Mitgelieferte Vorlagen (`isBuiltinEntryTemplate`)
  // sind kopierbar, aber NICHT bearbeitbar/löschbar (ADR-v9-264 E8) — ihre Zeile zeigt nur
  // erfassen + kopieren.
  //
  // Ikonische Zeilen-Controls: `.stb-icon-btn`, ✎ zuerst, destruktiv außen, 🗑 für „der
  // Eintrag verschwindet" (ADR-v9-263 E4) — dieselbe Reihenfolge/Primitive wie
  // Aufgaben-/Protokoll-/Hypothesen-Zeile. Gelöscht wird über `ConfirmDialog` (TST-27).
  import type { EntryTemplate } from '../../../core/model/entry-templates';
  import { isBuiltinEntryTemplate } from '../../../core/model/entry-templates';
  import { roleSummary } from './entry-template-builder-model';
  import ConfirmDialog from '../../shell/ConfirmDialog.svelte';

  interface Props {
    templates: EntryTemplate[];
    onCapture: (tpl: EntryTemplate) => void;
    onEdit: (tpl: EntryTemplate) => void;
    onCopy: (tpl: EntryTemplate) => void;
    onDelete: (tpl: EntryTemplate) => void;
    onNew: () => void;
  }
  const { templates, onCapture, onEdit, onCopy, onDelete, onNew }: Props = $props();

  let toDelete = $state<EntryTemplate | null>(null);
</script>

<div class="entry-list">
  <div class="entry-list__head">
    <h2>Erfassung</h2>
    <button type="button" class="stb-btn" data-variant="primary" onclick={onNew}>＋ Neue Vorlage</button>
  </div>

  {#if templates.length === 0}
    <p class="entry-list__empty">Noch keine Vorlage vorhanden.</p>
  {:else}
    <ul class="entry-list__rows">
      {#each templates as tpl (tpl.id)}
        {@const builtin = isBuiltinEntryTemplate(tpl.id)}
        <li class="entry-list__row">
          <div class="entry-list__info">
            <span class="entry-list__label">{tpl.label || '(ohne Namen)'}</span>
            <span class="entry-list__roles">{roleSummary(tpl)}</span>
          </div>
          <div class="entry-list__actions">
            <button type="button" class="stb-btn" data-variant="primary" onclick={() => onCapture(tpl)}>
              ▶ Erfassen
            </button>
            {#if !builtin}
              <button type="button" class="stb-icon-btn" onclick={() => onEdit(tpl)} aria-label={`„${tpl.label}“ bearbeiten`}>✎</button>
            {/if}
            <button type="button" class="stb-icon-btn" onclick={() => onCopy(tpl)} aria-label={`„${tpl.label}“ kopieren`}>⧉</button>
            {#if !builtin}
              <button
                type="button"
                class="stb-icon-btn"
                data-variant="danger"
                onclick={() => (toDelete = tpl)}
                aria-label={`„${tpl.label}“ löschen`}
              >🗑</button>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

{#if toDelete}
  <ConfirmDialog
    titel={`„${toDelete.label}“ löschen?`}
    text="Die Vorlage geht mit allen Feldern verloren. Bereits erfasste Personen und Familien bleiben unangetastet."
    onConfirm={() => {
      onDelete(toDelete!);
      toDelete = null;
    }}
    onCancel={() => (toDelete = null)}
  />
{/if}

<style>
  .entry-list {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.75rem;
    overflow-y: auto;
  }

  .entry-list__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .entry-list__head h2 {
    margin: 0;
  }

  .entry-list__empty {
    color: var(--stb-text-dim);
  }

  .entry-list__rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .entry-list__row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.6rem 0.7rem;
    background: var(--stb-surface-2);
    border-radius: var(--stb-radius-card);
  }

  .entry-list__info {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }

  .entry-list__label {
    font-weight: 600;
    color: var(--stb-text);
  }

  .entry-list__roles {
    font-size: 0.78rem;
    color: var(--stb-text-dim);
  }

  .entry-list__actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex-wrap: wrap;
  }
</style>
