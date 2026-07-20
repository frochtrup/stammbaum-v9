// tests/ui/place-contemporaries-model.test.ts — Ortszeitgenossen (Spec 20 §1.7 [S],
// ADR-v9-78 Punkt 5): erweitert das Hof-Muster "EINE zeitlich integrierte, chronologische
// Liste" auf die Village-Ebene (Ort + seine Höfe). Reine Funktion (TST-5).
import { describe, expect, it } from 'vitest';
import { makeDatabase, makePerson, makeFamily } from '../../core/model';
import { makePlaceRegistry, makeHofRegistry, type PlaceContext } from '../../core/places';
import { place, hof } from '../core/places-fixtures';
import {
  buildPlaceContemporaries,
  groupContemporaries,
  type PlaceContemporaryRow,
} from '../../ui/views/place/place-detail-model';

function ctxFor(db: ReturnType<typeof makeDatabase>): PlaceContext {
  return { places: makePlaceRegistry(db.placeObjects), hofs: makeHofRegistry(db.hofObjects) };
}

describe('buildPlaceContemporaries — Grunderfassung (Ort + Höfe, eine Zeile je Person×Ereignis)', () => {
  it('erfasst ein direktes Orts-Ereignis (kein Hof-Bezug)', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    const p = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    p.birth.placeId = '@P1@';
    p.birth.date = '1 JAN 1900';
    db.individuals.set('@I1@', p);

    const rows = buildPlaceContemporaries(db, ctxFor(db), '@P1@');

    expect(rows).toHaveLength(1);
    expect(rows[0].personName).toBe('Otto Bauer');
    expect(rows[0].year).toBe(1900);
    expect(rows[0].hofId).toBeNull();
    expect(rows[0].hofLabel).toBeNull();
  });

  it('erfasst ein Hof-Ereignis eines Hofes DIESES Orts, mit hofLabel', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Meyer' });
    p.birth.hofId = '@H1@';
    p.birth.placeId = '@P1@';
    p.birth.date = '1 JAN 1900';
    db.individuals.set('@I1@', p);

    const rows = buildPlaceContemporaries(db, ctxFor(db), '@P1@');

    expect(rows).toHaveLength(1);
    expect(rows[0].hofId).toBe('@H1@');
    expect(rows[0].hofLabel).toBe('Wall 33');
  });

  it('eine Person mit Ereignissen in zwei verschiedenen Jahrzehnten erscheint als ZWEI Zeilen', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    const p = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    p.birth.placeId = '@P1@';
    p.birth.date = '1 JAN 1850';
    p.death.placeId = '@P1@';
    p.death.date = '1 JAN 1870';
    db.individuals.set('@I1@', p);

    const rows = buildPlaceContemporaries(db, ctxFor(db), '@P1@');

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.year)).toEqual([1850, 1870]);
  });

  it('doppelzählt NICHT: ein Event mit hofId dieses Orts zählt als Hof-Zeile, nicht zusätzlich als Ort-Zeile', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Meyer' });
    p.birth.hofId = '@H1@';
    p.birth.placeId = '@P1@';
    p.birth.date = '1 JAN 1900';
    db.individuals.set('@I1@', p);

    const rows = buildPlaceContemporaries(db, ctxFor(db), '@P1@');

    expect(rows).toHaveLength(1);
  });

  it('ignoriert ein Ereignis, dessen Hof zu einem ANDEREN Ort gehört', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Rheine' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P2@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Meyer' });
    p.birth.hofId = '@H1@';
    p.birth.placeId = '@P2@';
    p.birth.date = '1 JAN 1900';
    db.individuals.set('@I1@', p);

    const rows = buildPlaceContemporaries(db, ctxFor(db), '@P1@');

    expect(rows).toHaveLength(0);
  });

  it('ignoriert Familien-Events (nur Personen-Events, analog hof-detail-model.ts)', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    const husband = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    db.individuals.set('@I1@', husband);
    const fam = makeFamily('@F1@', { husband: '@I1@' });
    fam.marriage.placeId = '@P1@';
    fam.marriage.date = '1 JAN 1900';
    db.families.set('@F1@', fam);

    const rows = buildPlaceContemporaries(db, ctxFor(db), '@P1@');

    expect(rows).toHaveLength(0);
  });

  it('sortiert chronologisch aufsteigend, undatierte ans Ende', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@'));
    const later = makePerson('@I1@', { given: 'B', surname: 'Später' });
    later.birth.placeId = '@P1@';
    later.birth.date = '1 JAN 1950';
    db.individuals.set('@I1@', later);
    const earlier = makePerson('@I2@', { given: 'A', surname: 'Früher' });
    earlier.birth.placeId = '@P1@';
    earlier.birth.date = '1 JAN 1900';
    db.individuals.set('@I2@', earlier);
    const undated = makePerson('@I3@', { given: 'C', surname: 'Undatiert' });
    undated.death.placeId = '@P1@';
    db.individuals.set('@I3@', undated);

    const rows = buildPlaceContemporaries(db, ctxFor(db), '@P1@');

    expect(rows.map((r) => r.personName)).toEqual(['A Früher', 'B Später', 'C Undatiert']);
  });

  it('gibt eine leere Liste zurück, wenn der Ort keine Ereignisse hat', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@'));
    expect(buildPlaceContemporaries(db, ctxFor(db), '@P1@')).toEqual([]);
  });
});

