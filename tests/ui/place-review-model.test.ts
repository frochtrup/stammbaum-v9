// tests/ui/place-review-model.test.ts — "Orts-Zuweisungen prüfen"-Review, Klasse P
// (Spec 11 §6, Spec 20 §1.7). Ruft NUR den Kern-Klassifikator resolveEvents auf
// (ADR-v9-18-Lehre) — hier wird die Filterung auf P, die Kandidaten-Auflösung und die
// Owner-Annotation getestet.
//
// Hintergrund (2026-07-16): Klasse P hatte bis dahin GAR KEINE Ansicht — sie lief
// fälschlich in die HOF-Review (mit leerem Klassen-Label und unpassenden Hof-Aktionen)
// und war nach deren Filterung unsichtbar. Diese Datei deckt die neue, eigene Ansicht ab.
import { describe, expect, it } from 'vitest';
import { makeDatabase, makeEvent, makePerson, makeFamily } from '../../core/model';
import { place, placeMap } from '../core/places-fixtures';
import { makePlaceRegistry, makeHofRegistry, type PlaceContext } from '../../core/places';
import { buildPlaceReview } from '../../ui/views/place/place-review-model';

/** Registry über den ECHTEN Datenbestand — die Kandidaten-Labels brauchen die Ketten
 *  (ohne sie sind zwei gleichnamige Orte ununterscheidbar, s. Modul-Kommentar). */
function ctxFor(db: ReturnType<typeof makeDatabase>): PlaceContext {
  return { places: makePlaceRegistry(db.placeObjects), hofs: makeHofRegistry(db.hofObjects) };
}

/** Bequemlichkeits-Wrapper: baut den Pflicht-Context aus derselben db. */
function buildPlaceReviewFor(db: ReturnType<typeof makeDatabase>) {
  return buildPlaceReview(db, ctxFor(db));
}

/** Zwei gleichnamige Orte ohne disambiguierenden Elter → findAllByName liefert 2 → P. */
function dbWithAmbiguousPlace() {
  const db = makeDatabase();
  db.placeObjects = placeMap(
    place('@OL_DE@', { title: 'Oldenburg', type: 'Town' }),
    place('@OL_US@', { title: 'Oldenburg', type: 'Town' }),
  );
  const person = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
  person.death.place = 'Oldenburg'; // atomarer PLAC, KEIN addr
  person.death.date = '1900';
  db.individuals.set('@I1@', person);
  return db;
}

