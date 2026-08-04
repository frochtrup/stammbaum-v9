// Wire-Konventions-Matrix (Spec 11 §4.3) — je Konvention ein Fixture, das den
// erwarteten Auflösungspfad verriegelt.
import { describe, it, expect } from 'vitest';
import { resolveEvents, buildPlacForGedcom, makePlaceRegistry, makeHofRegistry } from '../../core/places/index';
import { place, hof, placeMap, hofMap, ev } from './places-fixtures';

const village = place('@OCHTRUP@', {
  title: 'Ochtrup',
  type: 'Town',
  enclosedBy: [{ placeId: '@DE@', from: null, to: null }],
});
const country = place('@DE@', { title: 'Deutschland', type: 'Country' });
const places = placeMap(village, country);

describe('Konvention 1 — Ancestris (PLAC Hof, Dorf, … + ADDR Hof)', () => {
  it('Hof existiert → Pfad A, PLAC bit-identisch (net_delta=0)', () => {
    const hofs = hofMap(
      hof('_hof_wall_33_ochtrup', '@OCHTRUP@', {
        addrs: [{ value: 'Wall 33', from: null, to: null }],
      }),
    );
    const source = ev('RESI', {
      place: 'Wall 33, Ochtrup, Deutschland',
      addr: 'Wall 33',
      date: '1900',
    });
    const res = resolveEvents([source], places, hofs);
    const r = res.events[0];
    expect(r.path).toBe('A');
    expect(r.event.hofId).toBe('_hof_wall_33_ochtrup');
    expect(r.event.placeId).toBe('@OCHTRUP@');
    // Wire-Treue: reprojiziertes PLAC == Eingabe (bit-identisch).
    expect(r.event.place).toBe('Wall 33, Ochtrup, Deutschland');
    // Idempotenz: kein neuer Hof gebootstrappt.
    expect(res.hofObjects.size).toBe(1);
  });

  it('Hof existiert nicht → Pfad C (Bootstrap), danach idempotent', () => {
    const source = ev('RESI', {
      place: 'Wall 33, Ochtrup, Deutschland',
      addr: 'Wall 33',
      date: '1900',
    });
    const res = resolveEvents([source], places, hofMap());
    expect(res.events[0].path).toBe('C');
    expect(res.hofObjects.size).toBe(1);
    const newHofId = res.events[0].event.hofId!;
    // Zweiter Lauf mit dem gebootstrappten Hof → Pfad A, keine weitere Anlage.
    const res2 = resolveEvents([source], places, res.hofObjects);
    expect(res2.events[0].path).toBe('A');
    expect(res2.events[0].event.hofId).toBe(newHofId);
    expect(res2.hofObjects.size).toBe(1);
  });
});

describe('Konvention 2 — MyHeritage/GRAMPS (PLAC Dorf + ADDR Hof)', () => {
  it('Hof-Typ, Hof existiert → Pfad B', () => {
    const hofs = hofMap(
      hof('_hof_wall_33_ochtrup', '@OCHTRUP@', {
        addrs: [{ value: 'Wall 33', from: null, to: null }],
      }),
    );
    const source = ev('RESI', { place: 'Ochtrup, Deutschland', addr: 'Wall 33', date: '1900' });
    const res = resolveEvents([source], places, hofs);
    expect(res.events[0].path).toBe('B');
    expect(res.events[0].event.hofId).toBe('_hof_wall_33_ochtrup');
  });

  it('Hof-Typ, Hof existiert nicht → Pfad B\' (Bootstrap); der Hof ist gebunden', () => {
    const source = ev('RESI', { place: 'Ochtrup, Deutschland', addr: 'Wall 33', date: '1900' });
    const res = resolveEvents([source], places, hofMap());
    expect(res.events[0].path).toBe("B'");
    expect(res.hofObjects.size).toBe(1);
    expect(res.events[0].event.hofId).not.toBeNull();
    // Der Übergang Konvention 2→1 ist eine ANZEIGE-Aussage, keine Datei-Aussage
    // (ADR-v9-197): `PLAC` bleibt, was die Quelle sagt — der Hof-Präfix erscheint in der
    // projizierten Kette. Bis BL-288 schrieb der Ladepass ihn in `ev.place` und damit in
    // die Datei, an einem Ereignis, das der Nutzer nie angefasst hatte.
    expect(res.events[0].event.place).toBe('Ochtrup, Deutschland');
    expect(buildPlacForGedcom(res.events[0].event, 1900, {
      places: makePlaceRegistry(places),
      hofs: makeHofRegistry(res.hofObjects),
    })).toBe('Wall 33, Ochtrup, Deutschland');
  });

  it('Non-Hof-Typ mit ADDR ohne Hof-Match → Review Klasse A', () => {
    const source = ev('BIRT', { place: 'Ochtrup, Deutschland', addr: 'Wall 33', date: '1900' });
    const res = resolveEvents([source], places, hofMap());
    expect(res.events[0].event.hofId).toBeNull();
    expect(res.review).toHaveLength(1);
    expect(res.review[0].klass).toBe('A');
  });
});

