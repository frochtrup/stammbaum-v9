// ui/islands/map/mini-map.ts — Mini-Karte (BL-09, Spec 20 §1.7/§1.8): ein KOMPAKTER,
// KACHELFREIER Welt-Locator für den Ort-/Hof-Steckbrief UND die Berichte (Ortsbuch,
// Hofchronik). Reine Zeichenfunktion `lat/long → SVG-String` — kein DOM, kein Netz, kein
// Wall-Clock (INV-ARCH-1, TST-3, deterministisch goldfile-testbar). Genau EIN Mechanismus
// für alle drei Verwendungen (INV-UI-4): die interaktive Karte-Lens (Leaflet-Kacheln
// online) bleibt der Ort für Exploration; die Mini-Karte ist die statische, überall — auch
// im self-contained Report-HTML (keine externe Ressource, Spec §4) — funktionierende
// Verortung „wo liegt das ungefähr auf der Welt".
//
// Weltumriss + Projektion kommen aus `svg-fallback-map.ts` (dieselbe grobe Kontinent-
// Silhouette wie die Offline-Fallback-Karte — EINE Quelle, keine zweite Umriss-Kopie).
import { CONTINENT_OUTLINES, project, VIEW_W, VIEW_H } from './svg-fallback-map';

/** Feste, kontextunabhängige Karten-Palette (self-contained: keine CSS-Variablen, damit die
 *  Mini-Karte im Report-HTML ohne App-Stylesheet identisch aussieht). Eine Karte trägt ihre
 *  eigene Farbwelt — bewusst NICHT theme-abhängig (dunkler Ozean liest sich auf hellem
 *  Report-Papier wie ein Karten-Widget, auf der dunklen App-Fläche wie eine Kachel). */
const OCEAN = '#24303f';
const LAND = '#3c5a4d';
const GRATICULE = '#ffffff22';
const MARKER = '#f0b429';
const MARKER_RING = '#ffffff';
const HALO = '#f0b42955';
const LABEL_BG = '#0f1720cc';
const LABEL_FG = '#e6edf3';

/** `< & " ` maskieren — der `label`/`title` kann Nutzertext (Ortsname) enthalten. */
function escXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Koordinate deutsch formatiert: `52.207° N, 7.189° O` (N/S, O/W). */
export function formatLatLong(lat: number, long: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = long >= 0 ? 'O' : 'W';
  return `${Math.abs(lat).toFixed(3)}° ${ns}, ${Math.abs(long).toFixed(3)}° ${ew}`;
}

export interface MiniMapOptions {
  lat: number;
  long: number;
  /** Zugänglicher Name / Tooltip der Karte (z. B. der Ortsname). Wird maskiert. */
  label?: string;
  /** Koordinaten-Label einblenden (unten links). Default true. */
  showCoords?: boolean;
}

/**
 * Rendert die Mini-Karte als in sich geschlossenen SVG-String. Marker sitzt auf der
 * äquidistanten Weltprojektion an (lat, long); ein Koordinaten-Label unten gibt die Präzision.
 * Reine Funktion — gleiche Eingabe, gleiche Bytes (TST-3).
 */
export function renderMiniMapSvg(opts: MiniMapOptions): string {
  const { lat, long, label, showCoords = true } = opts;
  const { x, y } = project(lat, long);

  const continents = CONTINENT_OUTLINES.map((outline) => {
    const pts = outline.map(([la, lo]) => {
      const p = project(la, lo);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    });
    return `<polygon points="${pts.join(' ')}" fill="${LAND}" />`;
  }).join('');

  // Graticule: Meridiane/Breitenkreise alle 30° — dezentes Karten-Raster ohne eigene Daten.
  const grat: string[] = [];
  for (let lo = -150; lo <= 150; lo += 30) {
    const a = project(90, lo);
    const b = project(-90, lo);
    grat.push(`<line x1="${a.x.toFixed(1)}" y1="0" x2="${b.x.toFixed(1)}" y2="${VIEW_H}" stroke="${GRATICULE}" stroke-width="1" />`);
  }
  for (let la = -60; la <= 60; la += 30) {
    const a = project(la, -180);
    grat.push(`<line x1="0" y1="${a.y.toFixed(1)}" x2="${VIEW_W}" y2="${a.y.toFixed(1)}" stroke="${GRATICULE}" stroke-width="1" />`);
  }

  const marker =
    `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="26" fill="${HALO}" />` +
    `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="11" fill="${MARKER}" stroke="${MARKER_RING}" stroke-width="3" />`;

  let coords = '';
  if (showCoords) {
    const text = formatLatLong(lat, long);
    // Breite grob aus Zeichenzahl (monospace-nah) — reicht für den Hintergrund-Streifen.
    const w = Math.max(150, text.length * 13 + 24);
    coords =
      `<rect x="10" y="${VIEW_H - 46}" width="${w}" height="34" rx="6" fill="${LABEL_BG}" />` +
      `<text x="22" y="${VIEW_H - 23}" fill="${LABEL_FG}" font-family="system-ui, sans-serif" font-size="22">${escXml(text)}</text>`;
  }

  const aria = label ? escXml(`Karte: ${label} (${formatLatLong(lat, long)})`) : escXml(`Karte: ${formatLatLong(lat, long)}`);

  return (
    `<svg viewBox="0 0 ${VIEW_W} ${VIEW_H}" preserveAspectRatio="xMidYMid meet" ` +
    `class="mini-map__svg" role="img" aria-label="${aria}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect x="0" y="0" width="${VIEW_W}" height="${VIEW_H}" fill="${OCEAN}" />` +
    grat.join('') +
    continents +
    marker +
    coords +
    `</svg>`
  );
}
