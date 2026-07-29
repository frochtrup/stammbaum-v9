// tests/core/gov.test.ts — GOV-Import (BL-131, Spec 20 §1.7, Spec 11 §1). Reine
// Funktionen (TST-5), build-frei.
//
// Die Testtexte folgen der GOV-Textzusammenfassung, wie sie gov.genealogy.net ausgibt —
// Form abgeglichen gegen BEIDE v8-Parser (`ui-views-place.js::_parseGovText` und
// `gov-enrich.py::parse_gov_block`, letzterer lief gegen echte GOV-Texte), nicht geraten.
import { describe, expect, it } from 'vitest';
import {
  parseGovText,
  applyGovEntry,
  isUnresolvedGovPlaceholder,
  countUnresolvedGovPlaceholders,
  govPlaceholderId,
} from '../../core/places';
import type { PlaceObject, PlaceObjects } from '../../core/places';
import { place, placeMap } from './places-fixtures';

const OCHTRUP = `object_162795
heißt (auf deu) Ochtrup,
heißt (auf nld) Ochtrup,
ist (auf deu) Kirchdorf,
ist ab 1969-07-01 (auf deu) Stadt,
gehört ab 1803 bis 1969-06-30 zu object_279180,
gehört ab 1969-07-01 zu object_190334,
hat externe Kennung geonames:2856803
TEXT:Ochtrup ist eine Stadt im Kreis Steinfurt.:TEXT`;

describe('parseGovText (BL-131)', () => {
  it('liest Kennung, Namen mit Sprache, datierte Typen, Eltern und externe Kennungen', () => {
    const e = parseGovText(OCHTRUP)!;
    expect(e.govId).toBe('object_162795');
    expect(e.names).toEqual([
      { lang: 'deu', value: 'Ochtrup', from: null, to: null },
      { lang: 'nld', value: 'Ochtrup', from: null, to: null },
    ]);
    expect(e.types).toEqual([
      { rawType: 'Kirchdorf', type: 'Village', from: null, to: null },
      { rawType: 'Stadt', type: 'Town', from: 1969, to: null },
    ]);
    expect(e.parents).toEqual([
      { govObjId: 'object_279180', from: 1803, to: 1969 },
      { govObjId: 'object_190334', from: 1969, to: null },
    ]);
    expect(e.extIds).toEqual({ geonames: '2856803' });
    expect(e.description).toBe('Ochtrup ist eine Stadt im Kreis Steinfurt.');
  });

  it('schneidet den „sagt …"-Quellenzusatz ab (GOV hängt ihn an Namens-/Typzeilen)', () => {
    const e = parseGovText('object_1\nheißt (auf deu) Vechta sagt Quelle XY\nist (auf deu) Amt sagt Quelle XY')!;
    expect(e.names[0].value).toBe('Vechta');
    expect(e.types[0].rawType).toBe('Amt');
  });

  it('versteht die Altform „gehört DATUM zu …" (Stichtag ohne ab/bis)', () => {
    const e = parseGovText('object_1\ngehört 1885 zu object_9')!;
    expect(e.parents).toEqual([{ govObjId: 'object_9', from: 1885, to: 1885 }]);
  });

  it('versteht ein Zusatzwort vor „zu" (Form aus gov-enrich.py — der v8-UI-Parser verlor sie still)', () => {
    const e = parseGovText('object_1\ngehört ab 1803 kirchlich zu object_9')!;
    expect(e.parents).toEqual([{ govObjId: 'object_9', from: 1803, to: null }]);
  });

  it('lässt ein unbekanntes GOV-Typwort roh stehen, statt einen Typ zu erfinden', () => {
    const e = parseGovText('object_1\nist (auf deu) Wüstung')!;
    expect(e.types[0]).toEqual({ rawType: 'Wüstung', type: '', from: null, to: null });
  });

  it('gibt null bei leerem Text zurück', () => {
    expect(parseGovText('   \n  ')).toBeNull();
  });

  it('gibt null zurück, wenn KEINE GOV-Aussage vorkommt — ein versehentlich eingefügter Absatz darf keine Kennung erfinden', () => {
    expect(parseGovText('Mein Notizzettel\nnoch eine Zeile')).toBeNull();
  });
});

