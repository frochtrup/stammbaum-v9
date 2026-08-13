<script lang="ts">
  // ui/shell/AppDataFileButtons.svelte — app-data.json Export/Import (Spec 30 §2.3, BL-180).
  //
  // Bewusst dieselbe Bauform wie PlacesFileButtons (INV-UI-4 — ein Muster, nicht pro Datei
  // neu erfunden): zwei ausdrückliche Nutzeraktionen, sekundär gestaltet (ADR-v9-128),
  // eigener Picker, gemeinsames Export-Rohr `FileService.exportToFile` (INV-FILE-2/3).
  //
  // KEIN stiller Schreib-Sync pro Änderung (ADR-v9-134): auf Tier-2-Plattformen wäre jede
  // Mutation ein Share-Sheet.
  import { exportAppDataFile, importAppDataFile, type AppDataIO } from '../../services/app-data';
  import StatusNotice from './StatusNotice.svelte';

  interface Props {
    /** Geteilte FileService-Instanz aus App.svelte (dasselbe Export-Rohr wie SaveButton). */
    fileService: import('../../services/file').FileService;
    appDataIO: AppDataIO;
  }
  const { fileService, appDataIO }: Props = $props();

  let exportStatus = $state<'idle' | 'busy'>('idle');
  let exportNotice = $state('');
  let importStatus = $state<'idle' | 'busy'>('idle');
  let importNotice = $state('');

  async function handleExport() {
    exportStatus = 'busy';
    exportNotice = '';
    try {
      const result = await exportAppDataFile(fileService, appDataIO.store);
      if (!result.ok) exportNotice = 'Export abgebrochen.';
      else if (result.tier === 'fs-handle') exportNotice = 'App-Daten gespeichert (direkt in die Datei).';
      else if (result.tier === 'share') exportNotice = 'App-Daten zum Sichern angeboten (Share-Sheet).';
      else exportNotice = 'App-Daten als Download bereitgestellt.';
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
      const state = await appDataIO.sync.load();
      const result = await importAppDataFile(appDataIO.picker, appDataIO.sync, {
        rev: state.rev,
        sections: state.sections,
      });
      if (!result.imported) {
        importStatus = 'idle';
        return;
      }
      // Der Hinweis benennt betroffene Abschnitte statt nur „Konflikt" zu sagen — sonst
      // weiß der Nutzer nicht, was er nachsehen soll.
      const w = result.warning;
      importNotice =
        w?.kind === 'section-conflict'
          ? `App-Daten übernommen. Abweichend auf beiden Seiten (importierte Fassung gilt): ${w.conflictSections.join(', ')}.`
          : w?.kind === 'schema-too-new'
            ? `Nicht übernommen: die Datei stammt aus einer neueren Version (Schema ${w.foundSchemaVersion}).`
            : 'App-Daten übernommen. Wirksam beim nächsten Öffnen der betroffenen Flächen.';
    } catch (err) {
      importNotice = 'Import fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err));
    } finally {
      importStatus = 'idle';
    }
  }
</script>

<div class="app-data-bar">
  <div class="app-data-bar__action">
    <button
      type="button"
      class="stb-btn"
      data-variant="secondary"
      onclick={handleExport}
      disabled={exportStatus === 'busy'}
    >
      {exportStatus === 'busy' ? 'Exportiere …' : 'App-Daten exportieren'}
    </button>
    <StatusNotice text={exportNotice} onDismiss={() => (exportNotice = '')} lage="inline" />
  </div>

  <div class="app-data-bar__action">
    <button
      type="button"
      class="stb-btn"
      data-variant="secondary"
      onclick={handleImport}
      disabled={importStatus === 'busy'}
    >
      {importStatus === 'busy' ? 'Importiere …' : 'App-Daten importieren'}
    </button>
    <StatusNotice text={importNotice} onDismiss={() => (importNotice = '')} lage="inline" />
  </div>
</div>

<style>
  .app-data-bar {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .app-data-bar__action {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  /* Sekundär wie die Orts-Aktionen (ADR-v9-128): eine Nebenaktion auf einer ANDEREN Datei.
     Optik + Trefferfläche aus `.stb-btn[data-variant='secondary']` — die 44 px standen hier
     als Literal, obwohl Spec 21 §6i sie EINMAL als Token verlangt. */

  /* Beide Rückmeldungen kommen aus `StatusNotice` (BL-334) — die Import-Meldung nennt
     hier betroffene Abschnitte und war damit die längste ohne Frist im Programm. */
</style>
