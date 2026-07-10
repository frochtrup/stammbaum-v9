// tests/ui/place-detail-model.test.ts — Orts-Steckbrief (Spec 20 §1.7 [K]: Ereignisse
// nach Typ, Quellen, enclosedBy-Kette, pnames-Varianten). Reine Funktion (TST-5).
import { describe, expect, it } from 'vitest';
import { makeDatabase, makeCitation, makeFamily, makePerson } from '../../core/model';
import { makePlaceRegistry, makeHofRegistry, type PlaceContext } from '../../core/places';
import { place } from '../core/places-fixtures';
import { buildPlaceDetail } from '../../ui/views/place/place-detail-model';

function ctxFor(db: ReturnType<typeof makeDatabase>): PlaceContext {
  return { places: makePlaceRegistry(db.placeObjects), hofs: makeHofRegistry(db.hofObjects) };
}

describe('buildPlaceDetail — Ereignisse gruppiert nach Typ', () => {
  it('sammelt Personen-Geburt + Familien-Heirat, die dieses PlaceObject referenzieren', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));

    const person = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    person.birth.placeId = '@P1@';
    person.birth.date = '1 JAN 1900';
    db.individuals.set('@I1@', person);

    const fam = makeFamily('@F1@', { husband: '@I1@' });
    fam.marriage.placeId = '@P1@';
    fam.marriage.date = '1 JUN 1925';
    db.families.set('@F1@', fam);

    const detail = buildPlaceDetail(db, ctxFor(db), '@P1@');

    expect(detail).not.toBeNull();
    const types = detail!.eventsByType.map((g) => g.type).sort();
    expect(types).toEqual(['BIRT', 'MARR']);
    const birtGroup = detail!.eventsByType.find((g) => g.type === 'BIRT')!;
    expect(birtGroup.rows[0].ownerLabel).toBe('Otto Bauer');
  });

  it('liefert NUR das Jahr, nicht die Ortskette (Spec 21 §10h: die Seite IST der Ort)', () => {
    const db = makeDatabase();
    db.placeObjects.set('@KREIS@', place('@KREIS@', { title: 'Kreis Steinfurt' }));
    db.placeObjects.set(
      '@P1@',
      place('@P1@', { title: 'Ochtrup', enclosedBy: [{ placeId: '@KREIS@', from: null, to: null }] }),
    );
    const person = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    person.birth.placeId = '@P1@';
    person.birth.date = '1 JAN 1900';
    db.individuals.set('@I1@', person);

    const detail = buildPlaceDetail(db, ctxFor(db), '@P1@');

    const row = detail!.eventsByType[0]!.rows[0]!;
    expect(row.year).toBe('1900');
    expect(row.year).not.toContain('Ochtrup');
    expect(row.year).not.toContain('Kreis Steinfurt');
  });

  it('liefert die Zitate je Ereigniszeile (für Quellen-Badges pro Zeile)', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@'));
    const person = makePerson('@I1@');
    person.birth.placeId = '@P1@';
    person.birth.citations.push(makeCitation('@S1@'));
    db.individuals.set('@I1@', person);

    const detail = buildPlaceDetail(db, ctxFor(db), '@P1@');

    expect(detail!.eventsByType[0]!.rows[0]!.citations.map((c) => c.sourceId)).toEqual(['@S1@']);
  });

  it('ignoriert Ereignisse an einem ANDEREN Ort', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Münster' }));

    const person = makePerson('@I1@');
    person.birth.placeId = '@P2@';
    db.individuals.set('@I1@', person);

    const detail = buildPlaceDetail(db, ctxFor(db), '@P1@');

    expect(detail!.eventsByType).toEqual([]);
  });

  it('findet Ort auch über String-Match (ev.place, kein placeId gesetzt) — Chokepoint B', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));

    const person = makePerson('@I1@');
    person.birth.place = 'Ochtrup';
    db.individuals.set('@I1@', person);

    const detail = buildPlaceDetail(db, ctxFor(db), '@P1@');

    expect(detail!.eventsByType).toHaveLength(1);
  });

  it('gibt null zurück, wenn die id nicht existiert', () => {
    const db = makeDatabase();
    expect(buildPlaceDetail(db, ctxFor(db), '@gone@')).toBeNull();
  });
});

