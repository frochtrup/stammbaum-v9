// tools/regiongeo/build-region-geo.mjs — erzeugt die gebündelte, regionale Vektor-
// Grundkarte für die Mini-Karte (BL-214, ADR-v9-147): `ui/islands/map/region-geo.ts`.
//
// WARUM ES DAS GIBT: Der Report + die App-offline-Mini-Karte brauchen eine
// self-contained, deterministische, netz-freie Grundkarte (kein Kachel-Server, LP-8,
// Spec 20 §4). Diese Datei lädt einmalig öffentlich verfügbares Natural-Earth-Material
// (Public Domain), schneidet es auf Mitteleuropa zu (Sutherland–Hodgman-Clip),
// vereinfacht es (Douglas–Peucker) und rundet die Koordinaten — Ergebnis ist ein
// kompaktes TS-Datenmodul (~40 KB), das in den Build wandert. Nur DAS Ergebnis wird
// eingecheckt; die 40-MB-Quelldateien bleiben im (gitignorierten) Cache.
//
// Aufruf:  npm run geo:build
//
// Quellen (Natural Earth, Public Domain — https://www.naturalearthdata.com/about/terms-of-use/):
//   - ne_50m_admin_0_countries         → Landflächen (Füllung) + Küste + Landesgrenzen
//   - ne_10m_admin_1_states_provinces  → deutsche Bundesland-Grenzen (auf DE gefiltert)
//   - ne_50m_rivers_lake_centerlines   → große Flüsse (scalerank ≤ 6)
// bezogen aus dem nvkelso/natural-earth-vector-Repo (GeoJSON-Spiegel).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, '.cache'); // gitignoriert (tools/regiongeo/.cache)
const OUT = path.join(HERE, '..', '..', 'ui', 'islands', 'map', 'region-geo.ts');

// [minLng, minLat, maxLng, maxLat] — Mitteleuropa: DE + Nachbarländer großzügig.
const BBOX = [2.0, 44.5, 20.0, 57.0];
const LAND_TOL = 0.02; // Douglas–Peucker-Toleranz in Grad (~2 km)
const STATE_TOL = 0.035;
const RIVER_TOL = 0.025;
const MIN_AREA = 0.003; // Ring-BBox-Fläche (Grad²) — winzige Inseln/Fragmente verwerfen
const RIVER_MAX_SCALERANK = 6; // nur große Flüsse
const DEC = 3; // Nachkommastellen (~110 m) — reicht für den regionalen Zoom

const BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
const SOURCES = {
  countries: 'ne_50m_admin_0_countries.geojson',
  states: 'ne_10m_admin_1_states_provinces.geojson',
  rivers: 'ne_50m_rivers_lake_centerlines.geojson',
};

