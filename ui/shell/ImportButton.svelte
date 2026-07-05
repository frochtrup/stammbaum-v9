<script lang="ts">
  // ui/shell/ImportButton.svelte — Import-Einstieg (Spec 20 §1.2): "Datei öffnen" +
  // "Demo laden" ([S] Demo-Modus). Beide Wege nutzen dieselbe Lade-Pipeline
  // load-gedcom-text.ts (parseGedcom -> Orte/Höfe-Wiring -> appState.loadDatabase()) —
  // EIN kanonischer Lade-Pfad (INV-UI-4-Lehre auf Lade-Orchestrierung angewendet, s.
  // load-gedcom-text.ts-Kopf), nur die Text-Quelle unterscheidet sich: echter
  // Datei-Picker (services/file) vs. mitgeliefertes Asset (fetch('./demo.ged'), analog
  // Verhaltens-Orakel legacy-v8/storage.js loadDemo() — funktioniert offline, weil
  // demo.ged als Vite-Static-Asset gebündelt ist, s. app/public/demo.ged).
  // GRAMPS-Import ist NICHT Teil dieser Scheibe (nur GEDCOM).
  import { createFileService } from '../../services/file';
  import { createPlacesSyncService } from '../../services/places';
  import { loadGedcomText } from './load-gedcom-text';
  import type { AppState } from './app-state.svelte';

  interface Props {
    appState: AppState;
  }
  const { appState }: Props = $props();

  let status = $state<'idle' | 'loading-file' | 'loading-demo' | 'error'>('idle');
  let errorMessage = $state('');
  /** Einfacher State-Flag für Konflikt-/Schema-Hinweise (Spec 30 §4 LP-9) — kein Modal,
   * keine eigene Toast-Infrastruktur vorhanden; reicht laut Aufgabenstellung. */
  let placesNotice = $state('');

  const fileService = createFileService();
  const placesSync = createPlacesSyncService();

  async function handleClick() {
    status = 'loading-file';
    errorMessage = '';
    placesNotice = '';
    try {
      const picked = await fileService.pickAndImport();
      if (!picked) {
        status = 'idle';
        return;
      }
      const result = await loadGedcomText(picked.text, picked.name, appState, placesSync);
      placesNotice = result.placesNotice;
      status = 'idle';
    } catch (err) {
      status = 'error';
      errorMessage = err instanceof Error ? err.message : String(err);
    }
  }

  async function handleDemoClick() {
    status = 'loading-demo';
    errorMessage = '';
    placesNotice = '';
    try {
      const res = await fetch('./demo.ged');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      const result = await loadGedcomText(text, 'demo.ged', appState, placesSync);
      placesNotice = result.placesNotice;
      status = 'idle';
    } catch (err) {
      status = 'error';
      errorMessage = err instanceof Error ? err.message : String(err);
    }
  }
</script>

<div class="import-bar">
  <button
    type="button"
    class="import-bar__button"
    onclick={handleClick}
    disabled={status === 'loading-file' || status === 'loading-demo'}
  >
    {status === 'loading-file' ? 'Lade …' : 'Datei öffnen (GEDCOM)'}
  </button>
  <button
    type="button"
    class="import-bar__button import-bar__button--secondary"
    onclick={handleDemoClick}
    disabled={status === 'loading-file' || status === 'loading-demo'}
  >
    {status === 'loading-demo' ? 'Lade …' : 'Demo laden'}
  </button>
  {#if appState.fileName}
    <span class="import-bar__filename">{appState.fileName}</span>
  {/if}
  {#if status === 'error'}
    <span class="import-bar__error" role="alert">Fehler beim Import: {errorMessage}</span>
  {/if}
  {#if placesNotice}
    <span class="import-bar__notice" role="status">{placesNotice}</span>
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

  .import-bar__button--secondary {
    background: transparent;
    color: var(--stb-gold);
    border: 1px solid var(--stb-gold-dim);
  }

  .import-bar__filename {
    color: var(--stb-text-dim);
    font-size: 0.85rem;
  }

  .import-bar__error {
    color: var(--stb-danger);
    font-size: 0.85rem;
  }

  .import-bar__notice {
    color: var(--stb-text-dim);
    font-size: 0.85rem;
    font-style: italic;
  }
</style>
