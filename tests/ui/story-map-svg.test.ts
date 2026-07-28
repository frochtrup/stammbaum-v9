// tests/ui/story-map-svg.test.ts — Lebensweg-Karte als reines SVG (BL-187, Spec 20 §1.10).
// Reine Funktion BiographyPoint[]→SVG-String; ein Renderweg für Live-Lens + Download.
import { describe, expect, it } from 'vitest';
import { buildStoryMapSvg } from '../../ui/islands/story/story-map-svg';
import type { BiographyPoint } from '../../ui/islands/map/map-model';

function pt(over: Partial<BiographyPoint>): BiographyPoint {
  return { placeId: null, title: '', lat: 52, long: 8, date: '', role: '', ...over };
}

describe('buildStoryMapSvg', () => {
  it('keine Punkte → leerer String (keine Karte)', () => {
    expect(buildStoryMapSvg([])).toBe('');
  });

  it('selbst-enthalten: ein <svg>, keine externe Ressource (http/src)', () => {
    const svg = buildStoryMapSvg([
      pt({ lat: 51.9, long: 8.6, role: 'Geburt', title: 'Detmold' }),
      pt({ lat: 52.0, long: 8.9, role: 'Tod', title: 'Lemgo' }),
    ]);
    expect(svg.startsWith('<svg')).toBe(true);
    // Kein externer Ressourcen-Verweis (der xmlns-Namespace ist kein Fetch, daher gezielt
    // src=/href=/<image prüfen statt „http").
    expect(svg).not.toMatch(/\bsrc=|<image|\bhref=/);
  });

  it('mehrere Stationen → Verbindungs-Polyline', () => {
    const svg = buildStoryMapSvg([
      pt({ lat: 51.9, long: 8.6, role: 'Geburt' }),
      pt({ lat: 52.0, long: 8.9, role: 'Wohnort' }),
      pt({ lat: 52.1, long: 9.0, role: 'Tod' }),
    ]);
    expect(svg).toContain('<polyline');
    // Rollen-Farbcodierung: Geburt grün, Tod rot.
    expect(svg).toContain('#3a8a3a');
    expect(svg).toContain('#b03030');
  });

  it('eine Station → Marker ohne Polyline, zentriert (kein Rand-Bug)', () => {
    const svg = buildStoryMapSvg([pt({ lat: 52, long: 8, role: 'Geburt', title: 'Ort' })]);
    expect(svg).toContain('<circle');
    expect(svg).not.toContain('<polyline');
    expect(svg).toContain('Ort');
    // viewBox 600x380 → Einzelpunkt gehört in die Mitte (300/190), nicht an den Rand.
    expect(svg).toContain('cx="300.0" cy="190.0"');
  });

  it('identische Koordinaten (Geburt=Tod am selben Ort) → zentriert, nicht am Rand', () => {
    const svg = buildStoryMapSvg([
      pt({ lat: 52, long: 7.9, role: 'Geburt' }),
      pt({ lat: 52, long: 7.9, role: 'Tod' }),
    ]);
    expect(svg).toContain('cx="300.0" cy="190.0"');
  });

  it('Ortsnamen werden HTML-escaped (Titel als <title>/Label)', () => {
    const svg = buildStoryMapSvg([pt({ lat: 52, long: 8, role: 'Geburt', title: 'A & B' })]);
    expect(svg).toContain('A &amp; B');
    expect(svg).not.toContain('A & B');
  });
});