describe('Konvention 3a — atomar, global eindeutig (PLAC Wall 33, kein ADDR)', () => {
  it('atomarer Ort mit PO-Match → Verwaltungs-Match (kein Hof)', () => {
    const atomicPlaces = placeMap(place('@WALL@', { title: 'Wall 33', type: 'Village' }));
    const source = ev('RESI', { place: 'Wall 33', date: '1900' });
    const res = resolveEvents([source], atomicPlaces, hofMap());
    expect(res.events[0].path).toBe('atomic-po');
    expect(res.events[0].event.placeId).toBe('@WALL@');
  });

  it('atomar ohne PO, aber global eindeutiger Hof → Pfad A\'', () => {
    const hofs = hofMap(
      hof('_hof_wall_33_ochtrup', '@OCHTRUP@', {
        addrs: [{ value: 'Wall 33', from: null, to: null }],
      }),
    );
    const source = ev('RESI', { place: 'Wall 33', date: '1900' });
    const res = resolveEvents([source], places, hofs);
    expect(res.events[0].path).toBe("A'");
    expect(res.events[0].event.hofId).toBe('_hof_wall_33_ochtrup');
    expect(res.events[0].event.placeId).toBe('@OCHTRUP@');
  });
});

describe('Konvention 3b — atomar, ohne Match → Review / Quelle schärfen', () => {
  it('atomarer Ort ohne PO und ohne Hof → nicht aufgelöst (kein Link)', () => {
    const source = ev('RESI', { place: 'Wall 33', date: '1900' });
    const res = resolveEvents([source], places, hofMap());
    expect(res.events[0].path).toBe('none');
    expect(res.events[0].event.placeId).toBeNull();
    expect(res.events[0].event.hofId).toBeNull();
    // ev.place bleibt Wire-Wert (nichts reprojiziert).
    expect(res.events[0].event.place).toBe('Wall 33');
  });
});

