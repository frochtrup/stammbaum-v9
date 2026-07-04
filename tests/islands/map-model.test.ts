// tests/islands/map-model.test.ts — reine Datenaufbereitungs-Tests der Karten-Insel
// (Spec 32 §2: Layout-Berechnung wird über Modell -> Positionen unit-getestet, nicht
// über gerenderte Pixel). Deckt: Epochen-Zuordnung inkl. Randjahre, Orte-mit-
// Koordinaten-Filter, Migrations-Linien-Aufbau, Personen-Biografie-Punkte, Determinismus.
import { describe, expect, it } from 'vitest';
import {
  MIGRATION_EPOCHS,
  MIGRATION_EPOCH_FALLBACK_COLOR,
  migrationEpochColor,
  migrationLines,
  personBiographyPoints,
  placesWithCoords,
} from '../../ui/islands/map/map-model';
import { addHof, addPlace, contextFor, makeDatabase, makeEvent, makePerson } from './map-fixtures';

describe('migrationEpochColor — Epochen-Zuordnung (Orakel: _MIGR_EPOCHS)', () => {
  it('ordnet jedes Referenzjahr der erwarteten Epoche zu', () => {
    expect(migrationEpochColor(1650)).toBe(MIGRATION_EPOCHS[0].color); // vor 1700
    expect(migrationEpochColor(1750)).toBe(MIGRATION_EPOCHS[1].color); // 1700-1799
    expect(migrationEpochColor(1820)).toBe(MIGRATION_EPOCHS[2].color); // 1800-1849
    expect(migrationEpochColor(1875)).toBe(MIGRATION_EPOCHS[3].color); // 1850-1899
    expect(migrationEpochColor(1920)).toBe(MIGRATION_EPOCHS[4].color); // 1900-1949
    expect(migrationEpochColor(1980)).toBe(MIGRATION_EPOCHS[5].color); // 1950+
  });

  it('behandelt Randjahre exakt an den Epochengrenzen (0/1699/1700/1799/1800/1849/1850/1899/1900/1949/1950)', () => {
    expect(migrationEpochColor(0)).toBe(MIGRATION_EPOCHS[0].color);
    expect(migrationEpochColor(1699)).toBe(MIGRATION_EPOCHS[0].color);
    expect(migrationEpochColor(1700)).toBe(MIGRATION_EPOCHS[1].color);
    expect(migrationEpochColor(1799)).toBe(MIGRATION_EPOCHS[1].color);
    expect(migrationEpochColor(1800)).toBe(MIGRATION_EPOCHS[2].color);
    expect(migrationEpochColor(1849)).toBe(MIGRATION_EPOCHS[2].color);
    expect(migrationEpochColor(1850)).toBe(MIGRATION_EPOCHS[3].color);
    expect(migrationEpochColor(1899)).toBe(MIGRATION_EPOCHS[3].color);
    expect(migrationEpochColor(1900)).toBe(MIGRATION_EPOCHS[4].color);
    expect(migrationEpochColor(1949)).toBe(MIGRATION_EPOCHS[4].color);
    expect(migrationEpochColor(1950)).toBe(MIGRATION_EPOCHS[5].color);
  });

  it('fällt bei fehlendem Geburtsjahr auf die Fallback-Farbe zurück', () => {
    expect(migrationEpochColor(null)).toBe(MIGRATION_EPOCH_FALLBACK_COLOR);
    expect(migrationEpochColor(undefined)).toBe(MIGRATION_EPOCH_FALLBACK_COLOR);
  });

  it('deckt genau 6 Epochen lückenlos von 0 bis 9999 ab', () => {
    expect(MIGRATION_EPOCHS).toHaveLength(6);
    const sorted = [...MIGRATION_EPOCHS].sort((a, b) => a.from - b.from);
    expect(sorted[0].from).toBe(0);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].from).toBe(sorted[i - 1].to + 1);
    }
    expect(sorted.at(-1)!.to).toBe(9999);
  });
});

