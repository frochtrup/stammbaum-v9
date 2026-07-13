<script lang="ts">
  // ui/shell/CoordIndicator.svelte — geteilter Koordinaten-Indikator (ADR-v9-79 Punkt l,
  // ADR-v9-80 Punkt 2, INV-UI-4). Ersetzt DREI unabhängige Kopien desselben
  // Paar-Zustand-Glyphen (◎ vorhanden / ◌ fehlt): `.place-list__coord-indicator`
  // (PlaceList.svelte), `.hof-list__coord-indicator` (HofList.svelte) UND den
  // Text-Link "Karte ↗" in PersonDetail.svelte/FamilyDetail.svelte (dort über
  // `EventLine.svelte`). Bewusst AUSSERHALB der `.stb-pill`-Familie (Spec 21 §10l
  // Punkt 2) — ein Paar-Zustand, IMMER sichtbar, keine reine Präsenz-Meldung.
  //
  // Klickverhalten (ADR-v9-78 Punkt 4, nur wenn Koordinaten UND eine focusId vorhanden
  // sind): setzt den geteilten ViewState-Slot `lensPlaceFocus` (view-state.svelte.ts,
  // NICHT `lensFocus` — der trägt Personen-IDs, s. dortiger Modul-Kommentar) und ruft
  // `onNavigateLens('map')` — DENSELBEN Lens-Umschalter-Mechanismus wie TreeView/
  // MapLensView/TimelineLensView (INV-UI-3, EIN kanonischer Weg). Eine separate Insel
  // (ui/islands/map/leaflet-map.ts, ui/views/map/MapLensView.svelte) macht diesen Slot
  // wirksam (zentriert/hebt den Marker hervor) — das ist NICHT Teil dieser Komponente.
  //
  // Ohne Koordinaten ist der Glyph reiner, nicht-interaktiver Text (kein Link ohne
  // Ziel). Mit Koordinaten, aber ohne focusId (z. B. ein Ereignis mit rohen
  // ev.lati/long-Fallback-Koordinaten, aber ohne aufgelöste placeId/hofId, s.
  // core/places/chokepoints.ts::eventCoords) bleibt der Glyph ebenfalls
  // nicht-interaktiv — nur die sekundäre externe OSM-Affordanz bleibt dann verfügbar.
  import type { ViewState } from './view-state.svelte';
  import type { LensId } from './lens-model';
  import { geoHref } from './geo-link';

  interface Props {
    coords: { lat: number; long: number } | null;
    /** Ziel-Id (Place- oder Hof-Id) für `lensPlaceFocus` — `null`, wenn kein
     *  aufgelöstes Orts-/Hof-Objekt existiert (dann kein interner Sprung möglich). */
    focusId: string | null;
    viewState: ViewState;
    /** Cross-Tab-Navigation zur Karte-Lens (App.svelte's `navigateLens`, INV-UI-3) —
     *  optional, damit isolierte Tests/Kontexte ohne Lens-Umschalter weiterlaufen. */
    onNavigateLens?: (lens: LensId) => void;
  }
  const { coords, focusId, viewState, onNavigateLens }: Props = $props();

  function handleClick() {
    if (!coords || !focusId) return;
    viewState.setCurrent('lensPlaceFocus', focusId);
    onNavigateLens?.('map');
  }
</script>

<span class="stb-coord-indicator">
  {#if coords}
    {#if focusId}
      <button
        type="button"
        class="stb-coord-indicator__glyph"
        title="Koordinaten vorhanden"
        onclick={handleClick}
      >
        ◎
      </button>
    {:else}
      <span class="stb-coord-indicator__glyph" title="Koordinaten vorhanden">◎</span>
    {/if}
    <a
      class="stb-coord-indicator__osm"
      href={geoHref(coords)}
      target="_blank"
      rel="noopener noreferrer"
    >
      ↗ OpenStreetMap
    </a>
  {:else}
    <span class="stb-coord-indicator__glyph stb-coord-indicator__glyph--missing" title="Koordinaten fehlen">
      ◌
    </span>
  {/if}
</span>
