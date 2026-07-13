// tests/ui/hof-list-model.test.ts — Höfe-Listen-Aufbereitung (Spec 20 §1.8 [K]:
// "Hof-Liste (aus Events aufgelöst, numerisch sortiert)"). Reine Funktion (TST-5).
import { describe, expect, it } from 'vitest';
import { makeDatabase } from '../../core/model';
import { place, hof, ev } from '../core/places-fixtures';
import { makePlaceRegistry, makeHofRegistry } from '../../core/places';
import type { PlaceContext } from '../../core/places';
import {
  buildHofRows,
  buildHofListSections,
  groupHofRowsByVillage,
  houseNumberOf,
  streetNameOf,
} from '../../ui/views/hof/hof-list-model';

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

describe('streetNameOf — Straßenname-Anteil (ohne Hausnummer)', () => {
  it('extrahiert den Straßenname vor der ersten Zahl', () => {
    expect(streetNameOf('Wall 33')).toBe('Wall');
    expect(streetNameOf('Goethestr.1 (Oster 141)')).toBe('Goethestr.');
  });

  it('Adresse ganz ohne Zahl liefert die volle Adresse als Schlüssel', () => {
    expect(streetNameOf('Schulze-Hof')).toBe('Schulze-Hof');
  });
});

describe('buildHofRows — Sammlung + Sortierung (Straße alphabetisch, dann Hausnummer numerisch)', () => {
  it('baut eine Zeile je HofObject mit Dorf-Titel', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));

    const rows = buildHofRows(db);

    expect(rows).toHaveLength(1);
    expect(rows[0].addr).toBe('Wall 33');
    expect(rows[0].villageTitle).toBe('Ochtrup');
  });

  it('sortiert INNERHALB derselben Straße numerisch nach Hausnummer, nicht alphabetisch', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 100', from: null, to: null }] }));
    db.hofObjects.set('@H2@', hof('@H2@', '@P1@', { addrs: [{ value: 'Wall 9', from: null, to: null }] }));

    const rows = buildHofRows(db);

    // alphabetisch wäre "Wall 100" vor "Wall 9" — numerisch ist 9 < 100
    expect(rows.map((r) => r.id)).toEqual(['@H2@', '@H1@']);
  });

  it('sortiert ZUERST alphabetisch nach Straße, erst danach numerisch nach Hausnummer', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    // "Am Bach 2" hat die kleinere Hausnummer, aber "Wall" kommt alphabetisch später —
    // Straßenname schlägt Hausnummer als primäres Kriterium (Nutzer-Vorgabe 2026-07-10).
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 1', from: null, to: null }] }));
    db.hofObjects.set('@H2@', hof('@H2@', '@P1@', { addrs: [{ value: 'Am Bach 2', from: null, to: null }] }));

    const rows = buildHofRows(db);

    expect(rows.map((r) => r.id)).toEqual(['@H2@', '@H1@']);
  });

  it('markiert hasCoords und liefert die Koordinaten selbst', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@'));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { lat: 52.1, long: 7.2 }));
    db.hofObjects.set('@H2@', hof('@H2@', '@P1@'));

    const rows = buildHofRows(db);

    expect(rows.find((r) => r.id === '@H1@')?.hasCoords).toBe(true);
    expect(rows.find((r) => r.id === '@H1@')?.coords).toEqual({ lat: 52.1, long: 7.2 });
    expect(rows.find((r) => r.id === '@H2@')?.hasCoords).toBe(false);
    expect(rows.find((r) => r.id === '@H2@')?.coords).toBeNull();
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

describe('groupHofRowsByVillage — Gruppierung nach Dorf (Nutzer-Vorgabe 2026-07-10)', () => {
  it('gruppiert nach Dorf-Titel, Dörfer alphabetisch, Höfe je Dorf in bestehender Reihenfolge', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Münster' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    db.hofObjects.set('@H2@', hof('@H2@', '@P2@', { addrs: [{ value: 'Domplatz 1', from: null, to: null }] }));
    db.hofObjects.set('@H3@', hof('@H3@', '@P1@', { addrs: [{ value: 'Am Bach 2', from: null, to: null }] }));

    const rows = buildHofRows(db);
    const groups = groupHofRowsByVillage(rows);

    // "Münster" vor "Ochtrup" (alphabetisch) — innerhalb "Ochtrup" bleibt die
    // Straße-dann-Hausnummer-Sortierung aus buildHofRows erhalten (Am Bach vor Wall).
    expect(groups.map((g) => g.type)).toEqual(['Münster', 'Ochtrup']);
    expect(groups.find((g) => g.type === 'Ochtrup')!.rows.map((r) => r.id)).toEqual(['@H3@', '@H1@']);
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
