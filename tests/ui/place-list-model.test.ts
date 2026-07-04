// tests/ui/place-list-model.test.ts — Orte-Listen-Aufbereitung (Spec 20 §1.7 [K]):
// Sammlung aus placeObjects (id-basiert), Typ-Badge, Koordinaten-Indikator, Typ-Filter,
// Gruppen-Modus (pnames-Varianten), Admin-Filter. Reine Funktion (TST-5).
import { describe, expect, it } from 'vitest';
import { makeDatabase } from '../../core/model';
import { place } from '../core/places-fixtures';
import {
  buildPlaceRows,
  defaultPlaceFilters,
  isAdminType,
  knownPlaceTypes,
  type PlaceFilters,
} from '../../ui/views/place/place-list-model';

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

  it('markiert hasCoords, wenn lat/long gesetzt sind', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Mit Koords', lat: 52.1, long: 7.2 }));
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Ohne Koords' }));

    const rows = buildPlaceRows(db);

    expect(rows.find((r) => r.id === '@P1@')?.hasCoords).toBe(true);
    expect(rows.find((r) => r.id === '@P2@')?.hasCoords).toBe(false);
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

describe('Typ-Filter', () => {
  it('filtert nach exaktem Typ', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Dorf', type: 'Village' }));
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Stadt', type: 'City' }));

    const filters: PlaceFilters = { ...defaultPlaceFilters(), type: 'City' };
    const rows = buildPlaceRows(db, '', filters);

    expect(rows.map((r) => r.id)).toEqual(['@P2@']);
  });

  it('knownPlaceTypes liefert alle vorkommenden Typen, dedupliziert + sortiert', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { type: 'Village' }));
    db.placeObjects.set('@P2@', place('@P2@', { type: 'City' }));
    db.placeObjects.set('@P3@', place('@P3@', { type: 'Village' }));

    expect(knownPlaceTypes(db)).toEqual(['City', 'Village']);
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

    const filters: PlaceFilters = { type: 'City', hideAdmin: true };
    const rows = buildPlaceRows(db, '', filters);

    expect(rows.map((r) => r.id)).toEqual(['@P3@']);
  });
});
