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
