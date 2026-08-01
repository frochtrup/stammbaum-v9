// tests/ui/place-list-model.test.ts — Orte-Listen-Aufbereitung (Spec 20 §1.7 [K]):
// Sammlung aus placeObjects (id-basiert), Typ-Badge, Koordinaten-Indikator, Typ-Filter,
// Gruppen-Modus (pnames-Varianten), Admin-Filter. Reine Funktion (TST-5).
import { describe, expect, it } from 'vitest';
import { makeDatabase, makePerson } from '../../core/model';
import { place, ev } from '../core/places-fixtures';
import { makePlaceRegistry, makeHofRegistry } from '../../core/places';
import type { PlaceContext } from '../../core/places';
import {
  buildPlaceRows,
  buildPlaceListSections,
  countPersonsPerPlace,
  defaultPlaceFilters,
  isAdminType,
  knownPlaceTypes,
  type PlaceFilters,
} from '../../ui/views/place/place-list-model';

function ctxOf(db: ReturnType<typeof makeDatabase>): PlaceContext {
  return { places: makePlaceRegistry(db.placeObjects), hofs: makeHofRegistry(db.hofObjects) };
}

describe('buildPlaceRows — Sammlung aus placeObjects, Typ-Badge, Koordinaten-Indikator', () => {
  it('baut eine Zeile je PlaceObject, alphabetisch nach Titel sortiert', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Zell', type: 'Village' }));
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Aachen', type: 'City' }));

    const rows = buildPlaceRows(db);

    expect(rows.map((r) => r.id)).toEqual(['@P2@', '@P1@']);
    expect(rows[0].title).toBe('Aachen');
    expect(rows[0].type).toBe('City');
  });

  it('markiert hasCoords, wenn lat/long gesetzt sind, und liefert die Koordinaten selbst', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Mit Koords', lat: 52.1, long: 7.2 }));
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Ohne Koords' }));

    const rows = buildPlaceRows(db);

    expect(rows.find((r) => r.id === '@P1@')?.hasCoords).toBe(true);
    expect(rows.find((r) => r.id === '@P1@')?.coords).toEqual({ lat: 52.1, long: 7.2 });
    expect(rows.find((r) => r.id === '@P2@')?.hasCoords).toBe(false);
    expect(rows.find((r) => r.id === '@P2@')?.coords).toBeNull();
  });

  it('fällt auf die id zurück, wenn kein Titel gesetzt ist (kein leeres Label)', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: '' }));

    const rows = buildPlaceRows(db);

    expect(rows[0].title).toBe('@P1@');
  });

  it('liefert pnames als variants (Gruppen-Modus-Grundlage)', () => {
    const db = makeDatabase();
    db.placeObjects.set(
      '@P1@',
      place('@P1@', {
        title: 'Sassenberg',
        pnames: [
          { value: 'Sassenbergk', from: 1600, to: 1750 },
          { value: 'Sassenberga', from: null, to: null },
        ],
      }),
    );

    const rows = buildPlaceRows(db);

    expect(rows[0].variants).toEqual(['Sassenbergk', 'Sassenberga']);
  });

  it('leere Suche liefert alle Orte', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'A' }));
    db.placeObjects.set('@P2@', place('@P2@', { title: 'B' }));

    expect(buildPlaceRows(db, '')).toHaveLength(2);
  });

  it('Suche findet über den Titel', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Hannover' }));

    const rows = buildPlaceRows(db, 'ochtrup');

    expect(rows.map((r) => r.id)).toEqual(['@P1@']);
  });

  it('Suche findet über eine pnames-Variante', () => {
    const db = makeDatabase();
    db.placeObjects.set(
      '@P1@',
      place('@P1@', { title: 'Sassenberg', pnames: [{ value: 'Sassenbergk', from: null, to: null }] }),
    );
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Hannover' }));

    const rows = buildPlaceRows(db, 'sassenbergk');

    expect(rows.map((r) => r.id)).toEqual(['@P1@']);
  });
});

