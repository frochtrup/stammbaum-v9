<script lang="ts">
  // ui/views/export/ExportView.svelte — die Export-Fläche (BL-119, Spec 20 §1.2 [S]
  // "DSGVO-Export (Anonymisierung), GED7-Export, Strict-Export (je opt-in)", Spec 14 §3.2).
  //
  // Sie sitzt im "Datei"-Eintrag unter dem Speichern-Knopf und ist KEIN eigenes Nav-Ziel
  // (ADR-v9-113): ein zweites dateibezogenes Ziel neben "Datei" wären zwei Wege für einen
  // Belang (INV-UI-2/15). Der Export läuft über dieselbe save-action.ts-Ebene wie Knopf
  // und ⌘S — EIN Speichern-Pfad, nicht drei (ADR-v9-80/-100).
  //
  // GRAMPS fehlt bewusst und nicht als ausgegrauter Eintrag: die App hält nie ein
  // grampsDoc, und der Cross-Export aus dem Modell liefert eine Datei ohne Ereignisse,
  // Orte, Zitate und Daten (gemessen, BL-139). Eine Fläche, die nie klickbar wird, ist
  // eine Ankündigung, kein Bedienelement.
  //
  // Der Zähler neben der Anonymisierung ist der eigentliche Fund aus BL-138: die Zahl
  // "N von M" hätte die kaputte Klassifikation (2767 statt 689) sofort sichtbar gemacht.
  // Er steht deshalb dauerhaft an der Bedienstelle, nicht nur in einem Test.
  import { buildLivingSet } from '../../../core/interop';
  import { exportFileName } from '../../../services/file';
  import type { FileService } from '../../../services/file';
  import type { AppState } from '../../shell/app-state.svelte';
  import { untrack } from 'svelte';
  import { baseNameOf, exportGedcom, type UiExportFormat } from '../../shell/save-action';

  interface Props {
    appState: AppState;
    /** Geteilte FileService-Instanz aus App.svelte (dasselbe Rohr wie SaveButton). */
    fileService: FileService;
    /** FS-Access-Handle der Originaldatei — nur der reine 5.5.1-Export nutzt ihn (Tier 1). */
    handle?: unknown;
    /** Bezugsjahr der Lebend-Klassifikation; injizierbar für Tests (TST-3). */
    referenceYear?: number;
  }
  const { appState, fileService, handle, referenceYear }: Props = $props();

  // GRAMPS wird NUR angeboten, wenn ein `.gramps` geladen ist (dann round-trippt der Export
  // voll — BL-139/140/142/144); aus einem GEDCOM-Ursprung wäre ein GRAMPS-Export hohl
  // (ADR-v9-113). Umgekehrt bleiben die GEDCOM-Cross-Exporte aus einem GRAMPS-Dokument
  // erlaubt (GEDCOM ist Master, das Modell ist vollständig).
  const FORMATE = $derived<ReadonlyArray<{ id: UiExportFormat; label: string }>>([
    ...(appState.docFormat === 'gramps'
      ? [{ id: 'gramps' as const, label: 'GRAMPS (nativ, Round-trip)' }]
      : []),
    { id: 'gedcom-5.5.1', label: 'GEDCOM 5.5.1 (Standard)' },
    { id: 'gedcom-strict', label: 'GEDCOM 5.5.1 strict (ohne Hersteller-Tags)' },
    { id: 'gedcom-7.0', label: 'GEDCOM 7.0' },
  ]);

  // Anfangs-Default = natives Format des geladenen Dokuments (nur EINMAL beim Öffnen der
  // Fläche gelesen — `untrack`, die Fläche wird pro Navigation frisch erzeugt).
  let format = $state<UiExportFormat>(untrack(() => (appState.docFormat === 'gramps' ? 'gramps' : 'gedcom-5.5.1')));
  let anonymize = $state(false);
  // Die Schwärzung arbeitet auf GEDCOM-Records (Spec 13 §7) — für den GRAMPS-Export nicht
  // umgesetzt; dann wird sie ignoriert (Checkbox deaktiviert, kein stiller Un-Anon-Export).
  const anonAktiv = $derived(anonymize && format !== 'gramps');
  let status = $state<'idle' | 'busy'>('idle');
  let notice = $state('');

  const jahr = $derived(referenceYear ?? new Date().getFullYear());
  const gesamt = $derived(appState.db.individuals.size);
  // Nur rechnen, wenn die Zahl auch gezeigt wird — ein BFS über den ganzen Bestand bei
  // jedem Tastendruck an einer anderen Stelle wäre Arbeit ohne Betrachter.
  const geschwaerzt = $derived(anonAktiv ? buildLivingSet(appState.db, jahr).size : 0);
  const zielname = $derived(exportFileName(baseNameOf(appState.fileName), format, anonAktiv));
  // Der Zielname wird nur gezeigt, wenn er vom Original ABWEICHT — bei einem reinen
  // 5.5.1-Export ohne Schwärzung ist er derselbe Name, und die Zeile wäre Rauschen
  // (dieser Fall ist ohnehin der Speichern-Knopf direkt darüber).
  const zielWeichtAb = $derived(zielname !== appState.fileName);

  async function handleExport() {
    status = 'busy';
    notice = '';
    notice = await exportGedcom(appState, fileService, {
      format,
      anonymizeReferenceYear: anonAktiv ? jahr : undefined,
      handle,
    });
    status = 'idle';
  }