describe('placesWithCoords — Orte-Modus (Orakel: _renderOrteModus)', () => {
  it('liefert nur Orte MIT gesetzten Koordinaten (lat/long != null)', () => {
    const db = makeDatabase();
    addPlace(db, 'P1', 'Dorf A', 51.5, 10.0);
    addPlace(db, 'P2', 'Dorf ohne Koords', null, null);
    addPlace(db, 'P3', 'Dorf nur lat', 51.0, null);

    const points = placesWithCoords(db, contextFor(db));

    expect(points.map((p) => p.placeId)).toEqual(['P1']);
  });

  it('zählt unterschiedliche Personen je Ort über deren Geburts-/Sterbe-Events', () => {
    const db = makeDatabase();
    addPlace(db, 'P1', 'Dorf A', 51.5, 10.0);
    db.individuals.set(
      'I1',
      makePerson('I1', { birth: makeEvent('BIRT', { placeId: 'P1', date: '1 JAN 1800' }) }),
    );
    db.individuals.set(
      'I2',
      makePerson('I2', { birth: makeEvent('BIRT', { placeId: 'P1', date: '1 JAN 1801' }) }),
    );

    const points = placesWithCoords(db, contextFor(db));

    expect(points).toHaveLength(1);
    expect(points[0].personCount).toBe(2);
    expect(points[0].isHof).toBe(false);
  });

  it('liefert Höfe als eigene Punkte mit isHof=true, gezählt getrennt vom umschließenden Dorf', () => {
    const db = makeDatabase();
    addPlace(db, 'P1', 'Dorf A', 51.5, 10.0);
    addHof(db, 'H1', 'P1', 'Oster 82a', 51.51, 10.01);
    db.individuals.set(
      'I1',
      makePerson('I1', { events: [makeEvent('RESI', { hofId: 'H1', date: '1 JAN 1850' })] }),
    );

    const points = placesWithCoords(db, contextFor(db));

    const hofPoint = points.find((p) => p.placeId === 'H1');
    const villagePoint = points.find((p) => p.placeId === 'P1');
    expect(hofPoint?.isHof).toBe(true);
    expect(hofPoint?.personCount).toBe(1);
    expect(villagePoint?.personCount).toBe(0); // Hof-Event zählt NICHT zusätzlich auf das Dorf
  });

  it('ist deterministisch: gleiche Eingabe -> gleiche Ausgabe', () => {
    const db = makeDatabase();
    addPlace(db, 'P1', 'Dorf A', 51.5, 10.0);
    addPlace(db, 'P2', 'Dorf B', 52.0, 11.0);

    const ctx = contextFor(db);
    expect(placesWithCoords(db, ctx)).toEqual(placesWithCoords(db, ctx));
  });
});

describe('personBiographyPoints — Personen-Modus (Orakel: _personGeoEvents)', () => {
  it('liefert Geburt/Tod/Events chronologisch sortiert mit Koordinaten', () => {
    const db = makeDatabase();
    addPlace(db, 'P1', 'Geburtsort', 51.0, 10.0);
    addPlace(db, 'P2', 'Sterbeort', 52.0, 11.0);
    db.individuals.set(
      'I1',
      makePerson('I1', {
        birth: makeEvent('BIRT', { placeId: 'P1', date: '1 JAN 1850' }),
        death: makeEvent('DEAT', { placeId: 'P2', date: '1 JAN 1920' }),
      }),
    );

    const points = personBiographyPoints(db, contextFor(db), 'I1');

    expect(points.map((p) => p.role)).toEqual(['Geburt', 'Tod']);
    expect(points[0]).toMatchObject({ lat: 51.0, long: 10.0, title: 'Geburtsort' });
    expect(points[1]).toMatchObject({ lat: 52.0, long: 11.0, title: 'Sterbeort' });
  });

  it('überspringt Events ohne auflösbare Koordinaten (kein Crash, kein Punkt)', () => {
    const db = makeDatabase();
    db.individuals.set('I1', makePerson('I1', { birth: makeEvent('BIRT', { place: 'Unbekannt' }) }));

    const points = personBiographyPoints(db, contextFor(db), 'I1');

    expect(points).toEqual([]);
  });

  it('liefert [] für unbekannte Person-ID (kein Crash)', () => {
    const db = makeDatabase();
    expect(personBiographyPoints(db, contextFor(db), 'I999')).toEqual([]);
  });

  it('sortiert undatierte Events ans Ende (Orakel-Fallback "9999")', () => {
    const db = makeDatabase();
    addPlace(db, 'P1', 'Ort A', 51.0, 10.0);
    addPlace(db, 'P2', 'Ort B', 52.0, 11.0);
    db.individuals.set(
      'I1',
      makePerson('I1', {
        events: [
          makeEvent('RESI', { placeId: 'P2', date: null, eventType: 'Wohnort ohne Datum' }),
          makeEvent('RESI', { placeId: 'P1', date: '1 JAN 1800', eventType: 'Wohnort mit Datum' }),
        ],
      }),
    );

    const points = personBiographyPoints(db, contextFor(db), 'I1');

    expect(points.map((p) => p.role)).toEqual(['Wohnort mit Datum', 'Wohnort ohne Datum']);
  });
});

