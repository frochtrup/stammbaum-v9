// tests/ui/place-detail-model.test.ts — Orts-Steckbrief (Spec 20 §1.7 [K]: Ereignisse
// nach Typ, Quellen, enclosedBy-Kette, pnames-Varianten). Reine Funktion (TST-5).
import { describe, expect, it } from 'vitest';
import { makeDatabase, makeCitation, makeFamily, makePerson } from '../../core/model';
import { makePlaceRegistry, makeHofRegistry, type PlaceContext } from '../../core/places';
import { place } from '../core/places-fixtures';
import {
  buildAncestorHistory,
  buildPlaceDetail,
  hasOwnDatedEnclosure,
  hierarchySpanLabel,
} from '../../ui/views/place/place-detail-model';

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
        ueberlappt: false,
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
        ueberlappt: false,
      },
      {
        year: 1946,
        label: 'ab 1946',
        chain: [
          { id: '@KREIS@', label: 'Kreis Steinfurt' },
          { id: '@NRW@', label: 'Nordrhein-Westfalen' },
        ],
        truncated: false,
        ueberlappt: false,
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
      { year: 1300, label: 'ab 1300', chain: [{ id: '@GRAF@', label: 'Grafschaft Steinfurt' }], truncated: false, ueberlappt: false },
      { year: 1814, label: 'ab 1814', chain: null, truncated: false, ueberlappt: false },
      { year: 1816, label: 'ab 1816', chain: [{ id: '@AMT@', label: 'Amt Ochtrup' }], truncated: false, ueberlappt: false },
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

  it('lässt einen einzelnen UNDATIERTEN Eintrag ohne Elterngeschichte bei der Zeitleiste leer', () => {
    const db = makeDatabase();
    db.placeObjects.set('@KREIS@', place('@KREIS@', { title: 'Kreis Steinfurt' }));
    db.placeObjects.set(
      '@P1@',
      place('@P1@', { title: 'Ochtrup', enclosedBy: [{ placeId: '@KREIS@', from: null, to: null }] }),
    );

    const detail = buildPlaceDetail(db, ctxFor(db), '@P1@');

    // Undatiert heißt „jederzeit gültig" und liefert kein Schlüsseljahr. Eine undatierte
    // Zeile (ADR-v9-191) erschiene hier nur als Verdopplung der „Aktuell:"-Kette — es gibt
    // weder eine geerbte Historie abzugrenzen noch einen zweiten Elter zu zeigen. Was die
    // Ansicht dabei NICHT mehr sagen darf („Keine übergeordnete Zugehörigkeit erfasst"),
    // hält der Komponententest fest.
    expect(detail!.hierarchyTimeline).toEqual([]);
    expect(detail!.ancestorHistory).toEqual([]);
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

// ADR-v9-191 / BL-265 — die Jahres-Zeilen gehören dem Ort nur, wenn er selbst datiert ist.
// Nutzerbefund: „selbst in der Ortsdetaildarstellung erscheinen nicht kuratierte Orte reich
// an Informationen, da z. B. ein Nürnberg, , , , Deutschland über die Auflösung von
// Deutschland eine zeitlich sortierte Verwaltungshierarchie bekommt … ohne den lokalen
// Veränderungen gerecht zu werden." Am Realbestand (Unsere Familie 2026.ged + orte.v9.json)
// traf das 66 von 171 unangereicherten Orten.
describe('Zugehörigkeit nach Jahr — geerbte Historie gehört dem Elternort (ADR-v9-191)', () => {
  /** Der gemessene Realfall: Erkelsdorf hängt undatiert an der Oberpfalz, und ALLE
   *  Schlüsseljahre der Zeitleiste stammen aus deren eigener Geschichte. */
  function erkelsdorf(): ReturnType<typeof makeDatabase> {
    const db = makeDatabase();
    db.placeObjects.set('@HRR@', place('@HRR@', { title: 'Heiliges Römisches Reich' }));
    db.placeObjects.set('@REICH@', place('@REICH@', { title: 'Deutsches Reich' }));
    db.placeObjects.set(
      '@BAYERN@',
      place('@BAYERN@', {
        title: 'Bayern',
        enclosedBy: [
          { placeId: '@HRR@', from: 1180, to: 1805 },
          { placeId: '@REICH@', from: 1871, to: null },
        ],
      }),
    );
    db.placeObjects.set(
      '@OPF@',
      place('@OPF@', { title: 'Oberpfalz', enclosedBy: [{ placeId: '@BAYERN@', from: 1180, to: null }] }),
    );
    // Der Ort selbst: EIN undatierter Eintrag, sonst nichts (Seed-Rohzustand).
    db.placeObjects.set(
      '@ERK@',
      place('@ERK@', { title: 'Erkelsdorf', enclosedBy: [{ placeId: '@OPF@', from: null, to: null }] }),
    );
    return db;
  }

  it('behauptet für den Ort selbst kein einziges Jahr — die Zeitleiste trägt EINE undatierte Zeile', () => {
    const db = erkelsdorf();

    const detail = buildPlaceDetail(db, ctxFor(db), '@ERK@');

    expect(detail!.hierarchyTimeline).toEqual([
      { year: null, label: 'undatiert', chain: [{ id: '@OPF@', label: 'Oberpfalz' }], truncated: false, ueberlappt: false },
    ]);
    // Der eigentliche Wächter: keine Zeile über diesen Ort trägt je ein Jahr, solange er
    // selbst undatiert ist. Vor ADR-v9-191 standen hier die Jahre 1180/1805/1871 — jedes
    // davon eine erfundene Aussage über Erkelsdorf.
    expect(detail!.hierarchyTimeline.every((r) => r.year == null)).toBe(true);
  });

  it('zeigt die geerbten Jahres-Zeilen weiterhin — aber als Geschichte der übergeordneten Ebenen', () => {
    const db = erkelsdorf();

    const detail = buildPlaceDetail(db, ctxFor(db), '@ERK@');

    // Die Information geht NICHT verloren (verworfene Alternative (f) des ADR) — sie
    // bekommt ihren Eigentümer zurück. Jede Kette beginnt bei der Oberpfalz, nicht bei
    // Erkelsdorf.
    expect(detail!.ancestorHistory.length).toBeGreaterThan(1);
    expect(detail!.ancestorHistory.map((r) => r.year)).toEqual([1180, 1871]);
    for (const row of detail!.ancestorHistory) {
      expect(row.chain?.[0]).toEqual({ id: '@OPF@', label: 'Oberpfalz' });
    }
  });

  it('lässt einen Ort MIT eigener datierter Zugehörigkeit unverändert (ADR-v9-75/76 gilt weiter)', () => {
    const db = erkelsdorf();
    // Derselbe Ort, jetzt mit einer eigenen, datierten Zuordnung.
    db.placeObjects.set(
      '@ERK@',
      place('@ERK@', { title: 'Erkelsdorf', enclosedBy: [{ placeId: '@OPF@', from: 1500, to: null }] }),
    );

    const detail = buildPlaceDetail(db, ctxFor(db), '@ERK@');

    // Jahres-Zeilen bleiben, wo sie hingehören — inklusive der Zeile, die NUR durch einen
    // Wechsel zwei Ebenen höher entsteht (1871): dort ist die Verdichtung gewollt.
    expect(detail!.hierarchyTimeline.map((r) => r.year)).toEqual([1500, 1871]);
    expect(detail!.ancestorHistory).toEqual([]);
  });

  it('fasst mehrere undatierte Eltern (nach einem Merge, ADR-v9-72) in EINE Zeile, dedupliziert', () => {
    const db = makeDatabase();
    db.placeObjects.set('@A@', place('@A@', { title: 'Amt Ochtrup' }));
    db.placeObjects.set('@B@', place('@B@', { title: 'Kreis Steinfurt' }));
    db.placeObjects.set(
      '@P1@',
      place('@P1@', {
        title: 'Ochtrup',
        enclosedBy: [
          { placeId: '@A@', from: null, to: null },
          { placeId: '@B@', from: null, to: null },
          { placeId: '@A@', from: null, to: null },
        ],
      }),
    );

    const detail = buildPlaceDetail(db, ctxFor(db), '@P1@');

    expect(detail!.hierarchyTimeline).toHaveLength(1);
    expect(detail!.hierarchyTimeline[0].chain).toEqual([
      { id: '@A@', label: 'Amt Ochtrup' },
      { id: '@B@', label: 'Kreis Steinfurt' },
    ]);
  });

  it('lässt beide Listen leer, wenn gar keine Zugehörigkeit erfasst ist', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));

    const detail = buildPlaceDetail(db, ctxFor(db), '@P1@');

    expect(detail!.hierarchyTimeline).toEqual([]);
    expect(detail!.ancestorHistory).toEqual([]);
  });

  it('hasOwnDatedEnclosure unterscheidet die drei Datierungs-Zustände (Spec 11 §1)', () => {
    expect(hasOwnDatedEnclosure(place('@X@', { enclosedBy: [] }))).toBe(false);
    expect(hasOwnDatedEnclosure(place('@X@', { enclosedBy: [{ placeId: '@A@', from: null, to: null }] }))).toBe(false);
    expect(hasOwnDatedEnclosure(place('@X@', { enclosedBy: [{ placeId: '@A@', from: 1816, to: null }] }))).toBe(true);
    // Nach unten offen („seit jeher bis 1806") ist ein ZEITRAUM, kein fehlender Anfang
    // (ADR-v9-181) — er zählt als eigene Datierung.
    expect(hasOwnDatedEnclosure(place('@X@', { enclosedBy: [{ placeId: '@A@', from: null, to: 1806 }] }))).toBe(true);
  });

  it('buildAncestorHistory ist leer, sobald der Ort selbst datiert ist (die Regel steckt in der Funktion)', () => {
    const db = erkelsdorf();
    const ctx = ctxFor(db);
    const undatiert = db.placeObjects.get('@ERK@')!;
    expect(buildAncestorHistory(ctx, '@ERK@', undatiert).length).toBeGreaterThan(0);

    const datiert = place('@ERK@', { title: 'Erkelsdorf', enclosedBy: [{ placeId: '@OPF@', from: 1500, to: null }] });
    expect(buildAncestorHistory(ctx, '@ERK@', datiert)).toEqual([]);
  });
});

