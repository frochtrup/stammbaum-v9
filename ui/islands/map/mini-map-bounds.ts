// ui/islands/map/mini-map-bounds.ts — Ausschnitts-Berechnung der Mini-Karte
// (BL-214, ADR-v9-147). Reine, DOM-/netz-freie Geometrie (INV-ARCH-1, TST-3):
// aus dem Orts-/Hof-Kontext den anzuzeigenden geografischen Ausschnitt bestimmen.
// EIN Mechanismus für alle drei Grundkarten-Wege (INV-UI-4) — der Vektor-Renderer
// (`mini-map.ts`, Report + App-offline) UND die Kachel-Mini-Karte (`mini-leaflet.ts`,
// App-online) fitten denselben Ausschnitt.
//
// ADR-v9-147 Punkt 1:
//  · Ort  → fester Regional-Zoom (kein Nachbar-Set), zentriert.
//  · Hof  → Ausschnitt über das Dorf + Geschwisterhöfe (soweit mit Koordinaten);
//           bei zu wenigen Koordinaten fester Dorf-Zoom auf den Hof selbst.
//
// Die zurückgegebene Box ist bereits AUF DEN ZIEL-ASPEKT der Mini-Karte gedehnt
// (siehe `MINI_MAP_W/H`), sodass der Vektor-Renderer sie ohne Randbalken linear in
// den viewBox abbildet — bei aspektkorrekter Box ist die lineare long→x/lat→y-
// Abbildung geografisch verzerrungsfrei (der cos(lat)-Faktor steckt in der Box).

/** Geografischer Punkt. Deckt sich strukturell mit `core/places::Coords`. */
export interface LatLong {
  lat: number;
  long: number;
}

/** Anzuzeigender Ausschnitt (Süd/West/Nord/Ost). */
export interface MiniMapBounds {
  minLat: number;
  maxLat: number;
  minLong: number;
  maxLong: number;
}

/**
 * Kontext für die Ausschnittswahl. `ort` = fester Regional-Zoom; `hof` = Ausschnitt
 * über Dorf + Geschwisterhöfe (Fallback Dorf-Zoom).
 */
export type MiniMapContext =
  | { kind: 'ort'; lat: number; long: number }
  | {
      kind: 'hof';
      lat: number;
      long: number;
      /** Koordinaten des Dorfs (villageId-PlaceObject), falls vorhanden. */
      villageCoords?: LatLong | null;
      /** Koordinaten der Geschwisterhöfe im selben Dorf (nur die mit Koordinaten). */
      siblingCoords?: LatLong[];
    };

/** viewBox-Maße der Mini-Karte — hier verankert, damit Ausschnitt (dieses Modul) und
 *  Renderer (`mini-map.ts`) über EINEN Aspekt einig sind (INV-UI-4). */
export const MINI_MAP_W = 1000;
export const MINI_MAP_H = 520;
const TARGET_ASPECT = MINI_MAP_W / MINI_MAP_H;

/** Regional-Zoom (Ort): ~2° Breite ≈ 220 km hoch — die Region um den Ort. */
const ORT_LAT_SPAN = 2.0;
/** Dorf-Zoom (Hof-Fallback / Mindestgröße): ~0.09° ≈ 10 km hoch. */
const HOF_VILLAGE_LAT_SPAN = 0.09;
/** Rand um den Hof-Cluster (Anteil der Cluster-Spanne). */
const HOF_PAD = 0.2;
/** Zwei Punkte, deren lat & long sich um weniger als das unterscheiden, gelten als
 *  identisch (≈ 11 m) — verhindert Über-Zoom, wenn Hof- und Dorf-Koordinate zusammenfallen. */
const SAME_POINT_EPS = 1e-4;

function cosLat(latDeg: number): number {
  // Untergrenze, damit die Aspekt-Rechnung nahe den Polen nicht explodiert (hier nie relevant).
  return Math.max(0.1, Math.cos((latDeg * Math.PI) / 180));
}

