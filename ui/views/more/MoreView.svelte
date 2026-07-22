<script lang="ts">
  // ui/views/more/MoreView.svelte — "Mehr"-Hub (Spec 21 §2 Mobile-Modell: "Mehr = Hub
  // für die Lenses (Karte / Zeitleiste / Statistik / Story) + Ausgaben + Einstellungen +
  // Datei").
  //
  // Diese Scheibe liefert das Navigations-Gerüst: ein Menü mit Einträgen. "Statistik"
  // ist echt (Spec 20 §4 "Statistik-Report") — Nutzer-Entscheidung: Statistik ist bewusst
  // KEINE Diagramm-/imperative-Insel-Lens (anders als Baum/Karte/Zeitleiste), bekommt
  // keinen gemeinsamen Lens-Umschalter und ist ausschließlich über diesen Hub-Eintrag
  // erreichbar. Story/Ausgaben/Einstellungen bleiben Platzhalter (eigene, spätere
  // Bauabschnitte).
  //
  // "Karte" und "Zeitleiste" haben inzwischen echten Inhalt (Karte: Leaflet+OSM-
  // Primärpfad + SVG-Offline-Fallback, ADR-v9-25; Zeitleiste: Swim-Lane + Dekaden-Modus,
  // Spec 20 §1.10) — GENAU EIN kanonischer Weg dorthin je Lens (INV-UI-2), daher leiten
  // diese Hub-Einträge über `onNavigateLens` auf denselben App.svelte-Pfad um
  // (activeTarget='map'/'timeline'), den auch der Lens-Umschalter nutzt, STATT eine
  // zweite Implementierung (eigener ComingSoonPanel/eigene Insel-Instanz) hier zu
  // pflegen. Kein Menü-Sub-Eintrag mehr für "Karte"/"Zeitleiste" — der Klick verlässt
  // den Hub sofort (analog "Statistik" bleibt im Hub, weil Statistik KEINEN zweiten
  // Pfad hat).
  //
  // "Datei" (Nachtrag 2026-07-07, Spec 21 §2): Datei öffnen/Demo laden/Speichern zogen
  // aus einer permanent sichtbaren Leiste in App.svelte hierher um — Nutzer-Fund per
  // Screenshot, dass diese Aktionen nur am Session-Anfang/-Ende gebraucht werden, nicht
  // während der laufenden Arbeit an Personen/Familien sichtbar sein müssen (v8-Oracle
  // bestätigt dasselbe Muster: `☰`-Menü, nicht permanente Topbar). Erster Menüpunkt
  // (nicht letzter), weil er für Erstnutzer der Einstieg ist, bevor überhaupt Daten da
  // sind — rendert echte Komponenten (ImportButton/SaveButton), keinen ComingSoonPanel.
  import type { AppState } from '../../shell/app-state.svelte';
  import ComingSoonPanel from '../../shell/ComingSoonPanel.svelte';
  import StatisticsView from '../stats/StatisticsView.svelte';
  import ImportButton from '../../shell/ImportButton.svelte';
  import SaveButton from '../../shell/SaveButton.svelte';
  import PlacesFileButtons from '../../shell/PlacesFileButtons.svelte';
  import ImportCompareView from '../import/ImportCompareView.svelte';
  import ExportView from '../export/ExportView.svelte';
  import { moreHubItems, type NavTargetId } from '../../shell/nav-model';
  import type { Route } from '../../shell/route.svelte';
  import { layout } from '../../shell/layout.svelte';
  import type { FileService } from '../../../services/file';
  import type { PlacesPersister } from '../../shell/places-persister';
  import type { PlacesFileIO } from '../../../services/places';

  interface Props {
    appState: AppState;
    /** Geteilte FileService-/Persister-Instanzen aus App.svelte (dieselben, die auch
     * Auto-Load/Auto-Save beim Start nutzen) — der "Datei"-Menüpunkt hält keine eigene
     * Instanz. */
    fileService: FileService;
    persister: PlacesPersister;
    /** Geteilter orte.json-Datei-IO (eigenes FS-Handle/Picker, ADR-v9-70) — optional, damit
     * bestehende Tests (die diesen Prop nicht kennen) unverändert weiterlaufen; ohne ihn
     * bleiben die "Orte exportieren/importieren"-Buttons unsichtbar. */
    placesFileIO?: PlacesFileIO;
    /** FS-Access-Handle der zuletzt geladenen/gespeicherten Datei (Tier 1), falls vorhanden. */
    fileHandle?: unknown;
    /** Meldet einen neuen FS-Handle nach einem Import zurück an App.svelte (s. ImportButton). */
    onImported?: (handle: unknown) => void;
    /** Die EINE Routen-Quelle (INV-UI-15) — der Hub hält keinen eigenen Unter-Zustand. */
    route: Route;
  }
  const { appState, fileService, persister, placesFileIO, fileHandle, onImported, route }: Props = $props();

  // Die Menü-Liste steht seit BL-90 NICHT mehr hier, sondern kommt als Projektion aus
  // dem einen Ziel-Register (nav-model.ts `MORE_HUB_ORDER`, INV-UI-15) — inklusive der
  // Reihenfolge-Begründung (Datei vor Statistik: Session-Einstieg für Erstnutzer).
  //
  // Welcher Eintrag geöffnet ist, hält seit BL-90 ebenfalls nicht mehr diese Komponente
  // (`openEntry`), sondern die EINE Routen-Quelle (route.svelte.ts). Das war der dritte
  // der drei unabhängigen Navigationszustände, die ADR-v9-101 zusammengeführt hat: nur
  // so kann die Desktop-Sidebar (BL-06) "Statistik" oder "Datei" direkt ansteuern, ohne
  // in den privaten Zustand dieses Hubs zu greifen — dort gibt es gar keinen Hub mehr.
  const items = moreHubItems();

  // Karte/Zeitleiste verlassen den Hub sofort (echter Inhalt, INV-UI-2 — derselbe Pfad
  // wie der Lens-Umschalter); alle übrigen Einträge öffnen eine Sub-Ansicht INNERHALB
  // des Hubs. Beides ist jetzt derselbe Aufruf — den Unterschied macht allein, ob das
  // Ziel eine eigene Fläche in der App-Wurzel hat.
  const LEAVES_HUB: readonly NavTargetId[] = ['map', 'timeline'];
  const hubInternal = items.filter((i) => !LEAVES_HUB.includes(i.id));

  // Welcher Hub-Eintrag ist offen, ergibt sich aus der Route — kein zweiter Zustand.
  // Karte/Zeitleiste sind bewusst ausgenommen: bei diesen Zielen rendert die App-Wurzel
  // die jeweilige Lens-Fläche und gar nicht diesen Hub.
  const openEntry = $derived(hubInternal.find((i) => i.id === route.target) ?? null);

  function backToMenu() {
    route.setTarget('more');
  }