// Symptom 2 (Bugfix 2026-07-12): Ancestris/MyHeritage schreiben PLAC oft in einem
// FESTEN Template mit Leerfeldern auf nicht belegten Ebenen — der Ortsname steht dann
// NICHT im ersten Komma-Segment (Index 0 leer), z. B. „, Ochtrup, , , NRW, Deutschland".
// Diese Form koexistiert im selben File mit der Normalform „Ochtrup, …". Vor dem Fix
// erzeugte das führende Leer-Segment leadSeg='' → das Event blieb unaufgelöst und tauchte
// nicht in der Orte-Liste auf. Kern-Anforderung: Leerfelder = „keine Angabe auf dieser
// Ebene", das Leitsegment ist der erste NICHT-leere Wert; die Auflösung ist IDENTISCH zur
// Normalform (Segment-Parsing-Äquivalenz), robust für 4 wie 6 Segmente.
describe('Symptom 2 — Leerfeld-PLAC (Ancestris Fixed-Template)', () => {
  // Kuratierter Bestand: atomares Ochtrup + Beckum in NRW/Deutschland-Hierarchie.
  const ochtrup = place('@OCHTRUP2@', { title: 'Ochtrup', type: 'Town' });
  const nrw = place('@NRW@', {
    title: 'Nordrhein-Westfalen',
    type: 'State',
    enclosedBy: [{ placeId: '@DE@', from: null, to: null }],
  });
  const de = place('@DE@', { title: 'Deutschland', type: 'Country' });
  const beckum = place('@BECKUM@', {
    title: 'Beckum',
    type: 'Town',
    enclosedBy: [{ placeId: '@NRW@', from: null, to: null }],
  });
  const atomicPlaces = placeMap(ochtrup, nrw, de, beckum);

  it('führendes Leerfeld, atomar: ", Ochtrup, , , ," matcht den vorhandenen Ort „Ochtrup"', () => {
    const source = ev('BIRT', { place: ', Ochtrup, , , ,', date: '1950' });
    const res = resolveEvents([source], atomicPlaces, hofMap());
    expect(res.events[0].path).toBe('atomic-po');
    expect(res.events[0].event.placeId).toBe('@OCHTRUP2@');
  });

  it('Äquivalenz: ", Ochtrup, , , ," löst IDENTISCH auf wie „Ochtrup" (kein Leerfeld-Titel-Ort)', () => {
    const empty = resolveEvents([ev('BIRT', { place: ', Ochtrup, , , ,', date: '1950' })], atomicPlaces, hofMap());
    const plain = resolveEvents([ev('BIRT', { place: 'Ochtrup', date: '1950' })], atomicPlaces, hofMap());
    expect(empty.events[0].event.placeId).toBe(plain.events[0].event.placeId);
    expect(empty.events[0].path).toBe(plain.events[0].path);
  });

  it('führendes Leerfeld + inneres Leerfeld, reich: ", Beckum, , , NRW, Deutschland" matcht Beckum über die Hierarchie', () => {
    const source = ev('BIRT', { place: ', Beckum, , , Nordrhein-Westfalen, Deutschland', date: '1900' });
    const res = resolveEvents([source], atomicPlaces, hofMap());
    expect(res.events[0].path).toBe('hierarchy-lead');
    expect(res.events[0].event.placeId).toBe('@BECKUM@');
  });

  it('robust für unterschiedliche Segment-Anzahl: 4-Segment ", Eggerode, , ," wie 6-Segment behandelt', () => {
    const withEggerode = placeMap(ochtrup, nrw, de, beckum, place('@EGG@', { title: 'Eggerode', type: 'Village' }));
    const short = resolveEvents([ev('BIRT', { place: ', Eggerode, , ,', date: '1900' })], withEggerode, hofMap());
    const long = resolveEvents([ev('BIRT', { place: ', Eggerode, , , , ', date: '1900' })], withEggerode, hofMap());
    expect(short.events[0].event.placeId).toBe('@EGG@');
    expect(long.events[0].event.placeId).toBe('@EGG@');
    expect(short.events[0].path).toBe('atomic-po');
    expect(long.events[0].path).toBe('atomic-po');
  });

  it('alle acht echten Leerfeld-Formen aus der GEDCOM-Datei werden aufgelöst (kein stiller Drop)', () => {
    // Genau die im Bugreport gemeldeten Strings + Segment-Längen-Varianten.
    const wall = place('@GRONAU@', { title: 'Gronau', type: 'Town' });
    const seedable = placeMap(
      ochtrup, nrw, de, beckum, wall,
      place('@AACHEN@', { title: 'Aachen', type: 'Town' }),
      place('@BERLIN@', { title: 'Berlin', type: 'City' }),
      place('@BREMEN@', { title: 'Bremen', type: 'City' }),
      place('@BURGDORF@', { title: 'Burgdorf', type: 'Town' }),
      place('@DENEKAMP@', { title: 'Denekamp', type: 'Village' }),
    );
    const realStrings = [
      ', Ochtrup, , , ,',
      ', Aachen, , , , ',
      ', Beckum, , , Nordrhein-Westfalen, Deutschland',
      ', Berlin, , , , Deutschland',
      ', Bremen, , ,, Deutschland',
      ', Burgdorf, , Hannover, , Deutschland',
      ', Denekamp, , , ,',
      ', Eggerode, , ,',
    ];
    const events = realStrings.map((p) => ev('BIRT', { place: p, date: '1900' }));
    const res = resolveEvents(events, seedable, hofMap());
    // Jede Form, deren Leitsegment einen bekannten Ort trifft, bekommt eine placeId.
    // (Eggerode ist hier bewusst NICHT im Bestand → bleibt ungelöst, das ist korrekt.)
    const resolvedLeads = res.events
      .map((r, i) => ({ place: realStrings[i], placeId: r.event.placeId }))
      .filter((x) => x.placeId != null)
      .map((x) => x.place);
    expect(resolvedLeads).toContain(', Ochtrup, , , ,');
    expect(resolvedLeads).toContain(', Aachen, , , , ');
    expect(resolvedLeads).toContain(', Beckum, , , Nordrhein-Westfalen, Deutschland');
    expect(resolvedLeads).toContain(', Berlin, , , , Deutschland');
    expect(resolvedLeads).toContain(', Bremen, , ,, Deutschland');
    expect(resolvedLeads).toContain(', Burgdorf, , Hannover, , Deutschland');
    expect(resolvedLeads).toContain(', Denekamp, , , ,');
    // Kein Leerfeld-Titel-Ort: keine placeId zeigt auf einen leeren/Komma-Titel.
    for (const r of res.events) {
      if (r.event.placeId != null) {
        const t = seedable.get(r.event.placeId)?.title ?? '';
        expect(t).not.toBe('');
        expect(t.startsWith(',')).toBe(false);
      }
    }
  });
});
