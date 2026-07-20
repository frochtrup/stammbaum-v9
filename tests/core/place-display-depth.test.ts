// tests/core/place-display-depth.test.ts — INV-UI-14 (Spec 21 §6l, ADR-v9-90/-100).
//
// Der Kern-Teil der Orts-Anzeigetiefe: `placeDisplayName` + `buildListPlaceName`.
// Die Regel liegt bewusst im KERN, nicht in `ui/shell` — die Zeitleisten-Insel
// (framework-freies JS ohne Zugriff auf die Schale) konsumiert sie ebenso wie
// `ui/shell/person-display.ts`. Ein Helfer in der Schale wäre als zweite
// Implementierung geendet (INV-UI-4, real zweimal gebrochen, s. ADR-v9-80).
//
// DER WICHTIGSTE FALL IST DER NEGATIVE: `shortName` ist reine Anzeige und darf den
// exportierten PLAC NIE verändern (ADR-v9-90, LP-1). Deshalb steht am Ende ein Test,
// der denselben Ort mit und ohne `shortName` durch `buildPlacForGedcom` schickt und
// Byte-Gleichheit verlangt. Ohne ihn wäre die Trennung eine Behauptung, kein Kontrakt.
import { describe, expect, it } from 'vitest';
import {
  makePlaceRegistry,
  makeHofRegistry,
  buildPlacForGedcom,
  buildListPlaceName,
  placeDisplayName,
  type PlaceContext,
} from '../../core/places';
import { place, hof, placeMap, hofMap, ev } from './places-fixtures';

/** Ochtrup im Fürstbistum Münster — die Kette aus der Messung zu ADR-v9-90 (16 Varianten). */
function ochtrupCtx(shortName = ''): PlaceContext {
  const hrr = place('P_HRR', { title: 'Heiliges Römisches Reich', type: 'Country' });
  const muenster = place('P_MS', {
    title: 'Fürstbistum Münster',
    type: 'State',
    enclosedBy: [{ placeId: 'P_HRR', from: null, to: null, dateRaw: null }],
  });
  const ochtrup = place('P_OCH', {
    title: 'Ochtrup',
    shortName,
    type: 'Town',
    enclosedBy: [{ placeId: 'P_MS', from: null, to: null, dateRaw: null }],
  });
  const oster = hof('_hof_oster82a_ochtrup', 'P_OCH', {
    addrs: [{ value: 'Oster 82a', from: null, to: null, dateRaw: null }],
  });
  return {
    places: makePlaceRegistry(placeMap(hrr, muenster, ochtrup)),
    hofs: makeHofRegistry(hofMap(oster)),
  };
}

describe('placeDisplayName (Spec 11 §5)', () => {
  it('nimmt shortName, wenn gesetzt', () => {
    expect(placeDisplayName(place('P1', { title: 'Frankfurt', shortName: 'Frankfurt (Main)' }))).toBe(
      'Frankfurt (Main)',
    );
  });

  it('fällt auf title zurück, wenn shortName leer ist (Default-Fall des Bestands)', () => {
    expect(placeDisplayName(place('P1', { title: 'Ochtrup' }))).toBe('Ochtrup');
  });

  it('fällt auf die id zurück, wenn auch der title fehlt — nie ein leerer String', () => {
    expect(placeDisplayName(place('P1'))).toBe('P1');
  });

  it('ist tolerant gegenüber undefined (Ort nicht gefunden)', () => {
    expect(placeDisplayName(undefined)).toBe('');
  });
});

