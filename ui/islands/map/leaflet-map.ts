// ui/islands/map/leaflet-map.ts — imperative Leaflet-Insel (Spec 02 §5, Spec 20 §1.9
// [S], ADR-v9-25). Framework-freies Vanilla-JS in einem von der reaktiven Schale
// gestellten Container. Rechnet NUR aus dem Modell (map-model.ts) — nie aus dem
// Live-DOM. Bei Moduswechsel/Update: kompletter Neu-Aufbau (kein Fein-Diffing, kein
// Framework-Reconciler, Spec 02 §5).
//
// Die Insel ruft nach oben ausschließlich über Callbacks (`onSelectPlace`,
// `onTileError`) — sie greift NICHT selbst auf ViewState/Kommandos zu (Auftrag: "Nur
// über Callbacks nach oben").
//
// Primärpfad: Leaflet + OpenStreetMap-Tiles (ADR-v9-25). `onTileError` meldet nach
// oben, wenn Kacheln nicht laden (Netzwerk/Offline) — die Umschaltentscheidung auf
// den SVG-Fallback trifft MapLensView.svelte (Umsetzungsdetail dieses Bauabschnitts,
// ADR-v9-25 Konsequenz-Absatz), nicht diese Insel selbst.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MigrationLine, PlacePoint, BiographyPoint } from './map-model';
import { escapeHtml } from './map-model';

export type MapMode = 'orte' | 'person' | 'migr';

export interface LeafletMountCallbacks {
  /** Klick auf einen Orts-/Hof-Marker im Orte-Modus. */
  onSelectPlace?: (placeId: string) => void;
  /** Mind. eine Kachelanfrage ist fehlgeschlagen (Offline/Netzwerkfehler, ADR-v9-25). */
  onTileError?: () => void;
}

export interface LeafletMountData {
  mode: MapMode;
  places: PlacePoint[];
  migrations: MigrationLine[];
  biography: BiographyPoint[];
  /** Animationsfortschritt (0..N) für Personen-/Migrations-Modus; -1 = alles anzeigen (kein Animationslauf). */
  animIndex?: number;
}

export interface LeafletIslandHandle {
  /** Kompletter Neu-Aufbau der Marker/Linien für den aktuellen Modus (Spec 02 §5). */
  update(data: LeafletMountData): void;
  /** Listener entfernen, Leaflet-Instanz zerstören. */
  destroy(): void;
}

const DEFAULT_CENTER: [number, number] = [51.5, 10.0];
const DEFAULT_ZOOM = 6;

function circleStyle(count: number): { radius: number; fillColor: string } {
  if (count >= 20) return { radius: 11, fillColor: '#c8a84a' };
  if (count >= 5) return { radius: 7, fillColor: '#9a7030' };
  return { radius: 4, fillColor: '#6a5020' };
}

/**
 * Mountet die Leaflet-Insel in `container`. `container` MUSS im DOM sichtbare
 * Ausmaße haben (Leaflet misst clientWidth/Height beim Init) — der Aufrufer ruft bei
 * Bedarf `invalidateSize()`-Timing über `update()` nach Sichtbarwerden erneut auf.
 */
