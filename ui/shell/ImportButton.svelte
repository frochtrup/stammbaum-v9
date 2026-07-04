<script lang="ts">
  // ui/shell/ImportButton.svelte — Import-Einstieg (Spec 20 §1.2): "Datei öffnen"
  // nutzt services/file (createFileService + pickAndImport), core/interop (parseGedcom)
  // gibt reines Domänenmodell zurück, das über AppState.loadDatabase() geladen wird.
  // GRAMPS-Import ist NICHT Teil dieser Scheibe (nur GEDCOM).
  import { createFileService } from '../../services/file';
  import { parseGedcom } from '../../core/interop';
  import type { AppState } from './app-state.svelte';

  interface Props {
    appState: AppState;
  }
  const { appState }: Props = $props();

  let status = $state<'idle' | 'loading' | 'error'>('idle');
  let errorMessage = $state('');

  const fileService = createFileService();

  async function handleClick() {
    status = 'loading';
    errorMessage = '';
    try {
      const picked = await fileService.pickAndImport();
      if (!picked) {
        status = 'idle';
        return;
      }
      const parsed = parseGedcom(picked.text);
      appState.loadDatabase(parsed.db, picked.name);
      status = 'idle';
    } catch (err) {
      status = 'error';
      errorMessage = err instanceof Error ? err.message : String(err);
    }
  }
</script>

<div class="import-bar">
  <button type="button" class="import-bar__button" onclick={handleClick} disabled={status === 'loading'}>
    {status === 'loading' ? 'Lade …' : 'Datei öffnen (GEDCOM)'}
  </button>
  {#if appState.fileName}
    <span class="import-bar__filename">{appState.fileName}</span>
  {/if}
  {#if status === 'error'}
    <span class="import-bar__error" role="alert">Fehler beim Import: {errorMessage}</span>
  {/if}
</div>

<style>
  .import-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 1rem;
    background: var(--stb-surface-2);
    border-bottom: 1px solid var(--stb-surface-3);
    flex-wrap: wrap;
  }

  .import-bar__button {
    background: var(--stb-gold);
    color: var(--stb-bg);
    border: none;
    border-radius: var(--stb-radius-control);
    padding: 0.5rem 0.9rem;
    font-weight: 600;
    cursor: pointer;
  }

  .import-bar__button:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .import-bar__filename {
    color: var(--stb-text-dim);
    font-size: 0.85rem;
  }

  .import-bar__error {
    color: var(--stb-danger);
    font-size: 0.85rem;
  }
</style>
