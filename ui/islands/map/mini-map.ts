// ui/islands/map/mini-map.ts — Mini-Karte (BL-214, ADR-v9-147): der gebündelte
// VEKTOR-Renderer für den Report UND die App-offline-Verortung. Reine Zeichenfunktion
// `Ausschnitt + Punkt → SVG-String` — kein DOM, kein Netz, keine Wall-Clock
// (INV-ARCH-1, TST-3, deterministisch goldfile-testbar). Self-contained (feste Palette
// als Inline-Attribute, keine CSS-Variablen, keine externe Ressource) → im
// Report-HTML ohne App-Stylesheet identisch (Spec 20 §4, LP-8).
//
// Anders als der frühere Welt-Locator (ADR-v9-145) zeichnet die Karte jetzt einen
// KONTEXT-Ausschnitt (`fitMiniMapBounds`, ADR-v9-147 Punkt 1) auf einer regionalen
// Vektor-Grundkarte (`region-geo.ts`: Landflächen/Küste/Landesgrenzen, deutsche
// Bundesland-Grenzen, große Flüsse). Die App-ONLINE-Steckbriefkarte nutzt stattdessen
// echte Kacheln (`mini-leaflet.ts`) — dieselbe `fitMiniMapBounds`-Box (INV-UI-4).
//
// Wirkungs-Ehrlichkeit (ADR-v9-147): am Ort/Regional-Zoom trägt die Grundkarte
// (Grenzen/Küste/Fluss), am Hof/Dorf-Zoom (~10 km) zeigt sie keine Details — dort ist
// die Karte der Positions-Rahmen (Marker + Kontext-Punkte + Maßstab), online retten
// die Kacheln.
import { REGION_GEO } from './region-geo';
import { MINI_MAP_W, MINI_MAP_H, type MiniMapBounds, type LatLong } from './mini-map-bounds';

/** Feste, kontextunabhängige Karten-Palette (self-contained — keine CSS-Variablen,
 *  damit die Mini-Karte im Report-HTML ohne App-Stylesheet identisch aussieht). */
const OCEAN = '#24303f';
const LAND = '#3c5a4d';
const LAND_STROKE = '#2b4238'; // Küste + Landesgrenzen (Kanten der Länder-Polygone)
const STATE_BORDER = '#ffffff33'; // deutsche Bundesland-Grenzen, dezent
const RIVER = '#4a7ba6';
const MARKER = '#f0b429';
const MARKER_RING = '#ffffff';
const HALO = '#f0b42955';
const CONTEXT_DOT = '#f0b42999'; // Dorf/Geschwisterhöfe (Hof-Kontext), gedämpft
const LABEL_BG = '#0f1720cc';
const LABEL_FG = '#e6edf3';
const SCALE_FG = '#e6edf3';

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

function cosLat(latDeg: number): number {
  return Math.max(0.1, Math.cos((latDeg * Math.PI) / 180));
}

type Pt = [number, number];

/** Sutherland–Hodgman: Polygon in Pixelraum an den (leicht gepolsterten) viewBox
 *  clippen — hält den SVG-String klein (nur Sichtbares) und lässt bei engem Zoom
 *  fast alles wegfallen (ADR-v9-147 „am Hof/Dorf-Zoom zeigt die Grundkarte nichts"). */
function clipPolygonPx(ring: Pt[], w: number, h: number, pad: number): Pt[] {
  const [minx, miny, maxx, maxy] = [-pad, -pad, w + pad, h + pad];
  const edge = (pts: Pt[], inside: (p: Pt) => boolean, cut: (a: Pt, b: Pt) => Pt): Pt[] => {
    const out: Pt[] = [];
    for (let i = 0; i < pts.length; i++) {
      const cur = pts[i];
      const prev = pts[(i + pts.length - 1) % pts.length];
      const ci = inside(cur);
      const pi = inside(prev);
      if (ci) {
        if (!pi) out.push(cut(prev, cur));
        out.push(cur);
      } else if (pi) {
        out.push(cut(prev, cur));
      }
    }
    return out;
  };
  let p = ring;
  p = edge(p, (q) => q[0] >= minx, (a, b) => [minx, a[1] + ((minx - a[0]) / (b[0] - a[0])) * (b[1] - a[1])]);
  if (!p.length) return [];
  p = edge(p, (q) => q[0] <= maxx, (a, b) => [maxx, a[1] + ((maxx - a[0]) / (b[0] - a[0])) * (b[1] - a[1])]);
  if (!p.length) return [];
  p = edge(p, (q) => q[1] >= miny, (a, b) => [a[0] + ((miny - a[1]) / (b[1] - a[1])) * (b[0] - a[0]), miny]);
  if (!p.length) return [];
  p = edge(p, (q) => q[1] <= maxy, (a, b) => [a[0] + ((maxy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]), maxy]);
  return p;
}

