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

  interface Props {
    appState: AppState;
    viewState: ViewState;
    route: Route;
    onNavigateLens?: (lens: LensId) => void;
  }
  const { appState, viewState, route, onNavigateLens }: Props = $props();

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

  function stopAnim(): void {
    animRunning = false;
    if (animTimer) clearTimeout(animTimer);
    animTimer = null;
  }

  function switchMode(next: MapMode): void {
    stopAnim();
    animIndex = -1;
    route.setMapMode(next);
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
          onSelectPlace: () => {},
        });
      } else {
        (handle as SvgFallbackHandle).update({
          mode,
          places,
          migrations,
          biography,
          focusPlaceId,
          focusCoords,
          onSelectPlace: () => {},
        });
      }
    } else {
      if (!handle) {
        handle = mountLeafletMap(containerEl, data, {
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

  <div class="map-lens-view__mode-row stb-segment-row" role="tablist" aria-label="Karten-Modus wählen">
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
      {#if personId && biography.length === 0}
        <span class="map-lens-view__empty-hint">Keine Koordinaten für diese Person vorhanden</span>
      {/if}
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

  <div class="map-lens-view__host" bind:this={containerEl}></div>

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

  .map-lens-view__empty-hint {
    color: var(--stb-text-dim);
    font-size: 0.8rem;
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

  .map-lens-view__host {
    flex: 1;
    min-height: 0;
    margin: 0.5rem 0.75rem 0.75rem;
  }

</style>
