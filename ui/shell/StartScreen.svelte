<script lang="ts">
  // ui/shell/StartScreen.svelte — was ein Erstnutzer sieht, solange nichts geladen ist
  // (Spec 20 §1.1, [ADR-v9-297]).
  //
  // DIE LÜCKE, DIE ER SCHLIESST. Der Erstnutzer-Rundgang ([ADR-v9-190]) läuft erst NACH
  // dem Demo-Laden und nur im mobilen Layout. Davor stand ein einzelner Satz in der leeren
  // Liste (`nav-model.ts::emptyListHint`) — auf dem Desktop war das alles. Der Rundgang
  // erklärt die Navigation; hier geht es um die Frage davor: wie komme ich überhaupt rein.
  //
  // KEIN OVERLAY, sondern der Inhalt der Fläche. Ein Modal müsste weggeklickt werden und
  // wäre danach fort — dieser Zustand ist aber kein Ereignis, sondern eine Lage („es ist
  // nichts geladen"), und er endet von selbst, sobald sie vorbei ist. Deshalb auch kein
  // „schon gesehen"-Merker: wer alles zurücksetzt, soll wieder hier landen.
  //
  // DIE ZWEI VORHANDENEN WEGE KOMMEN AUS `ImportButton` (INV-UI-4), nicht aus zwei neuen
  // Knöpfen: „Datei öffnen" und „Demo laden" tragen dort Ladepfad, Fehlermeldung,
  // Orts-Hinweis und den Demo-Dateinamen, an dem der Rundgang seinen Auslöser erkennt.
  // Ein Nachbau hier wäre eine zweite Lade-Stelle mit eigener Fehlerbehandlung.
  //
  // GENAU EINE GEFÜLLTE FLÄCHE ([ADR-v9-128]): „Datei öffnen" ist primär, „Demo laden" und
  // „Leer beginnen" sind sekundär.
  import type { AppState } from './app-state.svelte';
  import type { PlacesPersister } from './places-persister';
  import type { FileService } from '../../services/file';
  import ImportButton from './ImportButton.svelte';
  import { makeDatabase } from '../../core/model';

  interface Props {
    appState: AppState;
    /** Beide optional (s. EntityTab): ohne sie bleibt „Leer beginnen" der einzige Weg —
     *  ein Komponententest ohne Schale soll diese Fläche trotzdem montieren können. */
    persister?: PlacesPersister;
    fileService?: FileService;
    onFileHandleChanged?: (handle: unknown) => void;
  }
  const { appState, persister, fileService, onFileHandleChanged }: Props = $props();

  /** Dateiname eines leer begonnenen Baums. Er MUSS gesetzt sein: `appState.fileName` ist
   *  das Signal „etwas ist geladen" — es blendet diesen Bildschirm aus und schaltet die
   *  Arbeitskopie scharf (`persistWorkingCopyIfLoaded`). Ein leerer Name ließe den Nutzer
   *  im Startbildschirm sitzen, während er schon Personen anlegt. */
  export const NEUER_BAUM_NAME = 'Neuer Stammbaum.ged';

  function leerBeginnen() {
    appState.loadDatabase(makeDatabase(), NEUER_BAUM_NAME);
    onFileHandleChanged?.(undefined);
  }
</script>

<div class="start-screen" data-tour="start-screen">
  <h2 class="start-screen__title">Stammbaum</h2>
  <p class="start-screen__lead">
    Ein Genealogie-Editor, der ohne Server auskommt: Ihre Daten bleiben als GEDCOM- oder
    GRAMPS-Datei bei Ihnen. Um zu beginnen, öffnen Sie eine vorhandene Datei — oder sehen
    Sie sich erst den Demo-Bestand an.
  </p>

  <div class="start-screen__actions">
    {#if persister && fileService}
      <ImportButton
        {appState}
        {persister}
        {fileService}
        onImported={onFileHandleChanged}
        openIsPrimary={true}
      />
    {/if}
    <button type="button" class="stb-btn" data-variant="secondary" onclick={leerBeginnen}>
      Leer beginnen
    </button>
  </div>

  <p class="start-screen__hint">
    Alles bleibt auf diesem Gerät. Zum Sichern und Mitnehmen speichern Sie jederzeit wieder
    in Ihre eigene Datei.
  </p>
</div>

<style>
  .start-screen {
    padding: 2rem 1rem;
    max-width: 34rem;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .start-screen__title {
    margin: 0;
    font-size: 1.6rem;
  }

  .start-screen__lead {
    margin: 0;
    color: var(--stb-text-dim);
    line-height: 1.5;
  }

  /* Umbricht bei schmaler Spalte, statt die Knöpfe aus der Fläche zu schieben — das Maß
     ist die SPALTE, nicht der Formfaktor ([21 §6h](21-UI-UX.md)). */
  .start-screen__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .start-screen__hint {
    margin: 0;
    font-size: 0.85rem;
    color: var(--stb-text-muted);
  }
</style>
