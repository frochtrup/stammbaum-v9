<script lang="ts">
  // ui/views/export/ExportView.svelte — die Export-Fläche (BL-119, Spec 20 §1.2 [S]
  // "DSGVO-Export (Anonymisierung), GED7-Export, Strict-Export (je opt-in)", Spec 14 §3.2).
  //
  // Sie sitzt im "Datei"-Eintrag unter dem Speichern-Knopf und ist KEIN eigenes Nav-Ziel
  // (ADR-v9-113): ein zweites dateibezogenes Ziel neben "Datei" wären zwei Wege für einen
  // Belang (INV-UI-2/15). Der Export läuft über dieselbe save-action.ts-Ebene wie Knopf
  // und ⌘S — EIN Speichern-Pfad, nicht drei (ADR-v9-80/-100).
  //
  // GRAMPS ist seit BL-160/ADR-v9-127 IMMER dabei, nicht nur bei geladenem `.gramps`
  // (ADR-v9-113 Befund E5 ist damit überholt): ein GEDCOM-geladenes `db` exportiert GRAMPS
  // über `exportCrossFamily` als kompletten Vollbaum direkt aus dem Modell (BL-158), nicht
  // mehr über ein (nicht existentes) Passthrough-Doc. Cross-Family-Exporte sind nie
  // in-place-fähig (save-action.ts) — Download + neuer Dateiname sind erzwungen.
  //
  // Der Zähler neben der Anonymisierung ist der eigentliche Fund aus BL-138: die Zahl
  // "N von M" hätte die kaputte Klassifikation (2767 statt 689) sofort sichtbar gemacht.
  // Er steht deshalb dauerhaft an der Bedienstelle, nicht nur in einem Test.
  import { buildLivingSet } from '../../../core/interop';
  import { exportFileName } from '../../../services/file';
  import type { FileService } from '../../../services/file';
  import type { AppState } from '../../shell/app-state.svelte';
  import { untrack } from 'svelte';
  import { baseNameOf, exportGedcom, formatFamily, type UiExportFormat } from '../../shell/save-action';
  import StatusNotice from '../../shell/StatusNotice.svelte';
  import type { AppDataIO } from '../../../services/app-data';

  interface Props {
    appState: AppState;
    /** Geteilte FileService-Instanz aus App.svelte (dasselbe Rohr wie SaveButton). */
    fileService: FileService;
    /** FS-Access-Handle der Originaldatei — nur der reine 5.5.1-Export nutzt ihn (Tier 1). */
    handle?: unknown;
    /** Bezugsjahr der Lebend-Klassifikation; injizierbar für Tests (TST-3). */
    referenceYear?: number;
    /** Meldet ein bei „Speichern unter" (Tier 1b) NEU erworbenes Handle an die Schale —
     *  ein Export im nativen Format kann denselben Weg nehmen wie der Speichern-Knopf. */
    onHandleAcquired?: (handle: unknown) => void;
    /** B1-Bündel (BL-180): merkt Format + Schwärzung geräteübergreifend. Fehlt es
     *  (Tests, eingebettete Nutzung), verhält sich die Fläche wie bisher sitzungslokal. */
    appDataIO?: AppDataIO;
  }
  const { appState, fileService, handle, referenceYear, appDataIO, onHandleAcquired }: Props = $props();

  // Alle Formate stehen zur Wahl (BL-160) — ob ein Format den nativen Passthrough-Baum
  // projiziert oder als Cross-Family-Vollbaum direkt aus dem Modell synthetisiert wird
  // (`exportCrossFamily`, save-action.ts), entscheidet dieselbe Familien-Regel wie dort
  // (`formatFamily`) — nicht herausgefiltert, nur mit einem Hinweis versehen.
  const crossNote = (id: UiExportFormat): string =>
    formatFamily(id) !== appState.docFormat ? ' — aus dem Modell erzeugt' : '';
  const FORMATE = $derived<ReadonlyArray<{ id: UiExportFormat; label: string }>>([
    { id: 'gedcom-5.5.1' as const, label: `GEDCOM 5.5.1${crossNote('gedcom-5.5.1') || ' (Standard)'}` },
    { id: 'gedcom-strict' as const, label: `GEDCOM 5.5.1 strict (ohne Hersteller-Tags)${crossNote('gedcom-strict')}` },
    { id: 'gedcom-7.0' as const, label: `GEDCOM 7.0${crossNote('gedcom-7.0')}` },
    { id: 'gramps' as const, label: `GRAMPS${crossNote('gramps') || ' (nativ, Round-trip)'}` },
  ]);

  // Anfangs-Default = natives Format des geladenen Dokuments (nur EINMAL beim Öffnen der
  // Fläche gelesen — `untrack`, die Fläche wird pro Navigation frisch erzeugt).
  let format = $state<UiExportFormat>(untrack(() => (appState.docFormat === 'gramps' ? 'gramps' : 'gedcom-5.5.1')));
  let anonymize = $state(false);

  // Vorwahl aus dem B1-Bündel nachladen (BL-180). Bewusst NACH der Anfangs-Vorgabe:
  // liegt nichts gespeichert vor, bleibt das native Format des geladenen Dokuments
  // stehen — eine leere Vorwahl darf die sinnvolle Vorgabe nicht überschreiben.
  $effect(() => {
    if (!appDataIO) return;
    let abgebrochen = false;
    void appDataIO.sync
      .load()
      .then((state) => {
        const prefs = state.sections.exportPrefs;
        if (abgebrochen || !prefs) return;
        if (FORMATE.some((f) => f.id === prefs.format)) format = prefs.format as UiExportFormat;
        anonymize = prefs.anonymize;
      })
      .catch(() => {
        /* ohne gemerkte Vorwahl arbeitet die Fläche wie zuvor */
      });
    return () => {
      abgebrochen = true;
    };
  });

  /** Vorwahl merken — fire-and-forget wie die Projekt-Persistenz (ADR-v9-117). */
  function merkeVorwahl() {
    if (!appDataIO) return;
    void appDataIO.sync
      .load()
      .then((state) =>
        appDataIO.sync.reconcileAndSave(
          { ...state.sections, exportPrefs: { format, anonymize } },
          { rev: state.rev, sections: state.sections }
        )
      )
      .catch(() => {
        /* eine nicht gemerkte Vorwahl ist ärgerlich, kein Fehler */
      });
  }
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
    const outcome = await exportGedcom(appState, fileService, {
      format,
      anonymizeReferenceYear: anonAktiv ? jahr : undefined,
      handle,
    });
    notice = outcome.notice;
    if (outcome.handle !== undefined) onHandleAcquired?.(outcome.handle);
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
        onchange={(e) => {
          format = e.currentTarget.value as UiExportFormat;
          merkeVorwahl();
        }}
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
        onchange={(e) => {
          anonymize = e.currentTarget.checked;
          merkeVorwahl();
        }}
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
      <StatusNotice text={notice} onDismiss={() => (notice = '')} lage="inline" />
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

  /* Die Meldung nach dem Export kommt aus `StatusNotice` (BL-334) — der Zähler darüber
     (`__count`) bleibt eigen: er ist eine Dauer-Anzeige zum Zustand der Auswahl, keine
     Rückmeldung auf eine Handlung, und darf mit keiner Frist verschwinden. */
</style>