export function mountLeafletMap(
  container: HTMLElement,
  data: LeafletMountData,
  callbacks: LeafletMountCallbacks = {},
): LeafletIslandHandle {
  container.classList.add('map-island');
  container.innerHTML = '';
  const mapEl = document.createElement('div');
  mapEl.className = 'map-island__leaflet';
  container.appendChild(mapEl);

  const map = L.map(mapEl, {
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    zoomControl: true,
    attributionControl: true,
  });

  const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  });
  tileLayer.on('tileerror', () => callbacks.onTileError?.());
  tileLayer.addTo(map);

  const markerLayer = L.layerGroup().addTo(map);
  const lineLayer = L.layerGroup().addTo(map);

  function renderOrte(places: PlacePoint[]): void {
    const bounds: [number, number][] = [];
    for (const p of places) {
      const { radius, fillColor } = circleStyle(p.personCount);
      const marker = p.isHof
        ? L.marker([p.lat, p.long], {
            icon: L.divIcon({
              className: '',
              html: '<div class="map-island__diamond-marker"></div>',
              iconSize: [10, 10],
              iconAnchor: [5, 5],
            }),
          })
        : L.circleMarker([p.lat, p.long], {
            radius,
            fillColor,
            color: '#1a140a',
            weight: 1.5,
            opacity: 1,
            fillOpacity: 0.85,
          });
      marker.bindTooltip(`${escapeHtml(p.title)} · ${p.personCount} Person${p.personCount !== 1 ? 'en' : ''}`, {
        direction: 'top',
        offset: [0, -6],
      });
      marker.on('click', () => callbacks.onSelectPlace?.(p.placeId));
      marker.addTo(markerLayer);
      bounds.push([p.lat, p.long]);
    }
    if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 10 });
  }

  function renderMigr(lines: MigrationLine[], animIndex: number): void {
    const bounds: [number, number][] = [];
    const upTo = animIndex < 0 ? lines.length : Math.min(animIndex, lines.length);
    for (let i = 0; i < upTo; i++) {
      const line = lines[i];
      const latLngs = line.points.map((pt) => [pt.lat, pt.long] as [number, number]);
      const poly = L.polyline(latLngs, { color: line.color, weight: 1.5, opacity: 0.55 });
      poly.bindTooltip(escapeHtml(line.personName), { sticky: true });
      poly.addTo(lineLayer);
      const last = latLngs[latLngs.length - 1];
      L.circleMarker(last, {
        radius: 3.5,
        fillColor: line.color,
        color: '#1a140a',
        weight: 1,
        opacity: 1,
        fillOpacity: 0.9,
      }).addTo(markerLayer);
      bounds.push(...latLngs);
    }
    if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 10 });
  }

  function renderPerson(points: BiographyPoint[], animIndex: number): void {
    const bounds: [number, number][] = [];
    const upTo = animIndex < 0 ? points.length : Math.min(animIndex, points.length);
    for (let i = 0; i < upTo; i++) {
      const pt = points[i];
      const icon = L.divIcon({
        className: '',
        html: `<div class="map-island__bio-marker">${i + 1}</div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      const marker = L.marker([pt.lat, pt.long], { icon });
      marker.bindTooltip(
        `<b>${i + 1}. ${escapeHtml(pt.role)}</b><br>${escapeHtml(pt.title)}${pt.date ? '<br>' + escapeHtml(pt.date) : ''}`,
        { direction: 'top', offset: [0, -12] },
      );
      marker.addTo(markerLayer);
      if (i > 0) {
        const prev = points[i - 1];
        L.polyline(
          [
            [prev.lat, prev.long],
            [pt.lat, pt.long],
          ],
          { color: '#c8a84a', weight: 2, opacity: 0.55, dashArray: '6, 5' },
        ).addTo(lineLayer);
      }
      bounds.push([pt.lat, pt.long]);
    }
    if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
  }

  function render(next: LeafletMountData): void {
    markerLayer.clearLayers();
    lineLayer.clearLayers();
    const animIndex = next.animIndex ?? -1;
    if (next.mode === 'orte') renderOrte(next.places);
    else if (next.mode === 'migr') renderMigr(next.migrations, animIndex);
    else renderPerson(next.biography, animIndex);
  }

  render(data);
  // Leaflet misst Container-Maße beim Init — falls der Host beim Mount unsichtbar war
  // (z. B. hinter einem noch nicht aktiven Tab), zwingt ein verzögertes invalidateSize
  // Leaflet zum Nachmessen (Orakel-Verhalten: doppeltes invalidateSize, Safari-Fallback).
  const invalidateTimer = setTimeout(() => map.invalidateSize(), 100);
  const invalidateTimer2 = setTimeout(() => map.invalidateSize(), 400);

  return {
    update(next) {
      render(next);
    },
    destroy() {
      clearTimeout(invalidateTimer);
      clearTimeout(invalidateTimer2);
      map.remove();
      container.innerHTML = '';
      container.classList.remove('map-island');
    },
  };
}