// BL-325 / [ADR-v9-243] — der ⚠-Hinweis, den Spec 11 §5 seit jeher verlangt und der nie
// gebaut war: gelten in einem Jahr MEHRERE datierte Zugehörigkeiten, hat die Tie-Break-
// Regel gewählt („höheres `from` gewinnt"), nicht die Datenlage. Am maßgeblichen Bestand
// (`Testdateien/orte-2.json`, rev 277) sind das 433 Paare — ausnahmslos Randberührungen,
// weil `from`/`to` Jahre sind und beide Enden einschließen.
//
// `ueberlappt` ist bewusst das GEGENTEIL von `truncated` und deshalb ein eigenes Feld:
// dort fehlt eine Antwort, hier gibt es mehrere.
describe('buildPlaceDetail — überlappende Zugehörigkeiten (BL-325)', () => {
  /** Der Regelfall im echten Bestand: zwei aufeinanderfolgende Perioden teilen ihr Grenzjahr. */
  function randberuehrung() {
    const db = makeDatabase();
    db.placeObjects.set('@AMT@', place('@AMT@', { title: 'Amt Ilten' }));
    db.placeObjects.set('@DEP@', place('@DEP@', { title: 'Département de l’Aller' }));
    db.placeObjects.set(
      '@P1@',
      place('@P1@', {
        title: 'Dolgen',
        enclosedBy: [
          { placeId: '@AMT@', from: 1512, to: 1810 },
          { placeId: '@DEP@', from: 1810, to: 1813 },
        ],
      }),
    );
    return db;
  }

  it('markiert das Grenzjahr, in dem beide Perioden gelten', () => {
    const db = randberuehrung();

    const rows = buildPlaceDetail(db, ctxFor(db), '@P1@')!.hierarchyTimeline;

    const grenzjahr = rows.find((r) => r.year === 1810);
    expect(grenzjahr, 'für 1810 muss es eine Zeile geben').toBeDefined();
    expect(grenzjahr!.ueberlappt).toBe(true);
    // Die Tie-Break-Regel selbst bleibt unverändert: das spätere `from` gewinnt.
    expect(grenzjahr!.chain).toEqual([{ id: '@DEP@', label: 'Département de l’Aller' }]);
  });

  it('lässt die eindeutigen Jahre unmarkiert — sonst wäre der Hinweis wertlos', () => {
    const db = randberuehrung();

    const rows = buildPlaceDetail(db, ctxFor(db), '@P1@')!.hierarchyTimeline;

    const eindeutig = rows.filter((r) => r.year !== 1810);
    expect(eindeutig.length, 'es muss auch unmarkierte Zeilen geben').toBeGreaterThan(0);
    expect(eindeutig.every((r) => !r.ueberlappt)).toBe(true);
  });

  it('zählt eine UNDATIERTE Zugehörigkeit nicht als Konkurrenz', () => {
    // „ohne bekannte Datierung" ist der Rückfall, kein zweiter Anspruch — sonst wäre nach
    // jedem Merge (der mehrere undatierte Ketten hinterlässt, ADR-v9-72) jedes Jahr ⚠.
    const db = makeDatabase();
    db.placeObjects.set('@A@', place('@A@', { title: 'Amt' }));
    db.placeObjects.set('@B@', place('@B@', { title: 'Bezirk' }));
    db.placeObjects.set(
      '@P1@',
      place('@P1@', {
        title: 'Dorf',
        enclosedBy: [
          { placeId: '@A@', from: 1800, to: 1850 },
          { placeId: '@B@', from: null, to: null },
        ],
      }),
    );

    const rows = buildPlaceDetail(db, ctxFor(db), '@P1@')!.hierarchyTimeline;

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => !r.ueberlappt)).toBe(true);
  });

  it('markiert auch, wenn die Mehrdeutigkeit eine ÜBERGEORDNETE Ebene betrifft', () => {
    // Die gezeigte Kette hängt an jeder Ebene — eine Wahl weiter oben bestimmt den Rest
    // genauso. Der Blattknoten selbst ist hier eindeutig.
    const db = makeDatabase();
    db.placeObjects.set('@X@', place('@X@', { title: 'Preußen' }));
    db.placeObjects.set('@Y@', place('@Y@', { title: 'Norddeutscher Bund' }));
    db.placeObjects.set(
      '@KREIS@',
      place('@KREIS@', {
        title: 'Kreis',
        enclosedBy: [
          { placeId: '@X@', from: 1815, to: 1866 },
          { placeId: '@Y@', from: 1866, to: 1871 },
        ],
      }),
    );
    db.placeObjects.set(
      '@P1@',
      place('@P1@', { title: 'Dorf', enclosedBy: [{ placeId: '@KREIS@', from: 1815, to: null }] }),
    );

    const rows = buildPlaceDetail(db, ctxFor(db), '@P1@')!.hierarchyTimeline;

    const grenzjahr = rows.find((r) => r.year === 1866);
    expect(grenzjahr, 'für 1866 muss es eine Zeile geben').toBeDefined();
    expect(grenzjahr!.ueberlappt).toBe(true);
  });
});
