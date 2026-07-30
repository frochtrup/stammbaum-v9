// tests/ui/global-search-model.test.ts — globale Suche (Spec 20 §1.1 [K]: "über
// Personen/Familien/Quellen/Orte, gruppierte Ergebnisse"). Reine Funktion (TST-5),
// DOM-frei, testet je Entitätstyp mindestens einen Treffer-/Kein-Treffer-Fall +
// Gruppierung + die Mindestlänge-Grenze (kein Full-Scan-Flackern).
import { describe, expect, it } from 'vitest';
import { makeDatabase, makeFamily, makePerson, makeSource } from '../../core/model';
import { makePlaceRegistry, makeHofRegistry } from '../../core/places';
import { place, hof } from '../core/places-fixtures';
import { globalSearch, totalResultCount, MIN_QUERY_LENGTH } from '../../ui/views/search/global-search-model';

function ctxFor(db: ReturnType<typeof makeDatabase>) {
  return { places: makePlaceRegistry(db.placeObjects), hofs: makeHofRegistry(db.hofObjects) };
}

function seedDb() {
  const db = makeDatabase();
  const husband = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
  const wife = makePerson('@I2@', { given: 'Anna', surname: 'Klein' });
  husband.parentIn.push('@F1@');
  wife.parentIn.push('@F1@');
  db.individuals.set('@I1@', husband);
  db.individuals.set('@I2@', wife);
  db.families.set('@F1@', makeFamily('@F1@', { husband: '@I1@', wife: '@I2@' }));
  db.sources.set('@S1@', makeSource('@S1@', { abbr: 'KB Ochtrup', author: 'Pfarrer Meyer' }));
  db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup', type: 'Village' }));
  db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
  return db;
}

describe('globalSearch — Mindestlänge-Grenze', () => {
  it('liefert keine Ergebnisse bei leerer Query', () => {
    const db = seedDb();
    const result = globalSearch(db, ctxFor(db), '');
    expect(totalResultCount(result)).toBe(0);
  });

  it(`liefert keine Ergebnisse unterhalb von ${MIN_QUERY_LENGTH} Zeichen`, () => {
    const db = seedDb();
    const result = globalSearch(db, ctxFor(db), 'O');
    expect(totalResultCount(result)).toBe(0);
  });
});

describe('globalSearch — Personen', () => {
  it('findet eine Person über den Namen', () => {
    const db = seedDb();
    const result = globalSearch(db, ctxFor(db), 'Bauer');
    expect(result.persons.map((r) => r.id)).toEqual(['@I1@']);
    expect(result.persons[0].primary).toBe('Otto Bauer');
  });

  it('kein Treffer bei unbekanntem Namen', () => {
    const db = seedDb();
    const result = globalSearch(db, ctxFor(db), 'Zimmermann');
    expect(result.persons).toEqual([]);
  });
});

describe('globalSearch — Familien', () => {
  it('findet eine Familie über den Ehepartnernamen', () => {
    const db = seedDb();
    const result = globalSearch(db, ctxFor(db), 'Klein');
    expect(result.families.map((r) => r.id)).toEqual(['@F1@']);
    expect(result.families[0].primary).toBe('Otto Bauer ⚭ Anna Klein');
  });

  it('kein Treffer, wenn keine Familie passt', () => {
    const db = seedDb();
    const result = globalSearch(db, ctxFor(db), 'Zimmermann');
    expect(result.families).toEqual([]);
  });
});

describe('globalSearch — Quellen', () => {
  it('findet eine Quelle über den Kurznamen', () => {
    const db = seedDb();
    const result = globalSearch(db, ctxFor(db), 'Ochtrup');
    expect(result.sources.map((r) => r.id)).toContain('@S1@');
    const row = result.sources.find((r) => r.id === '@S1@')!;
    expect(row.primary).toBe('KB Ochtrup');
    expect(row.secondary).toBe('Pfarrer Meyer');
  });

  it('findet eine Quelle über den Autor', () => {
    const db = seedDb();
    const result = globalSearch(db, ctxFor(db), 'Meyer');
    expect(result.sources.map((r) => r.id)).toEqual(['@S1@']);
  });

  it('kein Treffer, wenn keine Quelle passt', () => {
    const db = seedDb();
    const result = globalSearch(db, ctxFor(db), 'Zimmermann');
    expect(result.sources).toEqual([]);
  });
});

describe('globalSearch — Orte', () => {
  it('findet einen Ort über den Titel', () => {
    const db = seedDb();
    const result = globalSearch(db, ctxFor(db), 'Ochtrup');
    expect(result.places.map((r) => r.id)).toContain('@P1@');
    const row = result.places.find((r) => r.id === '@P1@')!;
    expect(row.primary).toBe('Ochtrup');
    expect(row.secondary).toBe('Village');
  });

  it('kein Treffer, wenn kein Ort passt', () => {
    const db = seedDb();
    const result = globalSearch(db, ctxFor(db), 'Zimmermann');
    expect(result.places).toEqual([]);
  });
});