/** Box aus Zentrum + Breiten-Spanne; Längen-Spanne aspektkorrekt (cos-Faktor) abgeleitet. */
function centeredBox(lat: number, long: number, latSpan: number): MiniMapBounds {
  const longSpan = (TARGET_ASPECT * latSpan) / cosLat(lat);
  return {
    minLat: lat - latSpan / 2,
    maxLat: lat + latSpan / 2,
    minLong: long - longSpan / 2,
    maxLong: long + longSpan / 2,
  };
}

/** Dehnt eine Content-Box symmetrisch auf den Ziel-Aspekt (nur die zu kleine Dimension). */
function toAspect(b: MiniMapBounds): MiniMapBounds {
  const midLat = (b.minLat + b.maxLat) / 2;
  const midLong = (b.minLong + b.maxLong) / 2;
  const latSpan = b.maxLat - b.minLat;
  const projWidth = (b.maxLong - b.minLong) * cosLat(midLat); // projizierte Breite
  const curAspect = projWidth / (latSpan || 1e-9);
  if (curAspect < TARGET_ASPECT) {
    const needLong = (TARGET_ASPECT * latSpan) / cosLat(midLat);
    return { minLat: b.minLat, maxLat: b.maxLat, minLong: midLong - needLong / 2, maxLong: midLong + needLong / 2 };
  }
  const needLat = projWidth / TARGET_ASPECT;
  return { minLat: midLat - needLat / 2, maxLat: midLat + needLat / 2, minLong: b.minLong, maxLong: b.maxLong };
}

function distinctPoints(pts: LatLong[]): LatLong[] {
  const out: LatLong[] = [];
  for (const p of pts) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.long)) continue;
    if (out.some((q) => Math.abs(q.lat - p.lat) < SAME_POINT_EPS && Math.abs(q.long - p.long) < SAME_POINT_EPS)) continue;
    out.push({ lat: p.lat, long: p.long });
  }
  return out;
}

/**
 * Berechnet den Mini-Karten-Ausschnitt (ADR-v9-147 Punkt 1). Reine Funktion.
 */
export function fitMiniMapBounds(ctx: MiniMapContext): MiniMapBounds {
  if (ctx.kind === 'ort') {
    return centeredBox(ctx.lat, ctx.long, ORT_LAT_SPAN);
  }

  const points = distinctPoints([
    { lat: ctx.lat, long: ctx.long },
    ...(ctx.villageCoords ? [ctx.villageCoords] : []),
    ...(ctx.siblingCoords ?? []),
  ]);

  // Zu wenige Koordinaten → fester Dorf-Zoom auf den Hof selbst.
  if (points.length < 2) {
    return centeredBox(ctx.lat, ctx.long, HOF_VILLAGE_LAT_SPAN);
  }

  // Umschließende Box über Dorf + Geschwisterhöfe.
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLong = Infinity;
  let maxLong = -Infinity;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.long < minLong) minLong = p.long;
    if (p.long > maxLong) maxLong = p.long;
  }

  // Rand + Mindestgröße (Cluster darf nicht enger als der Dorf-Zoom werden). Die
  // Mindest-LÄNGE wird nicht separat gesetzt — bei einem vertikal schmalen Cluster
  // dehnt `toAspect` die Länge auf den Ziel-Aspekt (und umgekehrt).
  const midLat = (minLat + maxLat) / 2;
  const midLong = (minLong + maxLong) / 2;
  const latSpan = Math.max((maxLat - minLat) * (1 + 2 * HOF_PAD), HOF_VILLAGE_LAT_SPAN);
  const longSpan = (maxLong - minLong) * (1 + 2 * HOF_PAD);

  return toAspect({
    minLat: midLat - latSpan / 2,
    maxLat: midLat + latSpan / 2,
    minLong: midLong - longSpan / 2,
    maxLong: midLong + longSpan / 2,
  });
}
