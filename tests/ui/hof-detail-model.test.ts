// tests/ui/hof-detail-model.test.ts — Hof-Steckbrief (Spec 20 §1.8 [K]: Bewohner
// chronologisch; Spec 21 §10j: RESI/CENS = "Bewohner", PROP = "Eigentümer", getrennt
// statt fachlich falsch vermischt). Reine Funktion (TST-5).
import { describe, expect, it } from 'vitest';
import { makeDatabase, makePerson, makeEvent } from '../../core/model';
import { makePlaceRegistry, makeHofRegistry, type PlaceContext } from '../../core/places';
import { place, hof } from '../core/places-fixtures';
import { buildHofDetail, type HofResidentRow } from '../../ui/views/hof/hof-detail-model';

function ctxFor(db: ReturnType<typeof makeDatabase>): PlaceContext {
  return { places: makePlaceRegistry(db.placeObjects), hofs: makeHofRegistry(db.hofObjects) };
}

/** Alle Zeilen über alle Gruppen hinweg, in Gruppen-Reihenfolge — für Assertions, die
 *  sich (noch) nicht für die Bewohner-/Eigentümer-Trennung interessieren. */
function allRows(groups: { rows: HofResidentRow[] }[]): HofResidentRow[] {
  return groups.flatMap((g) => g.rows);
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
    const rows = allRows(detail!.residentGroups);
    expect(rows).toHaveLength(1);
    expect(rows[0].personName).toBe('Otto Bauer');
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

    // Alle drei sind Lebens-Ereignisse (BIRT/DEAT) -> eine gemeinsame "Bewohner"-Gruppe,
    // intern weiterhin chronologisch (undatiert ans Ende).
    expect(detail!.residentGroups).toHaveLength(1);
    expect(detail!.residentGroups[0].type).toBe('Bewohner');
    expect(detail!.residentGroups[0].rows.map((r) => r.personName)).toEqual([
      'A Früher',
      'B Später',
      'C Undatiert',
    ]);
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

describe('buildHofDetail — Bewohner/Eigentümer getrennt (Spec 21 §10j)', () => {
  it('gruppiert RESI/CENS als "Bewohner" und PROP als "Eigentümer", nicht vermischt', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@'));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@'));

    const resident = makePerson('@I1@', { given: 'Anna', surname: 'Meyer' });
    resident.events.push(makeEvent('RESI', { date: '1900', hofId: '@H1@' }));
    db.individuals.set('@I1@', resident);

    const owner = makePerson('@I2@', { given: 'Bernd', surname: 'Schulze' });
    owner.events.push(makeEvent('PROP', { date: '1905', hofId: '@H1@' }));
    db.individuals.set('@I2@', owner);

    const detail = buildHofDetail(db, ctxFor(db), '@H1@');

    const byType = new Map(detail!.residentGroups.map((g) => [g.type, g.rows.map((r) => r.personName)]));
    expect(byType.get('Bewohner')).toEqual(['Anna Meyer']);
    expect(byType.get('Eigentümer')).toEqual(['Bernd Schulze']);
  });

  it('liefert je Gruppe weiterhin chronologische Reihenfolge', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@'));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@'));

    const laterOwner = makePerson('@I1@', { given: 'Später', surname: 'Eigner' });
    laterOwner.events.push(makeEvent('PROP', { date: '1950', hofId: '@H1@' }));
    db.individuals.set('@I1@', laterOwner);

    const earlierOwner = makePerson('@I2@', { given: 'Früher', surname: 'Eigner' });
    earlierOwner.events.push(makeEvent('PROP', { date: '1900', hofId: '@H1@' }));
    db.individuals.set('@I2@', earlierOwner);

    const detail = buildHofDetail(db, ctxFor(db), '@H1@');

    const owners = detail!.residentGroups.find((g) => g.type === 'Eigentümer')!;
    expect(owners.rows.map((r) => r.personName)).toEqual(['Früher Eigner', 'Später Eigner']);
  });
});
