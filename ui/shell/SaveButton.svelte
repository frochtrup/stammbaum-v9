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
  import StatusNotice from './StatusNotice.svelte';
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
  /** Kurzer Status-Hinweis nach dem Speichern. Frist und Ausgang trägt `StatusNotice`
   *  (BL-334); solange er steht, tritt die Zielangabe dahinter zurück. */
  let notice = $state('');

  // Der eigentliche Vorgang liegt seit BL-93 in save-action.ts — dieselbe Funktion
  // ruft das Kürzel Cmd/Ctrl+S in App.svelte auf (EIN Speichern-Pfad, INV-UI-4).
  //
  // Die drei Varianten (Spec 14 §4.1) sind DIESELBE Funktion mit zwei Schaltern, kein
  // zweiter Speicher-Weg: „Speichern" sichert vorher, „Ohne Sicherung" überspringt den
  // Vorlauf, „Speichern unter …" erzwingt den Dialog. Hätte jede ihren eigenen Aufruf-
  // pfad, wären es drei Stellen, an denen der Tier-Fallback auseinanderlaufen kann.
  async function speichere(opts: { skipBackup?: boolean; forcePicker?: boolean } = {}) {
    status = 'saving';
    notice = '';
    const outcome = await saveCurrentDoc(appState, fileService, handle, opts);
    notice = outcome.notice;
    // Der FileService hat es bereits in der Arbeitskopie gemerkt; hier geht es um den
    // laufenden Sitzungszustand, damit schon der NÄCHSTE Klick still speichert.
    if (outcome.handle !== undefined) onHandleAcquired?.(outcome.handle);
    status = 'idle';
  }
</script>

{#if appState.fileName}
  <div class="save-bar">
    <div class="save-bar__row">
      <button
        type="button"
        class="stb-btn"
        data-variant="primary"
        onclick={() => speichere()}
        disabled={status === 'saving'}
      >
        {status === 'saving' ? 'Speichere …' : 'Speichern'}
      </button>
      {#if notice}
        <StatusNotice text={notice} onDismiss={() => (notice = '')} lage="inline" />
      {:else}
        <!-- Speicher-Ziel sichtbar machen (ADR-v9-128, Kritik-Punkt 2): „Speichern → Datei",
             damit klar ist, wohin geschrieben wird. Nach dem Speichern ersetzt die Meldung
             die Zielangabe. -->
        <span class="save-bar__target">→ {appState.fileName}</span>
      {/if}
    </div>
    <!-- Die beiden Nebenwege sichtbar statt in einer Disclosure: „Ohne Sicherung" ist der
         Ausweg, wenn die Sicherung scheitert (die Meldung nennt ihn wörtlich) — er muss
         dann dort sein, wo man ihn sucht, nicht hinter einem weiteren Klick. Zwei
         sekundäre Flächen in einer INHALTS-Gruppe, nicht im Kopfbereich: INV-UI-11
         (≤5 dauerhafte Elemente) gilt der permanenten Kopfzeile, nicht dieser Fläche. -->
    <div class="save-bar__row save-bar__row--aside">
      <button type="button" class="stb-btn" data-variant="secondary" onclick={() => speichere({ forcePicker: true })} disabled={status === 'saving'}>
        Speichern unter …
      </button>
      <button type="button" class="stb-btn" data-variant="secondary" onclick={() => speichere({ skipBackup: true })} disabled={status === 'saving'}>
        Ohne Sicherung speichern
      </button>
    </div>
  </div>
{/if}

<style>
  .save-bar {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .save-bar__row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.6rem;
  }

  /* Die Nebenwege treten zurück — sie sind seltener als der Hauptknopf und sollen ihn
     nicht optisch verdoppeln. Die Trefferfläche bleibt die des Design-Systems. */
  .save-bar__row--aside {
    font-size: 0.9rem;
  }

  /* Optik + Trefferfläche aus `.stb-btn[data-variant='primary']` (design-system.css). */

  /* Die Meldungs-Optik kommt aus `StatusNotice` (BL-334) — die Zielangabe daneben ist
     KEINE Meldung, sondern eine Dauer-Anzeige, und behält deshalb ihre eigene Regel. */
  .save-bar__target {
    color: var(--stb-text-dim);
    font-size: 0.85rem;
  }
</style>