describe('buildPlaceReview — Klasse P (mehrdeutiger Verwaltungs-Ort)', () => {
  it('meldet ein Event mit atomarem PLAC auf ≥2 gleichnamige Orte als Klasse P', () => {
    const review = buildPlaceReviewFor(dbWithAmbiguousPlace());

    expect(review.rows).toHaveLength(1);
    expect(review.rows[0].klass).toBe('P');
    expect(review.rows[0].placeText).toBe('Oldenburg');
    expect(review.rows[0].ownerLabel).toBe('Otto Bauer');
    expect(review.rows[0].ownerKind).toBe('person');
  });

  it('liefert die mehrdeutigen Orts-Kandidaten mit auflösbarem Label', () => {
    const review = buildPlaceReviewFor(dbWithAmbiguousPlace());

    const ids = review.rows[0].candidates.map((c) => c.placeId).sort();
    expect(ids).toEqual(['@OL_DE@', '@OL_US@']);
    expect(review.rows[0].candidates.every((c) => c.label === 'Oldenburg')).toBe(true);
  });

  it('zeigt in der Kandidaten-Beschriftung die volle Kette, wenn eine existiert (Disambiguierungs-Hilfe)', () => {
    const db = makeDatabase();
    db.placeObjects = placeMap(
      place('@NDS@', { title: 'Niedersachsen' }),
      place('@USA@', { title: 'USA' }),
      place('@OL_DE@', { title: 'Oldenburg', enclosedBy: [{ placeId: '@NDS@', from: null, to: null }] }),
      place('@OL_US@', { title: 'Oldenburg', enclosedBy: [{ placeId: '@USA@', from: null, to: null }] }),
    );
    const person = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    person.death.place = 'Oldenburg';
    person.death.date = '1900';
    db.individuals.set('@I1@', person);

    const review = buildPlaceReviewFor(db);

    const labels = review.rows[0].candidates.map((c) => c.label).sort();
    // Ohne Kette wären beide schlicht "Oldenburg" — ununterscheidbar, also nutzlos.
    expect(labels).toEqual(['Oldenburg › Niedersachsen', 'Oldenburg › USA']);
  });

  it('filtert Hof-Klassen (A/C/D) aus — die gehören in die Hof-Review (Spec 20 §1.8)', () => {
    const db = dbWithAmbiguousPlace();
    db.placeObjects.set('@OCHTRUP@', place('@OCHTRUP@', { title: 'Ochtrup', type: 'Town' }));
    const pHof = makePerson('@I2@', { given: 'Emma', surname: 'Meier' });
    pHof.death.place = 'Ochtrup';
    pHof.death.addr = 'Wall 33'; // → Klasse A, gehört NICHT hierher
    pHof.death.date = '1900';
    db.individuals.set('@I2@', pHof);

    const review = buildPlaceReviewFor(db);

    expect(review.rows).toHaveLength(1);
    expect(review.rows[0].klass).toBe('P');
    expect(review.rows[0].ownerLabel).toBe('Otto Bauer');
  });

  it('meldet nichts, wenn der Ort eindeutig auflösbar ist', () => {
    const db = makeDatabase();
    db.placeObjects = placeMap(place('@OL_DE@', { title: 'Oldenburg', type: 'Town' }));
    const person = makePerson('@I1@');
    person.death.place = 'Oldenburg';
    person.death.date = '1900';
    db.individuals.set('@I1@', person);

    expect(buildPlaceReviewFor(db).rows).toHaveLength(0);
  });

  it('annotiert Familien-Events mit dem Familien-Label', () => {
    const db = dbWithAmbiguousPlace();
    db.individuals.delete('@I1@');
    const h = makePerson('@H@', { given: 'Hans', surname: 'Klein' });
    const w = makePerson('@W@', { given: 'Grete', surname: 'Klein' });
    db.individuals.set('@H@', h);
    db.individuals.set('@W@', w);
    const fam = makeFamily('@F1@', { husband: '@H@', wife: '@W@' });
    fam.marriage.place = 'Oldenburg';
    fam.marriage.date = '1900';
    db.families.set('@F1@', fam);

    const review = buildPlaceReviewFor(db);

    expect(review.rows).toHaveLength(1);
    expect(review.rows[0].ownerKind).toBe('family');
    expect(review.rows[0].ownerLabel).toBe('Hans Klein ⚭ Grete Klein');
  });

  it('flatEvents[row.index] zeigt auf das ECHTE Event (Kommando-Rückführung, Reihenfolge-Invariante)', () => {
    const db = dbWithAmbiguousPlace();
    const review = buildPlaceReviewFor(db);

    const real = review.flatEvents[review.rows[0].index];
    // Identität, nicht nur Gleichheit: resolveEvents arbeitet auf Kopien, die Aktion
    // muss das in der Person lebende Original treffen.
    expect(real).toBe(db.individuals.get('@I1@')!.death);
  });
});

