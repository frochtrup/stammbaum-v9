// tests/ui/soundex.test.ts — deutsch-adaptierter Soundex (BL-10, ADR-v9-159).
// Portiert wörtlich aus dem v8-Orakel `ui-views-search.js:5-20` (Testframework TST-6,
// Wert-Ebene) — diese Tests verriegeln die exakte Kodierung, nicht nur den Namen der
// Funktion.
import { describe, expect, it } from 'vitest';
import { germanSoundex, isPureLetterQuery } from '../../ui/shell/soundex';

describe('germanSoundex', () => {
  it('liefert für phonetisch ähnliche Varianten denselben Code (Meyer/Maier/Mayr)', () => {
    const a = germanSoundex('Meyer');
    const b = germanSoundex('Maier');
    const c = germanSoundex('Mayr');
    expect(a).toBe(b);
    expect(a).toBe(c);
    expect(a).toBe('M600');
  });

  it('liefert für Schmidt/Schmitt denselben Code (Dopplung derselben Ziffernklasse zieht zusammen)', () => {
    expect(germanSoundex('Schmidt')).toBe(germanSoundex('Schmitt'));
    expect(germanSoundex('Schmidt')).toBe('S530');
  });

  it('faltet Umlaute/ß vor der Kodierung (Müller vs. Muller ergeben denselben Code)', () => {
    expect(germanSoundex('Müller')).toBe(germanSoundex('Muller'));
    expect(germanSoundex('Müller')).toBe('M460');
    // ß -> s
    expect(germanSoundex('Straß')).toBe(germanSoundex('Strass'));
  });

  it('faltet "ph" zu "f" vor der Kodierung', () => {
    expect(germanSoundex('Philipp')).toBe(germanSoundex('Filipp'));
  });

  it('liefert "" für leeren String', () => {
    expect(germanSoundex('')).toBe('');
  });

  it('liefert "" für einen rein nicht-alphabetischen String (kein Absturz)', () => {
    expect(germanSoundex('123')).toBe('');
    expect(germanSoundex('---')).toBe('');
  });

  it('unterschiedliche Anfangsbuchstaben ergeben unterschiedliche Codes', () => {
    expect(germanSoundex('Bauer')).not.toBe(germanSoundex('Meyer'));
  });

  it('ist stabil für einen einzelnen Buchstaben (kein Ziffern-Rest)', () => {
    expect(germanSoundex('A')).toBe('A000');
  });
});

describe('isPureLetterQuery', () => {
  it('akzeptiert reine Buchstaben inkl. Umlaute/ß', () => {
    expect(isPureLetterQuery('Meyer')).toBe(true);
    expect(isPureLetterQuery('müller')).toBe(true);
    expect(isPureLetterQuery('straße')).toBe(true);
  });

  it('lehnt Ziffern/Mischtexte ab', () => {
    expect(isPureLetterQuery('Meyer123')).toBe(false);
    expect(isPureLetterQuery('1900')).toBe(false);
    expect(isPureLetterQuery('Neu-Stadt')).toBe(false);
    expect(isPureLetterQuery('')).toBe(false);
  });
});