describe('Typ-Filter — auf der deutschen Kategorie, nicht dem Rohwert (ADR-v9-149)', () => {
  it('filtert nach exakter Kategorie', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Dorf', type: 'Village' }));
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Stadt', type: 'City' }));

    const filters: PlaceFilters = { ...defaultPlaceFilters(), type: 'Stadt' };
    const rows = buildPlaceRows(db, '', filters);

    expect(rows.map((r) => r.id)).toEqual(['@P2@']);
  });

  it('„Stadt" fängt BEIDE Rohwerte (Town + City) — die Kategorie, die der Nutzer sieht', () => {
    // Ohne diese Zusammenführung stünden zwei gleichnamige „Stadt"-Einträge im Dropdown,
    // die unterschiedlich filtern — für den Nutzer nicht unterscheidbar.
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ahaus', type: 'Town' }));
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Münster', type: 'City' }));
    db.placeObjects.set('@P3@', place('@P3@', { title: 'Ochtrup', type: 'Village' }));

    const rows = buildPlaceRows(db, '', { ...defaultPlaceFilters(), type: 'Stadt' });

    expect(rows.map((r) => r.id)).toEqual(['@P1@', '@P2@']);
  });

  it('knownPlaceTypes liefert deutsche Kategorien, auf dem Label dedupliziert + sortiert', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { type: 'Village' }));
    db.placeObjects.set('@P2@', place('@P2@', { type: 'City' }));
    db.placeObjects.set('@P3@', place('@P3@', { type: 'Village' }));
    // Town + City fallen auf EIN „Stadt" zusammen.
    db.placeObjects.set('@P4@', place('@P4@', { type: 'Town' }));

    expect(knownPlaceTypes(db)).toEqual(['Dorf', 'Stadt']);
  });

  it('nicht kategorisierte Orte sind als „Unbekannt" FILTERBAR (nur kein Zeilen-Chip)', () => {
    // Die Trennung, die ADR-v9-149 durchzieht: anzeigen nein, abfragen ja. `Unknown` und
    // ein leerer Typ fallen dabei in dieselbe Kategorie — für den Nutzer ist beides
    // „noch nicht kategorisiert".
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Albersloh', type: 'Unknown' }));
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Ochtrup', type: 'Village' }));
    db.placeObjects.set('@P3@', place('@P3@', { title: 'Am Don', type: '' }));

    expect(knownPlaceTypes(db)).toEqual(['Dorf', 'Unbekannt']);

    const rows = buildPlaceRows(db, '', { ...defaultPlaceFilters(), type: 'Unbekannt' });
    expect(rows.map((r) => r.id)).toEqual(['@P1@', '@P3@']);
  });
});

describe('Admin-Filter — reine Verwaltungseinheiten ausblendbar', () => {
  it('isAdminType erkennt County/Country als Verwaltungseinheit, Village/Town nicht', () => {
    expect(isAdminType('County')).toBe(true);
    expect(isAdminType('Country')).toBe(true);
    expect(isAdminType('District')).toBe(true);
    expect(isAdminType('Village')).toBe(false);
    expect(isAdminType('Town')).toBe(false);
    expect(isAdminType('City')).toBe(false);
  });

  it('hideAdmin blendet Kreis/Land aus, Dorf/Stadt bleiben', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Kreis Steinfurt', type: 'County' }));
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Ochtrup', type: 'Village' }));

    const filters: PlaceFilters = { ...defaultPlaceFilters(), hideAdmin: true };
    const rows = buildPlaceRows(db, '', filters);

    expect(rows.map((r) => r.id)).toEqual(['@P2@']);
  });

  it('kombiniert Typ-Filter + Admin-Filter', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Kreis Steinfurt', type: 'County' }));
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Ochtrup', type: 'Village' }));
    db.placeObjects.set('@P3@', place('@P3@', { title: 'Münster', type: 'City' }));

    const filters: PlaceFilters = { ...defaultPlaceFilters(), type: 'Stadt', hideAdmin: true };
    const rows = buildPlaceRows(db, '', filters);

    expect(rows.map((r) => r.id)).toEqual(['@P3@']);
  });
});

describe('Unvollständig-Filter (ADR-v9-149) — ersetzt die "ohne Zusatzangaben"-Pille', () => {
  // Die Abwesenheit von Daten ist eine ABFRAGE, kein Zeilen-Label: `enriched === false` ist
  // direkt nach dem Import der Regelfall (ADR-v9-44), eine Pille darauf stand damit auf der
  // Mehrheit der Zeilen. Als Filter wirkt dieselbe Information gezielt.
  it("level='none' zeigt NUR Orte ohne Zusatzangaben", () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Plain' }));
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Kuriert', type: 'Village' }));

    const filters: PlaceFilters = { ...defaultPlaceFilters(), level: 'none' as const };

    expect(buildPlaceRows(db, '', filters).map((r) => r.id)).toEqual(['@P1@']);
  });

  it("Default (level='') zeigt beide — der Filter ist opt-in", () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Plain' }));
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Kuriert', type: 'Village' }));

    expect(buildPlaceRows(db, '', defaultPlaceFilters()).map((r) => r.id)).toEqual(['@P2@', '@P1@']);
  });

  it('nutzt DASSELBE Merkmal wie das level-Feld der Zeile (keine zweite Definition)', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Plain' }));
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Kuriert', type: 'Village' }));

    const filtered = buildPlaceRows(db, '', { ...defaultPlaceFilters(), level: 'none' as const });
    const allUnenriched = buildPlaceRows(db).filter((r) => r.level === 'none');

    expect(filtered.map((r) => r.id)).toEqual(allUnenriched.map((r) => r.id));
  });

  it('kombiniert mit der Suche', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Ahaus' }));

    const filters: PlaceFilters = { ...defaultPlaceFilters(), level: 'none' as const };

    expect(buildPlaceRows(db, 'Ahaus', filters).map((r) => r.id)).toEqual(['@P2@']);
  });
});

