// tests/ui/place-detail-model.test.ts — Orts-Steckbrief (Spec 20 §1.7 [K]: Ereignisse
// nach Typ, Quellen, enclosedBy-Kette, pnames-Varianten). Reine Funktion (TST-5).
import { describe, expect, it } from 'vitest';
import { makeDatabase, makeCitation, makeFamily, makePerson } from '../../core/model';
import { makePlaceRegistry, makeHofRegistry, type PlaceContext } from '../../core/places';
import { place } from '../core/places-fixtures';
import { buildPlaceDetail, hierarchySpanLabel } from '../../ui/views/place/place-detail-model';

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

    expect(detail!.enclosureChain).toEqual([
      { id: '@P1@', label: 'Ochtrup' },
      { id: '@KREIS@', label: 'Kreis Steinfurt' },
    ]);
  });

  // Bugfix 2026-07-12: "Aktuell:" muss die tatsächlich HEUTE gültige Kette zeigen, nicht
  // enclosedBy[0] (reine Merge-/Einfüge-Reihenfolge). Nachgebaut nach dem realen
  // _po_ochtrup-Muster: mehrere gemergte, datierte enclosedBy-Perioden, deren offenes
  // (aktuelles) Ende NICHT an Index 0 steht.
  it('"Aktuell:" folgt der heute gültigen datierten Periode, nicht enclosedBy[0] (Merge-Reihenfolge)', () => {
    const db = makeDatabase();
    db.placeObjects.set('@AMT@', place('@AMT@', { title: 'Amt Ochtrup' }));
    db.placeObjects.set('@KREIS@', place('@KREIS@', { title: 'Kreis Steinfurt' }));
    db.placeObjects.set(
      '@P1@',
      place('@P1@', {
        title: 'Ochtrup',
        enclosedBy: [
          { placeId: '@KREIS@', from: 1816, to: 1934 }, // Index 0, aber historisch — nicht mehr aktuell
          { placeId: '@AMT@', from: 1934, to: null }, // Index 1, offenes Ende — heute gültig
        ],
      }),
    );

    const detail = buildPlaceDetail(db, ctxFor(db), '@P1@');

    expect(detail!.enclosureChain).toEqual([
      { id: '@P1@', label: 'Ochtrup' },
      { id: '@AMT@', label: 'Amt Ochtrup' },
    ]);
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

    expect(detail!.hierarchyTimeline).toEqual([
      {
        year: 1816,
        label: 'ab 1816',
        chain: [
          { id: '@KREIS@', label: 'Kreis Steinfurt' },
          { id: '@LAND@', label: 'Preußen' },
        ],
        truncated: false,
      },
    ]);
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
      {
        year: 1816,
        label: 'ab 1816',
        chain: [
          { id: '@KREIS@', label: 'Kreis Steinfurt' },
          { id: '@PREUSSEN@', label: 'Preußen' },
        ],
        truncated: false,
      },
      {
        year: 1946,
        label: 'ab 1946',
        chain: [
          { id: '@KREIS@', label: 'Kreis Steinfurt' },
          { id: '@NRW@', label: 'Nordrhein-Westfalen' },
        ],
        truncated: false,
      },
    ]);
  });

  it('markiert eine echte Verwaltungslücke als EINE "unbekannt"-Zeile (chain: null), wenn ein Schlüsseljahr in die Lücke fällt', () => {
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
      { year: 1300, label: 'ab 1300', chain: [{ id: '@GRAF@', label: 'Grafschaft Steinfurt' }], truncated: false },
      { year: 1814, label: 'ab 1814', chain: null, truncated: false },
      { year: 1816, label: 'ab 1816', chain: [{ id: '@AMT@', label: 'Amt Ochtrup' }], truncated: false },
    ]);
  });
});

