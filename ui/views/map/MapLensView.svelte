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
  import { onDestroy } from 'svelte';
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
  import LensViewHeader from '../../shell/LensViewHeader.svelte';
  import type { LensId } from '../../shell/lens-model';
  import { displayName, sortKey } from '../../shell/person-display';

  interface Props {
    appState: AppState;
    viewState: ViewState;
    onNavigateLens?: (lens: LensId) => void;
  }
  const { appState, viewState, onNavigateLens }: Props = $props();

  let mode = $state<MapMode>('orte');
  let personId = $state<string | null>(null);
  let personPickerOpen = $state(false);
  let personQuery = $state('');
  let animSpeed = $state(600);
  let animLoop = $state(false);
  let animRunning = $state(false);
  let animIndex = $state(-1); // -1 = alles anzeigen (kein Animationslauf aktiv)

  // Personen-Modus-Default: der geteilte Lens-Fokus (Spec 21 §4), NICHT verändert
  // durch den Picker im Personen-Modus (der Picker setzt nur den lokalen `personId`-State
  // dieser Ansicht — analog wie im Orakel `_mapPersonId` getrennt von `AppState.currentPersonId` war).
  const focusId = $derived(viewState.getCurrent('lensFocus'));
  $effect(() => {
    if (mode === 'person' && personId == null && focusId) personId = focusId;
  });

  let containerEl: HTMLDivElement | undefined = $state();
  let handle: LeafletIslandHandle | SvgFallbackHandle | null = null;
  let usingFallback = $state(!navigator.onLine);
  let offlineBannerVisible = $derived(usingFallback);

  const places = $derived(placesWithCoords(appState.db, appState.placeContext));
  const migrations = $derived(migrationLines(appState.db, appState.placeContext));
  const biography = $derived(personId ? personBiographyPoints(appState.db, appState.placeContext, personId) : []);

  const personResults = $derived(
    Array.from(appState.db.individuals.values())
      .filter((p) => !personQuery.trim() || displayName(p).toLowerCase().includes(personQuery.trim().toLowerCase()))
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b), 'de'))
      .slice(0, 50),
  );

  function stopAnim(): void {
    animRunning = false;
    if (animTimer) clearTimeout(animTimer);
    animTimer = null;
  }

  function switchMode(next: MapMode): void {
    stopAnim();
    animIndex = -1;
    mode = next;
  }

  function selectPerson(id: string): void {
    personId = id;
    personPickerOpen = false;
    stopAnim();
    animIndex = -1;
  }

  function mountOrUpdate(): void {
    if (!containerEl) return;
    const data = { mode, places, migrations, biography, animIndex };
    if (usingFallback) {
      if (!handle) {
        handle = mountSvgFallbackMap(containerEl, {
          mode,
          places,
          migrations,
          biography,
          onSelectPlace: () => {},
        });
      } else {
        (handle as SvgFallbackHandle).update({ mode, places, migrations, biography, onSelectPlace: () => {} });
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
    // Re-mount/-update bei jeder relevanten Änderung (Modus/Personen-Fokus/Daten/
    // Animationsfortschritt/Fallback-Wechsel) — kompletter Neu-Aufbau, kein Fein-
    // Diffing (Spec 02 §5).
    void mode;
    void places;
    void migrations;
    void biography;
    void animIndex;
    void usingFallback;
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
      <button type="button" class="map-lens-view__person-btn" onclick={() => (personPickerOpen = true)}>
        {personId ? displayName(appState.db.individuals.get(personId)!) : 'Person wählen…'}
      </button>
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

  {#if personPickerOpen}
    <div class="map-lens-view__picker-overlay" role="dialog" aria-label="Person für Karte wählen">
      <div class="map-lens-view__picker">
        <div class="map-lens-view__picker-header">
          <input
            type="search"
            class="map-lens-view__picker-input"
            placeholder="Person suchen…"
            bind:value={personQuery}
          />
          <button type="button" class="map-lens-view__picker-close" onclick={() => (personPickerOpen = false)}>
            ✕
          </button>
        </div>
        <ul class="map-lens-view__picker-list">
          {#each personResults as p (p.id)}
            <li>
              <button type="button" class="map-lens-view__picker-item" onclick={() => selectPerson(p.id)}>
                {displayName(p)}
              </button>
            </li>
          {:else}
            <li class="map-lens-view__picker-empty">Keine Person gefunden</li>
          {/each}
        </ul>
      </div>
    </div>
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

  .map-lens-view__person-btn {
    background: var(--stb-surface-2);
    border: 1px solid var(--stb-surface-3);
    color: var(--stb-text);
    border-radius: var(--stb-radius-control);
    padding: 0.4rem 0.6rem;
    font-size: 0.85rem;
    cursor: pointer;
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

  .map-lens-view__picker-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 3rem;
    z-index: 500;
  }

  .map-lens-view__picker {
    background: var(--stb-surface-1);
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-card);
    width: min(420px, 90vw);
    max-height: 70vh;
    display: flex;
    flex-direction: column;
  }

  .map-lens-view__picker-header {
    display: flex;
    gap: 0.5rem;
    padding: 0.6rem;
    border-bottom: 1px solid var(--stb-surface-3);
  }

  .map-lens-view__picker-input {
    flex: 1;
    background: var(--stb-surface-2);
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-control);
    color: var(--stb-text);
    padding: 0.4rem 0.6rem;
  }

  .map-lens-view__picker-close {
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
    font-size: 1rem;
  }

  .map-lens-view__picker-list {
    list-style: none;
    margin: 0;
    padding: 0.3rem;
    overflow-y: auto;
  }

  .map-lens-view__picker-item {
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    color: var(--stb-text);
    padding: 0.5rem 0.6rem;
    cursor: pointer;
    border-radius: var(--stb-radius-control);
  }

  .map-lens-view__picker-item:hover {
    background: var(--stb-surface-2);
  }

  .map-lens-view__picker-empty {
    padding: 0.6rem;
    color: var(--stb-text-dim);
  }
</style>