describe('migrationLines — Migrations-Modus (Orakel: _buildMigrLines)', () => {
  it('erzeugt genau eine Linie für Personen mit >= 2 unterschiedlichen Geo-Stationen', () => {
    const db = makeDatabase();
    addPlace(db, 'P1', 'Ort A', 51.0, 10.0);
    addPlace(db, 'P2', 'Ort B', 52.0, 11.0);
    db.individuals.set(
      'I1',
      makePerson('I1', {
        birth: makeEvent('BIRT', { placeId: 'P1', date: '1 JAN 1800' }),
        death: makeEvent('DEAT', { placeId: 'P2', date: '1 JAN 1870' }),
      }),
    );

    const lines = migrationLines(db, contextFor(db));

    expect(lines).toHaveLength(1);
    expect(lines[0].points).toEqual([
      { lat: 51.0, long: 10.0 },
      { lat: 52.0, long: 11.0 },
    ]);
    expect(lines[0].birthYear).toBe(1800);
  });

  it('schließt Personen mit nur einer Geo-Station aus (keine Nulllinie)', () => {
    const db = makeDatabase();
    addPlace(db, 'P1', 'Ort A', 51.0, 10.0);
    db.individuals.set('I1', makePerson('I1', { birth: makeEvent('BIRT', { placeId: 'P1', date: '1 JAN 1800' }) }));

    expect(migrationLines(db, contextFor(db))).toEqual([]);
  });

  it('dedupliziert konsekutive Duplikat-Koordinaten (keine Nulllinie bei Stationen am selben Ort)', () => {
    const db = makeDatabase();
    addPlace(db, 'P1', 'Ort A', 51.0, 10.0);
    db.individuals.set(
      'I1',
      makePerson('I1', {
        birth: makeEvent('BIRT', { placeId: 'P1', date: '1 JAN 1800' }),
        death: makeEvent('DEAT', { placeId: 'P1', date: '1 JAN 1870' }), // gleicher Ort wie Geburt
      }),
    );

    expect(migrationLines(db, contextFor(db))).toEqual([]);
  });

  it('färbt Linien nach Geburtsjahr-Epoche und sortiert aufsteigend (undatiert ans Ende)', () => {
    const db = makeDatabase();
    addPlace(db, 'P1', 'Ort A', 51.0, 10.0);
    addPlace(db, 'P2', 'Ort B', 52.0, 11.0);
    db.individuals.set(
      'I_undated',
      makePerson('I_undated', {
        birth: makeEvent('BIRT', { placeId: 'P1' }),
        death: makeEvent('DEAT', { placeId: 'P2' }),
      }),
    );
    db.individuals.set(
      'I_old',
      makePerson('I_old', {
        birth: makeEvent('BIRT', { placeId: 'P1', date: '1 JAN 1650' }),
        death: makeEvent('DEAT', { placeId: 'P2', date: '1 JAN 1690' }),
      }),
    );
    db.individuals.set(
      'I_modern',
      makePerson('I_modern', {
        birth: makeEvent('BIRT', { placeId: 'P1', date: '1 JAN 1980' }),
        death: makeEvent('DEAT', { placeId: 'P2', date: '1 JAN 2010' }),
      }),
    );

    const lines = migrationLines(db, contextFor(db));

    expect(lines.map((l) => l.personId)).toEqual(['I_old', 'I_modern', 'I_undated']);
    expect(lines[0].color).toBe(MIGRATION_EPOCHS[0].color);
    expect(lines[1].color).toBe(MIGRATION_EPOCHS[5].color);
    expect(lines[2].color).toBe(MIGRATION_EPOCH_FALLBACK_COLOR);
  });

  it('ist deterministisch: gleiche Eingabe -> gleiche Ausgabe', () => {
    const db = makeDatabase();
    addPlace(db, 'P1', 'Ort A', 51.0, 10.0);
    addPlace(db, 'P2', 'Ort B', 52.0, 11.0);
    db.individuals.set(
      'I1',
      makePerson('I1', {
        birth: makeEvent('BIRT', { placeId: 'P1', date: '1 JAN 1800' }),
        death: makeEvent('DEAT', { placeId: 'P2', date: '1 JAN 1870' }),
      }),
    );

    const ctx = contextFor(db);
    expect(migrationLines(db, ctx)).toEqual(migrationLines(db, ctx));
  });
});