describe('buildPlaceContemporaries — Zeitfenster-Filter (Ereignisjahre, inklusive Grenzen)', () => {
  function setupThreeYears(db: ReturnType<typeof makeDatabase>) {
    db.placeObjects.set('@P1@', place('@P1@'));
    const y1875 = makePerson('@I1@', { given: 'A', surname: 'Person' });
    y1875.birth.placeId = '@P1@';
    y1875.birth.date = '1 JAN 1875';
    db.individuals.set('@I1@', y1875);
    const y1900 = makePerson('@I2@', { given: 'B', surname: 'Person' });
    y1900.birth.placeId = '@P1@';
    y1900.birth.date = '1 JAN 1900';
    db.individuals.set('@I2@', y1900);
    const y1925 = makePerson('@I3@', { given: 'C', surname: 'Person' });
    y1925.birth.placeId = '@P1@';
    y1925.birth.date = '1 JAN 1925';
    db.individuals.set('@I3@', y1925);
    const undated = makePerson('@I4@', { given: 'D', surname: 'Person' });
    undated.birth.placeId = '@P1@';
    db.individuals.set('@I4@', undated);
  }

  it('grenzt auf [refYear-window, refYear+window] ein, INKLUSIVE der Grenzen', () => {
    const db = makeDatabase();
    setupThreeYears(db);

    const rows = buildPlaceContemporaries(db, ctxFor(db), '@P1@', { refYear: 1900, window: 25 });

    expect(rows.map((r) => r.personName)).toEqual(['A Person', 'B Person', 'C Person']);
  });

  it('grenzt Jahre AUSSERHALB des Fensters aus', () => {
    const db = makeDatabase();
    setupThreeYears(db);

    const rows = buildPlaceContemporaries(db, ctxFor(db), '@P1@', { refYear: 1900, window: 10 });

    expect(rows.map((r) => r.personName)).toEqual(['B Person']);
  });

  it('wirft undatierte Zeilen aus dem Ergebnis, wenn der Filter aktiv ist', () => {
    const db = makeDatabase();
    setupThreeYears(db);

    const rows = buildPlaceContemporaries(db, ctxFor(db), '@P1@', { refYear: 1900, window: 100 });

    expect(rows.every((r) => r.year != null)).toBe(true);
    expect(rows.map((r) => r.personName)).not.toContain('D Person');
  });

  it('ohne Filter (undefined/null) bleiben alle Zeilen inkl. undatierter erhalten', () => {
    const db = makeDatabase();
    setupThreeYears(db);

    expect(buildPlaceContemporaries(db, ctxFor(db), '@P1@').map((r) => r.personName)).toEqual([
      'A Person',
      'B Person',
      'C Person',
      'D Person',
    ]);
    expect(buildPlaceContemporaries(db, ctxFor(db), '@P1@', null).map((r) => r.personName)).toHaveLength(4);
  });
});