</script>

<div class="more-view">
  {#if openEntry}
    <!-- Auf Desktop gibt es kein Hub-Menü, in das man zurückkehren könnte (die Sidebar
         führt Datei/Statistik/… direkt) — der Zurück-Weg wäre eine Schaltfläche zu einer
         Fläche, die dort nicht existiert. Gefunden bei der eigenen Verifikation zu BL-06. -->
    {#if !layout.isDesktopLayout}
      <div class="more-view__sub-header">
        <button type="button" class="more-view__back" onclick={backToMenu}>← Zurück zum Menü</button>
      </div>
    {/if}
    {#if openEntry.id === 'stats'}
      <StatisticsView {appState} />
    {:else if openEntry.id === 'file'}
      <div class="more-view__file">
        <ImportButton {appState} {persister} {fileService} {onImported} />
        <SaveButton {appState} {fileService} handle={fileHandle} />
        {#if placesFileIO}
          <PlacesFileButtons {appState} {fileService} {persister} {placesFileIO} />
        {/if}
        <!-- Export in ein anderes Format (BL-119) steht UNTER dem Speichern-Knopf und
             aufklappbar: der Normalfall ist Speichern, ein Strict-/GED7-/anonymisierter
             Export ist die Ausnahme. Kein eigenes Nav-Ziel (ADR-v9-113). -->
        <details class="more-view__compare">
          <summary>In anderes Format exportieren</summary>
          <ExportView {appState} {fileService} handle={fileHandle} />
        </details>
        <!-- Import-Vergleich (BL-107) sitzt bei den Datei-Aktionen, nicht in einem
             Entitäts-Segment: er arbeitet auf einer ZWEITEN Datei, nicht auf dem
             geladenen Bestand. Aufklappbar, weil er selten gebraucht wird und die
             Datei-Fläche sonst mit einer vollen Arbeitsfläche startet. -->
        <details class="more-view__compare">
          <summary>Mit zweiter Datei vergleichen</summary>
          <ImportCompareView {appState} {fileService} />
        </details>
      </div>
    {:else}
      <ComingSoonPanel label="{openEntry.icon} {openEntry.label}" />
    {/if}
  {:else}
    <ul class="more-view__list">
      {#each items as item (item.id)}
        <li>
          <button type="button" class="more-view__item" onclick={() => route.setTarget(item.id)}>
            <span class="more-view__icon" aria-hidden="true">{item.icon}</span>
            <span class="more-view__label">{item.label}{item.implemented ? '' : ' (folgt)'}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .more-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow-y: auto;
  }

  .more-view__list {
    list-style: none;
    margin: 0;
    padding: 0.5rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .more-view__item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    background: var(--stb-surface-2);
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-card);
    color: var(--stb-text);
    padding: 0.75rem 1rem;
    font-size: 0.95rem;
    text-align: left;
    cursor: pointer;
  }

  .more-view__icon {
    font-size: 1.25rem;
    line-height: 1;
  }

  .more-view__label {
    color: var(--stb-text);
  }

  .more-view__sub-header {
    padding: 0.5rem 0.75rem 0;
  }

  .more-view__file {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.75rem;
  }

  .more-view__back {
    background: transparent;
    border: none;
    color: var(--stb-gold-light);
    cursor: pointer;
    font: inherit;
    padding: 0;
  }
</style>