/** Polylinie in Pixelraum an den viewBox clippen → sichtbare Teilstücke (ohne die
 *  Rechteck-Kanten, die ein Polygon-Clip erzeugen würde — für Grenz-/Fluss-LINIEN). */
function clipPolylinePx(line: Pt[], w: number, h: number, pad: number): Pt[][] {
  const inside = (p: Pt) => p[0] >= -pad && p[0] <= w + pad && p[1] >= -pad && p[1] <= h + pad;
  const out: Pt[][] = [];
  let cur: Pt[] = [];
  for (const pt of line) {
    if (inside(pt)) cur.push(pt);
    else {
      if (cur.length > 1) out.push(cur);
      cur = [];
    }
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

/** Nächste „runde" Zahl (1/2/5·10ⁿ) ≤·nahe dem Zielwert — für den Maßstabsbalken. */
function niceStep(v: number): number {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  const n = f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10;
  return n * p;
}

export interface MiniMapOptions {
  lat: number;
  long: number;
  /** Anzuzeigender Ausschnitt (aus `fitMiniMapBounds`, ADR-v9-147 Punkt 1). */
  bounds: MiniMapBounds;
  /** Zugänglicher Name / Tooltip der Karte (z. B. der Ortsname). Wird maskiert. */
  label?: string;
  /** Zusätzliche, gedämpfte Punkte (Dorf + Geschwisterhöfe im Hof-Kontext). */
  contextPoints?: LatLong[];
  /** Koordinaten-Label einblenden (unten links). Default true. */
  showCoords?: boolean;
  /** Maßstabsbalken einblenden (unten rechts). Default true. */
  showScale?: boolean;
}

/**
 * Rendert die Mini-Karte als in sich geschlossenen SVG-String: regionale Vektor-
 * Grundkarte im gegebenen Ausschnitt, Kontext-Punkte, Marker, Maßstab und Koordinaten-
 * Label. Reine Funktion — gleiche Eingabe, gleiche Bytes (TST-3).
 */
export function renderMiniMapSvg(opts: MiniMapOptions): string {
  const { lat, long, bounds, label, contextPoints = [], showCoords = true, showScale = true } = opts;
  const { minLat, maxLat, minLong, maxLong } = bounds;
  const lonRange = maxLong - minLong || 1e-9;
  const latRange = maxLat - minLat || 1e-9;

  // Lineare long→x / lat→y-Abbildung — bei aspektkorrekter Box (fitMiniMapBounds)
  // verzerrungsfrei (der cos-Faktor steckt in der Box).
  const px = (lng: number) => ((lng - minLong) / lonRange) * MINI_MAP_W;
  const py = (la: number) => ((maxLat - la) / latRange) * MINI_MAP_H;
  const f1 = (n: number) => n.toFixed(1);
  const PAD = 8; // Pixel-Rand: Kanten-Strokes voll rendern, ohne Off-Screen-Ballast
  const ptsStr = (pts: Pt[]) => pts.map(([x, y]) => `${f1(x)},${f1(y)}`).join(' ');
  const proj = (ring: number[][]): Pt[] => ring.map(([lng, la]) => [px(lng), py(la)]);

  // Landflächen (gefüllt): Polygon-Clip → nur der sichtbare Ausschnitt.
  const land = REGION_GEO.land
    .map((ring) => clipPolygonPx(proj(ring), MINI_MAP_W, MINI_MAP_H, PAD))
    .filter((p) => p.length >= 3)
    .map((p) => `<polygon points="${ptsStr(p)}" fill="${LAND}" stroke="${LAND_STROKE}" stroke-width="1" />`)
    .join('');
  // Bundesland-Grenzen + Flüsse (Linien): Polylinien-Clip → keine falschen Kanten am Rand.
  const states = REGION_GEO.states
    .flatMap((ring) => {
      const pr = proj(ring);
      return clipPolylinePx([...pr, pr[0]], MINI_MAP_W, MINI_MAP_H, PAD); // Ring schließen
    })
    .map((seg) => `<polyline points="${ptsStr(seg)}" fill="none" stroke="${STATE_BORDER}" stroke-width="1" />`)
    .join('');
  const rivers = REGION_GEO.rivers
    .flatMap((line) => clipPolylinePx(proj(line), MINI_MAP_W, MINI_MAP_H, PAD))
    .map((seg) => `<polyline points="${ptsStr(seg)}" fill="none" stroke="${RIVER}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />`)
    .join('');

  // Kontext-Punkte (Dorf/Geschwisterhöfe) gedämpft, VOR dem Hauptmarker.
  const context = contextPoints
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.long))
    .map((p) => `<circle cx="${f1(px(p.long))}" cy="${f1(py(p.lat))}" r="7" fill="${CONTEXT_DOT}" />`)
    .join('');

  const mx = px(long);
  const my = py(lat);
  const marker =
    `<circle cx="${f1(mx)}" cy="${f1(my)}" r="24" fill="${HALO}" />` +
    `<circle cx="${f1(mx)}" cy="${f1(my)}" r="11" fill="${MARKER}" stroke="${MARKER_RING}" stroke-width="3" />`;

  // Maßstabsbalken: nächste runde Distanz nahe ~25 % der Kartenbreite.
  let scale = '';
  if (showScale) {
    const kmPerDegLong = 111.32 * cosLat((minLat + maxLat) / 2);
    const totalKm = lonRange * kmPerDegLong;
    const niceKm = niceStep(totalKm * 0.25);
    const barW = (niceKm / totalKm) * MINI_MAP_W;
    const barX = MINI_MAP_W - barW - 20;
    const barY = MINI_MAP_H - 24;
    const text = niceKm >= 1 ? `${niceKm} km` : `${Math.round(niceKm * 1000)} m`;
    scale =
      `<g stroke="${SCALE_FG}" stroke-width="3" fill="none">` +
      `<line x1="${f1(barX)}" y1="${barY}" x2="${f1(barX + barW)}" y2="${barY}" />` +
      `<line x1="${f1(barX)}" y1="${barY - 6}" x2="${f1(barX)}" y2="${barY + 6}" />` +
      `<line x1="${f1(barX + barW)}" y1="${barY - 6}" x2="${f1(barX + barW)}" y2="${barY + 6}" />` +
      `</g>` +
      `<text x="${f1(barX + barW / 2)}" y="${barY - 12}" fill="${SCALE_FG}" font-family="system-ui, sans-serif" font-size="20" text-anchor="middle">${text}</text>`;
  }

  let coords = '';
  if (showCoords) {
    const text = formatLatLong(lat, long);
    const w = Math.max(150, text.length * 13 + 24);
    coords =
      `<rect x="10" y="${MINI_MAP_H - 46}" width="${w}" height="34" rx="6" fill="${LABEL_BG}" />` +
      `<text x="22" y="${MINI_MAP_H - 23}" fill="${LABEL_FG}" font-family="system-ui, sans-serif" font-size="22">${escXml(text)}</text>`;
  }

  const aria = label
    ? escXml(`Karte: ${label} (${formatLatLong(lat, long)})`)
    : escXml(`Karte: ${formatLatLong(lat, long)}`);

  return (
    `<svg viewBox="0 0 ${MINI_MAP_W} ${MINI_MAP_H}" preserveAspectRatio="xMidYMid meet" ` +
    `class="mini-map__svg" role="img" aria-label="${aria}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect x="0" y="0" width="${MINI_MAP_W}" height="${MINI_MAP_H}" fill="${OCEAN}" />` +
    land +
    rivers +
    states +
    context +
    marker +
    scale +
    coords +
    `</svg>`
  );
}
