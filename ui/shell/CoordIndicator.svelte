<script lang="ts">
  // ui/shell/CoordIndicator.svelte — geteilter Koordinaten-Indikator (ADR-v9-79 Punkt l,
  // ADR-v9-80 Punkt 2, INV-UI-4). Ersetzt DREI unabhängige Kopien desselben
  // Paar-Zustand-Glyphen (◎ vorhanden / ◌ fehlt): `.place-list__coord-indicator`
  // (PlaceList.svelte), `.hof-list__coord-indicator` (HofList.svelte) UND den
  // Text-Link "Karte ↗" in PersonDetail.svelte/FamilyDetail.svelte (dort über
  // `EventLine.svelte`). Bewusst AUSSERHALB der `.stb-pill`-Familie (Spec 21 §10l
  // Punkt 2) — ein Paar-Zustand, IMMER sichtbar, keine reine Präsenz-Meldung.
  //
  // Klickverhalten (ADR-v9-78 Punkt 4, präzisiert per Nachtrag): der Sprung ist
  // IMMER verfügbar, sobald `coords` gesetzt ist — NICHT mehr an eine aufgelöste
  // `focusId` gekoppelt. Grund (Nutzer-Korrektur nach Ansicht des ersten Ergebnisses):
  // Event-Koordinaten sind oft präziser als die des zugeordneten Orts/Hofs (z. B. ein
  // Geburtshaus statt des Dorf-Zentrums, `eventCoords`-Fallback, Spec 11 §5) — die
  // Karte muss darauf zentrieren können, AUCH wenn kein PlaceObject/HofObject mit
  // eigenen Koordinaten existiert. Setzt IMMER den Roh-Koordinaten-Slot
  // `viewState.setMapCoordFocus(coords)`; setzt ZUSÄTZLICH `lensPlaceFocus` (Entitäts-
  // ID), wenn eine `focusId` vorhanden ist — dient dann NUR noch als optionaler
  // Hervorhebungs-Hinweis (hebt den kuratierten Marker zusätzlich hervor, falls einer
  // an dieser Stelle existiert), ist aber für den Sprung selbst nicht mehr nötig. Ruft
  // `onNavigateLens('map')` — DENSELBEN Lens-Umschalter-Mechanismus wie TreeView/
  // MapLensView/TimelineLensView (INV-UI-3, EIN kanonischer Weg). Eine separate Insel
  // (ui/islands/map/leaflet-map.ts, ui/views/map/MapLensView.svelte) macht beide Slots
  // wirksam (zentriert auf die Koordinate, hebt ggf. zusätzlich den kuratierten Marker
  // hervor, oder zeichnet einen Ad-hoc-Marker an der genauen Stelle) — das ist NICHT
  // Teil dieser Komponente.
  //
  // Ohne Koordinaten ist der Glyph reiner, nicht-interaktiver Text (kein Link ohne
  // Ziel) — einziger verbleibender nicht-interaktiver Fall.
  import type { ViewState } from './view-state.svelte';
  import type { LensId } from './lens-model';
  import { geoHref } from './geo-link';
  import { tooltip } from './tooltip';

  interface Props {
    coords: { lat: number; long: number } | null;
    /** Ziel-Id (Place- oder Hof-Id) für die ZUSÄTZLICHE Marker-Hervorhebung —
     *  `null`, wenn kein aufgelöstes Orts-/Hof-Objekt existiert (der Koordinaten-
     *  Sprung selbst funktioniert trotzdem, s. o.). */
    focusId: string | null;
    viewState: ViewState;
    /** Cross-Tab-Navigation zur Karte-Lens (App.svelte's `navigateLens`, INV-UI-3) —
     *  optional, damit isolierte Tests/Kontexte ohne Lens-Umschalter weiterlaufen. */
    onNavigateLens?: (lens: LensId) => void;
  }
  const { coords, focusId, viewState, onNavigateLens }: Props = $props();

  function handleClick() {
    if (!coords) return;
    viewState.setMapCoordFocus(coords);
    if (focusId) viewState.setCurrent('lensPlaceFocus', focusId);
    onNavigateLens?.('map');
  }
</script>

<span class="stb-coord-indicator" class:stb-coord-indicator--chip={!!coords}>
  {#if coords}
    <button
      type="button"
      class="stb-coord-indicator__glyph"
      aria-label="Koordinaten vorhanden"
      use:tooltip={'Koordinaten vorhanden'}
      onclick={handleClick}
    >
      ◎
    </button>
    <a
      class="stb-coord-indicator__osm"
      href={geoHref(coords)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Auf OpenStreetMap öffnen"
      use:tooltip={'Auf OpenStreetMap öffnen'}
    >↗</a>
  {:else}
    <span
      class="stb-coord-indicator__glyph stb-coord-indicator__glyph--missing"
      aria-label="Koordinaten fehlen"
      use:tooltip={'Koordinaten fehlen'}
    >
      ◌
    </span>
  {/if}
</span>
