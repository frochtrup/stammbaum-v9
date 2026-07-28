// tests/core/place-coords.test.ts — Koordinaten-Eingabe (v8-Orakel: gedcom.js `parseCoordInput`).
//
// Ein Feld, automatisch aufgelöst: der Nutzer fügt eine komplette Apple-Maps-Koordinate
// („52,22779° N, 7,17310° O") in EIN Feld ein, wir zerlegen sie in Breite/Länge. Fällt
// die Eingabe nicht als Paar durch, gilt jedes Feld einzeln (GEDCOM `N52.2` oder Dezimal).
import { describe, expect, it } from 'vitest';
import { parseCoordPair, parseCoordAxis, resolveCoordFields } from '../../core/places/coords';

describe('parseCoordPair — ein Feld, komplettes Paar', () => {
  it('Apple-Maps deutsch: „52,22779° N, 7,17310° O"', () => {
    expect(parseCoordPair('52,22779° N, 7,17310° O')).toEqual({ lat: 52.22779, long: 7.1731 });
  });

  it('Apple-Maps mit Süd/West kehrt das Vorzeichen um', () => {
    expect(parseCoordPair('33,86880° S, 151,20930° W')).toEqual({ lat: -33.8688, long: -151.2093 });
  });

  it('Dezimal-Paar mit Komma-Trenner: „52.22779, 7.17310"', () => {
    expect(parseCoordPair('52.22779, 7.17310')).toEqual({ lat: 52.22779, long: 7.1731 });
  });

  it('Dezimal-Paar mit Leerraum-Trenner: „52.22779 7.17310"', () => {
    expect(parseCoordPair('52.22779 7.17310')).toEqual({ lat: 52.22779, long: 7.1731 });
  });

  it('führende GEDCOM-Buchstaben: „N52.2073 E7.1845"', () => {
    expect(parseCoordPair('N52.2073 E7.1845')).toEqual({ lat: 52.2073, long: 7.1845 });
  });

  it('führende GEDCOM-Buchstaben mit West: „N52.2073, W3.48"', () => {
    expect(parseCoordPair('N52.2073, W3.48')).toEqual({ lat: 52.2073, long: -3.48 });
  });

  it('kein Paar → null (Einzelwert bleibt dem Achsen-Parser überlassen)', () => {
    expect(parseCoordPair('52,22779')).toBeNull();
    expect(parseCoordPair('N52.2073')).toBeNull();
    expect(parseCoordPair('')).toBeNull();
  });

  it('Werte ausserhalb des gültigen Bereichs → null', () => {
    expect(parseCoordPair('91,0° N, 7,0° O')).toBeNull(); // Breite > 90
    expect(parseCoordPair('52,0° N, 181,0° O')).toBeNull(); // Länge > 180
  });
});

describe('parseCoordAxis — einzelner Wert', () => {
  it('GEDCOM-Form N/S', () => {
    expect(parseCoordAxis('N52.2073')).toBe(52.2073);
    expect(parseCoordAxis('S52.2073')).toBe(-52.2073);
  });

  it('Dezimal mit deutschem Komma', () => {
    expect(parseCoordAxis('52,2073')).toBe(52.2073);
    expect(parseCoordAxis('-3,48')).toBe(-3.48);
  });

  it('nachgestellter Richtungsbuchstabe (° optional)', () => {
    expect(parseCoordAxis('7,17310° O')).toBe(7.1731);
    expect(parseCoordAxis('3.48 W')).toBe(-3.48);
  });

  it('leer / unparsbar → null', () => {
    expect(parseCoordAxis('')).toBeNull();
    expect(parseCoordAxis('   ')).toBeNull();
    expect(parseCoordAxis('abc')).toBeNull();
  });
});

describe('resolveCoordFields — Paar-vor-Einzel (das UI-Verhalten)', () => {
  it('komplettes Paar im ersten Feld gewinnt, zweites Feld wird ignoriert', () => {
    expect(resolveCoordFields('52,22779° N, 7,17310° O', '')).toEqual({
      lat: 52.22779,
      long: 7.1731,
    });
  });

  it('zwei getrennte Felder werden einzeln aufgelöst', () => {
    expect(resolveCoordFields('N52.2073', 'E7.1845')).toEqual({ lat: 52.2073, long: 7.1845 });
    expect(resolveCoordFields('52,2073', '7,1845')).toEqual({ lat: 52.2073, long: 7.1845 });
  });

  it('beide leer → beide null', () => {
    expect(resolveCoordFields('', '')).toEqual({ lat: null, long: null });
  });
});
