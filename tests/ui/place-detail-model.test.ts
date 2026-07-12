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
    // Gruppen-Header deutsch übersetzt (event-labels.ts, Nutzer-Fund 2026-07-10) — "BIRT"/
    // "MARR" erscheinen nicht mehr roh.
    const types = detail!.eventsByType.map((g) => g.type).sort();
    expect(types).toEqual(['Geburt', 'Heirat']);
    const birtGroup = detail!.eventsByType.find((g) => g.type === 'Geburt')!;
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

describe('buildPlaceDetail — hierarchyTimeline ("Zugehörigkeit nach Jahr", volle Kette, v8-Vorbild)', () => {
  it('liefert ein leeres Array ohne enclosedBy-Einträge', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));

    const detail = buildPlaceDetail(db, ctxFor(db), '@P1@');

    expect(detail!.hierarchyTimeline).toEqual([]);
  });

  it('zeigt die VOLLE Kette (nicht nur den direkten Elternteil) zum Schlüsseljahr', () => {
    const db = makeDatabase();
    db.placeObjects.set('@LAND@', place('@LAND@', { title: 'Preußen' }));
    db.placeObjects.set(
      '@KREIS@',
      place('@KREIS@', { title: 'Kreis Steinfurt', enclosedBy: [{ placeId: '@LAND@', from: 1816, to: null }] }),
    );
    db.placeObjects.set(
      '@P1@',
      place('@P1@', { title: 'Ochtrup', enclosedBy: [{ placeId: '@KREIS@', from: 1816, to: null }] }),
    );

    const detail = buildPlaceDetail(db, ctxFor(db), '@P1@');

    expect(detail!.hierarchyTimeline).toEqual([{ year: 1816, chainLabel: 'Kreis Steinfurt › Preußen' }]);
  });

  it('erzeugt eine neue Zeile, wenn sich NUR die Zugehörigkeit einer ÜBERGEORDNETEN Ebene ändert (direkter Elternteil bleibt gleich)', () => {
    const db = makeDatabase();
    db.placeObjects.set('@PREUSSEN@', place('@PREUSSEN@', { title: 'Preußen' }));
    db.placeObjects.set('@NRW@', place('@NRW@', { title: 'Nordrhein-Westfalen' }));
    db.placeObjects.set(
      '@KREIS@',
      place('@KREIS@', {
        title: 'Kreis Steinfurt',
        // Der Kreis selbst wechselt 1946 von Preußen zu NRW — Ochtrups DIREKTER
        // Elternteil (der Kreis) ändert sich dabei nicht.
        enclosedBy: [
          { placeId: '@PREUSSEN@', from: 1816, to: 1945 },
          { placeId: '@NRW@', from: 1946, to: null },
        ],
      }),
    );
    db.placeObjects.set(
      '@P1@',
      place('@P1@', { title: 'Ochtrup', enclosedBy: [{ placeId: '@KREIS@', from: 1816, to: null }] }),
    );

    const detail = buildPlaceDetail(db, ctxFor(db), '@P1@');

    // 1945 (Ende der Preußen-Periode) fällt weg, weil die volle Kette dort identisch mit
    // 1816 bleibt (Duplikate werden zusammengefasst) — erst 1946 ändert die volle Kette.
    expect(detail!.hierarchyTimeline).toEqual([
      { year: 1816, chainLabel: 'Kreis Steinfurt › Preußen' },
      { year: 1946, chainLabel: 'Kreis Steinfurt › Nordrhein-Westfalen' },
    ]);
  });

  it('markiert eine echte Verwaltungslücke als EINE "unbekannt"-Zeile (chainLabel: null), wenn ein Schlüsseljahr in die Lücke fällt', () => {
    const db = makeDatabase();
    db.placeObjects.set(
      '@GRAF@',
      place('@GRAF@', {
        title: 'Grafschaft Steinfurt',
        // Eine zusätzliche pnames-Periode liefert (wie in v8) ein Schlüsseljahr, das
        // tatsächlich INNERHALB der Lücke 1814-1815 liegt -- ohne ein Schlüsseljahr,
        // das in die Lücke selbst fällt, gäbe es keine Zeile mitten in der Lücke, nur
        // davor/danach (nur SCHLÜSSELJAHRE werden geprüft, keine ganzen Zeiträume).
        pnames: [{ value: 'Grafschaft Steinfurt (Spätform)', from: 1814, to: null }],
      }),
    );
    db.placeObjects.set('@AMT@', place('@AMT@', { title: 'Amt Ochtrup' }));
    db.placeObjects.set(
      '@P1@',
      place('@P1@', {
        title: 'Ochtrup',
        enclosedBy: [
          { placeId: '@GRAF@', from: 1300, to: 1813 },
          { placeId: '@AMT@', from: 1816, to: null },
        ],
      }),
    );

    const detail = buildPlaceDetail(db, ctxFor(db), '@P1@');

    // 1813 liegt noch INNERHALB der GRAF-Periode (inklusiv) -> identische Kette wie 1300,
    // wird zusammengefasst. 1814 liegt in der echten Lücke -> "unbekannt". 1816 -> AMT.
    expect(detail!.hierarchyTimeline).toEqual([
      { year: 1300, chainLabel: 'Grafschaft Steinfurt' },
      { year: 1814, chainLabel: null },
      { year: 1816, chainLabel: 'Amt Ochtrup' },
    ]);
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
