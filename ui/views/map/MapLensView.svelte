<script lang="ts">
  // ui/views/map/MapLensView.svelte — Karten-Lens (Spec 21 §4, Spec 20 §1.9 [S],
  // ADR-v9-25). Dünner Svelte-Wrapper um die imperativen Karten-Inseln — kein
  // Layout-/Marker-Code hier, das lebt in ui/islands/map/{leaflet-map,svg-fallback-map,
  // map-model}.ts (Spec 02 §5: "die reaktive Schale rendert nur einen leeren Container
  // und übergibt ihm Kern-Daten + Callbacks").
  //
  // Primärpfad Leaflet+OSM-Tiles, Offline-Fallback SVG-Weltumriss (ADR-v9-25). Die
  // Umschaltentscheidung (Umsetzungsdetail laut ADR-v9-25-Konsequenz-Absatz) kombiniert
  // zwei Signale: `navigator.onLine` (sofortige Vermutung beim Mount/Wechsel) UND
  // Leaflet's `tileerror`-Event (späteres, verlässlicheres Signal — online, aber
  // Tile-Server nicht erreichbar zählt genauso als "Fallback nötig"). Einmal auf den
  // Fallback umgeschaltet bleibt es dabei, bis die Ansicht neu gemountet wird (kein
  // Flackern zwischen den beiden Rendering-Pfaden während einer Sitzung).
  //
  // Bindet DENSELBEN Lens-Umschalter wie TreeView.svelte ein (INV-UI-3) und liest/
  // schreibt den geteilten ViewState-Fokus-Slot `lensFocus` NUR für den Personen-Modus-
  // Default (Spec 21 §4 "Fokus bleibt beim Lens-Wechsel erhalten") — der Fokus selbst
  // wird hier nicht weitergereicht, TreeView bleibt der Owner der Baum-Rezentrierung.
  //
  // Orte-Modus-Fokus (ADR-v9-78 Punkt 4, Spec 20 §1.9 "Lücke 2"): liest den EIGENEN
  // Slot `lensPlaceFocus` (view-state.svelte.ts) — bewusst NICHT `lensFocus`
  // mitbenutzt, weil das ein einmaliger Sprung-Auftrag aus einem Orts-/Hof-Klick-
  // Origin ist (Ereigniszeilen-Kartenlink/`CoordIndicator`, `PlaceDetail`/`HofDetail`),
  // kein Dauer-Fokus wie bei Personen. Anders als `lensFocus`/`focusId` unten wird der
  // Slot deshalb SOFORT nach dem Lesen zurückgesetzt (`viewState.setCurrent(
  // 'lensPlaceFocus', null)`) — sonst würde ein späterer, unabhängiger Karte-Besuch
  // erneut auf denselben alten Ort springen.
  import { onDestroy, untrack } from 'svelte';
  import { onlineStatus } from '../../shell/online-status.svelte';
  import '../../islands/map/leaflet-map.css';
  import '../../islands/map/svg-fallback-map.css';
  import { mountLeafletMap, type LeafletIslandHandle, type MapMode } from '../../islands/map/leaflet-map';
  import { mountSvgFallbackMap, type SvgFallbackHandle } from '../../islands/map/svg-fallback-map';
  import {
    MIGRATION_EPOCHS,
    migrationLines,
    personBiographyPoints,
    placesWithCoords,
  } from '../../islands/map/map-model';
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import type { Route } from '../../shell/route.svelte';
  import LensViewHeader from '../../shell/LensViewHeader.svelte';
  import type { LensId } from '../../shell/lens-model';
  // Personen-Auswahl über den gemeinsamen Entitäts-Picker (INV-UI-4, ADR-v9-40) statt
  // einer eigenen Overlay-Konstruktion: dadurch dieselbe Trefferliste wie in JEDER
  // anderen Personen-Auswahl der App — Geburtsjahr/-ort als Unterzeile
  // (`yearPlaceSummary`) und dieselbe Match-Logik wie die globale Suche
  // (`matchesSearch`, nicht bloß ein Substring-Vergleich auf dem Anzeigenamen).
  import PersonPicker from '../../shell/PersonPicker.svelte';
  import MapExplorePanel from './MapExplorePanel.svelte';
  // Warum die Fläche leer ist (BL-310). Eine leere Karte ohne Text ist kein Zustand,
  // sondern ein vermuteter Defekt — und leer ist sie beim ERSTEN Blick fast immer, weil
  // der Village-Seed unangereicherte Orte ohne Koordinaten anlegt (ADR-v9-28). Die
  // Begründung ist eine reine Funktion, damit sie ohne Datenbank prüfbar bleibt.
  import { mapEmptyReason } from './map-empty-model';

  interface Props {
    appState: AppState;
    viewState: ViewState;
    route: Route;
    onNavigateLens?: (lens: LensId) => void;
    /** Marker-Klick → Explorationspanel → Personen-/Orts-/Hof-Sprung (BL-210). Optional,
     *  damit isolierte Tests/Kontexte ohne Ziel-Umschalter weiterlaufen. */
    onNavigateToPerson?: (personId: string) => void;
    onNavigateToPlace?: (placeId: string) => void;
    onNavigateToHof?: (hofId: string) => void;
    /** Weg in den Orte-Tab, wenn die Karte mangels Koordinaten leer ist (BL-310). Der
     *  Batch-Geocoder lebt dort hinter der Werkzeuge-Disclosure (`PlaceList`, BL-130) —
     *  die Karte VERWEIST darauf und baut ihn nicht nach (INV-UI-4). Optional wie die
     *  Sprung-Callbacks daneben, damit isolierte Tests ohne Schale laufen; fehlt er,
     *  bleibt der erklärende Satz und nur der Knopf entfällt. */
    onOpenPlaceList?: () => void;
  }
  const {
    appState,
    viewState,
    route,
    onNavigateLens,
    onNavigateToPerson,
    onNavigateToPlace,
    onNavigateToHof,
    onOpenPlaceList,
  }: Props = $props();

  // Geklickter Marker (BL-210) — komponenten-lokal, bewusst NICHT in Route/ViewState:
  // das ist weder eine Entitäts-Auswahl noch ein Anzeige-Modus, sondern ein flüchtiger
  // Aufklapp-Zustand (dieselbe Abgrenzung wie bei den Dedup-/Review-Overlays in
  // EntityTab, ADR-v9-104).
  let explorePlaceId = $state<string | null>(null);

  // Anzeige-Modus im Routen-Merker, nicht lokal (ADR-v9-102): fiel sonst bei jeder
  // Rückkehr auf "Orte" zurück — und verdeckte damit die erhaltene Personenauswahl,
  // die es nur im Personen-Modus zu sehen gibt. Die Zuweisung an `MapMode` ist zugleich
  // der Compiler-Wächter dagegen, dass Insel-Union und Merker-Union auseinanderdriften.
  const mode = $derived<MapMode>(route.mapMode);
  let animSpeed = $state(600);
  let animLoop = $state(false);
  let animRunning = $state(false);
  let animIndex = $state(-1); // -1 = alles anzeigen (kein Animationslauf aktiv)

  // Die Personenauswahl der Karte lebt im ViewState-Slot `mapPerson`, NICHT in einem
  // lokalen `$state` (ADR-v9-102): diese Ansicht wird beim Wegnavigieren unmountet
  // (App.svelte rendert die Ziele über `{:else if}`), eine lokale Auswahl wäre danach
  // verloren — ein Vor-/Zurückspringen zwischen Karte und einer anderen Ansicht war
  // deshalb nicht möglich. Weiterhin bewusst GETRENNT vom geteilten `lensFocus` (analog
  // wie im Orakel `_mapPersonId` getrennt von `AppState.currentPersonId` war).
  const personId = $derived(viewState.getCurrent('mapPerson'));

  // Vorbelegung aus dem geteilten Lens-Fokus (Spec 21 §4) — NUR solange die Karte noch
  // gar keine eigene Auswahl hat. Eine spätere Baum-Rezentrierung überschreibt eine
  // getroffene Karten-Auswahl nicht (Nutzer-Entscheidung 2026-07-19).
  const focusId = $derived(viewState.getCurrent('lensFocus'));
  $effect(() => {
    if (mode === 'person' && personId == null && focusId) {
      viewState.setCurrent('mapPerson', focusId);
    }
  });

  // Orte-Modus-Fokus (ADR-v9-78 Punkt 4) — EINMALIGER Konsum-Read, s. Kommentar oben.
  // Zyklus-Guard: `setCurrent` innerhalb des Effekts ändert `selection.lensPlaceFocus`
  // erneut, was `placeFocusFromViewState` neu auswertet und den Effekt ein zweites Mal
  // laufen lässt — die Bedingung ist dann aber falsy (null), der Effekt endet also nach
  // maximal einem zusätzlichen No-Op-Durchlauf (keine Endlosschleife).
  let focusPlaceId = $state<string | null>(null);
  const placeFocusFromViewState = $derived(viewState.getCurrent('lensPlaceFocus'));
  $effect(() => {
    if (mode === 'orte' && placeFocusFromViewState) {
      focusPlaceId = placeFocusFromViewState;
      viewState.setCurrent('lensPlaceFocus', null);
    }
  });

  // Roh-Koordinaten-Fokus (ADR-v9-78-Nachtrag) — gleicher EINMALIGER-Konsum-Read/
  // Zyklus-Guard wie `focusPlaceId` oben, nur über das dedizierte
  // `setMapCoordFocus`/`getMapCoordFocus`-Paar statt des generischen `ViewTarget`-
  // Registers (Koordinaten sind keine Entitäts-Auswahl, s. view-state.svelte.ts).
  // `focusPlaceId` UND `focusCoords` können gleichzeitig gesetzt sein (`CoordIndicator`
  // setzt beide, wenn ein kuratierter Marker existiert) — die Insel entscheidet selbst,
  // welcher Vorrang hat (kuratierter Marker vor Ad-hoc-Punkt, s. leaflet-map.ts).
  let focusCoords = $state<{ lat: number; long: number } | null>(null);
  const coordFocusFromViewState = $derived(viewState.getMapCoordFocus());
  $effect(() => {
    if (mode === 'orte' && coordFocusFromViewState) {
      focusCoords = coordFocusFromViewState;
      viewState.setMapCoordFocus(null);
    }
  });

  let containerEl: HTMLDivElement | undefined = $state();
  let handle: LeafletIslandHandle | SvgFallbackHandle | null = null;
  // Startwert aus dem geteilten Schalen-Zustand statt aus einem zweiten, eigenen
  // `navigator.onLine`-Aufruf (INV-UI-4, BL-03). Die Sticky-Semantik bleibt unberührt:
  // gelesen wird NUR beim Mount in einen lokalen `$state`; danach entscheidet allein
  // `onTileError` (ADR-v9-25, kein Flackern zwischen den Rendering-Pfaden).
  // `untrack`, damit der Initialwert keine Abhängigkeit aufbaut (TST-10) — ohne das
  // würde ein späterer Online-Wechsel die Karte doch wieder umschalten.
  let usingFallback = $state(untrack(() => !onlineStatus.online));
  let offlineBannerVisible = $derived(usingFallback);

  const places = $derived(placesWithCoords(appState.db, appState.placeContext));
  const migrations = $derived(migrationLines(appState.db, appState.placeContext));
  const biography = $derived(personId ? personBiographyPoints(appState.db, appState.placeContext, personId) : []);

  // BL-310: die Zahlen, die schon da sind, an die Begründungs-Funktion reichen — sie
  // leitet nichts selbst her. Neu sind nur die beiden Bestandsgrößen, und sie gehen
  // GETRENNT hinein: ein Hof ist keine Unterart von Ort ([11 §1]), eine Summe im Satz
  // wäre also falsch, nicht bloß ungenau.
  const empty = $derived(
    mapEmptyReason({
      mode,
      markers: places.length,
      migrations: migrations.length,
      biography: biography.length,
      personSelected: personId != null,
      places: appState.db.placeObjects.size,
      hofs: appState.db.hofObjects.size,
    }),
  );

  function stopAnim(): void {
    animRunning = false;
    if (animTimer) clearTimeout(animTimer);
    animTimer = null;
  }

  function switchMode(next: MapMode): void {
    stopAnim();
    animIndex = -1;
    // Das Explorationspanel gehört zum Orte-Modus (nur dort gibt es Orts-/Hof-Marker) —
    // beim Moduswechsel schließen, sonst bliebe ein Panel ohne zugehörige Marker stehen.
    explorePlaceId = null;
    route.setMapMode(next);
  }

  /** Marker-Klick (BL-210) — Callback der BEIDEN Rendering-Pfade (Leaflet + SVG-
   *  Fallback), damit das Panel offline genauso erscheint (Offline-Pfad-Parität, wie
   *  schon beim Fokus-Sprung ADR-v9-78). */
  function selectPlaceMarker(id: string): void {
    explorePlaceId = id;
  }

  function selectPerson(id: string | null): void {
    if (!id) return;
    viewState.setCurrent('mapPerson', id);
    stopAnim();
    animIndex = -1;
  }

  function mountOrUpdate(): void {
    if (!containerEl) return;
    const data = { mode, places, migrations, biography, animIndex, focusPlaceId, focusCoords };
    if (usingFallback) {
      if (!handle) {
        handle = mountSvgFallbackMap(containerEl, {
          mode,
          places,
          migrations,
          biography,
          focusPlaceId,
          focusCoords,
          onSelectPlace: selectPlaceMarker,
        });
      } else {
        (handle as SvgFallbackHandle).update({
          mode,
          places,
          migrations,
          biography,
          focusPlaceId,
          focusCoords,
          onSelectPlace: selectPlaceMarker,
        });
      }
    } else {
      if (!handle) {
        handle = mountLeafletMap(containerEl, data, {
          onSelectPlace: selectPlaceMarker,
          onTileError: () => {
            // Verlässliches Signal (auch wenn navigator.onLine=true meldete): Kacheln
            // laden nicht -> auf den Offline-Fallback wechseln (ADR-v9-25).
            if (usingFallback) return;
            handle?.destroy();
            handle = null;
            usingFallback = true;
            mountOrUpdate();
          },
        });
      } else {
        (handle as LeafletIslandHandle).update(data);
      }
    }
  }

  $effect(() => {
    // Re-mount/-update bei jeder relevanten Änderung (Modus/Personen-Fokus/Orts-Fokus/
    // Daten/Animationsfortschritt/Fallback-Wechsel) — kompletter Neu-Aufbau, kein
    // Fein-Diffing (Spec 02 §5).
    void mode;
    void places;
    void migrations;
    void biography;
    void animIndex;
    void usingFallback;
    void focusPlaceId;
    mountOrUpdate();
  });

  let animTimer: ReturnType<typeof setTimeout> | null = null;
  function animStep(): void {
    const maxIdx = mode === 'migr' ? migrations.length : biography.length;
    if (animIndex >= maxIdx) {
      if (animLoop) {
        animIndex = 0;
      } else {
        animRunning = false;
        return;
      }
    } else {
      animIndex += 1;
    }
    animTimer = setTimeout(animStep, animSpeed);
  }

  function toggleAnim(): void {
    if (animRunning) {
      stopAnim();
      return;
    }
    const maxIdx = mode === 'migr' ? migrations.length : biography.length;
    if (animIndex < 0 || animIndex >= maxIdx) animIndex = 0;
    animRunning = true;
    animStep();
  }

  function resetAnim(): void {
    stopAnim();
    animIndex = -1;
  }

  onDestroy(() => {
    stopAnim();
    handle?.destroy();
    handle = null;
  });
