// tests/ui/hof-review-model.test.ts — "Hof-Zuweisungen prüfen"-Review (Spec 11 §6,
// Spec 20 §1.8 [K]). Ruft NUR den Kern-Klassifikator resolveEvents auf (ADR-v9-18-
// Lehre) — hier wird nur die Owner-Annotation + Zeilen-Aufbereitung getestet.
import { describe, expect, it } from 'vitest';
import { makeDatabase, makePerson, makeFamily } from '../../core/model';
import { place, hof, placeMap } from '../core/places-fixtures';
import { buildHofReview } from '../../ui/views/hof/hof-review-model';

describe('buildHofReview — Klasse A (Non-Hof-Typ, kein Hof im Dorf)', () => {
  it('meldet ein Personen-Ereignis mit ADDR ohne Hof-Match als Klasse A', () => {
    const db = makeDatabase();
    db.placeObjects = placeMap(place('@OCHTRUP@', { title: 'Ochtrup', type: 'Town' }));
    const person = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    person.death.place = 'Ochtrup';
    person.death.addr = 'Wall 33';
    person.death.date = '1900';
    db.individuals.set('@I1@', person);

    const review = buildHofReview(db);

    expect(review.rows).toHaveLength(1);
    expect(review.rows[0].klass).toBe('A');
    expect(review.rows[0].ownerLabel).toBe('Otto Bauer');
    expect(review.rows[0].ownerKind).toBe('person');
    expect(review.rows[0].addr).toBe('Wall 33');
  });

  it('row.villageId liefert das am echten Event verankerte Dorf (aus der resolveEvents-Kopie)', () => {
    const db = makeDatabase();
    db.placeObjects = placeMap(place('@OCHTRUP@', { title: 'Ochtrup', type: 'Town' }));
    const person = makePerson('@I1@');
    person.death.place = 'Ochtrup';
    person.death.addr = 'Wall 33';
    db.individuals.set('@I1@', person);

    const review = buildHofReview(db);

    expect(review.rows[0].villageId).toBe('@OCHTRUP@');
  });
});

describe('buildHofReview — Klasse C (mehrdeutig, Familien-Ereignis)', () => {
  it('meldet eine Familien-Heirat mit ≥2 Hof-Kandidaten als Klasse C', () => {
    const db = makeDatabase();
    db.placeObjects = placeMap(place('@OCHTRUP@', { title: 'Ochtrup', type: 'Town' }));
    db.hofObjects.set('_hof_a', hof('_hof_a', '@OCHTRUP@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    db.hofObjects.set('_hof_b', hof('_hof_b', '@OCHTRUP@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));

    const husband = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    const wife = makePerson('@I2@', { given: 'Anna', surname: 'Klein' });
    db.individuals.set('@I1@', husband);
    db.individuals.set('@I2@', wife);
    const fam = makeFamily('@F1@', { husband: '@I1@', wife: '@I2@' });
    fam.marriage.place = 'Ochtrup';
    fam.marriage.addr = 'Wall 33';
    fam.marriage.type = 'RESI'; // Hof-Typ, damit Pfad B/C überhaupt greift
    db.families.set('@F1@', fam);

    const review = buildHofReview(db);

    expect(review.rows).toHaveLength(1);
    expect(review.rows[0].klass).toBe('C');
    expect(review.rows[0].ownerKind).toBe('family');
    expect(review.rows[0].ownerLabel).toBe('Otto Bauer ⚭ Anna Klein');
    expect(review.rows[0].candidates.map((c) => c.hofId).sort()).toEqual(['_hof_a', '_hof_b']);
  });
});

describe('buildHofReview — keine Review-Zeilen, wenn alles sauber auflöst', () => {
  it('liefert eine leere Liste ohne ADDR-Lücken', () => {
    const db = makeDatabase();
    db.placeObjects = placeMap(place('@OCHTRUP@', { title: 'Ochtrup' }));
    const person = makePerson('@I1@');
    person.birth.place = 'Ochtrup';
    db.individuals.set('@I1@', person);

    const review = buildHofReview(db);

    expect(review.rows).toEqual([]);
  });
});

describe('buildHofReview — Klasse P gehört NICHT in die Hof-Review (Spec 20 §1.8: Klassen A/C/D)', () => {
  // Befund svelte-check 2026-07-16 (HofReview.svelte:25: "Property 'P' is missing in
  // type '{A,C,D}' but required in type 'Record<ReviewClass, string>'"): buildHofReview
  // reichte JEDES ReviewItem aus resolveEvents durch — auch Klasse P, die im PLACE-Pfad
  // entsteht (resolve.ts: `ids.length >= 2 && !ev.addr`, also ein Event OHNE jeden
  // Hof-Bezug: zwei gleichnamige Orte, nicht disambiguierbar). Folge: eine Orts-
  // Mehrdeutigkeit erschien in der HOF-Review mit leerem Klassen-Label
  // (`klassLabel['P']` === undefined, ungeschützt gerendert) und bot dort Hof-Aktionen
  // an, die auf ein Orts-Problem nicht passen. Die UI war korrekt (Spec: A/C/D) —
  // der TYP war zu weit. Kein Informationsverlust durch das Filtern: P hat in der
  // Hof-Ansicht keine sinnvolle Bedeutung (eigene Orts-Review-Ansicht fehlt noch,
  // separat gemeldet).
  it('filtert Klasse-P-Items (Orts-Mehrdeutigkeit ohne ADDR) aus den Hof-Review-Zeilen', () => {
    const db = makeDatabase();
    // Zwei gleichnamige Orte ohne disambiguierenden Elter -> findAllByName liefert 2.
    db.placeObjects = placeMap(
      place('@OL_DE@', { title: 'Oldenburg', type: 'Town' }),
      place('@OL_US@', { title: 'Oldenburg', type: 'Town' }),
    );
    const person = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    person.death.place = 'Oldenburg'; // atomarer PLAC, KEIN addr -> Klasse P
    person.death.date = '1900';
    db.individuals.set('@I1@', person);

    const review = buildHofReview(db);

    // Bewusst über `string` verglichen: seit dem Fix schließt `HofReviewClass` das 'P'
    // bereits TYPMÄSSIG aus — geprüft werden soll hier aber das LAUFZEIT-Verhalten des
    // Filters (der Kern liefert weiterhin P-Items), nicht die Typdeklaration.
    expect(review.rows.every((r) => (r.klass as string) !== 'P')).toBe(true);
    expect(review.rows).toHaveLength(0);
  });

  it('lässt die echten Hof-Klassen (A) unberührt, wenn im selben Lauf ein P-Item auftritt', () => {
    const db = makeDatabase();
    db.placeObjects = placeMap(
      place('@OL_DE@', { title: 'Oldenburg', type: 'Town' }),
      place('@OL_US@', { title: 'Oldenburg', type: 'Town' }),
      place('@OCHTRUP@', { title: 'Ochtrup', type: 'Town' }),
    );
    const pPlace = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    pPlace.death.place = 'Oldenburg'; // -> P, muss verschwinden
    pPlace.death.date = '1900';
    db.individuals.set('@I1@', pPlace);
    const pHof = makePerson('@I2@', { given: 'Emma', surname: 'Meier' });
    pHof.death.place = 'Ochtrup';
    pHof.death.addr = 'Wall 33'; // -> A, muss bleiben
    pHof.death.date = '1900';
    db.individuals.set('@I2@', pHof);

    const review = buildHofReview(db);

    expect(review.rows).toHaveLength(1);
    expect(review.rows[0].klass).toBe('A');
    expect(review.rows[0].ownerLabel).toBe('Emma Meier');
  });
});
