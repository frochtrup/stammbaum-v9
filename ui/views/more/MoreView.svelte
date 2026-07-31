<script lang="ts">
  // ui/views/more/MoreView.svelte — "Mehr"-Hub (Spec 21 §2 Mobile-Modell: "Mehr = Hub
  // für die Lenses (Karte / Zeitleiste / Statistik / Story) + Ausgaben + Einstellungen +
  // Datei").
  //
  // Diese Scheibe liefert das Navigations-Gerüst: ein Menü mit Einträgen. "Statistik"
  // ist echt (Spec 20 §4 "Statistik-Report") — Nutzer-Entscheidung: Statistik ist bewusst
  // KEINE Diagramm-/imperative-Insel-Lens (anders als Baum/Karte/Zeitleiste), bekommt
  // keinen gemeinsamen Lens-Umschalter und ist ausschließlich über diesen Hub-Eintrag
  // erreichbar. "Ausgaben" ist seit BL-169 ebenfalls echt (ReportsView, Druck-Reports §4).
  // Story/Einstellungen bleiben Platzhalter (eigene, spätere Bauabschnitte).
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
  import type { ViewState } from '../../shell/view-state.svelte';
  import ComingSoonPanel from '../../shell/ComingSoonPanel.svelte';
  import StatisticsView from '../stats/StatisticsView.svelte';
  import ImportButton from '../../shell/ImportButton.svelte';
  import SaveButton from '../../shell/SaveButton.svelte';
  import PlacesFileButtons from '../../shell/PlacesFileButtons.svelte';
  import AppDataFileButtons from '../../shell/AppDataFileButtons.svelte';
  import type { AppDataIO } from '../../../services/app-data';
  import ImportCompareView from '../import/ImportCompareView.svelte';
  import ExportView from '../export/ExportView.svelte';
  import ReportsView from '../reports/ReportsView.svelte';
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
    /** B1-Bündel (app-data.json, BL-180) — dateiübergreifender app-privater Zustand. */
    appDataIO?: AppDataIO;
    /** FS-Access-Handle der zuletzt geladenen/gespeicherten Datei (Tier 1), falls vorhanden. */
    fileHandle?: unknown;
    /** Meldet einen neuen FS-Handle nach einem Import zurück an App.svelte (s. ImportButton). */
    onImported?: (handle: unknown) => void;
    /** Die EINE Routen-Quelle (INV-UI-15) — der Hub hält keinen eigenen Unter-Zustand. */
    route: Route;
    /** Für die Proband-Vorbelegung der Report-Bezugsperson (BL-120), an ReportsView
     *  durchgereicht. Optional, damit bestehende Tests unverändert laufen. */
    viewState?: ViewState;
  }
  const { appState, fileService, persister, placesFileIO, appDataIO, fileHandle, onImported, route, viewState }: Props = $props();

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

  // Hilfelink auf das mit-deployte Benutzerhandbuch (app/public/HANDBUCH.html → dist,
  // unter der vite-`base` ausgeliefert; NICHT im SW-Precache, s. sw-manifest.ts). Öffnet
  // in einem neuen Tab — ein statisches Doc, kein Nav-Ziel/keine View.
  const handbuchUrl = `${import.meta.env.BASE_URL}HANDBUCH.html`;

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
    {:else if openEntry.id === 'reports'}
      <ReportsView {appState} {viewState} />
    {:else if openEntry.id === 'file'}
      <!-- Nach Funktion gruppiert mit leisen Überschriften (ADR-v9-128): Laden · Sichern ·
           Orts-Bestand · Austausch. Genau EINE gefüllte Primäraktion je Zustand — Öffnen
           (keine Datei) bzw. Speichern (Datei geladen), s. openIsPrimary. -->
      <div class="more-view__file">
        <section class="more-view__group" role="group" aria-labelledby="filegrp-load">
          <h3 id="filegrp-load" class="stb-role-label more-view__group-label">Laden</h3>
          <ImportButton {appState} {persister} {fileService} {onImported} openIsPrimary={!appState.fileName} />
        </section>

        {#if appState.fileName}
          <section class="more-view__group" role="group" aria-labelledby="filegrp-save">
            <h3 id="filegrp-save" class="stb-role-label more-view__group-label">Sichern</h3>
            <SaveButton {appState} {fileService} handle={fileHandle} />
          </section>
        {/if}

        {#if placesFileIO}
          <!-- Eigene, abgesetzte Gruppe: die orte.json-Aktionen betreffen den geräteüber-
               greifenden Orts-Bestand, NICHT die geladene Genealogie-Datei (eigener FS-Handle/
               Picker, ADR-v9-70) — deshalb visuell getrennt und sekundär (ADR-v9-128). -->
          <section class="more-view__group more-view__group--aside" role="group" aria-labelledby="filegrp-places">
            <h3 id="filegrp-places" class="stb-role-label more-view__group-label">Orts-Bestand (orte.json)</h3>
            <p class="more-view__group-hint">Betrifft den geräteübergreifenden Orts-Bestand, nicht Ihren Stammbaum.</p>
            <PlacesFileButtons {appState} {fileService} {persister} {placesFileIO} />
          </section>
        {/if}

        {#if appDataIO}
          <!-- Dritte Datei, dritte Gruppe: das B1-Bündel trägt dateiübergreifende
               Einstellungen (Regel-Konfiguration, Export-Vorwahl) und ist damit weder
               Stammbaum noch Orts-Bestand (Spec 30 §2.2/§2.3, ADR-v9-173). -->
          <section class="more-view__group more-view__group--aside" role="group" aria-labelledby="filegrp-appdata">
            <h3 id="filegrp-appdata" class="stb-role-label more-view__group-label">App-Daten (app-data.json)</h3>
            <p class="more-view__group-hint">
              Ihre Einstellungen (Prüfregeln, Export-Vorwahl) — gilt für alle Stammbäume, enthält keine Personendaten.
            </p>
            <AppDataFileButtons {fileService} {appDataIO} />
          </section>
        {/if}

        <section class="more-view__group" role="group" aria-labelledby="filegrp-exchange">
          <h3 id="filegrp-exchange" class="stb-role-label more-view__group-label">Austausch</h3>
          <!-- Export in ein anderes Format (BL-119): aufklappbar, weil der Normalfall
               Speichern ist und ein Strict-/GED7-/anonymisierter Export die Ausnahme
               (kein eigenes Nav-Ziel, ADR-v9-113). -->
          <details class="more-view__compare">
            <summary data-variant="secondary">In anderes Format exportieren</summary>
            <ExportView {appState} {fileService} handle={fileHandle} {appDataIO} />
          </details>
          <!-- Import-Vergleich (BL-107): arbeitet auf einer ZWEITEN Datei, nicht auf dem
               geladenen Bestand. Aufklappbar, weil selten gebraucht. -->
          <details class="more-view__compare">
            <summary data-variant="secondary">Mit zweiter Datei vergleichen</summary>
            <ImportCompareView {appState} {fileService} />
          </details>
        </section>
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
      <li>
        <a class="more-view__item" href={handbuchUrl} target="_blank" rel="noopener">
          <span class="more-view__icon" aria-hidden="true">📖</span>
          <span class="more-view__label">Hilfe &amp; Handbuch</span>
          <span class="more-view__ext" aria-hidden="true">↗</span>
        </a>
      </li>
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

  /* Der Hilfelink teilt die Zeilen-Optik der Hub-Knöpfe (INV-UI-4), ist aber ein <a>. */
  a.more-view__item {
    text-decoration: none;
  }

  .more-view__icon {
    font-size: 1.25rem;
    line-height: 1;
  }

  .more-view__label {
    color: var(--stb-text);
  }

  .more-view__ext {
    margin-left: auto;
    color: var(--stb-text-dim);
  }

  .more-view__sub-header {
    padding: 0.5rem 0.75rem 0;
  }

  .more-view__file {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    padding: 0.75rem;
    /* Auf breiten Screens (Tablet-Portrait) nicht links kleben (ADR-v9-128). */
    width: 100%;
    max-width: 32rem;
    margin: 0 auto;
  }

  .more-view__group {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .more-view__group-label {
    margin: 0;
  }

  /* „Orts-Bestand" sichtbar abgesetzt — andere Datei als der Stammbaum. */
  .more-view__group--aside {
    border-top: 1px solid var(--stb-surface-3);
    padding-top: 1rem;
  }

  .more-view__group-hint {
    margin: 0;
    color: var(--stb-text-dim);
    font-size: 0.8rem;
  }

  /* Die aufklappbaren Austausch-Aktionen tragen denselben outline-Sekundär-Stil wie die
     übrigen Datei-Knöpfe (ADR-v9-128, Kritik-Folge): kein weißer Rohtext mehr. Bleibt ein
     <summary> (native Disclosure-Tastaturbedienung), nur optisch als Knopf. Eigener Chevron
     statt des Default-Dreiecks; dreht bei geöffnetem <details>. */
  .more-view__compare > summary {
    display: inline-flex;
    align-items: center;
    gap: 0.45em;
    width: fit-content;
    background: transparent;
    color: var(--stb-gold);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.5rem 0.9rem;
    font-weight: 600;
    cursor: pointer;
    list-style: none;
  }

  .more-view__compare > summary::-webkit-details-marker {
    display: none;
  }

  .more-view__compare > summary::before {
    content: '▸';
    font-size: 0.8em;
    color: var(--stb-text-dim);
  }

  .more-view__compare[open] > summary::before {
    content: '▾';
  }

  .more-view__compare > summary:hover,
  .more-view__compare > summary:focus-visible {
    border-color: var(--stb-gold);
  }

  /* Aufgeklappter Inhalt leicht eingerückt, damit die Zugehörigkeit zum Toggle sichtbar ist. */
  .more-view__compare[open] {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
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
