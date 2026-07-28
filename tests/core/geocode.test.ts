// tests/core/geocode.test.ts — reine Nominatim-Antwort-Auswertung (BL-130).
// Orakel: legacy-v8/geocoding.js. Inline-Fixtures, headless (INV-ARCH-2).
import { describe, expect, it } from 'vitest';
import {
  parseNominatimResults,
  nominatimSearchUrl,
  type NominatimResult,
} from '../../core/places/geocode';

describe('parseNominatimResults', () => {
  it('nimmt den ersten Treffer, liest Koordinaten und Typ aus der tiefsten Ebene', () => {
    const results: NominatimResult[] = [
      {
        lat: '52.2073',
        lon: '7.1845',
        address: { village: 'Ochtrup', county: 'Steinfurt', state: 'Nordrhein-Westfalen', country: 'Deutschland' },
      },
    ];
    expect(parseNominatimResults(results)).toEqual({
      lat: 52.2073,
      long: 7.1845,
      type: 'Village',
      hierarchy: [
        { title: 'Steinfurt', type: 'County' },
        { title: 'Nordrhein-Westfalen', type: 'State' },
        { title: 'Deutschland', type: 'Country' },
      ],
    });
  });

  it('leitet City/Town/Hamlet aus dem passenden address-Feld ab', () => {
    expect(parseNominatimResults([{ lat: '48.13', lon: '11.57', address: { city: 'München' } }])?.type).toBe('City');
    expect(parseNominatimResults([{ lat: '1', lon: '2', address: { town: 'Ahaus' } }])?.type).toBe('Town');
    expect(parseNominatimResults([{ lat: '1', lon: '2', address: { hamlet: 'Klein' } }])?.type).toBe('Hamlet');
  });

  it('County/State/Country als Eigenebene, wenn keine feinere existiert', () => {
    const hit = parseNominatimResults([{ lat: '51.5', lon: '9.9', address: { state: 'Niedersachsen', country: 'Deutschland' } }]);
    expect(hit?.type).toBe('State');
    // Country liegt oberhalb der Eigenebene (State) und bleibt als Elternteil.
    expect(hit?.hierarchy).toEqual([{ title: 'Deutschland', type: 'Country' }]);
  });

  it('leere Liste oder unparsbare Koordinaten → null', () => {
    expect(parseNominatimResults([])).toBeNull();
    expect(parseNominatimResults([{ lat: 'x', lon: 'y' }])).toBeNull();
  });

  it('unbekannter Ort ohne address → Typ Unknown, keine Kette', () => {
    expect(parseNominatimResults([{ lat: '1', lon: '2' }])).toEqual({
      lat: 1,
      long: 2,
      type: 'Unknown',
      hierarchy: [],
    });
  });
});

describe('nominatimSearchUrl', () => {
  it('kodiert die Anfrage und setzt die festen Parameter', () => {
    const url = nominatimSearchUrl('https://nominatim.openstreetmap.org', 'Ochtrup, Steinfurt');
    expect(url).toContain('https://nominatim.openstreetmap.org/search?');
    expect(url).toContain('q=Ochtrup%2C+Steinfurt');
    expect(url).toContain('format=json');
    expect(url).toContain('addressdetails=1');
    expect(url).toContain('countrycodes=de%2Cat%2Cch');
  });
});
