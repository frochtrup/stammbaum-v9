<script lang="ts">
  // ui/views/settings/SettingsView.svelte — Arbeitsfläche „Einstellungen" (Spec 20 §1.14,
  // ADR-v9-188). Bis BL-257 war das Ziel `settings` ein ComingSoonPanel, und Spec 20 hatte
  // gar keinen Abschnitt dafür.
  //
  // Die Fläche ist KEINE Sammelstelle für alles Konfigurierbare. Sie beantwortet drei
  // Fragen — was gilt geräteübergreifend, was nur hier, wie nehme ich es mit — und
  // kennzeichnet jedes Element entsprechend. Deshalb:
  //  · Die app-data.json-Gruppe ist hierher UMGEZOGEN (aus der Datei-Fläche): das Bündel
  //    trägt die Einstellungen, also gehört sein Transport zu ihnen. Umzug, keine Kopie —
  //    der alte Platz ist geräumt (INV-UI-2).
  //  · orte.json bleibt bei „Datei": das ist genealogisches Cross-Stammbaum-Wissen (LP-4),
  //    keine Einstellung. Fachinhalt zieht nicht in eine Konfigurationsfläche.
  //  · Prüfregeln und Export-Vorwahl bleiben dort, wo sie bedient werden (neben ihren
  //    Befunden bzw. im Export-Dialog). Hier steht nur eine Zusammenfassung mit Sprung —
  //    ein zweites Bedienfeld wäre ein zweiter Weg zum selben Ziel.
  import type { AppState } from '../../shell/app-state.svelte';
  import type { FileService } from '../../../services/file';
  import type { AppDataIO } from '../../../services/app-data';
  import type { MediaResolver } from '../../../services/media';
  import AppDataFileButtons from '../../shell/AppDataFileButtons.svelte';
  import ConfirmDialog from '../../shell/ConfirmDialog.svelte';
  import {
    LOKALE_DATEN,
    resetAllLocalState,
    resetPlacesMirror,
  } from '../../../services/reset-local-state';
  import StatusNotice from '../../shell/StatusNotice.svelte';
  import type { NavTargetId } from '../../shell/nav-model';
  import {
    SCOPE_LABEL,
    mediaFilePaths,
    mediaFolderStatusText,
    resetWarnungText,
    type MediaFolderSummary,
  } from './settings-model';

  // Diagnose & Wartung (Spec 14 §3.3, [ADR-v9-297]). Zwei Stufen, beide mit Rückfrage —
  // die harte nennt namentlich, was verschwindet (Nutzer-Entscheidung 2026-08-28:
  // Warnhinweis mit Aufzählung, kein erzwungener Export-Zwischenschritt).
  //
  // NACH dem Zurücksetzen wird neu geladen, nicht der Zustand von Hand geleert: die App
  // hält den geladenen Bestand, den Orts-Kontext, Undo-Stapel und mehrere Persister im
  // Speicher. Sie einzeln zurückzudrehen waere eine zweite, stille Definition von „leer",
  // die bei jedem neuen Zustand nachgezogen werden muesste. Der Neustart IST die Definition.
  let frage = $state<null | 'orte' | 'alles'>(null);
  /** Der Hinweis der milden Stufe - hier als Konstante, damit das Template lesbar bleibt. */
  const ORTE_RESET_TEXT =
    'Gelöscht wird der Browser-Spiegel der kuratierten Orte und Höfe.\n\n' +
    'Er ist nur wiederherstellbar, wenn Sie eine orte.json exportiert haben. Die geladene ' +
    'Datei bleibt unberührt; Orte werden beim nächsten Laden neu aufgelöst.';

  let resetLaeuft = $state(false);
  let resetFehler = $state('');

  async function fuehreResetAus(welcher: 'orte' | 'alles') {
    frage = null;
    resetLaeuft = true;
    resetFehler = '';
    try {
      if (welcher === 'orte') await resetPlacesMirror();
      else await resetAllLocalState();
      window.location.reload();
    } catch (err) {
      resetLaeuft = false;
      resetFehler = err instanceof Error ? err.message : String(err);
    }
  }

  interface Props {
    appState: AppState;
    /** Geteiltes Export-Rohr (dieselbe Instanz wie SaveButton) — für den app-data-Transport. */
    fileService?: FileService;
    /** B1-Bündel (app-data.json). Ohne ihn bleibt die Transport-Gruppe unsichtbar. */
    appDataIO?: AppDataIO;
    /** Medien-Auflösung (BL-257). Optional, damit bestehende Tests unverändert laufen. */
    mediaResolver?: MediaResolver;
    /** Sprung in die Fläche, auf der eine Einstellung tatsächlich bedient wird. */
    onNavigate?: (target: NavTargetId) => void;
  }
  const { appState, fileService, appDataIO, mediaResolver, onNavigate }: Props = $props();

  // Der Ordnerzustand lebt im Dienst, nicht hier — diese Zahl ist nur seine Anzeige.
  // `tick` erzwingt das Neulesen nach einer Aktion (der Dienst ist bewusst kein
  // Svelte-Store: er gehört der services-Schicht und darf nichts über Svelte wissen).
  let tick = $state(0);
  let busy = $state(false);
  let notice = $state('');

  const filePaths = $derived(mediaFilePaths(appState.db));
  const summary = $derived.by((): MediaFolderSummary => {
    void tick;
    const status = mediaResolver?.status() ?? {
      connected: false,
      folderName: '',
      fileCount: 0,
      importedCount: 0,
    };
    const report = mediaResolver?.matchReport(filePaths) ?? {
      total: filePaths.length,
      found: 0,
      missing: filePaths.length,
      byBasename: 0,
    };
    return { ...status, ...report };
  });

  const folderSupported = $derived(mediaResolver?.isSupported() ?? false);
  const canImport = $derived(mediaResolver?.canImport() ?? false);

  async function importFiles() {
    if (!mediaResolver) return;
    busy = true;
    notice = '';
    try {
      const n = await mediaResolver.importFiles();
      notice = n === 0 ? 'Keine Dateien gewählt.' : `${n} ${n === 1 ? 'Datei' : 'Dateien'} übernommen.`;
    } catch (err) {
      notice = 'Import fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err));
    } finally {
      busy = false;
      tick++;
    }
  }

  async function clearImported() {
    if (!mediaResolver) return;
    busy = true;
    try {
      await mediaResolver.clearImported();
      notice = '';
    } finally {
      busy = false;
      tick++;
    }
  }

  async function connectFolder() {
    if (!mediaResolver) return;
    busy = true;
    notice = '';
    try {
      const ok = await mediaResolver.connect();
      if (!ok) notice = 'Ordner-Auswahl abgebrochen.';
      // Ordnername als B1-Hinweis mitnehmen (ADR-v9-188 Punkt 6) — der HANDLE bleibt
      // gerätelokal, nur sein Name reist. Geschrieben wie jeder andere Abschnitt, über
      // `reconcileAndSave` gegen den geladenen Stand (kein zweiter Schreibweg).
      else if (appDataIO) {
        const state = await appDataIO.sync.load();
        await appDataIO.sync.reconcileAndSave(
          { ...state.sections, media: { folderName: mediaResolver.status().folderName } },
          { rev: state.rev, sections: state.sections },
        );
      }
    } catch (err) {
      notice = 'Ordner konnte nicht gelesen werden: ' + (err instanceof Error ? err.message : String(err));
    } finally {
      busy = false;
      tick++;
    }
  }

  async function rescanFolder() {
    if (!mediaResolver) return;
    busy = true;
    try {
      await mediaResolver.rescan();
    } finally {
      busy = false;
      tick++;
    }
  }

  async function disconnectFolder() {
    if (!mediaResolver) return;
    busy = true;
    try {
      await mediaResolver.disconnect();
      notice = '';
    } finally {
      busy = false;
      tick++;
    }
  }

  // --- Backup-Ordner (Spec 14 §4.1) -----------------------------------------------
  // Eigener Zustand neben dem Medien-Ordner, kein gemeinsamer: es sind zwei Handles mit
  // zwei Rechten (`read` vs. `readwrite`) und zwei Lebensläufen — sie nur deshalb
  // zusammenzulegen, weil beide „ein Ordner" sind, machte aus einem Leserecht für Fotos
  // stillschweigend ein Schreibrecht.
  let backup = $state({ supported: false, connected: false, name: '' });
  let backupNotice = $state('');

  $effect(() => {
    void tick;
    if (!fileService) return;
    fileService
      .backupFolderStatus()
      .then((s) => {
        backup = s;
      })
      .catch(() => {
        /* Ein nicht lesbarer Handle-Store ist kein Grund, die Einstellungen zu leeren. */
      });
  });

  async function connectBackupFolder() {
    if (!fileService) return;
    busy = true;
    backupNotice = '';
    try {
      const name = await fileService.connectBackupFolder();
      backupNotice = name
        ? `Sicherungen gehen ab jetzt nach „${name}".`
        : 'Ordner-Auswahl abgebrochen.';
    } catch (err) {
      backupNotice = 'Ordner konnte nicht verbunden werden: ' + (err instanceof Error ? err.message : String(err));
    } finally {
      busy = false;
      tick++;
    }
  }

  async function disconnectBackupFolder() {
    if (!fileService) return;
    busy = true;
    try {
      await fileService.disconnectBackupFolder();
      // Der Satz sagt die FOLGE, nicht die Handlung: „getrennt" wüsste der Nutzer schon,
      // „speichert ab jetzt ohne Sicherung" ist das, was er wissen muss (INV-FILE-4).
      backupNotice = 'Getrennt — Speichern überschreibt ab jetzt ohne Sicherung.';
    } finally {
      busy = false;
      tick++;
    }
  }
