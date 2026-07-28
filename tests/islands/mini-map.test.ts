// tests/islands/mini-map.test.ts — Mini-Karte (BL-09): reiner SVG-Renderer, deshalb
// Unit- statt Component-Test (TST-5). Deterministisch (TST-3): gleiche Eingabe → gleiche
// Bytes, keine Wall-Clock, kein DOM, kein Netz.
import { describe, expect, it } from 'vitest';
import { renderMiniMapSvg, formatLatLong } from '../../ui/islands/map/mini-map';

describe('formatLatLong (BL-09)', () => {
  it('formatiert Nordost deutsch (N/O)', () => {
    expect(formatLatLong(52.207, 7.189)).toBe('52.207° N, 7.189° O');
  });
  it('formatiert Südwest deutsch (S/W)', () => {
    expect(formatLatLong(-33.45, -70.66)).toBe('33.450° S, 70.660° W');
  });
});

describe('renderMiniMapSvg (BL-09)', () => {
  it('liefert ein self-contained SVG (kein externer Verweis, keine CSS-Variable)', () => {
    const svg = renderMiniMapSvg({ lat: 52.2, long: 7.2, label: 'Ochtrup' });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).not.toContain('var(--'); // keine App-CSS-Abhängigkeit (Report-tauglich)
    // Einziges `http` ist der SVG-Namespace — keine externe/geladene Ressource (Spec §4).
    expect(svg).not.toMatch(/(href|src|url\()/);
    expect(svg).not.toMatch(/https:\/\//);
  });

  it('trägt einen Marker und das Koordinaten-Label', () => {
    const svg = renderMiniMapSvg({ lat: 52.2, long: 7.2 });
    expect(svg).toContain('<circle'); // Marker
    expect(svg).toContain('52.200° N, 7.200° O'); // Koordinaten-Readout
  });

  it('maskiert den Ortsnamen im aria-label (kein Markup-Durchgriff)', () => {
    const svg = renderMiniMapSvg({ lat: 1, long: 1, label: 'A <b>&' });
    expect(svg).toContain('aria-label="Karte: A &lt;b&gt;&amp;');
    expect(svg).not.toContain('<b>');
  });

  it('kann das Koordinaten-Label unterdrücken (showCoords=false)', () => {
    const svg = renderMiniMapSvg({ lat: 52.2, long: 7.2, showCoords: false });
    // Sichtbarer Text-Streifen entfällt; das aria-label trägt die Koordinate weiterhin.
    expect(svg).not.toContain('<text');
    expect(svg).toContain('aria-label="Karte: 52.200° N, 7.200° O"');
  });

  it('ist deterministisch (gleiche Eingabe → gleiche Bytes)', () => {
    const a = renderMiniMapSvg({ lat: 48.137, long: 11.575, label: 'München' });
    const b = renderMiniMapSvg({ lat: 48.137, long: 11.575, label: 'München' });
    expect(a).toBe(b);
  });
});