</script>

{#if appState.fileName}
  <div class="export-view">
    <label class="export-view__field">
      <span class="export-view__caption">Format</span>
      <!-- value={} + onchange statt bind:value (TST-12, happy-dom-Falle) -->
      <select
        value={format}
        onchange={(e) => (format = e.currentTarget.value as UiExportFormat)}
        aria-label="Export-Format"
      >
        {#each FORMATE as f (f.id)}
          <option value={f.id}>{f.label}</option>
        {/each}
      </select>
    </label>

    <label class="export-view__check">
      <input
        type="checkbox"
        checked={anonymize}
        disabled={format === 'gramps'}
        onchange={(e) => (anonymize = e.currentTarget.checked)}
      />
      <span>Lebende Personen anonymisieren (DSGVO){format === 'gramps' ? ' — nur für GEDCOM' : ''}</span>
    </label>

    {#if anonAktiv}
      <p class="export-view__count" role="status">
        {geschwaerzt} von {gesamt} Personen werden geschwärzt — Name, Daten und Ereignisse fallen weg,
        Familienlinks bleiben. Die Originaldatei wird dabei nie überschrieben.
      </p>
    {/if}

    {#if zielWeichtAb}
      <p class="export-view__target">Zieldatei: <code>{zielname}</code></p>
    {/if}

    <div class="export-view__actions">
      <button type="button" class="export-view__button" onclick={handleExport} disabled={status === 'busy'}>
        {status === 'busy' ? 'Exportiere …' : 'Exportieren'}
      </button>
      {#if notice}
        <span class="export-view__notice" role="status">{notice}</span>
      {/if}
    </div>
  </div>
{/if}

<style>
  .export-view {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .export-view__field {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .export-view__caption {
    color: var(--stb-text-dim);
    font-size: 0.8rem;
  }

  .export-view__check {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .export-view__count,
  .export-view__target {
    margin: 0;
    color: var(--stb-text-dim);
    font-size: 0.85rem;
  }

  .export-view__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem;
  }

  .export-view__button {
    background: var(--stb-gold);
    color: var(--stb-bg);
    border: none;
    border-radius: var(--stb-radius-control);
    padding: 0.5rem 0.9rem;
    font-weight: 600;
    cursor: pointer;
  }

  .export-view__button:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .export-view__notice {
    color: var(--stb-text-dim);
    font-size: 0.85rem;
    font-style: italic;
  }
</style>
