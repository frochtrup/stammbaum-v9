<script lang="ts">
  // ui/shell/SaveButton.svelte — expliziter Export (Spec 20 §1.2 [K] "Speichern über ein
  // Export-Rohr, zwei Tiers", Spec 14 §3.2 INV-FILE-2). Nur sichtbar/aktiv, solange eine
  // Datei geladen ist (appState.fileName) — vorher gibt es nichts zu exportieren.
  //
  // Nutzt das EINE Export-Rohr (exportViaOnePipe) statt einer eigenen Save-Maschinerie:
  // baut das ParsedGedcom-Doc über appState.buildGedcomDoc() (Chokepoint, kein core-Zugriff
  // hier) und reicht es unverändert durch. Nur der Standard-GEDCOM-5.5.1-Pfad — GED7/
  // Strict/GRAMPS/Anonymisierung sind nicht Teil dieser Aktion (separater Export-Dialog,
  // nicht Teil dieser Scheibe).
  import { saveCurrentDoc } from './save-action';
  import type { FileService } from '../../services/file';
  import type { AppState } from './app-state.svelte';

  interface Props {
    appState: AppState;
    fileService: FileService;
    /** FS-Access-Handle der zuletzt geladenen/gespeicherten Datei (Tier 1), falls vorhanden. */
    handle?: unknown;
  }
  const { appState, fileService, handle }: Props = $props();

  let status = $state<'idle' | 'saving'>('idle');
  /** Kurzer Status-Hinweis nach dem Speichern (analog placesEditNotice-Muster in App.svelte). */
  let notice = $state('');

  // Der eigentliche Vorgang liegt seit BL-93 in save-action.ts — dieselbe Funktion
  // ruft das Kürzel Cmd/Ctrl+S in App.svelte auf (EIN Speichern-Pfad, INV-UI-4).
  async function handleClick() {
    status = 'saving';
    notice = '';
    notice = await saveCurrentDoc(appState, fileService, handle);
    status = 'idle';
  }
</script>

{#if appState.fileName}
  <div class="save-bar">
    <button type="button" class="save-bar__button" data-variant="primary" onclick={handleClick} disabled={status === 'saving'}>
      {status === 'saving' ? 'Speichere …' : 'Speichern'}
    </button>
    {#if notice}
      <span class="save-bar__notice" role="status">{notice}</span>
    {/if}
  </div>
{/if}

<style>
  .save-bar {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .save-bar__button {
    background: var(--stb-gold);
    color: var(--stb-bg);
    border: none;
    border-radius: var(--stb-radius-control);
    padding: 0.5rem 0.9rem;
    font-weight: 600;
    cursor: pointer;
  }

  .save-bar__button:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .save-bar__notice {
    color: var(--stb-text-dim);
    font-size: 0.85rem;
    font-style: italic;
  }
</style>