describe('globalSearch — Höfe (ADR-v9-24)', () => {
  it('findet einen Hof über die Adresse', () => {
    const db = seedDb();
    const result = globalSearch(db, ctxFor(db), 'Wall 33');
    expect(result.hofs.map((r) => r.id)).toEqual(['@H1@']);
    expect(result.hofs[0].primary).toBe('Wall 33');
    expect(result.hofs[0].secondary).toBe('Ochtrup');
  });

  it('findet einen Hof über den Dorf-Titel', () => {
    const db = seedDb();
    const result = globalSearch(db, ctxFor(db), 'Ochtrup');
    expect(result.hofs.map((r) => r.id)).toContain('@H1@');
  });

  it('kein Treffer, wenn kein Hof passt', () => {
    const db = seedDb();
    const result = globalSearch(db, ctxFor(db), 'Zimmermann');
    expect(result.hofs).toEqual([]);
  });
});

describe('globalSearch — Gruppierung', () => {
  it('gruppiert Treffer über mehrere Entitätstypen hinweg im selben Aufruf', () => {
    const db = seedDb();
    // "Ochtrup" trifft die Quelle (Kurzname), den Ort (Titel) UND den Hof (Dorf-Titel).
    const result = globalSearch(db, ctxFor(db), 'Ochtrup');
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.places.length).toBeGreaterThan(0);
    expect(result.hofs.length).toBeGreaterThan(0);
    expect(result.persons).toEqual([]);
    expect(result.families).toEqual([]);
  });

  it('liefert für alle fünf Gruppen leere Arrays, wenn nichts geladen ist', () => {
    const db = makeDatabase();
    const result = globalSearch(db, ctxFor(db), 'irgendwas');
    expect(result).toEqual({ persons: [], families: [], sources: [], places: [], hofs: [] });
  });
});

describe('BL-10/ADR-v9-159 — Soundex-Umschalter der globalen Suche (eigener, getrennter Zustand)', () => {
  function seededVariant() {
    const db = makeDatabase();
    db.individuals.set('@I3@', makePerson('@I3@', { given: 'Karl', surname: 'Maier' }));
    return db;
  }

  it('Soundex aus (Default): "meyer" findet NICHT die phonetische Variante "Maier"', () => {
    const db = seededVariant();
    const result = globalSearch(db, ctxFor(db), 'meyer');
    expect(result.persons).toEqual([]);
  });

  it('Soundex an: "meyer" findet zusätzlich die phonetisch gleiche Schreibweise "Maier"', () => {
    const db = seededVariant();
    const result = globalSearch(db, ctxFor(db), 'meyer', true);
    expect(result.persons.map((r) => r.id)).toEqual(['@I3@']);
  });

  it('ADR-v9-160: phonetische NACHNAMEN-Treffer stehen vor den Vornamens-Zufallstreffern', () => {
    const db = makeDatabase();
    // "Meier"/"Maria" teilen den Code M600 — ohne Vorrang stünde "Maria Albers"
    // alphabetisch vor "Hans Meyer" und der gesuchte Nachname ginge unter.
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Maria', surname: 'Albers' }));
    db.individuals.set('@I2@', makePerson('@I2@', { given: 'Hans', surname: 'Meyer' }));
    db.individuals.set('@I3@', makePerson('@I3@', { given: 'Maria', surname: 'Zwiebel' }));
    const result = globalSearch(db, ctxFor(db), 'meier', true);
    expect(result.persons.map((r) => r.id)).toEqual(['@I2@', '@I1@', '@I3@']);
    // Innerhalb der Nachzügler bleibt die alphabetische Ordnung erhalten (stabile Sortierung).
    expect(result.persons.slice(1).map((r) => r.primary)).toEqual(['Maria Albers', 'Maria Zwiebel']);
  });

  it('wirkt NICHT auf Familien/Quellen/Orte/Höfe (nur die Personen-Teilsuche)', () => {
    const db = seedDb();
    // "Baur" ist phonetisch nah an "Bauer" (Ehemann), soll aber keinen Quellen-/Orts-/
    // Hof-Treffer erzeugen — der Soundex-Schalter der globalen Suche berührt nur
    // matchesPersonSearch, s. Aufgabe 2 des Bauauftrags.
    const result = globalSearch(db, ctxFor(db), 'baur', true);
    expect(result.persons.map((r) => r.id)).toEqual(['@I1@']);
    expect(result.sources).toEqual([]);
    expect(result.places).toEqual([]);
    expect(result.hofs).toEqual([]);
  });
});

describe('BL-211 — Geschlecht in Personen-Treffern (Icon-Quelle)', () => {
  it('Personen-Ergebniszeile trägt sex; Nicht-Personen nicht', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna', surname: 'Bauer', sex: 'F' }));
    db.sources.set('@S1@', makeSource('@S1@', { title: 'Bauer-Chronik' }));
    const res = globalSearch(db, ctxFor(db), 'Bauer');
    expect(res.persons[0].sex).toBe('F');
    expect(res.sources[0].sex).toBeUndefined();
  });
});
