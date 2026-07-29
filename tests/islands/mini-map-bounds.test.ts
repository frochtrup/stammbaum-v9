// tests/islands/mini-map-bounds.test.ts — Ausschnitts-Berechnung der Mini-Karte
// (BL-214, ADR-v9-147). Reine Geometrie → Unit-Test (TST-5), deterministisch (TST-3).
import { describe, expect, it } from 'vitest';
import {
  fitMiniMapBounds,
  MINI_MAP_W,
  MINI_MAP_H,
  type MiniMapBounds,
} from '../../ui/islands/map/mini-map-bounds';

const TARGET_ASPECT = MINI_MAP_W / MINI_MAP_H;
const cosLat = (lat: number) => Math.cos((lat * Math.PI) / 180);

/** Projizierter Aspekt (Breite·cos / Höhe) — sollte dem viewBox-Aspekt entsprechen. */
function projectedAspect(b: MiniMapBounds): number {
  const midLat = (b.minLat + b.maxLat) / 2;
  return ((b.maxLong - b.minLong) * cosLat(midLat)) / (b.maxLat - b.minLat);
}
function contains(b: MiniMapBounds, lat: number, long: number): boolean {
  return lat >= b.minLat && lat <= b.maxLat && long >= b.minLong && long <= b.maxLong;
}

describe('fitMiniMapBounds — Ort (fester Regional-Zoom)', () => {
  it('zentriert den Ort und liefert einen regionalen Ausschnitt, der noch verortet', () => {
    const b = fitMiniMapBounds({ kind: 'ort', lat: 52.2, long: 7.19 });
    expect((b.minLat + b.maxLat) / 2).toBeCloseTo(52.2, 6);
    expect((b.minLong + b.maxLong) / 2).toBeCloseTo(7.19, 6);
    // Band statt Fixwert — die Zahl darf sich bewegen, die ABSICHT nicht: groß genug für
    // regionalen Kontext (Kreis + Nachbarorte), klein genug, um den Ort noch zu verorten.
    // Vormals 2.0° (222×427 km) — laut Design-Kritik 2026-07-29 „irgendwo bei Münster"
    // statt einer Verortung; jetzt 0.8° (89×171 km), gemessen an der Stelle, ab der die
    // Vektor-Grundkarte leerläuft (ADR-v9-150).
    expect(b.maxLat - b.minLat).toBeGreaterThan(0.4);
    expect(b.maxLat - b.minLat).toBeLessThan(1.2);
  });

  it('bleibt deutlich weiter als der Hof-/Dorf-Zoom (die Staffelung ist der eigentliche Punkt)', () => {
    // Diese Beziehung überlebt jede künftige Feinjustierung beider Konstanten — anders als
    // zwei unabhängig gepinnte Zahlen.
    const ort = fitMiniMapBounds({ kind: 'ort', lat: 52.2, long: 7.19 });
    const hof = fitMiniMapBounds({ kind: 'hof', lat: 52.2, long: 7.19 });
    expect(ort.maxLat - ort.minLat).toBeGreaterThan((hof.maxLat - hof.minLat) * 3);
  });

  it('ist aspektkorrekt (projizierte Breite/Höhe = viewBox-Aspekt)', () => {
    const b = fitMiniMapBounds({ kind: 'ort', lat: 52.2, long: 7.19 });
    expect(projectedAspect(b)).toBeCloseTo(TARGET_ASPECT, 3);
  });

  it('ist deterministisch', () => {
    const a = fitMiniMapBounds({ kind: 'ort', lat: 48.137, long: 11.575 });
    const b = fitMiniMapBounds({ kind: 'ort', lat: 48.137, long: 11.575 });
    expect(a).toEqual(b);
  });
});

describe('fitMiniMapBounds — Hof', () => {
  it('ohne Nachbar-Koordinaten: fester Dorf-Zoom auf den Hof (enger als Regional)', () => {
    const b = fitMiniMapBounds({ kind: 'hof', lat: 52.2, long: 7.19 });
    expect((b.minLat + b.maxLat) / 2).toBeCloseTo(52.2, 6);
    // Dorf-Zoom: ~10 km hoch, viel enger als der Ort-Regional-Zoom.
    expect(b.maxLat - b.minLat).toBeLessThan(0.2);
    expect(contains(b, 52.2, 7.19)).toBe(true);
    expect(projectedAspect(b)).toBeCloseTo(TARGET_ASPECT, 3);
  });

  it('mit Dorf + Geschwisterhöfen: fittet alle Punkte in den Ausschnitt', () => {
    const b = fitMiniMapBounds({
      kind: 'hof',
      lat: 52.20,
      long: 7.19,
      villageCoords: { lat: 52.21, long: 7.17 },
      siblingCoords: [
        { lat: 52.19, long: 7.22 },
        { lat: 52.23, long: 7.18 },
      ],
    });
    expect(contains(b, 52.20, 7.19)).toBe(true); // der Hof selbst
    expect(contains(b, 52.21, 7.17)).toBe(true); // Dorf
    expect(contains(b, 52.19, 7.22)).toBe(true); // Geschwisterhof
    expect(contains(b, 52.23, 7.18)).toBe(true); // Geschwisterhof
    // Rand: der Ausschnitt ist größer als die reine Punktespanne.
    expect(b.maxLat - b.minLat).toBeGreaterThan(52.23 - 52.19);
    expect(projectedAspect(b)).toBeCloseTo(TARGET_ASPECT, 3);
  });

  it('Dorf-Koordinate == Hof-Koordinate zählt als ein Punkt → Dorf-Zoom (kein Über-Zoom)', () => {
    const b = fitMiniMapBounds({
      kind: 'hof',
      lat: 52.2,
      long: 7.19,
      villageCoords: { lat: 52.2, long: 7.19 },
      siblingCoords: [],
    });
    expect(b.maxLat - b.minLat).toBeLessThan(0.2); // Dorf-Zoom, nicht auf 0 kollabiert
    expect(b.maxLat - b.minLat).toBeGreaterThan(0.05);
  });

  it('ignoriert nicht-endliche Nachbar-Koordinaten robust', () => {
    const b = fitMiniMapBounds({
      kind: 'hof',
      lat: 52.2,
      long: 7.19,
      villageCoords: { lat: Number.NaN, long: Number.NaN },
      siblingCoords: [{ lat: 52.25, long: 7.25 }],
    });
    expect(contains(b, 52.2, 7.19)).toBe(true);
    expect(contains(b, 52.25, 7.25)).toBe(true);
    expect(Number.isFinite(b.minLat) && Number.isFinite(b.maxLong)).toBe(true);
  });
});
