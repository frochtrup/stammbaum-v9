<script lang="ts">
  // ui/views/map/MapLensView.svelte — Platzhalter-Slot für die Karten-Lens (Spec 21
  // §4, ADR-v9-25). Diese Scheibe baut NUR die Navigations-/Fokus-Verdrahtung; der
  // eigentliche Karten-Inhalt (Leaflet + OSM-Tiles-Primärpfad, SVG-Weltumriss-Offline-
  // Fallback, ADR-v9-25) ist ein SPÄTERER Bauabschnitt (islands-builder) und ersetzt
  // NUR den ComingSoonPanel-Aufruf unten — Props/Route bleiben unverändert.
  //
  // Bindet DENSELBEN Lens-Umschalter wie TreeView.svelte ein (INV-UI-3: kein
  // eigenes Wechsel-UI) und liest den geteilten ViewState-Fokus-Slot `lensFocus`
  // (Spec 21 §4 "Fokus bleibt beim Lens-Wechsel erhalten") — schon jetzt, damit der
  // künftige Karten-Bauabschnitt nur noch den Platzhalter-Inhalt ersetzen muss, ohne
  // die Fokus-Verdrahtung nochmal anzufassen.
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import LensSwitcher from '../../shell/LensSwitcher.svelte';
  import ComingSoonPanel from '../../shell/ComingSoonPanel.svelte';
  import type { LensId } from '../../shell/lens-model';

  interface Props {
    appState: AppState;
    viewState: ViewState;
    onNavigateLens?: (lens: LensId) => void;
  }
  const { viewState, onNavigateLens }: Props = $props();

  // Nur zur Anzeige/spätere Verwendung durch den echten Karten-Bau — dieselbe
  // Chokepoint-Lesart wie TreeView.svelte (viewState.getCurrent('lensFocus')), KEIN
  // eigener Fokus-Slot.
  const focusId = $derived(viewState.getCurrent('lensFocus'));
</script>

<div class="map-lens-view">
  <div class="map-lens-view__topbar">
    <span class="map-lens-view__title">Karte</span>
  </div>
  <div class="map-lens-view__lens-row">
    <LensSwitcher active="map" onNavigate={(lens) => onNavigateLens?.(lens)} />
  </div>
  <ComingSoonPanel
    label={focusId ? `🗺 Karte — Fokus bleibt erhalten (${focusId})` : '🗺 Karte'}
  />
</div>

<style>
  .map-lens-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .map-lens-view__topbar {
    display: flex;
    align-items: center;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--stb-surface-3);
  }

  .map-lens-view__title {
    font-family: var(--stb-font-title);
    color: var(--stb-gold-light);
  }

  .map-lens-view__lens-row {
    padding: 0.5rem 0.75rem 0;
  }
</style>