async function fetchCached(name) {
  fs.mkdirSync(CACHE, { recursive: true });
  const dest = path.join(CACHE, name);
  if (fs.existsSync(dest)) return dest;
  process.stderr.write(`  ↓ ${name} …\n`);
  const res = await fetch(`${BASE}/${name}`);
  if (!res.ok) throw new Error(`Download fehlgeschlagen (${res.status}): ${name}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

// ---- Sutherland–Hodgman: Polygon-Ring am Rechteck clippen ----
function clipPolygon(ring, [minx, miny, maxx, maxy]) {
  const edge = (pts, inside, cut) => {
    const out = [];
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
  p = edge(p, (q) => q[0] >= minx, (a, b) => { const t = (minx - a[0]) / (b[0] - a[0]); return [minx, a[1] + t * (b[1] - a[1])]; });
  if (!p.length) return [];
  p = edge(p, (q) => q[0] <= maxx, (a, b) => { const t = (maxx - a[0]) / (b[0] - a[0]); return [maxx, a[1] + t * (b[1] - a[1])]; });
  if (!p.length) return [];
  p = edge(p, (q) => q[1] >= miny, (a, b) => { const t = (miny - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), miny]; });
  if (!p.length) return [];
  p = edge(p, (q) => q[1] <= maxy, (a, b) => { const t = (maxy - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), maxy]; });
  return p;
}

// ---- Polylinie in bbox-interne Teilstücke zerlegen ----
function clipLine(line, [minx, miny, maxx, maxy]) {
  const inside = (p) => p[0] >= minx && p[0] <= maxx && p[1] >= miny && p[1] <= maxy;
  const out = [];
  let cur = [];
  for (const pt of line) {
    if (inside(pt)) cur.push(pt);
    else { if (cur.length > 1) out.push(cur); cur = []; }
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

// ---- Douglas–Peucker ----
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const [s, e] = stack.pop();
    let maxD = 0;
    let idx = -1;
    const [x1, y1] = pts[s];
    const [x2, y2] = pts[e];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1e-12;
    for (let i = s + 1; i < e; i++) {
      const [px, py] = pts[i];
      const t = ((px - x1) * dx + (py - y1) * dy) / len2;
      const cx = x1 + t * dx;
      const cy = y1 + t * dy;
      const d = (px - cx) ** 2 + (py - cy) ** 2;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx !== -1 && maxD > t2) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const round = (n) => Math.round(n * 10 ** DEC) / 10 ** DEC;
const roundRing = (ring) => ring.map(([a, b]) => [round(a), round(b)]);

function outerRings(geom) {
  if (geom.type === 'Polygon') return [geom.coordinates[0]];
  if (geom.type === 'MultiPolygon') return geom.coordinates.map((poly) => poly[0]);
  return [];
}
function linesOf(geom) {
  if (geom.type === 'LineString') return [geom.coordinates];
  if (geom.type === 'MultiLineString') return geom.coordinates;
  return [];
}
function bboxArea(ring) {
  let mnx = Infinity;
  let mny = Infinity;
  let mxx = -Infinity;
  let mxy = -Infinity;
  for (const [x, y] of ring) {
    if (x < mnx) mnx = x;
    if (x > mxx) mxx = x;
    if (y < mny) mny = y;
    if (y > mxy) mxy = y;
  }
  return (mxx - mnx) * (mxy - mny);
}

function ringsFromPolygons(features, tol, filter) {
  const out = [];
  for (const f of features) {
    if (filter && !filter(f)) continue;
    for (const ring of outerRings(f.geometry)) {
      const clipped = clipPolygon(ring, BBOX);
      if (clipped.length < 4) continue;
      if (bboxArea(clipped) < MIN_AREA) continue;
      const simp = roundRing(simplify(clipped, tol));
      if (simp.length >= 4) out.push(simp);
    }
  }
  return out;
}

async function main() {
  process.stderr.write('region-geo: Quellen laden …\n');
  const [cf, sf, rf] = await Promise.all([
    fetchCached(SOURCES.countries),
    fetchCached(SOURCES.states),
    fetchCached(SOURCES.rivers),
  ]);
  const countries = JSON.parse(fs.readFileSync(cf, 'utf8'));
  const states = JSON.parse(fs.readFileSync(sf, 'utf8'));
  const rivers = JSON.parse(fs.readFileSync(rf, 'utf8'));

  process.stderr.write('region-geo: verarbeiten …\n');
  const land = ringsFromPolygons(countries.features, LAND_TOL);
  const stateRings = ringsFromPolygons(states.features, STATE_TOL, (f) => f.properties.iso_a2 === 'DE');
  const riverLines = [];
  for (const f of rivers.features) {
    if ((f.properties.scalerank ?? 99) > RIVER_MAX_SCALERANK) continue;
    for (const line of linesOf(f.geometry)) {
      for (const seg of clipLine(line, BBOX)) {
        const simp = roundRing(simplify(seg, RIVER_TOL));
        if (simp.length >= 2) riverLines.push(simp);
      }
    }
  }

  const countPts = (arr) => arr.reduce((s, r) => s + r.length, 0);
  const fmt = (rings) => '[' + rings.map((r) => JSON.stringify(r)).join(',\n    ') + ']';
  const body = `// GENERIERT von tools/regiongeo/build-region-geo.mjs — NICHT VON HAND BEARBEITEN.
// Neu erzeugen: \`npm run geo:build\`. Quelle: Natural Earth (Public Domain,
// https://www.naturalearthdata.com/about/terms-of-use/) — ne_50m_admin_0_countries,
// ne_10m_admin_1_states_provinces (auf DE gefiltert), ne_50m_rivers_lake_centerlines.
//
// Regionale Vektor-Grundkarte der Mini-Karte (BL-214, ADR-v9-147): Landflächen +
// Küste + Landesgrenzen (Länder-Polygone), deutsche Bundesland-Grenzen, große Flüsse.
// Koordinaten sind [lng, lat], auf Mitteleuropa zugeschnitten und vereinfacht — grob
// genug für den regionalen Zoom (ADR-v9-147 „Wirkungs-Ehrlichkeit"), kein Straßen-
// niveau. Self-contained, deterministisch, netz-frei (TST-3, report-tauglich, LP-8).

/** [minLng, minLat, maxLng, maxLat] — abgedeckter Ausschnitt (Mitteleuropa). */
export type Bbox4 = readonly [number, number, number, number];

export interface RegionGeo {
  bbox: Bbox4;
  /** Gefüllte Landflächen (nur äußere Ringe), je Punkt [lng, lat]. */
  land: number[][][];
  /** Deutsche Bundesland-Grenzringe (gestrichelt/dünn gezeichnet, keine Füllung). */
  states: number[][][];
  /** Große Flüsse als Polylinien. */
  rivers: number[][][];
}

export const REGION_GEO: RegionGeo = {
  bbox: ${JSON.stringify(BBOX)},
  land: ${fmt(land)},
  states: ${fmt(stateRings)},
  rivers: ${fmt(riverLines)},
};
`;
  fs.writeFileSync(OUT, body);
  const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
  process.stderr.write(
    `region-geo: geschrieben → ${path.relative(path.join(HERE, '..', '..'), OUT)}\n` +
      `  land ${land.length} Ringe/${countPts(land)} Pkt · ` +
      `states ${stateRings.length}/${countPts(stateRings)} · ` +
      `rivers ${riverLines.length}/${countPts(riverLines)} · Datei ${kb} KB\n`,
  );
}

main().catch((e) => { process.stderr.write(String(e?.stack || e) + '\n'); process.exit(1); });