// ADR-v9-181 / BL-249 — Nutzerbefund „eine vorne offene Gültigkeit einer Zuordnung wird
// nicht aufgelöst FROM     TO 1806 XXX". `from == null` bei GESETZTEM `to` heißt „seit
// jeher bis to" und ist damit ein Zeitraum, kein fehlender Anfang; im Bestand des Nutzers
// (`orte.v9.json`) tragen 12 Zuordnungen diese Form.
describe('buildPlaceDetail — nach unten offene Zugehörigkeit (ADR-v9-181)', () => {
  function ochtrupMitOffenemAnfang() {
    const db = makeDatabase();
    db.placeObjects.set('@FUERST@', place('@FUERST@', { title: 'Fürstbistum Münster' }));
    db.placeObjects.set('@KREIS@', place('@KREIS@', { title: 'Kreis Steinfurt' }));
    db.placeObjects.set(
      '@P1@',
      place('@P1@', {
        title: 'Ochtrup',
        enclosedBy: [
          { placeId: '@FUERST@', from: null, to: 1806 },
          { placeId: '@KREIS@', from: 1816, to: null },
        ],
      }),
    );
    return db;
  }

  it('zeigt die vorne offene Periode ÜBERHAUPT — vorher fiel sie ganz aus der Ansicht', () => {
    const db = ochtrupMitOffenemAnfang();

    const detail = buildPlaceDetail(db, ctxFor(db), '@P1@');

    // Der Defekt: `docStart` entstand nur aus Einträgen MIT `from`, wurde damit 1816 und
    // klemmte das Schlüsseljahr 1806 weg — übrig blieb EINE Zeile.
    expect(detail!.hierarchyTimeline).toHaveLength(2);
    expect(detail!.hierarchyTimeline[0].chain).toEqual([
      { id: '@FUERST@', label: 'Fürstbistum Münster' },
    ]);
  });

  it('beschriftet die erste Zeile mit dem Zeitraum „bis …", nicht mit einem Punktjahr', () => {
    const db = ochtrupMitOffenemAnfang();

    const detail = buildPlaceDetail(db, ctxFor(db), '@P1@');

    // „1806" allein läse sich, als hätte die Zugehörigkeit in genau diesem Jahr gegolten.
    expect(detail!.hierarchyTimeline.map((r) => r.label)).toEqual(['bis 1806', 'ab 1816']);
  });

  it('klemmt weiterhin, wo es einen dokumentierten Anfang gibt (die Klemme fällt nicht ersatzlos)', () => {
    const db = makeDatabase();
    db.placeObjects.set('@LAND@', place('@LAND@', { title: 'Preußen', enclosedBy: [] }));
    db.placeObjects.set(
      '@KREIS@',
      place('@KREIS@', {
        title: 'Kreis Steinfurt',
        // Der Kreis hängt seit 1500 an Preußen — ein Schlüsseljahr weit VOR Ochtrups
        // eigener, dokumentierter Zugehörigkeit.
        enclosedBy: [{ placeId: '@LAND@', from: 1500, to: null }],
      }),
    );
    db.placeObjects.set(
      '@P1@',
      place('@P1@', { title: 'Ochtrup', enclosedBy: [{ placeId: '@KREIS@', from: 1816, to: null }] }),
    );

    const detail = buildPlaceDetail(db, ctxFor(db), '@P1@');

    // 1500 darf keine Zeile erzeugen: über Ochtrup ist zu diesem Jahr nichts bekannt.
    expect(detail!.hierarchyTimeline.map((r) => r.year)).toEqual([1816]);
  });

  it('lässt einen wirklich UNDATIERTEN Eintrag unverändert (from und to fehlen beide)', () => {
    const db = makeDatabase();
    db.placeObjects.set('@KREIS@', place('@KREIS@', { title: 'Kreis Steinfurt' }));
    db.placeObjects.set(
      '@P1@',
      place('@P1@', { title: 'Ochtrup', enclosedBy: [{ placeId: '@KREIS@', from: null, to: null }] }),
    );

    const detail = buildPlaceDetail(db, ctxFor(db), '@P1@');

    // Undatiert heißt „jederzeit gültig" und liefert kein Schlüsseljahr — die Zeitleiste
    // bleibt leer (unverändertes Verhalten, nur die Lesefläche „Aktuell:" zeigt die Kette).
    expect(detail!.hierarchyTimeline).toEqual([]);
  });

  it('endet die Aussage der ersten Zeile schon früher, wenn eine ÜBERGEORDNETE Ebene innerhalb der offenen Periode wechselt', () => {
    const db = makeDatabase();
    db.placeObjects.set('@REICH@', place('@REICH@', { title: 'Heiliges Römisches Reich' }));
    db.placeObjects.set('@WESTF@', place('@WESTF@', { title: 'Königreich Westphalen' }));
    db.placeObjects.set(
      '@FUERST@',
      place('@FUERST@', {
        title: 'Fürstbistum Münster',
        enclosedBy: [
          { placeId: '@REICH@', from: null, to: 1802 },
          { placeId: '@WESTF@', from: 1803, to: null },
        ],
      }),
    );
    db.placeObjects.set(
      '@P1@',
      place('@P1@', { title: 'Ochtrup', enclosedBy: [{ placeId: '@FUERST@', from: null, to: 1806 }] }),
    );

    const detail = buildPlaceDetail(db, ctxFor(db), '@P1@');

    // Die erste Zeile gilt nur bis zum Jahr VOR der nächsten — „bis 1806" wäre dort
    // falsch, weil die gezeigte Kette 1803 endet.
    expect(detail!.hierarchyTimeline[0].label).toBe('bis 1802');
    expect(detail!.hierarchyTimeline[1].label).toBe('ab 1803');
  });
});

describe('hierarchySpanLabel — offen ist richtungsabhängig (Spec 11 §1)', () => {
  it('nennt einen nach unten offenen Zeitraum „bis X"', () => {
    expect(hierarchySpanLabel(null, 1806)).toBe('bis 1806');
  });

  it('nennt einen nach oben offenen Zeitraum „ab X"', () => {
    expect(hierarchySpanLabel(1816, null)).toBe('ab 1816');
  });

  it('nennt einen beidseitig begrenzten Zeitraum mit Bis-Strich', () => {
    expect(hierarchySpanLabel(1816, 1974)).toBe('1816–1974');
  });

  it('zieht ein einjähriges Intervall zur Jahreszahl zusammen', () => {
    expect(hierarchySpanLabel(1806, 1806)).toBe('1806');
  });

  it('liefert für den undatierten Fall leeren Text, nicht „bis null"', () => {
    expect(hierarchySpanLabel(null, null)).toBe('');
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
