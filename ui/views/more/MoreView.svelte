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
  import type { LensId } from '../../shell/lens-model';
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
    /** Verlässt den Hub Richtung Karten-/Zeitleiste-Lens (App.svelte activeTarget=
     * 'map'/'timeline', INV-UI-2). */
    onNavigateLens?: (lens: LensId) => void;
  }
  const { appState, fileService, persister, placesFileIO, fileHandle, onImported, onNavigateLens }: Props = $props();

  type MoreEntry = 'file' | 'stats' | 'story' | 'reports' | 'settings';

  interface MenuItem {
    id: MoreEntry;
    icon: string;
    label: string;
    implemented: boolean;
  }

  // Reihenfolge folgt Spec 21 §1/§3: Datei zuerst (Session-Einstieg), dann die
  // verbleibende Lens (Story), dann die übrigen Arbeitsflächen-Einträge, die laut §2 in
  // den "Mehr"-Hub gehören. "Karte" und "Zeitleiste" sind KEIN Menü-Sub-Eintrag mehr
  // (s. Kommentar oben) — eigene Buttons, die sofort über onNavigateLens navigieren
  // statt eine Sub-Ansicht im Hub zu öffnen.
  const items: MenuItem[] = [
    { id: 'file', icon: '📁', label: 'Datei', implemented: true },
    { id: 'stats', icon: '📊', label: 'Statistik', implemented: true },
    { id: 'story', icon: '📖', label: 'Story', implemented: false },
    { id: 'reports', icon: '🖨', label: 'Ausgaben', implemented: false },
    { id: 'settings', icon: '⚙', label: 'Einstellungen', implemented: false },
  ];

  // Ein Menü mit einer Sub-Ansicht reicht (Auftrag: "halte das einfach, kein komplexer
  // History-Stack nötig") — kein eigener Eintrag in der zentralen ViewState-Instanz,
  // weil dieser Hub rein lokale Menü-Navigation ist (INV-VS bleibt unberührt: die
  // "echte" Auswahl je Ziel bleibt weiterhin exklusiv bei ViewState, sobald die
  // einzelnen Lenses/Ausgaben/Einstellungen gebaut werden).
  let openEntry = $state<MenuItem | null>(null);

  function open(item: MenuItem) {
    openEntry = item;
  }

  function backToMenu() {
    openEntry = null;
  }
</script>

<div class="more-view">
  {#if openEntry}
    <div class="more-view__sub-header">
      <button type="button" class="more-view__back" onclick={backToMenu}>← Zurück zum Menü</button>
    </div>
    {#if openEntry.id === 'stats'}
      <StatisticsView {appState} />
    {:else if openEntry.id === 'file'}
      <div class="more-view__file">
        <ImportButton {appState} {persister} {fileService} {onImported} />
        <SaveButton {appState} {fileService} handle={fileHandle} />
        {#if placesFileIO}
          <PlacesFileButtons {appState} {fileService} {persister} {placesFileIO} />
        {/if}
      </div>
    {:else}
      <ComingSoonPanel label="{openEntry.icon} {openEntry.label}" />
    {/if}
  {:else}
    <ul class="more-view__list">
      <li>
        <button type="button" class="more-view__item" onclick={() => onNavigateLens?.('map')}>
          <span class="more-view__icon" aria-hidden="true">🗺</span>
          <span class="more-view__label">Karte</span>
        </button>
      </li>
      <li>
        <button type="button" class="more-view__item" onclick={() => onNavigateLens?.('timeline')}>
          <span class="more-view__icon" aria-hidden="true">⏱</span>
          <span class="more-view__label">Zeitleiste</span>
        </button>
      </li>
      {#each items as item (item.id)}
        <li>
          <button type="button" class="more-view__item" onclick={() => open(item)}>
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
