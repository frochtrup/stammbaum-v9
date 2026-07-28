// tests/ui/book-reports.test.ts — die vier Buch-Grad-§4-Ausgaben (BL-176…179, Spec 20 §4):
// Familienbuch (#7), Ortssippenbuch (#11), Hofchronik (#12), Ortsbuch (#13). Reine
// Renderfunktionen über das Modell + PlaceContext → headless goldfile-testbar (kein DOM,
// injiziertes Erstell-Datum, TST-3). Jeder Test prüft die tragende Struktur der Ausgabe.
import { describe, expect, it } from 'vitest';
import { makeDatabase, makePerson, makeFamily, makeEvent } from '../../core/model';
import { makePlaceRegistry, makeHofRegistry, type PlaceContext } from '../../core/places';
import type { PlaceObject, HofObject } from '../../core/places/types';
import type { ChildLink, Database } from '../../core/model/types';
import {
  buildFamilyBook,
  buildLocalFamilyBook,
  buildFarmChronicle,
  buildPlaceGazetteer,
} from '../../ui/views/reports/index';

const ON = '27. Juli 2026';

function childLink(familyId: string): ChildLink {
  return { familyId, pedigree: 'birth', fatherRel: '', motherRel: '', fatherRelSeen: false, motherRelSeen: false, citations: [] };
}

function po(id: string, over: Partial<PlaceObject>): PlaceObject {
  return {
    id, title: '', shortName: '', type: '', pnames: [], enclosedBy: [],
    lat: null, long: null, note: '', existsFrom: null, existsTo: null,
    govId: null, govTypes: null, ...over,
  };
}

function hof(id: string, over: Partial<HofObject>): HofObject {
  return {
    id, villageId: '', addrs: [], lat: null, long: null, note: '',
    existsFrom: null, existsTo: null, predecessor: null, successor: null,
    govId: null, govTypes: null, schemaVersion: 1, ...over,
  };
}

/** PlaceContext aus derselben `db`-Welt wie im echten App-State (app-state.svelte.ts):
 *  die Registries sind reine Indizes über `db.placeObjects`/`db.hofObjects`. */
function ctxForDb(db: Database): PlaceContext {
  return { places: makePlaceRegistry(db.placeObjects), hofs: makeHofRegistry(db.hofObjects) };
}

/** Kleiner Stammbaum: Carl (I5, Proband) ← Otto (I1) ⚭ Berta (I4); Otto ← Hans/Anna (F1). */
function makeTree(): Database {
  const db = makeDatabase();
  db.individuals.set('I1', makePerson('I1', {
    given: 'Otto', surname: 'Meyer', sex: 'M',
    birth: makeEvent('BIRT', { date: '1850', place: 'Detmold', placeId: 'P1' }),
    death: makeEvent('DEAT', { date: '1920' }),
    childOf: [childLink('F1')], parentIn: ['F2'],
  }));
  db.individuals.set('I2', makePerson('I2', {
    given: 'Hans', surname: 'Meyer', sex: 'M',
    birth: makeEvent('BIRT', { date: '1820', place: 'Detmold', placeId: 'P1' }), parentIn: ['F1'],
  }));
  db.individuals.set('I3', makePerson('I3', { given: 'Anna', surname: 'Schmidt', sex: 'F', parentIn: ['F1'] }));
  db.individuals.set('I4', makePerson('I4', { given: 'Berta', surname: 'Klein', sex: 'F', parentIn: ['F2'] }));
  db.individuals.set('I5', makePerson('I5', {
    given: 'Carl', surname: 'Meyer', sex: 'M',
    birth: makeEvent('BIRT', { date: '1880' }), childOf: [childLink('F2')],
  }));
  db.families.set('F1', makeFamily('F1', { husband: 'I2', wife: 'I3', children: ['I1'] }));
  db.families.set('F2', makeFamily('F2', {
    husband: 'I1', wife: 'I4', children: ['I5'],
    marriage: makeEvent('MARR', { date: '1878', place: 'Detmold', placeId: 'P1' }),
  }));
  return db;
}

/** Ergänzt die Orts-Welt: P1 Detmold (Dorf) in P2 Kreis Lippe, mit historischem Namen. */
function addPlaces(db: Database): Database {
  db.placeObjects.set('P1', po('P1', {
    title: 'Detmold', type: 'Village',
    pnames: [{ value: 'Theotmalli', from: 1000, to: 1500 }],
    enclosedBy: [{ placeId: 'P2', from: null, to: null }],
  }));
  db.placeObjects.set('P2', po('P2', { title: 'Kreis Lippe', type: 'County' }));
  return db;
}