</script>

<div class="map-lens-view">
  <LensViewHeader active="map" onNavigate={(lens) => onNavigateLens?.(lens)} />

  <div class="map-lens-view__mode-row stb-segment-row stb-segment-row--full" role="tablist" aria-label="Karten-Modus wählen">
    <button
      type="button"
      role="tab"
      class="stb-segment-btn"
      class:stb-segment-btn--active={mode === 'orte'}
      aria-current={mode === 'orte' ? 'page' : undefined}
      onclick={() => switchMode('orte')}
    >
      Orte
    </button>
    <button
      type="button"
      role="tab"
      class="stb-segment-btn"
      class:stb-segment-btn--active={mode === 'person'}
      aria-current={mode === 'person' ? 'page' : undefined}
      onclick={() => switchMode('person')}
    >
      Personen
    </button>
    <button
      type="button"
      role="tab"
      class="stb-segment-btn"
      class:stb-segment-btn--active={mode === 'migr'}
      aria-current={mode === 'migr' ? 'page' : undefined}
      onclick={() => switchMode('migr')}
    >
      Migrationen
    </button>
  </div>

  {#if offlineBannerVisible}
    <div class="map-lens-view__offline-banner" role="status">
      Offline — vereinfachte Weltkarte ohne Straßendetail (kein Zugriff auf Kartenkacheln).
    </div>
  {/if}

  {#if mode === 'person'}
    <div class="map-lens-view__person-row">
      <PersonPicker
        {appState}
        value={personId}
        onChange={selectPerson}
        allowCreate={false}
        placeholder="Person wählen…"
        label="Person für Karte wählen"
      />
      <!-- Der frühere Inline-Satz „Keine Koordinaten für diese Person vorhanden" stand
           hier und war der EINZIGE Leerzustand der drei Modi (BL-310). Er lebt jetzt in
           `mapEmptyReason` und erscheint mit denselben Worten auf der Kartenfläche —
           ein Mechanismus statt eines pro Modus (INV-UI-4). -->
    </div>
  {/if}

  {#if mode === 'migr'}
    <div class="map-lens-view__legend">
      {#each MIGRATION_EPOCHS as epoch (epoch.label)}
        <span class="map-lens-view__legend-item">
          <span class="map-lens-view__legend-swatch" style:background={epoch.color}></span>
          {epoch.label}
        </span>
      {/each}
    </div>
  {/if}

  {#if mode === 'migr' || mode === 'person'}
    <div class="map-lens-view__anim-bar">
      <button type="button" class="map-lens-view__anim-btn" onclick={toggleAnim}>
        {animRunning ? '⏸ Pause' : '▶ Abspielen'}
      </button>
      <button type="button" class="map-lens-view__anim-btn" onclick={resetAnim}>⏹ Zurücksetzen</button>
      <label class="map-lens-view__anim-label">
        Geschwindigkeit
        <select
          value={animSpeed}
          onchange={(e) => (animSpeed = Number(e.currentTarget.value))}
          class="map-lens-view__anim-select"
        >
          <option value={1200}>langsam</option>
          <option value={600}>normal</option>
          <option value={250}>schnell</option>
        </select>
      </label>
      <label class="map-lens-view__anim-label">
        <input type="checkbox" bind:checked={animLoop} />
        Loop
      </label>
    </div>
  {/if}

  <!-- BL-310: der Hinweis liegt ÜBER der Kartenfläche, nicht in einer der beiden Inseln.
       Damit gilt er für Leaflet UND den SVG-Fallback, ohne dass ein Rendering-Pfad ihn
       kennen muss — dieselbe Offline-Parität wie beim Marker-Klick (ADR-v9-154), nur
       billiger erreicht. Er sitzt auf einer Fläche, auf der ohnehin nichts ist, und
       verschwindet mit dem ersten Marker: kein Dauer-Element, kein Zuwachs am
       Befehlsflächen-Budget (INV-UI-11, [21 §6h]). -->
  <div class="map-lens-view__canvas">
    <div class="map-lens-view__host" bind:this={containerEl}></div>
    {#if empty}
      <!-- BEWUSST KEIN `role="status"`. Der erste Bau-Stand hatte es und brach zwei
           bestehende Tests, die den Offline-Banner über genau diese Rolle finden — die
           Kollision war der Anlass, die Frage überhaupt zu stellen, und die Antwort gab
           dem Test recht: eine Live-Region meldet ÄNDERUNGEN. Der Banner ist eine
           (offline ⇄ online), dieser Hinweis nicht — er steht beim Betreten schon da und
           würde bei jedem Re-Render neu vorgelesen. Als normaler Inhalt erreicht ihn der
           Screenreader in Dokumentreihenfolge, und zwar genau einmal. -->
      <div class="map-lens-view__empty">
        <p class="map-lens-view__empty-headline">{empty.headline}</p>
        <p class="map-lens-view__empty-hint">{empty.hint}</p>
        {#if empty.offersGeocoding && onOpenPlaceList}
          <button type="button" class="stb-btn" data-variant="secondary" onclick={onOpenPlaceList}>
            📍 Zum Orte-Tab
          </button>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Orts-Explorationspanel (BL-210): unter der Karte, nicht darüber — s.
       MapExplorePanel.svelte. Nur im Orte-Modus, weil nur dort Orts-/Hof-Marker
       existieren. -->
  {#if mode === 'orte'}
    <MapExplorePanel
      {appState}
      placeId={explorePlaceId}
      onClose={() => (explorePlaceId = null)}
      {onNavigateToPerson}
      {onNavigateToPlace}
      {onNavigateToHof}
    />
  {/if}
</div>

<style>
  .map-lens-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  /* Modus-Umschalter-Pillen selbst kommen aus design-system.css (.stb-segment-row/
     .stb-segment-btn/--active) — EntityTab-Kanon, dieselben Klassen wie der
     Entitäten-Segment-Umschalter und LensSwitcher. */
  .map-lens-view__mode-row {
    padding: 0.5rem 0.75rem 0;
  }

  .map-lens-view__offline-banner {
    margin: 0.5rem 0.75rem 0;
    padding: 0.4rem 0.6rem;
    background: var(--stb-surface-2);
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-control);
    color: var(--stb-text-dim);
    font-size: 0.8rem;
  }

  .map-lens-view__person-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem 0;
  }

  /* BL-310 — Leerzustand der Kartenfläche.
     `__canvas` ist der Bezugsrahmen: er erbt die Flex-Rolle, die vorher `__host` allein
     trug, damit die Karte weiter die Resthöhe füllt. Der Hinweis liegt darüber und
     nimmt keine eigene Höhe ein — er darf die Karte nicht kleiner machen, nur weil er
     erscheint. */
  .map-lens-view__canvas {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .map-lens-view__empty {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    padding: 1.5rem;
    text-align: center;
    /* Die Grundkarte bleibt sichtbar (sie trägt den Kontext „das ist eine Karte"), aber
       gedämpft — sonst kämpft der Satz gegen Straßendetail. Kein voller Blocker: die
       Zoom-Bedienelemente bleiben erreichbar, deshalb `pointer-events: none` und nur der
       Knopf selbst wieder klickbar. */
    background: color-mix(in srgb, var(--stb-bg) 78%, transparent);
    pointer-events: none;
    /* ÜBER Leaflets Karteninhalt, UNTER seinen Bedienelementen. Leaflet staffelt seine
       Panes fest (leaflet.css: tile 200 · overlay 400 · shadow 500 · marker 600 ·
       tooltip 650 · popup 700) und legt die Controls auf 800/1000. Ohne eigenen Wert
       gewinnt jeder positionierte Pane — im ersten Bau-Stand stand eine einzelne Kachel
       ungedämpft MITTEN im Satz und machte die Überschrift unlesbar. Kein Test konnte
       das finden: happy-dom rechnet keine Stapelreihenfolge; nur die Sicht auf die echte
       Karte zeigte es. 750 dämpft alles Karteninhaltliche und lässt +/− scharf. */
    z-index: 750;
  }

  .map-lens-view__empty > :global(.stb-btn) {
    pointer-events: auto;
  }

  .map-lens-view__empty-headline {
    margin: 0;
    max-width: 34rem;
    color: var(--stb-text);
    font-weight: 600;
  }

  .map-lens-view__empty-hint {
    margin: 0;
    max-width: 34rem;
    color: var(--stb-text-dim);
    font-size: 0.8rem;
    line-height: 1.5;
  }

  .map-lens-view__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    padding: 0.5rem 0.75rem 0;
    font-size: 0.75rem;
    color: var(--stb-text-dim);
  }

  .map-lens-view__legend-item {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }

  .map-lens-view__legend-swatch {
    display: inline-block;
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 50%;
  }

  .map-lens-view__anim-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem;
    padding: 0.5rem 0.75rem 0;
    font-size: 0.8rem;
  }

  .map-lens-view__anim-btn {
    background: var(--stb-surface-2);
    border: 1px solid var(--stb-surface-3);
    color: var(--stb-text);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.6rem;
    cursor: pointer;
  }

  .map-lens-view__anim-label {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    color: var(--stb-text-dim);
  }

  /* Die Flex-Rolle liegt seit BL-310 am `__canvas`-Rahmen darüber; hier bleibt nur noch,
     wie die Karte selbst darin sitzt. */
  .map-lens-view__host {
    flex: 1;
    min-height: 0;
    margin: 0.5rem 0.75rem 0.75rem;
  }

</style>