describe('buildListPlaceName — die drei Fälle (INV-UI-14)', () => {
  it('Ort-gelinkt (83 % der Zeilen): Kurzname statt Verwaltungskette', () => {
    const ctx = ochtrupCtx();
    const e = ev('BIRT', { placeId: 'P_OCH', date: '1750' });
    expect(buildListPlaceName(e, ctx)).toBe('Ochtrup');
  });

  it('Ort-gelinkt mit shortName: der kuratierte Name gewinnt', () => {
    const ctx = ochtrupCtx('Ochtrup (Westf.)');
    const e = ev('BIRT', { placeId: 'P_OCH', date: '1750' });
    expect(buildListPlaceName(e, ctx)).toBe('Ochtrup (Westf.)');
  });

  it('Hof-gelinkt (15 %): Adresse + Dorf-Kurzname, Dorfkette abgeschnitten', () => {
    const ctx = ochtrupCtx();
    const e = ev('RESI', { hofId: '_hof_oster82a_ochtrup', date: '1750' });
    expect(buildListPlaceName(e, ctx)).toBe('Oster 82a, Ochtrup');
  });

  it('Hof-gelinkt: das Dorf zeigt seinen shortName, nicht den title', () => {
    const ctx = ochtrupCtx('Ochtrup (Westf.)');
    const e = ev('RESI', { hofId: '_hof_oster82a_ochtrup', date: '1750' });
    expect(buildListPlaceName(e, ctx)).toBe('Oster 82a, Ochtrup (Westf.)');
  });

  it('ungelinkt (1,2 %): erstes Komma-Segment des Rohtexts', () => {
    const ctx = ochtrupCtx();
    const e = ev('BIRT', { place: 'Steinwedel, Amt Burgdorf, Kurfürstentum Braunschweig-Lüneburg' });
    expect(buildListPlaceName(e, ctx)).toBe('Steinwedel');
  });

  it('ungelinkt ohne Kette: Rohtext unverändert', () => {
    expect(buildListPlaceName(ev('BIRT', { place: 'Ochtrup' }), ochtrupCtx())).toBe('Ochtrup');
  });

  it('ohne jede Ortsangabe: leerer String, kein Platzhalter', () => {
    expect(buildListPlaceName(ev('BIRT'), ochtrupCtx())).toBe('');
  });

  it('stale hofId (Hof-Objekt fehlt): fällt auf den Rohtext zurück, wirft nicht', () => {
    const ctx = ochtrupCtx();
    const e = ev('RESI', { hofId: '_hof_weg_ochtrup', place: 'Wester 141, Ochtrup' });
    expect(buildListPlaceName(e, ctx)).toBe('Wester 141');
  });
});

describe('Abgrenzung zum Detail-/Wire-Kontext (INV-UI-14 obere Hälfte)', () => {
  it('buildPlacForGedcom liefert weiterhin die volle Kette — die Listenform ersetzt sie nicht', () => {
    const ctx = ochtrupCtx();
    const e = ev('BIRT', { placeId: 'P_OCH', date: '1750' });
    expect(buildPlacForGedcom(e, 1750, ctx)).toBe('Ochtrup, Fürstbistum Münster, Heiliges Römisches Reich');
    expect(buildListPlaceName(e, ctx)).toBe('Ochtrup');
  });

  it('NEGATIV-BEWEIS: ein gesetzter shortName verändert den exportierten PLAC nicht (LP-1)', () => {
    const ohne = ochtrupCtx();
    const mit = ochtrupCtx('Ochtrup (Westf.)');
    const e = ev('BIRT', { placeId: 'P_OCH', date: '1750' });
    expect(buildPlacForGedcom(e, 1750, mit)).toBe(buildPlacForGedcom(e, 1750, ohne));

    const hofEv = ev('RESI', { hofId: '_hof_oster82a_ochtrup', date: '1750' });
    expect(buildPlacForGedcom(hofEv, 1750, mit)).toBe(buildPlacForGedcom(hofEv, 1750, ohne));
  });

  it('NEGATIV-BEWEIS: shortName ist kein Match-Kriterium — findByName sieht ihn nicht', () => {
    const ctx = ochtrupCtx('Ochtrup (Westf.)');
    expect(ctx.places.findByName('Ochtrup (Westf.)')).toBeNull();
    expect(ctx.places.findByName('Ochtrup')).toBe('P_OCH');
  });
});