</script>

<div class="settings-view">
  <p class="settings-view__intro">
    Was gilt geräteübergreifend, was nur auf diesem Gerät — und wie Sie es mitnehmen.
  </p>

  <!-- Zuerst, weil es als einziges hier einen DATENVERLUST verhindert: alles andere in
       dieser Fläche ist Komfort. -->
  <section class="settings-view__group" aria-labelledby="set-backup">
    <h3 id="set-backup" class="stb-role-label settings-view__group-label">Sicherung beim Speichern</h3>
    <p class="settings-view__scope">{SCOPE_LABEL.device}</p>
    <p class="settings-view__hint">
      Speichern schreibt still in dieselbe Datei zurück. Ist hier ein Ordner verbunden,
      legt die App vorher eine datierte Kopie des bisherigen Standes darin ab — z. B.
      <code>Meine Familie (Backup 2026-08-28 14-32-05).ged</code>. Es wird nichts
      automatisch gelöscht; alte Sicherungen räumen Sie selbst auf.
    </p>

    {#if !fileService || !backup.supported}
      <!-- Kein Verzeichnis-Zugriff auf dieser Plattform (iOS/Safari) — dort überschreibt
           die App aber auch nichts still: jeder Save ist eine eigene Geste mit eigenem
           Ziel. Kein toter Knopf, sondern der Grund dafür. -->
      <p class="settings-view__status" data-testid="backup-folder-status">
        Auf diesem Gerät nicht nötig: Speichern legt hier jedes Mal eine Datei über den
        Teilen- bzw. Download-Weg an und überschreibt nichts unbemerkt.
      </p>
    {:else}
      <p class="settings-view__status" data-testid="backup-folder-status">
        {backup.connected
          ? `Sicherungen gehen nach „${backup.name}".`
          : 'Kein Backup-Ordner verbunden — Speichern überschreibt ohne Sicherung.'}
      </p>
      <div class="settings-view__actions">
        <button
          type="button"
          class="stb-btn"
          data-variant={backup.connected ? 'secondary' : 'primary'}
          disabled={busy}
          onclick={connectBackupFolder}
        >
          {backup.connected ? 'Anderen Ordner wählen' : 'Backup-Ordner wählen'}
        </button>
        {#if backup.connected}
          <button type="button" class="stb-btn" data-variant="secondary" disabled={busy} onclick={disconnectBackupFolder}>
            Trennen
          </button>
        {/if}
      </div>
      <StatusNotice text={backupNotice} onDismiss={() => (backupNotice = '')} lage="inline" />
    {/if}
  </section>

  <section class="settings-view__group" aria-labelledby="set-media">
    <h3 id="set-media" class="stb-role-label settings-view__group-label">Medien-Ordner</h3>
    <p class="settings-view__scope">{SCOPE_LABEL.device}</p>
    <p class="settings-view__hint">
      Startpunkt für relative Dateipfade in Ihren Medien. Der Browser braucht dafür einen
      freigegebenen Ordner — ein eingetippter Pfad genügt nicht.
    </p>

    <p class="settings-view__status" data-testid="media-folder-status">
      {mediaFolderStatusText(summary)}
    </p>

    {#if !mediaResolver || !folderSupported}
      <!-- Kein Verzeichnis-Handle auf dieser Plattform (iOS/Safari): statt eines toten
           Ordner-Knopfes der Import-Weg (BL-259). Die Zuordnung läuft dann über den
           Dateinamen — der Browser gibt beim Import keinen Ordner her. -->
      <p class="settings-view__hint">
        Dieses Gerät kann keine Ordner freigeben (z. B. Safari auf iPhone/iPad). Wählen Sie
        die Bilder stattdessen einzeln aus — sie werden über ihren Dateinamen zugeordnet
        und bleiben auf diesem Gerät gespeichert.
      </p>
      {#if canImport}
        <div class="settings-view__actions">
          <button type="button" class="stb-btn" data-variant="secondary" disabled={busy} onclick={importFiles}>
            Medien importieren
          </button>
          {#if summary.importedCount > 0}
            <button type="button" class="stb-btn" data-variant="secondary" disabled={busy} onclick={clearImported}>
              Importierte verwerfen
            </button>
          {/if}
        </div>
        <StatusNotice text={notice} onDismiss={() => (notice = '')} lage="inline" />
      {/if}
    {:else}
      <div class="settings-view__actions">
        <button
          type="button"
          class="stb-btn"
          data-variant="secondary"
          disabled={busy}
          onclick={connectFolder}
        >
          {summary.connected ? 'Anderen Ordner wählen' : 'Ordner wählen'}
        </button>
        {#if summary.connected}
          <button
            type="button"
            class="stb-btn"
            data-variant="secondary"
            disabled={busy}
            onclick={rescanFolder}
          >
            Neu einlesen
          </button>
          <button
            type="button"
            class="stb-btn"
            data-variant="secondary"
            disabled={busy}
            onclick={disconnectFolder}
          >
            Trennen
          </button>
        {/if}
      </div>
      <StatusNotice text={notice} onDismiss={() => (notice = '')} lage="inline" />
    {/if}
  </section>

  <section class="settings-view__group" aria-labelledby="set-summary">
    <h3 id="set-summary" class="stb-role-label settings-view__group-label">Wird woanders bedient</h3>
    <p class="settings-view__scope">{SCOPE_LABEL.travels}</p>
    <ul class="settings-view__jumps">
      <li>
        <button type="button" class="settings-view__jump" onclick={() => onNavigate?.('quality')}>
          <span>Prüfregeln</span>
          <span class="settings-view__jump-hint">im Dashboard, neben ihren Befunden ›</span>
        </button>
      </li>
      <li>
        <button type="button" class="settings-view__jump" onclick={() => onNavigate?.('file')}>
          <span>Export-Vorwahl</span>
          <span class="settings-view__jump-hint">im Export-Dialog ›</span>
        </button>
      </li>
    </ul>
  </section>

  <section class="settings-view__group settings-view__group--aside" aria-labelledby="set-reset">
    <h3 id="set-reset" class="stb-role-label settings-view__group-label">Zurücksetzen</h3>
    <p class="settings-view__scope">{SCOPE_LABEL.device}</p>
    <p class="settings-view__hint">
      Für den Fall eines inkonsistenten lokalen Zustands. Beide Aktionen betreffen nur, was
      im Browser liegt — Ihre GEDCOM-/GRAMPS-Datei wird nicht angefasst.
    </p>
    {#if resetFehler}
      <p class="settings-view__hint" role="alert">Zurücksetzen fehlgeschlagen: {resetFehler}</p>
    {/if}
    <div class="settings-view__reset-actions">
      <button
        type="button"
        class="stb-btn"
        data-variant="secondary"
        disabled={resetLaeuft}
        onclick={() => (frage = 'orte')}
      >
        Ortsdaten zurücksetzen
      </button>
      <button
        type="button"
        class="stb-btn"
        data-variant="danger"
        disabled={resetLaeuft}
        onclick={() => (frage = 'alles')}
      >
        Alles zurücksetzen
      </button>
    </div>
  </section>

  {#if frage === 'orte'}
    <ConfirmDialog
      titel="Ortsdaten zurücksetzen?"
      text={ORTE_RESET_TEXT}
      bestaetigen="Ortsdaten löschen"
      onConfirm={() => fuehreResetAus('orte')}
      onCancel={() => (frage = null)}
    />
  {/if}
  {#if frage === 'alles'}
    <ConfirmDialog
      titel="Wirklich allen lokalen Speicher löschen?"
      text={resetWarnungText(LOKALE_DATEN)}
      bestaetigen="Alles löschen"
      onConfirm={() => fuehreResetAus('alles')}
      onCancel={() => (frage = null)}
    />
  {/if}

  {#if appDataIO && fileService}
    <section class="settings-view__group settings-view__group--aside" aria-labelledby="set-appdata">
      <h3 id="set-appdata" class="stb-role-label settings-view__group-label">
        Mitnehmen (app-data.json)
      </h3>
      <p class="settings-view__scope">{SCOPE_LABEL.travels}</p>
      <p class="settings-view__hint">
        Ihre Einstellungen (Prüfregeln, Export-Vorwahl, Forschungsprojekte) — enthält keine
        Personendaten. Der Medien-Ordner ist nicht dabei: er gehört zu diesem Gerät.
      </p>
      <AppDataFileButtons {fileService} {appDataIO} />
    </section>
  {/if}
</div>

<style>
  .settings-view__reset-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .settings-view {
    padding: 1rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .settings-view__intro {
    margin: 0;
    color: var(--stb-text-dim);
    font-size: 0.85rem;
  }

  .settings-view__group {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .settings-view__group--aside {
    border-top: 1px solid var(--stb-surface-3);
    padding-top: 1rem;
  }

  .settings-view__group-label {
    margin: 0;
  }

  .settings-view__scope {
    margin: 0;
    font-size: 0.72rem;
    color: var(--stb-text-dim);
  }

  .settings-view__hint {
    margin: 0;
    font-size: 0.8rem;
    color: var(--stb-text-dim);
  }


  .settings-view__status {
    margin: 0.2rem 0 0;
    font-size: 0.85rem;
  }

  /* Die Rückmeldung nach Ordner-/Medien-Aktionen kommt aus `StatusNotice` (BL-334) —
     EIN Kanal, an zwei Stellen gezeigt, je nachdem welcher Zweig gerade offen ist. */

  .settings-view__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.3rem;
  }

  /* Optik + Trefferfläche aus `.stb-btn[data-variant='secondary']` (design-system.css).
     `data-variant` ist seit dieser Konsolidierung ein ECHTER globaler Hook — vorher war
     es ein Marker, der nur wirkte, wenn die Komponente zufällig eine eigene Regel
     mitbrachte, und genau daran rendete dieser Knopf beim Bau im Browser-Default. */

  .settings-view__jumps {
    list-style: none;
    margin: 0.2rem 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  /* Eine ganze Zeile als Sprungziel — trotzdem ein Bedienelement, also gilt die
     Trefferfläche (Spec 21 §6i). Sie lag gemessen bei 33,5 px. */
  .settings-view__jump {
    width: 100%;
    min-height: var(--stb-touch-target);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    background: var(--stb-surface-2);
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-control);
    padding: 0.5rem 0.7rem;
    text-align: left;
    color: var(--stb-text);
    cursor: pointer;
  }

  .settings-view__jump:hover,
  .settings-view__jump:focus-visible {
    border-color: var(--stb-gold-dim);
  }

  .settings-view__jump-hint {
    font-size: 0.75rem;
    color: var(--stb-text-dim);
  }
</style>
