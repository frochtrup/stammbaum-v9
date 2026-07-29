// ui/islands/map/mini-leaflet.ts — kompakte Kachel-Mini-Karte für den App-ONLINE-
// Steckbrief (BL-214, ADR-v9-147 Punkt 2). Wiederverwendung des vorhandenen Leaflet-
// Kachel-Insels (OSM-Kacheln, `leaflet-map.ts`-Konstanten, CSP bereits erlaubt) — KEINE
// neue Infrastruktur. Der Report + die App-offline-Verortung nutzen stattdessen den
// gebündelten Vektor-Renderer (`mini-map.ts`); beide Wege fitten denselben Ausschnitt
// (`fitMiniMapBounds`, INV-UI-4).
//
// Bewusst statisch (keine Zoom-/Drag-Interaktion) — die Mini-Karte ist eine Verortung,
// kein zweiter interaktiver Karten-Mechanismus (INV-UI-4); Exploration bleibt der
// Karte-Lens vorbehalten, dorthin springt der CoordIndicator (ADR-v9-78 Punkt 4).
// `onTileError` meldet fehlende Kacheln nach oben (Offline/Netzwerkfehler) — die
// Umschaltung auf den Vektor-Fallback trifft die Svelte-Hülle (`PlaceMiniMap.svelte`),
// analog `MapLensView` (ADR-v9-25).
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { OSM_TILE_URL, OSM_ATTRIBUTION, OSM_MAX_ZOOM } from './leaflet-map';
import type { MiniMapBounds, LatLong } from './mini-map-bounds';

export interface MiniLeafletOptions {
  lat: number;
  long: number;
  /** Anzuzeigender Ausschnitt (aus `fitMiniMapBounds`). */
  bounds: MiniMapBounds;
  /** Zugänglicher Name / Tooltip des Markers. */
  label?: string;
  /** Gedämpfte Kontext-Punkte (Dorf + Geschwisterhöfe im Hof-Kontext). */
  contextPoints?: LatLong[];
  /** Fehlende Kacheln (Offline/Netzwerkfehler, ADR-v9-25) → Umschaltung nach oben. */
  onTileError?: () => void;
}

export interface MiniLeafletHandle {
  update(opts: MiniLeafletOptions): void;
  destroy(): void;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Mountet die statische Kachel-Mini-Karte in `container` (muss sichtbare Ausmaße
 * haben — Leaflet misst clientWidth/Height beim Init). Fittet auf `bounds`.
 */
export function mountMiniLeaflet(container: HTMLElement, options: MiniLeafletOptions): MiniLeafletHandle {
  container.classList.add('mini-leaflet');
  container.innerHTML = '';
  const mapEl = document.createElement('div');
  mapEl.className = 'mini-leaflet__map';
  container.appendChild(mapEl);

  const map = L.map(mapEl, {
    zoomControl: false,
    attributionControl: true,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    touchZoom: false,
  });

  const tileLayer = L.tileLayer(OSM_TILE_URL, { attribution: OSM_ATTRIBUTION, maxZoom: OSM_MAX_ZOOM });
  let tileErrored = false;
  tileLayer.on('tileerror', () => {
    if (tileErrored) return;
    tileErrored = true;
    options.onTileError?.();
  });
  tileLayer.addTo(map);

  const markerLayer = L.layerGroup().addTo(map);

  function render(opts: MiniLeafletOptions): void {
    markerLayer.clearLayers();
    const b = opts.bounds;
    map.fitBounds(
      [
        [b.minLat, b.minLong],
        [b.maxLat, b.maxLong],
      ],
      { animate: false },
    );
    for (const p of opts.contextPoints ?? []) {
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.long)) continue;
      L.circleMarker([p.lat, p.long], {
        radius: 5,
        fillColor: '#c8a84a',
        color: '#1a140a',
        weight: 1,
        opacity: 1,
        fillOpacity: 0.7,
      }).addTo(markerLayer);
    }
    const marker = L.circleMarker([opts.lat, opts.long], {
      radius: 8,
      fillColor: '#f0b429',
      color: '#ffffff',
      weight: 3,
      opacity: 1,
      fillOpacity: 0.95,
    });
    if (opts.label) marker.bindTooltip(escapeHtml(opts.label), { direction: 'top', offset: [0, -6] });
    marker.addTo(markerLayer);
  }

  render(options);
  // Leaflet misst Container-Maße beim Init — falls der Host beim Mount unsichtbar war,
  // zwingt ein verzögertes invalidateSize + erneutes fitBounds Leaflet zum Nachmessen.
  const invalidate = () => {
    map.invalidateSize();
    const b = options.bounds;
    map.fitBounds(
      [
        [b.minLat, b.minLong],
        [b.maxLat, b.maxLong],
      ],
      { animate: false },
    );
  };
  const t1 = setTimeout(invalidate, 100);
  const t2 = setTimeout(invalidate, 400);

  return {
    update(next) {
      options = next;
      render(next);
    },
    destroy() {
      clearTimeout(t1);
      clearTimeout(t2);
      map.remove();
      container.innerHTML = '';
      container.classList.remove('mini-leaflet');
    },
  };
}
