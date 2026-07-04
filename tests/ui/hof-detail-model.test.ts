// tests/ui/hof-detail-model.test.ts — Hof-Steckbrief (Spec 20 §1.8 [K]: Bewohner
// chronologisch). Reine Funktion (TST-5).
import { describe, expect, it } from 'vitest';
import { makeDatabase, makePerson } from '../../core/model';
import { makePlaceRegistry, makeHofRegistry, type PlaceContext } from '../../core/places';
import { place, hof } from '../core/places-fixtures';
import { buildHofDetail } from '../../ui/views/hof/hof-detail-model';

function ctxFor(db: ReturnType<typeof makeDatabase>): PlaceContext {
  return { places: makePlaceRegistry(db.placeObjects), hofs: makeHofRegistry(db.hofObjects) };
}

describe('buildHofDetail — Bewohner chronologisch', () => {
  it('sammelt Personen-Ereignisse, die diesen Hof referenzieren (per hofId)', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));

    const person = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    person.birth.hofId = '@H1@';
    person.birth.placeId = '@P1@';
    person.birth.date = '1 JAN 1900';
    db.individuals.set('@I1@', person);

    const detail = buildHofDetail(db, ctxFor(db), '@H1@');

    expect(detail).not.toBeNull();
    expect(detail!.villageTitle).toBe('Ochtrup');
    expect(detail!.residents).toHaveLength(1);
    expect(detail!.residents[0].personName).toBe('Otto Bauer');
  });

  it('sortiert Bewohner chronologisch, undatierte ans Ende', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@'));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@'));

    const later = makePerson('@I1@', { given: 'B', surname: 'Später' });
    later.birth.hofId = '@H1@';
    later.birth.date = '1 JAN 1950';
    db.individuals.set('@I1@', later);

    const earlier = makePerson('@I2@', { given: 'A', surname: 'Früher' });
    earlier.birth.hofId = '@H1@';
    earlier.birth.date = '1 JAN 1900';
    db.individuals.set('@I2@', earlier);

    const undated = makePerson('@I3@', { given: 'C', surname: 'Undatiert' });
    undated.death.hofId = '@H1@';
    db.individuals.set('@I3@', undated);

    const detail = buildHofDetail(db, ctxFor(db), '@H1@');

    expect(detail!.residents.map((r) => r.personName)).toEqual(['A Früher', 'B Später', 'C Undatiert']);
  });

  it('gibt null zurück, wenn die id nicht existiert', () => {
    const db = makeDatabase();
    expect(buildHofDetail(db, ctxFor(db), '@gone@')).toBeNull();
  });

  it('liefert predecessor/successor-Label über die Adresse des verlinkten Hofs', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@'));
    db.hofObjects.set('@H0@', hof('@H0@', '@P1@', { addrs: [{ value: 'Alter Hof', from: null, to: null }] }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { predecessor: '@H0@' }));

    const detail = buildHofDetail(db, ctxFor(db), '@H1@');

    expect(detail!.predecessorLabel).toBe('Alter Hof');
    expect(detail!.successorLabel).toBeNull();
  });
});
