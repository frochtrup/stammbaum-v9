// tests/core/model/name-parts.test.ts — Zerlegung eines GEDCOM-NAME-Werts in Vor-/Nachname
// (Spec 10 §2, ADR-v9-112). Die Zerlegung ist die Quelle für `Person.given`/`Person.surname`,
// wenn die Datei keine `GIVN`/`SURN`-Untertags mitbringt — der häufigste Fall in freier Wildbahn.
//
// Leitfrage jeder Zusicherung hier: macht die QUELLE die Aussage, oder erfinden wir sie?
// Nur ein wohlgeformtes Schrägstrichpaar ist eine Aussage der Quelle; alles andere bleibt leer.

import { describe, it, expect } from 'vitest';
import { splitGedcomName, composeGedcomName } from '../../../core/model/name-parts';

describe('splitGedcomName — wohlgeformtes Schrägstrichpaar (Spec 10 §2)', () => {
  it('Vorname(n) vor, Nachname zwischen den Schrägstrichen', () => {
    expect(splitGedcomName('Theodor Hermann /Zurloh/')).toEqual({
      given: 'Theodor Hermann',
      surname: 'Zurloh',
      suffix: '',
    });
  });

  it('nur Nachname (kein Vorname vor dem Schrägstrich)', () => {
    expect(splitGedcomName('/Zurloh/')).toEqual({ given: '', surname: 'Zurloh', suffix: '' });
  });

  it('leerer Nachname — die Quelle sagt AUSDRÜCKLICH "kein Nachname", also zerlegbar', () => {
    expect(splitGedcomName('Anna //')).toEqual({ given: 'Anna', surname: '', suffix: '' });
  });

  it('Nachlauf hinter dem Paar ist der Namenszusatz (GEDCOM 5.5.1 personal_name_value)', () => {
    // 10 solcher Zeilen in tests/fixtures/MeineDaten_ancestris.ged — kein Randfall.
    expect(splitGedcomName('van /Beethoven/ Jr.')).toEqual({
      given: 'van',
      surname: 'Beethoven',
      suffix: 'Jr.',
    });
  });

  it('Umgebungs-Leerraum wird je Teil getrimmt', () => {
    expect(splitGedcomName('  Anna Maria  /Decker/  ')).toEqual({
      given: 'Anna Maria',
      surname: 'Decker',
      suffix: '',
    });
  });
});

describe('splitGedcomName — nicht eindeutig auflösbar → null (keine erfundene Aussage)', () => {
  it('kein Schrägstrich: "alles ist Vorname" wäre eine Behauptung, die die Quelle nie macht', () => {
    // 23 solcher Zeilen in tests/fixtures/MeineDaten_ancestris.ged.
    expect(splitGedcomName('Anna Maria')).toBeNull();
  });

  it('nicht geschlossenes Paar → unzerlegbar', () => {
    expect(splitGedcomName('Anna /Decker')).toBeNull();
  });

  it('mehr als ein Paar → mehrdeutig, GEDCOM 5.5.1 erlaubt nur eins', () => {
    expect(splitGedcomName('A /B/ C /D/')).toBeNull();
  });

  it('leerer Wert → null', () => {
    expect(splitGedcomName('')).toBeNull();
    expect(splitGedcomName('   ')).toBeNull();
  });
});

describe('composeGedcomName — Umkehrung, hält beide Namens-Hälften im Einklang', () => {
  it('setzt den Nachnamen zwischen Schrägstriche', () => {
    expect(composeGedcomName({ given: 'Theodor Hermann', surname: 'Zurloh', suffix: '' }))
      .toBe('Theodor Hermann /Zurloh/');
  });

  it('hängt den Namenszusatz hinter das Paar', () => {
    expect(composeGedcomName({ given: 'van', surname: 'Beethoven', suffix: 'Jr.' }))
      .toBe('van /Beethoven/ Jr.');
  });

  it('leerer Nachname behält die Schrägstriche (GEDCOM-Form für "hat keinen")', () => {
    expect(composeGedcomName({ given: 'Anna', surname: '', suffix: '' })).toBe('Anna //');
  });

  it('gar keine Teile → leerer Wert (kein "//"-Gerippe)', () => {
    expect(composeGedcomName({ given: '', surname: '', suffix: '' })).toBe('');
  });

  it('ist links-invers zu splitGedcomName (Rundlauf über beide Richtungen)', () => {
    for (const raw of ['Theodor Hermann /Zurloh/', '/Zurloh/', 'Anna //', 'van /Beethoven/ Jr.']) {
      const parts = splitGedcomName(raw)!;
      expect(parts).not.toBeNull();
      expect(splitGedcomName(composeGedcomName(parts))).toEqual(parts);
    }
  });
});