describe('groupContemporaries — drei Gruppierungsmodi (ADR-v9-78 Punkt 5/6)', () => {
  function rowsAcrossDecades(): PlaceContemporaryRow[] {
    return [
      { key: 'a', personId: '@I1@', personName: 'A', year: 1875, label: 'Geburt', hofId: null, hofLabel: null },
      { key: 'b', personId: '@I2@', personName: 'B', year: 1905, label: 'Geburt', hofId: null, hofLabel: null },
      { key: 'c', personId: '@I3@', personName: 'C', year: null, label: 'Geburt', hofId: null, hofLabel: null },
    ];
  }

  it('"decade": gruppiert nach Jahrzehnt in AUFSTEIGENDER numerischer Reihenfolge (nicht alphabetisch)', () => {
    const groups = groupContemporaries(rowsAcrossDecades(), 'decade');

    expect(groups.map((g) => g.type)).toEqual(['1870er', '1900er', 'Ohne Jahr']);
    expect(groups[0].rows.map((r) => r.personName)).toEqual(['A']);
    expect(groups[2].rows.map((r) => r.personName)).toEqual(['C']);
  });

  it('"decade": ein Jahrzehnt >= 1000 sortiert numerisch korrekt vor einem <1000 (String-Sortier-Falle)', () => {
    const rows: PlaceContemporaryRow[] = [
      { key: 'a', personId: '@I1@', personName: 'A', year: 995, label: 'X', hofId: null, hofLabel: null },
      { key: 'b', personId: '@I2@', personName: 'B', year: 1900, label: 'X', hofId: null, hofLabel: null },
    ];

    const groups = groupContemporaries(rows, 'decade');

    expect(groups.map((g) => g.type)).toEqual(['990er', '1900er']);
  });

  it('"hof": gruppiert nach Hof-Label, direkt-am-Ort-Zeilen in eigener Gruppe zuerst', () => {
    const rows: PlaceContemporaryRow[] = [
      { key: 'a', personId: '@I1@', personName: 'A', year: 1900, label: 'X', hofId: '@H2@', hofLabel: 'Zweithof' },
      { key: 'b', personId: '@I2@', personName: 'B', year: 1900, label: 'X', hofId: null, hofLabel: null },
      { key: 'c', personId: '@I3@', personName: 'C', year: 1900, label: 'X', hofId: '@H1@', hofLabel: 'Erstehof' },
    ];

    const groups = groupContemporaries(rows, 'hof');

    expect(groups.map((g) => g.type)).toEqual(['Direkt am Ort', 'Erstehof', 'Zweithof']);
  });

  it('"chrono": genau EINE Gruppe, Zeilen bleiben in der übergebenen (chronologischen) Reihenfolge', () => {
    const rows = rowsAcrossDecades();

    const groups = groupContemporaries(rows, 'chrono');

    expect(groups).toHaveLength(1);
    expect(groups[0].rows).toEqual(rows);
  });

  it('"chrono": eine leere Eingabe erzeugt KEINE leere Gruppe (kein Header ohne Inhalt)', () => {
    expect(groupContemporaries([], 'chrono')).toEqual([]);
  });

  it('leere Eingabe erzeugt in jedem Modus keine Gruppen', () => {
    expect(groupContemporaries([], 'decade')).toEqual([]);
    expect(groupContemporaries([], 'hof')).toEqual([]);
  });
});