describe('applyGovEntry (BL-131)', () => {
  it('füllt Kennung, Titel, Typ, Namensvarianten und Typ-Historie eines Platzhalter-Orts', () => {
    const places = placeMap(place('P1', { title: '', govId: null }));
    const res = applyGovEntry(places, 'P1', parseGovText(OCHTRUP)!)!;
    const pl = places.get('P1')!;

    expect(pl.govId).toBe('object_162795');
    expect(pl.title).toBe('Ochtrup');
    // Offen endender Typ-Eintrag gewinnt gegen den älteren (Kirchdorf bis 1969).
    expect(pl.type).toBe('Town');
    expect(pl.govTypes).toEqual(['Kirchdorf', 'Stadt']);
    expect(res.changes).toBeGreaterThan(0);
  });

  it('legt fremdsprachige Namen als `translations` ab, NICHT als pnames (v9-Sprachachse, Abweichung von v8)', () => {
    const places = placeMap(place('P1', { title: 'Breslau' }));
    applyGovEntry(places, 'P1', parseGovText('object_5\nheißt (auf deu) Breslau\nheißt (auf pol) Wrocław')!);
    const pl = places.get('P1')!;

    expect(pl.translations).toEqual([{ lang: 'pol', value: 'Wrocław' }]);
    expect(pl.pnames.map((p) => p.value)).not.toContain('Wrocław');
  });

  it('erfindet KEINE typ-präfigierten pnames („Königreich Preußen") — pnames ist Match-Kriterium (§4.2)', () => {
    const places = placeMap(place('P1', { title: 'Preußen' }));
    applyGovEntry(places, 'P1', parseGovText('object_5\nist ab 1701 bis 1918 (auf deu) Königreich')!);
    const pl = places.get('P1')!;

    expect(pl.pnames).toEqual([]);
    expect(pl.govTypes).toEqual(['Königreich']);
  });

  it('setzt NIE Farm/Building als Ortstyp (Höfe sind eigene Entität, Spec 11 §1)', () => {
    const places = placeMap(place('P1', { title: 'Meyerhof' }));
    applyGovEntry(places, 'P1', parseGovText('object_5\nist (auf deu) Hof')!);
    const pl = places.get('P1')!;

    expect(pl.type).toBe('');
    // Der GOV-Befund geht dabei NICHT verloren — er bleibt in der Typ-Historie.
    expect(pl.govTypes).toEqual(['Hof']);
  });

  it('überschreibt kuratierte Werte nicht (fill-if-empty wie beim Merge, §9.2)', () => {
    const places = placeMap(place('P1', { title: 'Mein Ochtrup', type: 'Village', govId: 'eigene-id' }));
    applyGovEntry(places, 'P1', parseGovText(OCHTRUP)!);
    const pl = places.get('P1')!;

    expect(pl.title).toBe('Mein Ochtrup');
    expect(pl.type).toBe('Village');
    expect(pl.govId).toBe('eigene-id');
  });

  it('legt für unbekannte Eltern GOV-Platzhalter an und verknüpft sie datiert', () => {
    const places = placeMap(place('P1', { title: 'Ochtrup' }));
    const res = applyGovEntry(places, 'P1', parseGovText(OCHTRUP)!)!;
    const pl = places.get('P1')!;

    expect(res.createdPlaceholders).toHaveLength(2);
    expect(pl.enclosedBy).toEqual([
      { placeId: govPlaceholderId('object_279180'), from: 1803, to: 1969 },
      { placeId: govPlaceholderId('object_190334'), from: 1969, to: null },
    ]);
    expect(countUnresolvedGovPlaceholders(places)).toBe(2);
  });

  it('verknüpft mit einem BESTEHENDEN Ort, wenn dessen govId passt — kein zweiter Platzhalter', () => {
    const places = placeMap(
      place('P1', { title: 'Ochtrup' }),
      place('P-kreis', { title: 'Kreis Steinfurt', govId: 'object_279180' }),
    );
    const res = applyGovEntry(places, 'P1', parseGovText('object_1\ngehört ab 1803 zu object_279180')!)!;

    expect(res.createdPlaceholders).toEqual([]);
    expect(places.get('P1')!.enclosedBy[0].placeId).toBe('P-kreis');
  });

  it('ist idempotent: zweimal dasselbe Einfügen ändert beim zweiten Mal nichts', () => {
    const places = placeMap(place('P1', { title: '' }));
    const entry = parseGovText(OCHTRUP)!;
    applyGovEntry(places, 'P1', entry);
    const second = applyGovEntry(places, 'P1', entry)!;

    expect(second.changes).toBe(0);
    expect(second.createdPlaceholders).toEqual([]);
    expect(places.size).toBe(3);
  });

  // REGRESSION (beim Browser-Test am echten Bestand gefunden, nicht im Testbestand):
  // `translations` ist ein nachträglich hinzugekommenes, abwärtskompatibles orte.json-Feld
  // (ADR-v9-144) — an einem aus einer ÄLTEREN Datei geladenen PlaceObject fehlt es. Der
  // erste Bau spreadete es ungeprüft und warf; sichtbar war nur „der Knopf tut nichts".
  // Die Fixture `place()` setzt das Feld immer, deshalb hätte kein Test es gefangen.
  it('verträgt ein PlaceObject ohne die abwärtskompatiblen Listenfelder (alte orte.json)', () => {
    const legacy = place('P1', { title: '' }) as unknown as Record<string, unknown>;
    delete legacy.translations;
    delete legacy.pnames;
    delete legacy.enclosedBy;
    const places: PlaceObjects = new Map([['P1', legacy as unknown as PlaceObject]]);

    const res = applyGovEntry(places, 'P1', parseGovText(OCHTRUP)!)!;

    expect(res.changes).toBeGreaterThan(0);
    expect(places.get('P1')!.translations).toEqual([{ lang: 'nld', value: 'Ochtrup' }]);
  });

  it('gibt null zurück, wenn die Ziel-Id nicht existiert', () => {
    expect(applyGovEntry(placeMap(), 'weg', parseGovText(OCHTRUP)!)).toBeNull();
  });
});

describe('isUnresolvedGovPlaceholder (BL-131)', () => {
  it('ist wahr genau für einen Ort, dessen Titel noch seine GOV-Kennung ist', () => {
    expect(isUnresolvedGovPlaceholder(place('a', { title: 'object_9', govId: 'object_9' }))).toBe(true);
    expect(isUnresolvedGovPlaceholder(place('b', { title: 'Kreis Steinfurt', govId: 'object_9' }))).toBe(false);
    // Kein GOV-Bezug = kein Platzhalter (der Regelfall für jeden geseedeten Ort).
    expect(isUnresolvedGovPlaceholder(place('c', { title: 'Ochtrup' }))).toBe(false);
  });
});
