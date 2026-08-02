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
    /** FS-Access-Handle der zuletzt geladenen/gespeicherten Datei (Tier 1a), falls vorhanden. */
    handle?: unknown;
    /** Meldet ein bei „Speichern unter" (Tier 1b) NEU erworbenes Handle an die Schale. */
    onHandleAcquired?: (handle: unknown) => void;
  }
  const { appState, fileService, handle, onHandleAcquired }: Props = $props();

  let status = $state<'idle' | 'saving'>('idle');
  /** Kurzer Status-Hinweis nach dem Speichern (analog placesEditNotice-Muster in App.svelte). */
  let notice = $state('');

  // Der eigentliche Vorgang liegt seit BL-93 in save-action.ts — dieselbe Funktion
  // ruft das Kürzel Cmd/Ctrl+S in App.svelte auf (EIN Speichern-Pfad, INV-UI-4).
  async function handleClick() {
    status = 'saving';
    notice = '';
    const outcome = await saveCurrentDoc(appState, fileService, handle);
    notice = outcome.notice;
    // Der FileService hat es bereits in der Arbeitskopie gemerkt; hier geht es um den
    // laufenden Sitzungszustand, damit schon der NÄCHSTE Klick still speichert.
    if (outcome.handle !== undefined) onHandleAcquired?.(outcome.handle);
    status = 'idle';
  }
</script>

{#if appState.fileName}
  <div class="save-bar">
    <button type="button" class="stb-btn" data-variant="primary" onclick={handleClick} disabled={status === 'saving'}>
      {status === 'saving' ? 'Speichere …' : 'Speichern'}
    </button>
    {#if notice}
      <span class="save-bar__notice" role="status">{notice}</span>
    {:else}
      <!-- Speicher-Ziel sichtbar machen (ADR-v9-128, Kritik-Punkt 2): „Speichern → Datei",
           damit klar ist, wohin geschrieben wird. Nach dem Speichern ersetzt die Meldung
           die Zielangabe. -->
      <span class="save-bar__target">→ {appState.fileName}</span>
    {/if}
  </div>
{/if}

<style>
  .save-bar {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  /* Optik + Trefferfläche aus `.stb-btn[data-variant='primary']` (design-system.css). */

  .save-bar__notice {
    color: var(--stb-text-dim);
    font-size: 0.85rem;
    font-style: italic;
  }

  .save-bar__target {
    color: var(--stb-text-dim);
    font-size: 0.85rem;
  }
</style>