describe('buildPlaceDetail — Quellen (dedupliziert per Source)', () => {
  it('sammelt Zitate der referenzierenden Ereignisse, ohne Duplikate', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@'));
    const person = makePerson('@I1@');
    person.birth.placeId = '@P1@';
    person.birth.citations.push(makeCitation('@S1@'));
    person.death.placeId = '@P1@';
    person.death.citations.push(makeCitation('@S1@')); // gleiche Quelle
    db.individuals.set('@I1@', person);

    const detail = buildPlaceDetail(db, ctxFor(db), '@P1@');

    expect(detail!.citations).toHaveLength(1);
    expect(detail!.citations[0].sourceId).toBe('@S1@');
  });
});

describe('buildPlaceDetail — pnames-Varianten + enclosedBy-Kette', () => {
  it('liefert pnames als variants mit Zeitraum', () => {
    const db = makeDatabase();
    db.placeObjects.set(
      '@P1@',
      place('@P1@', { title: 'Sassenberg', pnames: [{ value: 'Sassenbergk', from: 1600, to: 1750 }] }),
    );

    const detail = buildPlaceDetail(db, ctxFor(db), '@P1@');

    expect(detail!.variants).toEqual([{ value: 'Sassenbergk', from: 1600, to: 1750 }]);
  });

  it('liefert die enclosedBy-Kette (Ort, übergeordnet, …)', () => {
    const db = makeDatabase();
    db.placeObjects.set('@KREIS@', place('@KREIS@', { title: 'Kreis Steinfurt' }));
    db.placeObjects.set(
      '@P1@',
      place('@P1@', { title: 'Ochtrup', enclosedBy: [{ placeId: '@KREIS@', from: null, to: null }] }),
    );

    const detail = buildPlaceDetail(db, ctxFor(db), '@P1@');

    expect(detail!.enclosureChain).toEqual(['Ochtrup', 'Kreis Steinfurt']);
  });
});

describe('buildPlaceDetail — String→PlaceObject-Kandidaten (Spec 20 §1.7 [K])', () => {
  it('listet ein Event mit passendem ev.place, aber ohne placeId', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    const person = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    person.death.place = 'Ochtrup';
    db.individuals.set('@I1@', person);

    const detail = buildPlaceDetail(db, ctxFor(db), '@P1@');

    expect(detail!.unlinkedEvents).toHaveLength(1);
    expect(detail!.unlinkedEvents[0].ownerLabel).toBe('Otto Bauer');
    expect(detail!.unlinkedEvents[0].placeText).toBe('Ochtrup');
  });

  it('matcht auch über eine pnames-Variante (historische Schreibweise)', () => {
    const db = makeDatabase();
    db.placeObjects.set(
      '@P1@',
      place('@P1@', { title: 'Sassenberg', pnames: [{ value: 'Sassenbergk', from: null, to: null }] }),
    );
    const person = makePerson('@I1@');
    person.birth.place = 'Sassenbergk';
    db.individuals.set('@I1@', person);

    const detail = buildPlaceDetail(db, ctxFor(db), '@P1@');

    expect(detail!.unlinkedEvents).toHaveLength(1);
  });

  it('listet KEIN Event, das bereits placeId trägt', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    const person = makePerson('@I1@');
    person.birth.place = 'Ochtrup';
    person.birth.placeId = '@P1@';
    db.individuals.set('@I1@', person);

    const detail = buildPlaceDetail(db, ctxFor(db), '@P1@');

    expect(detail!.unlinkedEvents).toEqual([]);
  });

  it('listet KEIN Event mit abweichendem Ortsnamen', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    const person = makePerson('@I1@');
    person.birth.place = 'Münster';
    db.individuals.set('@I1@', person);

    const detail = buildPlaceDetail(db, ctxFor(db), '@P1@');

    expect(detail!.unlinkedEvents).toEqual([]);
  });
});
