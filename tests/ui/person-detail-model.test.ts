// tests/ui/person-detail-model.test.ts — Personen-Detail-Projektion (Spec 20 §1.4 [K]):
// Ereignisse, Quellen-Zitate, Geo-Koordinaten, Familien-Navigationszeilen. Reine
// Funktion, deshalb Unit statt Component-Test (TST-5).
import { describe, expect, it } from 'vitest';
import { makeDatabase, makePerson, makeFamily, makeCitation } from '../../core/model';
import { makePlaceRegistry, makeHofRegistry, type PlaceContext } from '../../core/places';
import { buildPersonDetail } from '../../ui/views/person/person-detail-model';

function emptyContext(): PlaceContext {
  return { places: makePlaceRegistry(new Map()), hofs: makeHofRegistry(new Map()) };
}

describe('buildPersonDetail — Ereignisse/Quellen/Familien-Navigation', () => {
  it('gibt null zurück, wenn die id im aktuellen Datenbestand fehlt (definierter Fallback)', () => {
    const db = makeDatabase();
    expect(buildPersonDetail(db, emptyContext(), '@I999@')).toBeNull();
  });

  it('listet nur tatsächlich vorhandene Sonder-Ereignisse (Geburt/Tod), keine leeren Platzhalter', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.birth.date = '1 JAN 1900';
    db.individuals.set('@I1@', p);

    const detail = buildPersonDetail(db, emptyContext(), '@I1@')!;

    expect(detail.events.map((e) => e.label)).toEqual(['Geburt']);
  });

  it('reicht Quellen-Zitate eines Ereignisses unverändert durch (für die §N-Badge-Darstellung)', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.birth.date = '1 JAN 1900';
    p.birth.citations.push(makeCitation('@S1@', { quay: 2 }));
    db.individuals.set('@I1@', p);

    const detail = buildPersonDetail(db, emptyContext(), '@I1@')!;

    expect(detail.events[0].citations).toHaveLength(1);
    expect(detail.events[0].citations[0].sourceId).toBe('@S1@');
    expect(detail.events[0].citations[0].quay).toBe(2);
  });

  it('liefert Koordinaten für ein Ereignis, wenn im Modell vorhanden (Geo-Link-Voraussetzung)', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.birth.date = '1 JAN 1900';
    p.birth.lati = 52.1;
    p.birth.long = 7.6;
    db.individuals.set('@I1@', p);

    const detail = buildPersonDetail(db, emptyContext(), '@I1@')!;

    expect(detail.events[0].coords).toEqual({ lat: 52.1, long: 7.6 });
  });

  it('liefert keine Koordinaten, wenn weder Event noch Ort/Hof welche tragen', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.birth.date = '1 JAN 1900';
    db.individuals.set('@I1@', p);

    const detail = buildPersonDetail(db, emptyContext(), '@I1@')!;

    expect(detail.events[0].coords).toBeNull();
  });

  it('baut anklickbare Familien-Navigationszeilen für eigene Familie (parentIn) und Herkunftsfamilie (childOf)', () => {
    const db = makeDatabase();
    const child = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    const parent = makePerson('@I2@', { given: 'Otto', surname: 'Bauer' });
    const spouse = makePerson('@I3@', { given: 'Lisa', surname: 'Klein' });

    const famChild = makeFamily('@F1@', { husband: '@I2@', children: ['@I1@'] });
    const famOwn = makeFamily('@F2@', { husband: '@I1@', wife: '@I3@' });

    child.childOf.push({
      familyId: '@F1@',
      pedigree: 'birth',
      fatherRel: '',
      motherRel: '',
      fatherRelSeen: false,
      motherRelSeen: false,
      citations: [],
    });
    child.parentIn.push('@F2@');

    db.individuals.set('@I1@', child);
    db.individuals.set('@I2@', parent);
    db.individuals.set('@I3@', spouse);
    db.families.set('@F1@', famChild);
    db.families.set('@F2@', famOwn);

    const detail = buildPersonDetail(db, emptyContext(), '@I1@')!;

    expect(detail.families).toHaveLength(2);
    const own = detail.families.find((f) => f.role === 'parentIn')!;
    expect(own.members.map((m) => m.personId)).toEqual(['@I3@']);
    const origin = detail.families.find((f) => f.role === 'childOf')!;
    expect(origin.members.map((m) => m.personId)).toEqual(['@I2@']);
  });
});
