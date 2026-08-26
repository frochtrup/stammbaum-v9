// tests/core/undatierte-projektion.test.ts — was ein UNDATIERTES Ereignis als PLAC
// bekommt (BL-384, ADR-v9-292).
//
// DIE ENTSCHEIDUNG, die diese Datei festhält: ohne Stichtag baut die Projektion keine
// Verwaltungskette — der atomare Leitname bleibt die richtige KONSTRUKTION (jede Kette
// wäre eine erfundene Epoche, s. ADR) — aber sie ist kein zulässiger ERSATZ für eine
// reichere Quelle. `buildPlacForGedcom` liefert deshalb `null`, sobald ihre Projektion
// eine Ortsebene fallenließe, die der Quelltext nennt; alle sieben `ev.place`-Schreib-
// stellen fallen dadurch OHNE eigenes Zutun auf den Quelltext zurück (kein siebenfaches
// Nachziehen — der Zwang statt der Erinnerung).
//
// KNOTENBASIERT, nicht zeichenkettenbasiert: eine Umbenennung DESSELBEN Knotens
// („Herzogtum Oldenburg" → „Großherzogtum Oldenburg") ist kein Verlust, der Wegfall
// eines Knotens schon. Ein reiner Zeichenketten-Vergleich hätte die 232 periodengerechten
// Umbenennungen aus ADR-v9-224 mitgesperrt.
//
// ABGRENZUNG zu `unbekannteEbenen` (ADR-v9-224/-247): das ist die NACHBARFRAGE — „nennt
// die Quelle eine Ebene, die der BESTAND nicht kennt". Sie fängt den undatierten Fall
// nachweislich nicht: am Realbestand (dieselben 4.478 reichen, kuratierten Ereignisse
// einmal ohne Datum gerechnet) würde `alignCuratedEventTexts` 260 davon trotz Sperre
// schreiben und dabei die Kette kappen. Beide Prüfungen teilen sich die Knoten-Abdeckung,
// stellen aber verschiedene Fragen — Test 5 hält den Unterschied fest.
import { describe, it, expect } from 'vitest';
import {
  buildPlacForGedcom,
  verloreneEbenen,
  unbekannteEbenen,
  makePlaceRegistry,
  makeHofRegistry,
  linkEventToHof,
  eventSpanne,
} from '../../core/places/index';
import type { PlaceContext } from '../../core/places/index';
import { place, hof, placeMap, hofMap, ev } from './places-fixtures';

/** Nienberge unter der preußischen Kette — der gemessene Fall aus BL-384. */
const NIENBERGE = place('_po_nienberge', {
  title: 'Nienberge',
  lat: 51.99,
  long: 7.55, // angereichert → kuratiert
  enclosedBy: [{ placeId: '_po_kreis_ms', from: null, to: null }],
});
const KREIS = place('_po_kreis_ms', {
  title: 'Kreis Münster',
  enclosedBy: [{ placeId: '_po_westfalen', from: null, to: null }],
});
const WESTFALEN = place('_po_westfalen', {
  title: 'Provinz Westfalen',
  pnames: [{ value: 'Westfalen', from: null, to: null }],
  enclosedBy: [],
});

const ctxOrt = (): PlaceContext => ({
  places: makePlaceRegistry(placeMap(NIENBERGE, KREIS, WESTFALEN)),
  hofs: makeHofRegistry(hofMap()),
});

describe('BL-384 — die undatierte Projektion ersetzt Ebenen, sie streicht sie nicht', () => {
  it('1. undatiert + reiche Quelle → null (die Kette darf nicht gekappt werden)', () => {
    const e = ev('OCCU', {
      place: 'Nienberge, Kreis Münster, Provinz Westfalen',
      placeId: '_po_nienberge',
      date: null,
    });
    // Ohne Sperre wäre das Ergebnis „Nienberge" — zwei Ebenen weg, in die Datei geschrieben.
    expect(buildPlacForGedcom(e, null, ctxOrt())).toBeNull();
  });

  it('2. undatiert + Quelle ist schon der Leitname → die Projektion greift wie bisher', () => {
    const e = ev('OCCU', { place: 'Nienberge', placeId: '_po_nienberge', date: null });
    expect(buildPlacForGedcom(e, null, ctxOrt())).toBe('Nienberge');
  });

  it('2b. undatiert + Quelle mit LEEREN Segmenten → kein Verlust, die Projektion greift', () => {
    // Der gemessene Regelfall am Realbestand (10 von 12 Abweichungen): Ancestris schreibt
    // die leeren Ebenen als Kommas mit. Ein leeres Segment ist keine Ebene.
    const e = ev('OCCU', { place: ', Nienberge, , , ,', placeId: '_po_nienberge', date: null });
    expect(buildPlacForGedcom(e, null, ctxOrt())).toBe('Nienberge');
  });

  it('3. undatiertes HOF-Ereignis: die Umbenennung erreicht ev.place weiterhin (ADR-v9-81)', () => {
    // 471 der 711 undatierten, ortsgebundenen Ereignisse des Realbestands hängen an einem
    // Hof. Würde die Sperre pauschal jede undatierte Projektion unterbinden, käme eine
    // EXPLIZITE Hof-Umbenennung dort nie an — genau die Halb-Erledigung aus ADR-v9-81.
    const h = hof('_hof_weiner5', '_po_nienberge', {
      addrs: [{ value: 'Weiner 5', from: null, to: null }],
      lat: 52.0,
      long: 7.5,
    });
    const ctx: PlaceContext = {
      places: makePlaceRegistry(placeMap(NIENBERGE, KREIS, WESTFALEN)),
      hofs: makeHofRegistry(hofMap(h)),
    };
    const e = ev('RESI', { place: 'Weiner 19, Nienberge', date: null });
    linkEventToHof(e, '_hof_weiner5', ctx);
    expect(e.place).toBe('Weiner 5, Nienberge');
  });

  it('4. DATIERT bleibt unberührt — die periodengerechte Kette wird weiter gebaut', () => {
    const e = ev('OCCU', {
      place: 'Nienberge, Kreis Münster, Provinz Westfalen',
      placeId: '_po_nienberge',
      date: '1850',
    });
    expect(buildPlacForGedcom(e, eventSpanne(e), ctxOrt())).toBe(
      'Nienberge, Kreis Münster, Provinz Westfalen',
    );
  });

  it('5. verloreneEbenen ist knotenbasiert — Umbenennung nein, Wegfall ja', () => {
    const e = ev('OCCU', {
      place: 'Nienberge, Kreis Münster, Westfalen',
      placeId: '_po_nienberge',
      date: null,
    });
    const ctx = ctxOrt();
    // „Westfalen" ist ein pname DESSELBEN Knotens, den die Projektion als „Provinz
    // Westfalen" nennt → kein Verlust.
    expect(verloreneEbenen(e, ctx, 'Nienberge, Kreis Münster, Provinz Westfalen')).toEqual([]);
    // Dieselbe Quelle gegen die gekappte Projektion → zwei Ebenen weg.
    expect(verloreneEbenen(e, ctx, 'Nienberge')).toEqual(['Kreis Münster', 'Westfalen']);
    // Und die NACHBARFRAGE bleibt eine andere: der Bestand kennt beide Ebenen sehr wohl.
    expect(unbekannteEbenen(e, ctx)).toEqual([]);
  });
});