describe('Anreicherungs-Stufe (§9.1, ADR-v9-44/-191) — level-Feld je Zeile', () => {
  it("plain (Seed-Rohzustand) → level='none'", () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup', enclosedBy: [{ placeId: '@DE@', from: null, to: null }] }));

    expect(buildPlaceRows(db)[0].level).toBe('none');
  });

  it("eine einzelne Angabe (nur Typ) → level='sparse', NICHT schon 'rich'", () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup', type: 'Village' }));

    expect(buildPlaceRows(db)[0].level).toBe('sparse');
  });

  it("vier Facetten → level='rich' (die am Realbestand gemessene Senke liegt bei 3)", () => {
    const db = makeDatabase();
    db.placeObjects.set(
      '@P1@',
      place('@P1@', {
        title: 'Ochtrup',
        type: 'Village',
        pnames: [{ value: 'Ochtorpe', from: 1200, to: 1500 }],
        lat: 52.2,
        long: 7.2,
        note: 'Kirchspiel',
      }),
    );

    expect(buildPlaceRows(db)[0].level).toBe('rich');
  });
});

describe('Hierarchie-Badge (Spec 20 §1.7 [K], ADR-v9-79 Punkt 3) — hasHierarchy-Feld je Zeile', () => {
  it('PlaceObject mit enclosedBy-Eintrag → hasHierarchy=true', () => {
    const db = makeDatabase();
    db.placeObjects.set(
      '@P1@',
      place('@P1@', { title: 'Ochtrup', enclosedBy: [{ placeId: '@DE@', from: null, to: null }] }),
    );

    expect(buildPlaceRows(db)[0].hasHierarchy).toBe(true);
  });

  it('PlaceObject ohne enclosedBy-Eintrag → hasHierarchy=false', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));

    expect(buildPlaceRows(db)[0].hasHierarchy).toBe(false);
  });

  it('hasHierarchy ist UNABHÄNGIG von der Anreicherungs-Stufe — Typ gesetzt, aber keine Kette', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup', type: 'Village' }));

    const row = buildPlaceRows(db)[0];
    expect(row.level).not.toBe('none');
    expect(row.hasHierarchy).toBe(false);
  });
});

describe('buildPlaceListSections — Referenz-Filter (§9.3, ADR-v9-46)', () => {
  it('referenziertes PlaceObject landet in "referenced", referenzloses in "unreferenced"', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Verwaist' }));
    const events = [ev('BIRT', { placeId: '@P1@' })];

    const sections = buildPlaceListSections(db, ctxOf(db), events);

    expect(sections.referenced.map((r) => r.id)).toEqual(['@P1@']);
    expect(sections.unreferenced.map((r) => r.id)).toEqual(['@P2@']);
  });

  it('keine Events → alle Orte landen in "unreferenced"', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));

    const sections = buildPlaceListSections(db, ctxOf(db), []);

    expect(sections.referenced).toEqual([]);
    expect(sections.unreferenced.map((r) => r.id)).toEqual(['@P1@']);
  });

  it('Such-/Typ-Filter gelten für BEIDE Abschnitte gleichermaßen', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup', type: 'Village' }));
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Münster', type: 'City' }));
    const events = [ev('BIRT', { placeId: '@P1@' }), ev('BIRT', { placeId: '@P2@' })];

    const filters: PlaceFilters = { ...defaultPlaceFilters(), type: 'Dorf' };
    const sections = buildPlaceListSections(db, ctxOf(db), events, '', filters);

    expect(sections.referenced.map((r) => r.id)).toEqual(['@P1@']);
    expect(sections.unreferenced).toEqual([]);
  });
});

describe('BL-204 — Personen-Zähler je Ort (countPersonsPerPlace)', () => {
  it('zählt distinkte Personen; Mehrfach-Ereignisse derselben Person nur einmal', () => {
    const db = makeDatabase();
    db.placeObjects.set('P1', place('P1', { title: 'Ochtrup' }));
    const a = makePerson('@I1@', { given: 'A' });
    a.birth = ev('BIRT', { placeId: 'P1' });
    a.death = ev('DEAT', { placeId: 'P1' }); // dieselbe Person, zweites Ereignis → nicht doppelt
    const b = makePerson('@I2@', { given: 'B' });
    b.birth = ev('BIRT', { placeId: 'P1' });
    db.individuals.set('@I1@', a);
    db.individuals.set('@I2@', b);
    const counts = countPersonsPerPlace(db, ctxOf(db));
    expect(counts.get('P1')).toBe(2);
  });

  it('setzt personCount + alphabetische Trenner-Grundlage in die Listenzeile', () => {
    const db = makeDatabase();
    db.placeObjects.set('P1', place('P1', { title: 'Ochtrup' }));
    const a = makePerson('@I1@', { given: 'A' });
    a.birth = ev('BIRT', { placeId: 'P1' });
    db.individuals.set('@I1@', a);
    const sections = buildPlaceListSections(db, ctxOf(db), [a.birth], '', defaultPlaceFilters());
    const row = [...sections.referenced, ...sections.unreferenced].find((r) => r.id === 'P1')!;
    expect(row.personCount).toBe(1);
  });
});
