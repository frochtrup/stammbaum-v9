// ui/islands/story/story-map-svg.ts — Lebensweg-Karte des Story-Modus als reines,
// selbst-enthaltenes SVG (BL-187, Spec 20 §1.10 / §1.9). Reine Funktion
// `BiographyPoint[] → SVG-String` — kein DOM, keine externe Ressource (Kacheln): damit
// EIN Renderweg für die Live-Lens (inline eingebettet, offline-tauglich) UND den
// HTML-Download (inline). v9-Vereinfachung ggü. v8 (dort Leaflet + Canvas→PNG-Snapshot,
// `legacy-v8/ui-story.js::_initStoryMap`/`_captureMapSnapshot`): eine Vektorgrafik statt
// Rasterung, in beiden Ausgaben identisch.
//
// Feste Farben (kein CSS-Var) — die Karte ist eine Grafik, die im hellen Druck-HTML wie in
// der dunklen App gleich lesbar sein soll; die v8-Export-Karte macht es ebenso.
import type { BiographyPoint } from '../map/map-model';

const VIEW_W = 600;
const VIEW_H = 380;
const PAD = 34;

const COL_LINE = '#c8a24a';
const COL_BG = '#eef3f6';
const COL_BORDER = '#c0a878';
const COL_TEXT = '#3a2810';

/** Marker-Farbe nach Rolle (Orakel `_initStoryMap`: Geburt/Taufe grün, Tod/Begräbnis rot,
 *  Heirat blau, sonst gold). */
function roleColor(role: string): string {
  if (/geburt|tauf|bapt|chr/i.test(role)) return '#3a8a3a';
  if (/tod|beerd|begr|buri|deat/i.test(role)) return '#b03030';
  if (/heirat|ehe|marr/i.test(role)) return '#3060b0';
  return COL_LINE;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}

interface Projected {
  x: number;
  y: number;
  pt: BiographyPoint;
}

/**
 * Projiziert die Punkte äquidistant (mit cos-Breitenkorrektur) in die viewBox, auf die
 * Bounding-Box skaliert + zentriert. Bei nur einem Punkt / Null-Spanne: mittig platziert.
 */
function projectAll(points: readonly BiographyPoint[]): Projected[] {
  const lats = points.map((p) => p.lat);
  const longs = points.map((p) => p.long);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLong = Math.min(...longs);
  const maxLong = Math.max(...longs);
  const midLat = (minLat + maxLat) / 2;
  const cos = Math.max(0.1, Math.cos((midLat * Math.PI) / 180));

  const spanX = (maxLong - minLong) * cos;
  const spanY = maxLat - minLat;
  const innerW = VIEW_W - 2 * PAD;
  const innerH = VIEW_H - 2 * PAD;
  // Einheitlicher Maßstab (aspect-preserving); Fallback-Zoom, wenn die Spanne ~0 ist.
  const scale = spanX <= 1e-9 && spanY <= 1e-9 ? 1 : Math.min(spanX > 0 ? innerW / spanX : Infinity, spanY > 0 ? innerH / spanY : Infinity);
  const drawW = spanX * scale;
  const drawH = spanY * scale;
  const offX = PAD + (innerW - drawW) / 2;
  const offY = PAD + (innerH - drawH) / 2;

  return points.map((pt) => ({
    // Bei Null-Spanne (ein Punkt oder identische Koordinaten) mittig zentrieren — sonst
    // landet der Marker am Rand (offX enthält bereits die halbe Innenbreite).
    x: spanX > 0 ? offX + (pt.long - minLong) * cos * scale : VIEW_W / 2,
    y: spanY > 0 ? offY + (maxLat - pt.lat) * scale : VIEW_H / 2,
    pt,
  }));
}

/**
 * Baut die Lebensweg-Karte als SVG-String. Leerer String, wenn keine Geo-Stationen
 * vorliegen (dann rendert der Aufrufer keine Karte).
 */
export function buildStoryMapSvg(points: readonly BiographyPoint[]): string {
  if (!points.length) return '';
  const proj = projectAll(points);

  const path =
    proj.length > 1
      ? `<polyline points="${proj.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" fill="none" stroke="${COL_LINE}" stroke-width="2.5" stroke-dasharray="6 5" stroke-linejoin="round" opacity="0.85"/>`
      : '';

  const markers = proj
    .map((p, i) => {
      const c = roleColor(p.pt.role);
      const label = [p.pt.role, p.pt.title].filter(Boolean).join(': ');
      // Nummerierte Station + Titel als kleines Label rechts/über dem Punkt.
      const labelText = p.pt.title ? `<text x="${(p.x + 8).toFixed(1)}" y="${(p.y - 6).toFixed(1)}" font-size="11" fill="${COL_TEXT}" font-family="Georgia, serif">${esc(p.pt.title)}</text>` : '';
      return (
        `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="6" fill="${c}" stroke="#fff" stroke-width="1.5"><title>${esc(label)}</title></circle>` +
        `<text x="${p.x.toFixed(1)}" y="${(p.y + 3.5).toFixed(1)}" font-size="8" fill="#fff" text-anchor="middle" font-family="Georgia, serif">${i + 1}</text>` +
        labelText
      );
    })
    .join('');

  return `<svg viewBox="0 0 ${VIEW_W} ${VIEW_H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Lebensweg-Karte" class="story-map-svg" style="width:100%;height:auto;max-height:340px;background:${COL_BG};border:1px solid ${COL_BORDER};border-radius:6px">` +
    path +
    markers +
    `</svg>`;
}

/**
 * Hängt die Lebensweg-Karte in `container` ein (Insel-Muster, Spec 02 §5): die reaktive
 * Schale ruft nur diese Funktion; die DOM-Berührung (`innerHTML`) lebt hier in der `.ts`-
 * Insel, nicht in der `.svelte`-Komponente (svelte/no-dom-manipulating). Leere Punktliste
 * → leerer Container.
 */
export function mountStoryMap(container: HTMLElement, points: readonly BiographyPoint[]): void {
  container.innerHTML = buildStoryMapSvg(points);
}