describe('buildPlaceReview — nicht unterscheidbare Kandidaten (Dubletten-Fall)', () => {
  // Befund der eigenen Browser-Verifikation 2026-07-16 am echten Datenbestand: von 96
  // Klasse-P-Zeilen trugen 23 KANDIDATEN MIT IDENTISCHEM LABEL — z. B. vier PlaceObjects
  // "Bremen", alle mit Kette "Bremen › Deutschland", alle unangereichert, alle ohne
  // Koordinaten. In jeder sichtbaren Eigenschaft gleich = echte Dubletten. "Ort wählen"
  // ist dort die FALSCHE Aktion: egal welchen der vier der Nutzer nimmt, die anderen drei
  // bleiben liegen und derselbe Fall kehrt beim nächsten Import wieder. Richtiger Weg ist
  // der Massen-Dedup (§9.2) — danach bleibt EIN Kandidat und die Zuordnung wird eindeutig,
  // ganz ohne Wahl. Das Flag trägt diese Unterscheidung in die Ansicht.
  it('markiert eine Zeile, deren Kandidaten alle dasselbe Label tragen', () => {
    const db = makeDatabase();
    // Vier gleichnamige Orte mit IDENTISCHER Kette (der reale "Bremen"-Fall).
    db.placeObjects = placeMap(
      place('@DE@', { title: 'Deutschland' }),
      place('@B1@', { title: 'Bremen', enclosedBy: [{ placeId: '@DE@', from: null, to: null }] }),
      place('@B2@', { title: 'Bremen', enclosedBy: [{ placeId: '@DE@', from: null, to: null }] }),
    );
    const person = makePerson('@I1@', { given: 'Klaus', surname: 'Decker' });
    person.death.place = 'Bremen';
    person.death.date = '1950';
    db.individuals.set('@I1@', person);

    const review = buildPlaceReviewFor(db);

    expect(review.rows).toHaveLength(1);
    expect(review.rows[0].candidatesIndistinguishable).toBe(true);
  });

  it('markiert NICHT, wenn die Ketten die Kandidaten unterscheiden', () => {
    const db = makeDatabase();
    db.placeObjects = placeMap(
      place('@NDS@', { title: 'Niedersachsen' }),
      place('@USA@', { title: 'USA' }),
      place('@OL_DE@', { title: 'Oldenburg', enclosedBy: [{ placeId: '@NDS@', from: null, to: null }] }),
      place('@OL_US@', { title: 'Oldenburg', enclosedBy: [{ placeId: '@USA@', from: null, to: null }] }),
    );
    const person = makePerson('@I1@');
    person.death.place = 'Oldenburg';
    person.death.date = '1900';
    db.individuals.set('@I1@', person);

    const review = buildPlaceReviewFor(db);

    expect(review.rows[0].candidatesIndistinguishable).toBe(false);
  });
});

// ADR-v9-191 / BL-267 — die Zuordnungs-Fläche trug bis dahin GAR KEIN Kurations-Signal.
describe('buildPlaceReview — Kurationsstand am Kandidaten (ADR-v9-191)', () => {
  it('liefert Grad und Prüf-Marker je Kandidat — dort, wo die Kette nicht unterscheidet', () => {
    const db = makeDatabase();
    // Zwei gleichnamige Orte OHNE Elternkette: `candidatesIndistinguishable` schlägt an,
    // das Label ist bei beiden identisch. Genau hier ist der Kurationsstand das Einzige,
    // was noch unterscheidet.
    db.placeObjects.set('@A@', place('@A@', { title: 'Bremen' }));
    db.placeObjects.set(
      '@B@',
      place('@B@', {
        title: 'Bremen',
        type: 'Town',
        pnames: [{ value: 'Freie Hansestadt Bremen', from: 1806, to: null }],
        lat: 53.07,
        long: 8.8,
        note: 'Hansestadt',
        reviewedAt: 1_700_000_000_000,
      }),
    );
    const p = makePerson('@I1@', { birth: makeEvent('BIRT', { place: 'Bremen' }) });
    db.individuals.set(p.id, p);

    const result = buildPlaceReview(db, ctxFor(db));

    expect(result.rows).toHaveLength(1);
    const byId = new Map(result.rows[0].candidates.map((c) => [c.placeId, c]));
    expect(byId.get('@A@')!.level).toBe('none');
    expect(byId.get('@A@')!.reviewed).toBe(false);
    expect(byId.get('@B@')!.level).toBe('rich');
    expect(byId.get('@B@')!.reviewed).toBe(true);
    // Die Labels selbst unterscheiden nicht — der Grund, warum der Stand hier hingehört.
    expect(byId.get('@A@')!.label).toBe(byId.get('@B@')!.label);
  });
});
