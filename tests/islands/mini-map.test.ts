// tests/islands/mini-map.test.ts — Mini-Karte (BL-214): reiner Vektor-Renderer, deshalb
// Unit- statt Component-Test (TST-5). Deterministisch (TST-3): gleiche Eingabe → gleiche
// Bytes, keine Wall-Clock, kein DOM, kein Netz.
import { describe, expect, it } from 'vitest';
import { renderMiniMapSvg, formatLatLong } from '../../ui/islands/map/mini-map';
import { fitMiniMapBounds } from '../../ui/islands/map/mini-map-bounds';

const ortBounds = fitMiniMapBounds({ kind: 'ort', lat: 52.2, long: 7.2 });

describe('formatLatLong (BL-214)', () => {
  it('formatiert Nordost deutsch (N/O)', () => {
    expect(formatLatLong(52.207, 7.189)).toBe('52.207° N, 7.189° O');
  });
  it('formatiert Südwest deutsch (S/W)', () => {
    expect(formatLatLong(-33.45, -70.66)).toBe('33.450° S, 70.660° W');
  });
});

describe('renderMiniMapSvg (BL-214)', () => {
  it('liefert ein self-contained SVG (kein externer Verweis, keine CSS-Variable)', () => {
    const svg = renderMiniMapSvg({ lat: 52.2, long: 7.2, bounds: ortBounds, label: 'Ochtrup' });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).not.toContain('var(--'); // keine App-CSS-Abhängigkeit (Report-tauglich)
    // Einziges `http` ist der SVG-Namespace — keine externe/geladene Ressource (Spec §4).
    expect(svg).not.toMatch(/(href|src|url\()/);
    expect(svg).not.toMatch(/https:\/\//);
  });

  it('zeichnet die regionale Vektor-Grundkarte (Landflächen) plus Marker + Koordinaten', () => {
    const svg = renderMiniMapSvg({ lat: 52.2, long: 7.2, bounds: ortBounds });
    expect(svg).toContain('<polygon'); // region-geo Landflächen/Grenzen
    expect(svg).toContain('<circle'); // Marker
    expect(svg).toContain('52.200° N, 7.200° O'); // Koordinaten-Readout
  });

  it('zeichnet einen Maßstabsbalken mit runder Distanz', () => {
    const svg = renderMiniMapSvg({ lat: 52.2, long: 7.2, bounds: ortBounds });
    expect(svg).toMatch(/>\d+ (km|m)</); // z. B. „100 km"
  });

  it('projiziert den Punkt in die Mitte des viewBox, wenn er im Box-Zentrum liegt', () => {
    const svg = renderMiniMapSvg({ lat: 52.2, long: 7.2, bounds: ortBounds });
    // Der Hauptmarker (r=11) sitzt am Box-Zentrum → ~ (500, 260) im 1000×520-viewBox.
    const m = svg.match(/<circle cx="([\d.]+)" cy="([\d.]+)" r="11"/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeCloseTo(500, 0);
    expect(Number(m![2])).toBeCloseTo(260, 0);
  });

  it('zeichnet Kontext-Punkte (Dorf/Geschwisterhöfe)', () => {
    const withCtx = renderMiniMapSvg({
      lat: 52.2,
      long: 7.2,
      bounds: ortBounds,
      contextPoints: [{ lat: 52.25, long: 7.25 }],
    });
    const without = renderMiniMapSvg({ lat: 52.2, long: 7.2, bounds: ortBounds });
    expect((withCtx.match(/<circle/g) ?? []).length).toBeGreaterThan((without.match(/<circle/g) ?? []).length);
  });

  it('maskiert den Ortsnamen im aria-label (kein Markup-Durchgriff)', () => {
    const svg = renderMiniMapSvg({ lat: 1, long: 1, bounds: ortBounds, label: 'A <b>&' });
    expect(svg).toContain('aria-label="Karte: A &lt;b&gt;&amp;');
    expect(svg).not.toContain('<b>');
  });

  it('kann Koordinaten- und Maßstabs-Label unterdrücken', () => {
    const svg = renderMiniMapSvg({ lat: 52.2, long: 7.2, bounds: ortBounds, showCoords: false, showScale: false });
    expect(svg).not.toMatch(/<text[^>]*>52\.200° N/); // kein sichtbarer Koordinaten-Streifen
    expect(svg).not.toMatch(/>\d+ (km|m)</); // kein Maßstab
    expect(svg).toContain('aria-label="Karte: 52.200° N, 7.200° O"'); // aria trägt sie weiter
  });

  it('ist deterministisch (gleiche Eingabe → gleiche Bytes)', () => {
    const b = fitMiniMapBounds({ kind: 'ort', lat: 48.137, long: 11.575 });
    const a1 = renderMiniMapSvg({ lat: 48.137, long: 11.575, bounds: b, label: 'München' });
    const a2 = renderMiniMapSvg({ lat: 48.137, long: 11.575, bounds: b, label: 'München' });
    expect(a1).toBe(a2);
  });
});
