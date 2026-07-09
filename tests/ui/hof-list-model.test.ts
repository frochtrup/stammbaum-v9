// tests/ui/hof-list-model.test.ts — Höfe-Listen-Aufbereitung (Spec 20 §1.8 [K]:
// "Hof-Liste (aus Events aufgelöst, numerisch sortiert)"). Reine Funktion (TST-5).
import { describe, expect, it } from 'vitest';
import { makeDatabase } from '../../core/model';
import { place, hof, ev } from '../core/places-fixtures';
import { makePlaceRegistry, makeHofRegistry } from '../../core/places';
import type { PlaceContext } from '../../core/places';
import { buildHofRows, buildHofListSections, houseNumberOf } from '../../ui/views/hof/hof-list-model';

function ctxOf(db: ReturnType<typeof makeDatabase>): PlaceContext {
  return { places: makePlaceRegistry(db.placeObjects), hofs: makeHofRegistry(db.hofObjects) };
}

describe('houseNumberOf — Hausnummer-Anteil als numerischer Sortierschlüssel', () => {
  it('extrahiert eine führende Zahl', () => {
    expect(houseNumberOf('Wall 33')).toBe(33);
    expect(houseNumberOf('9 Hauptstraße')).toBe(9);
  });

  it('Adresse ohne führende Zahl sortiert ans Ende (+Infinity)', () => {
    expect(houseNumberOf('Schulze-Hof')).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('buildHofRows — Sammlung + numerische Sortierung', () => {
  it('baut eine Zeile je HofObject mit Dorf-Titel', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));

    const rows = buildHofRows(db);

    expect(rows).toHaveLength(1);
    expect(rows[0].addr).toBe('Wall 33');
    expect(rows[0].villageTitle).toBe('Ochtrup');
  });

  it('sortiert numerisch nach Hausnummer, nicht alphabetisch', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 100', from: null, to: null }] }));
    db.hofObjects.set('@H2@', hof('@H2@', '@P1@', { addrs: [{ value: 'Wall 9', from: null, to: null }] }));

    const rows = buildHofRows(db);

    // alphabetisch wäre "Wall 100" vor "Wall 9" — numerisch ist 9 < 100
    expect(rows.map((r) => r.id)).toEqual(['@H2@', '@H1@']);
  });

  it('Adressen ohne Hausnummer sortieren ans Ende', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Schulze-Hof', from: null, to: null }] }));
    db.hofObjects.set('@H2@', hof('@H2@', '@P1@', { addrs: [{ value: 'Wall 9', from: null, to: null }] }));

    const rows = buildHofRows(db);

    expect(rows.map((r) => r.id)).toEqual(['@H2@', '@H1@']);
  });

  it('markiert hasCoords', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@'));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { lat: 52.1, long: 7.2 }));
    db.hofObjects.set('@H2@', hof('@H2@', '@P1@'));

    const rows = buildHofRows(db);

    expect(rows.find((r) => r.id === '@H1@')?.hasCoords).toBe(true);
    expect(rows.find((r) => r.id === '@H2@')?.hasCoords).toBe(false);
  });

  it('Suche filtert über Adresse + Dorf-Titel', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Münster' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    db.hofObjects.set('@H2@', hof('@H2@', '@P2@', { addrs: [{ value: 'Domplatz 1', from: null, to: null }] }));

    expect(buildHofRows(db, 'wall').map((r) => r.id)).toEqual(['@H1@']);
    expect(buildHofRows(db, 'münster').map((r) => r.id)).toEqual(['@H2@']);
  });
});

describe('Anreicherungs-Prädikat (§9.1, ADR-v9-44) — enriched-Feld je Zeile', () => {
  it('plain (1 undatierte Adresse) → enriched=false', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));

    expect(buildHofRows(db)[0].enriched).toBe(false);
  });

  it('angereichert (z. B. Notiz gesetzt) → enriched=true', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set(
      '@H1@',
      hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }], note: 'Hof am Bach' }),
    );

    expect(buildHofRows(db)[0].enriched).toBe(true);
  });
});

describe('buildHofListSections — Referenz-Filter (§9.3, ADR-v9-46)', () => {
  it('referenzierter Hof landet in "referenced", referenzloser in "unreferenced"', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    db.hofObjects.set('@H2@', hof('@H2@', '@P1@', { addrs: [{ value: 'Verwaist 1', from: null, to: null }] }));
    const events = [ev('RESI', { hofId: '@H1@' })];

    const sections = buildHofListSections(db, ctxOf(db), events);

    expect(sections.referenced.map((r) => r.id)).toEqual(['@H1@']);
    expect(sections.unreferenced.map((r) => r.id)).toEqual(['@H2@']);
  });

  it('keine Events → alle Höfe landen in "unreferenced"', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@'));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@'));

    const sections = buildHofListSections(db, ctxOf(db), []);

    expect(sections.referenced).toEqual([]);
    expect(sections.unreferenced.map((r) => r.id)).toEqual(['@H1@']);
  });
});
