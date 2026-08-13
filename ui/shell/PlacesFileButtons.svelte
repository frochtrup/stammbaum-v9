<script lang="ts">
  // ui/shell/PlacesFileButtons.svelte — orte.json Export/Import (ADR-v9-70, Spec 14 §6).
  // Zwei explizite Nutzeraktionen, analog SaveButton/ImportButton für die Genealogie-
  // Datei, aber GETRENNT: eigener FileIO (eigenes FS-Handle, eigener Picker) — berührt
  // nie die Genealogie-Arbeitskopie oder deren Picker-State.
  //
  // Export nutzt DASSELBE FileService.exportToFile-Rohr (INV-FILE-2-Analogie) wie die
  // Genealogie-Datei — daher wird `fileService` von außen durchgereicht (App.svelte hält
  // GENAU EINE Instanz), statt hier eine zweite zu erzeugen.
  import { exportPlacesFile } from '../../services/places';
  import type { FileService } from '../../services/file';
  import type { PlacesFileIO } from '../../services/places';
  import type { PlacesPersister } from './places-persister';
  import type { AppState } from './app-state.svelte';
  import { importPlacesFile } from './places-file-import';
  import StatusNotice from './StatusNotice.svelte';

  interface Props {
    appState: AppState;
    /** Geteilte FileService-Instanz aus App.svelte (dasselbe Export-Rohr wie SaveButton). */
    fileService: FileService;
    /** Geteilter Orts-Persister (dieselbe Instanz wie Import/Edit-Kommandos, damit baseRev konsistent bleibt). */
    persister: PlacesPersister;
    /** Eigener orte.json-Datei-IO (eigenes FS-Handle, eigener Picker, GETRENNT von fileService). */
    placesFileIO: PlacesFileIO;
  }
  const { appState, fileService, persister, placesFileIO }: Props = $props();

  let exportStatus = $state<'idle' | 'busy'>('idle');
  let exportNotice = $state('');
  let importStatus = $state<'idle' | 'busy'>('idle');
  let importNotice = $state('');

  async function handleExport() {
    exportStatus = 'busy';
    exportNotice = '';
    try {
      const result = await exportPlacesFile(fileService, placesFileIO.placesStore, placesFileIO.handleStore);
      if (!result.ok) {
        exportNotice = 'Export abgebrochen.';
      } else if (result.tier === 'fs-handle') {
        exportNotice = 'Orte gespeichert (direkt in die Datei).';
      } else if (result.tier === 'share') {
        exportNotice = 'Orte zum Sichern angeboten (Share-Sheet).';
      } else {
        exportNotice = 'Orte als Download bereitgestellt.';
      }
    } catch (err) {
      exportNotice = 'Export fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err));
    } finally {
      exportStatus = 'idle';
    }
  }

  async function handleImport() {
    importStatus = 'busy';
    importNotice = '';
    try {
      const result = await importPlacesFile(placesFileIO.picker, placesFileIO.handleStore, persister);
      if (!result.imported) {
        importStatus = 'idle';
        return;
      }
      if (result.placeObjects && result.hofObjects) {
        appState.replacePlacesAndHofs(result.placeObjects, result.hofObjects);
      }
      importNotice = result.notice || 'Orte importiert.';
    } catch (err) {
      importNotice = 'Import fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err));
    } finally {
      importStatus = 'idle';
    }
  }
</script>

<div class="places-file-bar">
  <div class="places-file-bar__action">
    <button type="button" class="stb-btn" data-variant="secondary" onclick={handleExport} disabled={exportStatus === 'busy'}>
      {exportStatus === 'busy' ? 'Exportiere …' : 'Orte exportieren'}
    </button>
    <StatusNotice text={exportNotice} onDismiss={() => (exportNotice = '')} lage="inline" />
  </div>

  <div class="places-file-bar__action">
    <button type="button" class="stb-btn" data-variant="secondary" onclick={handleImport} disabled={importStatus === 'busy'}>
      {importStatus === 'busy' ? 'Importiere …' : 'Orte importieren'}
    </button>
    <StatusNotice text={importNotice} onDismiss={() => (importNotice = '')} lage="inline" />
  </div>
</div>

<style>
  .places-file-bar {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .places-file-bar__action {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  /* Sekundär/outline (ADR-v9-128): der Orts-Bestand ist eine Nebenaktion auf einer ANDEREN
     Datei — nicht so schwer wie die Primäraktion (Öffnen/Speichern). Die Optik kommt aus
     `.stb-btn[data-variant='secondary']` (design-system.css, INV-UI-4). */

  /* Beide Rückmeldungen kommen aus `StatusNotice` (BL-334) — inklusive Frist und ✕, die
     die handgebaute Fassung hier nie hatte. */
</style>
