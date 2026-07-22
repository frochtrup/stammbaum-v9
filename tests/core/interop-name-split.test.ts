// tests/core/interop-name-split.test.ts — `Person.given`/`Person.surname` werden beim Einlesen
// aus dem NAME-Wert gefüllt, wenn die Datei keine `GIVN`/`SURN`-Untertags mitbringt
// (Spec 10 §2, Spec 13 §3, ADR-v9-112).
//
// WARUM ALS EIGENE DATEI: die bestehenden Fixtures (mini.small.ged, MeineDaten_ancestris.ged,
// demo.ged) tragen die Untertags nahezu durchgängig — genau deshalb blieb die Lücke drei
// Anläufe lang unentdeckt (BL-108, ADR-v9-18). Diese Tests führen den untagged-Fall als
// eigenständige Vertragsfläche.

import { describe, it, expect } from 'vitest';
import { parseGedcom } from '../../core/interop';

function indi(nameLines: string[]): ReturnType<typeof parseGedcom>['db'] {
  return parseGedcom(['0 HEAD', '0 @I1@ INDI', ...nameLines, '0 TRLR'].join('\n')).db;
}

describe('NAME ohne GIVN/SURN (verbreitete Form) → Zerlegung beim Einlesen', () => {
  it('füllt given und surname aus dem Schrägstrichpaar', () => {
    const p = indi(['1 NAME Theodor Hermann /Zurloh/']).individuals.get('@I1@')!;
    expect(p.name).toBe('Theodor Hermann /Zurloh/'); // Rohwert bleibt unangetastet
    expect(p.given).toBe('Theodor Hermann');
    expect(p.surname).toBe('Zurloh');
  });

  it('Nachlauf hinter dem Paar füllt suffix — sonst ginge er der Anzeige verloren', () => {
    const p = indi(['1 NAME van /Beethoven/ Jr.']).individuals.get('@I1@')!;
    expect(p.given).toBe('van');
    expect(p.surname).toBe('Beethoven');
    expect(p.suffix).toBe('Jr.');
  });

  it('NAME ohne Schrägstriche lässt beide Felder leer (keine erfundene Zerlegung)', () => {
    const p = indi(['1 NAME Anna Maria']).individuals.get('@I1@')!;
    expect(p.name).toBe('Anna Maria');
    expect(p.given).toBe('');
    expect(p.surname).toBe('');
  });
});

describe('Vorrang: explizite Untertags schlagen die Zerlegung, feldweise', () => {
  it('GIVN/SURN vorhanden → unverändert übernommen', () => {
    const p = indi(['1 NAME Max /Muster/', '2 GIVN Max', '2 SURN Muster']).individuals.get('@I1@')!;
    expect(p.given).toBe('Max');
    expect(p.surname).toBe('Muster');
  });

  it('nur GIVN vorhanden (bewusst enger als der NAME-Wert) → given bleibt, surname wird ergänzt', () => {
    const p = indi(['1 NAME Anna Maria /Decker/', '2 GIVN Anna']).individuals.get('@I1@')!;
    expect(p.given).toBe('Anna'); // NICHT auf "Anna Maria" verbreitert
    expect(p.surname).toBe('Decker');
  });

  it('nur SURN vorhanden → surname bleibt, given wird ergänzt', () => {
    const p = indi(['1 NAME Anna Maria /Decker/', '2 SURN Decker']).individuals.get('@I1@')!;
    expect(p.given).toBe('Anna Maria');
    expect(p.surname).toBe('Decker');
  });

  it('NSFX vorhanden → der NAME-Nachlauf überschreibt ihn nicht', () => {
    const p = indi(['1 NAME van /Beethoven/ Jr.', '2 NSFX der Ältere']).individuals.get('@I1@')!;
    expect(p.suffix).toBe('der Ältere');
  });
});