describe('buildFamilyBook (BL-176, Familienbuch #7)', () => {
  const html = buildFamilyBook(makeTree(), 'I5', ON);

  it('rendert Cover, Inhaltsverzeichnis, Ahnen-Sektionen und Glossar', () => {
    expect(html).toContain('<title>Familienbuch</title>');
    expect(html).toContain('Carl Meyer');
    expect(html).toContain('Inhaltsverzeichnis');
    expect(html).toContain('Glossar');
    expect(html).toContain('Kekulé-Nr.');
    expect(html).toContain('Ahnen des Probanden · 5 Personen');
  });

  it('nummeriert die Sektionen nach Kekulé und verlinkt Personen', () => {
    // Proband Carl = 1, Vater Otto = 2, Mutter Berta = 3.
    expect(html).toContain('<div class="kekule-badge">1</div>');
    expect(html).toContain('<div class="kekule-badge">2</div>');
    expect(html).toContain('id="p-I1"');
    expect(html).toContain('href="#p-I1"');
    // Namenindex führt Otto mit seiner Kekulé-Nummer.
    expect(html).toContain('Otto Meyer (2)');
  });

  it('ist deterministisch bei gleichem Eingabe-Datum', () => {
    expect(buildFamilyBook(makeTree(), 'I5', ON)).toBe(html);
  });
});

describe('buildLocalFamilyBook (BL-177, Ortssippenbuch #11)', () => {
  const db = addPlaces(makeTree());
  const html = buildLocalFamilyBook(db, ctxForDb(db), ON);

  it('gruppiert Familien nach Ort mit Erzählsatz', () => {
    expect(html).toContain('<title>Ortssippenbuch</title>');
    expect(html).toContain('Detmold');
    // F2 (Heiratsort) UND F1 (Geburtsort des Mannes Hans) fallen auf Detmold.
    expect(html).toContain('2 Familien');
    expect(html).toContain('<strong>Otto Meyer (*1850 †1920)</strong> und <strong>Berta Klein</strong>');
    expect(html).toContain('heirateten 1878 in Detmold.');
    expect(html).toContain('ging 1 Kind hervor: Carl Meyer *1880.');
  });

  it('rendert die familienlose Menge ohne Absturz', () => {
    const empty = buildLocalFamilyBook(makeDatabase(), ctxForDb(makeDatabase()), ON);
    expect(empty).toContain('Keine Familien mit Ortsbezug');
  });
});

describe('buildFarmChronicle (BL-178, Hofchronik #12)', () => {
  function withHofs(): Database {
    const db = addPlaces(makeTree());
    // Otto: erst RESI am Nebenweg 2 (1870), dann Eigentümer Hauptstraße 1 (1880) → Zuzug.
    db.individuals.get('I1')!.events = [
      makeEvent('RESI', { date: '1870', hofId: 'H2' }),
      makeEvent('PROP', { date: '1880', hofId: 'H1' }),
    ];
    // Hans: Bewohner Hauptstraße 1.
    db.individuals.get('I2')!.events = [makeEvent('RESI', { date: '1885', hofId: 'H1' })];
    db.hofObjects.set('H1', hof('H1', { villageId: 'P1', addrs: [{ value: 'Hauptstraße 1', from: null, to: null }], note: 'Alter Meierhof' }));
    db.hofObjects.set('H2', hof('H2', { villageId: 'P1', addrs: [{ value: 'Nebenweg 2', from: null, to: null }] }));
    return db;
  }
  const db = withHofs();
  const html = buildFarmChronicle(db, ctxForDb(db), ON);

  it('gliedert Ort › Hof › Eigentümer/Bewohner', () => {
    expect(html).toContain('<title>Hofchronik</title>');
    expect(html).toContain('2 Höfe');
    expect(html).toContain('<h2>Detmold</h2>');
    expect(html).toContain('Hauptstraße 1');
    expect(html).toContain('Eigentümer');
    expect(html).toContain('Bewohner');
    expect(html).toContain('Otto Meyer');
    expect(html).toContain('Alter Meierhof');
  });

  it('zeigt den Zuzug (Wegzug-Zeile) von der vorigen Station', () => {
    expect(html).toContain('zugezogen von Nebenweg 2 (Detmold) (1870)');
  });

  it('meldet leeren Hof-Bestand ohne Absturz', () => {
    const noHofs = addPlaces(makeTree());
    expect(buildFarmChronicle(noHofs, ctxForDb(noHofs), ON)).toContain('Keine Höfe erfasst');
  });
});

describe('buildPlaceGazetteer (BL-179, Ortsbuch #13)', () => {
  const db = addPlaces(makeTree());
  const html = buildPlaceGazetteer(db, ctxForDb(db), ON);

  it('rendert Typ, Zugehörigkeit, historische Namen und Ereignisse', () => {
    expect(html).toContain('<title>Ortsbuch</title>');
    expect(html).toContain('<h2>Detmold</h2>');
    expect(html).toContain('<span class="ob-badge">Dorf</span>');
    expect(html).toContain('Kreis Lippe'); // Verwaltungszugehörigkeit
    expect(html).toContain('Theotmalli'); // historischer Name
    expect(html).toContain('Meyer'); // häufigster Familienname (Otto + Hans)
    expect(html).toContain('Ereignisse nach Zeitraum');
  });

  it('zählt Personen und Ereignisse je Ort', () => {
    // An P1: Otto Geburt (1850), Hans Geburt (1820), Heirat F2 zählt Otto UND Berta (1878).
    expect(html).toContain('3 Personen · 4 Ereignisse');
  });

  it('rendert die leere Ortsmenge ohne Absturz', () => {
    expect(buildPlaceGazetteer(makeDatabase(), ctxForDb(makeDatabase()), ON)).toContain('Keine Orte erfasst');
  });
});
