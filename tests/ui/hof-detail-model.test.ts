// tests/ui/hof-detail-model.test.ts — Hof-Steckbrief (Spec 20 §1.8 [K]: Bewohner
// chronologisch; Spec 21 §10j, Nachtrag 2026-07-10: Bewohner UND Eigentümer in EINER
// zeitlich integrierten Liste, Differenzierung über `row.role`, nicht über getrennte
// Sektionen). Reine Funktion (TST-5).
import { describe, expect, it } from 'vitest';
import { makeDatabase, makePerson, makeEvent } from '../../core/model';
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

  it('sortiert Bewohner UND Eigentümer gemeinsam chronologisch, undatierte ans Ende', () => {
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

describe('buildHofDetail — Mini-Karten-Kontext (BL-214, ADR-v9-147)', () => {
  it('liefert Dorf- + Geschwisterhof-Koordinaten für den Ausschnitt (nur die mit Koordinaten)', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup', lat: 52.21, long: 7.17 }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }], lat: 52.2, long: 7.19 }));
    db.hofObjects.set('@H2@', hof('@H2@', '@P1@', { addrs: [{ value: 'Wall 48', from: null, to: null }], lat: 52.19, long: 7.22 }));
    db.hofObjects.set('@H3@', hof('@H3@', '@P1@', { addrs: [{ value: 'Ohne Koord', from: null, to: null }] })); // lat/long null

    const detail = buildHofDetail(db, ctxFor(db), '@H1@');
    expect(detail!.villageCoords).toEqual({ lat: 52.21, long: 7.17 });
    // Nur der Geschwisterhof MIT Koordinaten (H2), nicht H3 (ohne) und nicht H1 (selbst).
    expect(detail!.siblingCoords).toEqual([{ lat: 52.19, long: 7.22 }]);
  });

  it('villageCoords ist null, wenn das Dorf keine Koordinaten trägt', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' })); // ohne Koordinaten
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }], lat: 52.2, long: 7.19 }));

    const detail = buildHofDetail(db, ctxFor(db), '@H1@');
    expect(detail!.villageCoords).toBeNull();
    expect(detail!.siblingCoords).toEqual([]);
  });
});

describe('buildHofDetail — Bewohner/Eigentümer zeitlich integriert (Spec 21 §10j, Nachtrag 2026-07-10)', () => {
  it('markiert RESI/CENS als "Bewohner" und PROP als "Eigentümer", in EINER chronologischen Liste', () => {
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

    // Eine gemeinsame, chronologische Liste (nicht nach Rolle gruppiert) — Anna (1900)
    // vor Bernd (1905), jeweils mit ihrer eigenen Rolle markiert.
    expect(detail!.residents.map((r) => [r.personName, r.role])).toEqual([
      ['Anna Meyer', 'Bewohner'],
      ['Bernd Schulze', 'Eigentümer'],
    ]);
  });

  it('mischt Bewohner- und Eigentümer-Zeilen chronologisch, statt sie nach Rolle zu trennen', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@'));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@'));

    const laterOwner = makePerson('@I1@', { given: 'Später', surname: 'Eigner' });
    laterOwner.events.push(makeEvent('PROP', { date: '1950', hofId: '@H1@' }));
    db.individuals.set('@I1@', laterOwner);

    const earlierResident = makePerson('@I2@', { given: 'Früher', surname: 'Bewohner' });
    earlierResident.events.push(makeEvent('RESI', { date: '1900', hofId: '@H1@' }));
    db.individuals.set('@I2@', earlierResident);

    const detail = buildHofDetail(db, ctxFor(db), '@H1@');

    // Chronologisch (1900 vor 1950), NICHT nach Rolle gruppiert (sonst stünde
    // "Später Eigner" trotz höherem Jahr vor "Früher Bewohner").
    expect(detail!.residents.map((r) => r.personName)).toEqual(['Früher Bewohner', 'Später Eigner']);
  });

  it('stellt bei GLEICHEM Jahr Eigentümer (PROP) vor Bewohner (Nutzer-Vorgabe 2026-07-10)', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@'));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@'));

    const resident = makePerson('@I1@', { given: 'Anna', surname: 'Bewohnerin' });
    resident.events.push(makeEvent('RESI', { date: '1950', hofId: '@H1@' }));
    db.individuals.set('@I1@', resident);

    const owner = makePerson('@I2@', { given: 'Zeno', surname: 'Eigentümer' });
    owner.events.push(makeEvent('PROP', { date: '1950', hofId: '@H1@' }));
    db.individuals.set('@I2@', owner);

    const detail = buildHofDetail(db, ctxFor(db), '@H1@');

    // Beide 1950 — "Zeno Eigentümer" käme alphabetisch NACH "Anna Bewohnerin",
    // steht aber durch die Rollen-Priorität (Eigentümer vor Bewohner) trotzdem zuerst.
    expect(detail!.residents.map((r) => [r.personName, r.role])).toEqual([
      ['Zeno Eigentümer', 'Eigentümer'],
      ['Anna Bewohnerin', 'Bewohner'],
    ]);
  });

  it('übersetzt das Label (RESI/PROP erscheinen nicht mehr roh, Nutzer-Fund 2026-07-10)', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@'));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@'));

    const resident = makePerson('@I1@', { given: 'Anna', surname: 'Meyer' });
    resident.events.push(makeEvent('RESI', { date: '1950', hofId: '@H1@' }));
    db.individuals.set('@I1@', resident);

    const owner = makePerson('@I2@', { given: 'Bernd', surname: 'Schulze' });
    owner.events.push(makeEvent('PROP', { date: '1960', hofId: '@H1@' }));
    db.individuals.set('@I2@', owner);

    const detail = buildHofDetail(db, ctxFor(db), '@H1@');

    expect(detail!.residents.map((r) => r.label)).toEqual(['Wohnort', 'Eigentum']);
  });
});
