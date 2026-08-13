<script lang="ts">
  // ui/shell/ImportButton.svelte — Import-Einstieg (Spec 20 §1.2): "Datei öffnen" +
  // "Demo laden" ([S] Demo-Modus). Beide Wege nutzen dieselbe Lade-Pipeline
  // load-gedcom-text.ts (parseGedcom -> Orte/Höfe-Wiring -> appState.loadDatabase()) —
  // EIN kanonischer Lade-Pfad (INV-UI-4-Lehre auf Lade-Orchestrierung angewendet, s.
  // load-gedcom-text.ts-Kopf), nur die Text-Quelle unterscheidet sich: echter
  // Datei-Picker (services/file) vs. mitgeliefertes Asset (fetch('./demo.ged'), analog
  // Verhaltens-Orakel legacy-v8/storage.js loadDemo() — funktioniert offline, weil
  // demo.ged als Vite-Static-Asset gebündelt ist, s. app/public/demo.ged).
  // Der Datei-Picker öffnet GEDCOM ODER GRAMPS (BL-139): der Picker gunzip-t und erkennt das
  // Format, `loadDocText` verzweigt in den passenden Ladepfad. Demo bleibt GEDCOM.
  import { loadGedcomText } from './load-gedcom-text';
  // Dateiname des Demo-Bestands aus EINER Quelle: der Erstnutzer-Rundgang (BL-213)
  // erkennt an genau diesem Namen, dass Demo-Material geladen ist.
  import { DEMO_FILE_NAME } from './onboarding-state.svelte';
  import { loadDocText } from './load-doc-text';
  import StatusNotice from './StatusNotice.svelte';
  import type { AppState } from './app-state.svelte';
  import type { PlacesPersister } from './places-persister';
  import type { FileService } from '../../services/file';

  interface Props {
    appState: AppState;
    /** Geteilter Orts-Persister (dieselbe Instanz wie app-state, damit baseRev konsistent bleibt). */
    persister: PlacesPersister;
    /** Geteilte FileService-Instanz (App.svelte hält EINE, analog `persister` oben) —
     * dieselbe IDB-Arbeitskopie-Instanz wie das Auto-Load/Auto-Save in App.svelte, statt
     * eine zweite, unabhängige FileService-Instanz lokal zu erzeugen (Auftrag Teil 1). */
    fileService: FileService;
    /** Meldet den FS-Access-Handle der importierten Datei (falls vorhanden) an App.svelte
     * zurück, damit SaveButton Tier-1 (in-place) nutzen kann — vorher ging `picked.handle`
     * beim manuellen "Datei öffnen" verloren (nur der Auto-Load-Pfad in App.svelte setzte
     * `fileHandle`). Bei "Demo laden" wird explizit `undefined` gemeldet: die Demo-Datei
     * hat keinen echten Handle, ein zuvor gemerkter Handle einer anderen Datei darf nicht
     * stehen bleiben (sonst würde "Speichern" versehentlich in die falsche Datei schreiben). */
    onImported?: (handle: unknown) => void;
    /** Ist „Datei öffnen" die Primäraktion (gefüllt) oder sekundär (outline)? Der Aufrufer
     *  (MoreView) macht sie primär, solange KEINE Datei geladen ist; sobald eine geladen ist,
     *  wird „Speichern" die Primäraktion und Öffnen sekundär — genau EINE gefüllte Fläche
     *  je Zustand (ADR-v9-128). „Demo laden" ist immer sekundär. */
    openIsPrimary?: boolean;
  }
  const { appState, persister, fileService, onImported, openIsPrimary = true }: Props = $props();

  let status = $state<'idle' | 'loading-file' | 'loading-demo' | 'error'>('idle');
  let errorMessage = $state('');
  /** Konflikt-/Schema-Hinweise nach dem Laden (Spec 30 §4 LP-9). Seit BL-334 über
   *  `StatusNotice` — kein eigener Kanal mehr, sondern der Baustein mit Frist und ✕. */
  let placesNotice = $state('');
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
      const result = await loadDocText(picked.format, picked.text, picked.name, appState, persister);
      placesNotice = result.placesNotice;
      onImported?.(picked.handle);
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
      const res = await fetch(`./${DEMO_FILE_NAME}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      const result = await loadGedcomText(text, DEMO_FILE_NAME, appState, persister);
      placesNotice = result.placesNotice;
      onImported?.(undefined);
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
    class="stb-btn"
    data-variant={openIsPrimary ? 'primary' : 'secondary'}
    onclick={handleClick}
    disabled={status === 'loading-file' || status === 'loading-demo'}
  >
    {status === 'loading-file' ? 'Lade …' : 'Datei öffnen (GEDCOM/GRAMPS)'}
  </button>
  <button
    type="button"
    class="stb-btn"
    data-variant="secondary"
    onclick={handleDemoClick}
    disabled={status === 'loading-file' || status === 'loading-demo'}
  >
    {status === 'loading-demo' ? 'Lade …' : 'Demo laden'}
  </button>
  <!-- KEIN `StatusNotice`, mit Absicht (BL-334): der Fehler ist keine transiente
       Rückmeldung, sondern der ZUSTAND des misslungenen Ladens — er steht, bis der
       nächste Versuch ihn ersetzt, und darf nicht nach 12 s wegblenden, während der
       Nutzer noch überlegt, welche Datei er stattdessen wählt. -->
  {#if status === 'error'}
    <span class="import-bar__error" role="alert">Fehler beim Import: {errorMessage}</span>
  {/if}
  <StatusNotice text={placesNotice} onDismiss={() => (placesNotice = '')} lage="inline" />
</div>

<style>
  /* Kein eigener Box-Hintergrund mehr (ADR-v9-128, Kritik-Punkt 3): „Laden" ist eine offene
     Sektion wie Sichern/Orts-Bestand/Austausch, kein abgesetzter Kasten. */
  .import-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  /* Optik + Trefferfläche kommen aus `.stb-btn` (design-system.css, INV-UI-4) —
     „EIN Layout, zwei Varianten" (ADR-v9-128) gilt jetzt app-weit statt nur hier. */

  .import-bar__error {
    color: var(--stb-danger);
    font-size: 0.85rem;
  }

  /* Die Orts-Rückmeldung kommt aus `StatusNotice` (BL-334); der Fehler daneben behält
     seine eigene, rote Optik — s. Begründung am Markup. */
</style>
