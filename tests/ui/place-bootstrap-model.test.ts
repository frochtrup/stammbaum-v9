// tests/ui/place-bootstrap-model.test.ts — Orte-Bootstrap-Vorschlag, UI-Aufbereitung
// (Spec 20 §1.7 [K], ADR-v9-27): Event-Sammlung über Personen+Familien, Aufruf der
// Kern-Funktion suggestPlaceCandidates, deterministische ID-Vergabe mit Kollisions-
// Fallback, Entwurf-PlaceObject-Konstruktion. Reine Funktionen (TST-5).
import { describe, expect, it } from 'vitest';
import { makeDatabase, makePerson, makeFamily } from '../../core/model';
import { makePlaceRegistry, makeHofRegistry } from '../../core/places';
import type { PlaceContext } from '../../core/places';
import { place, placeMap, hofMap } from '../core/places-fixtures';
import {
  collectAllEvents,
  buildPlaceCandidates,
  makePlaceId,
  draftPlaceObject,
} from '../../ui/views/place/place-bootstrap-model';

function ctxFrom(places = placeMap(), hofs = hofMap()): PlaceContext {
  return { places: makePlaceRegistry(places), hofs: makeHofRegistry(hofs) };
}

describe('collectAllEvents — flache Sammlung aus Personen + Familien', () => {
  it('sammelt Spezial-Events + events[] von Personen und Familien', () => {
    const db = makeDatabase();
    const person = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    person.birth.place = 'Ochtrup';
    db.individuals.set('@I1@', person);
    const husband = makePerson('@I2@', { given: 'Karl', surname: 'Meier' });
    const wife = makePerson('@I3@', { given: 'Anna', surname: 'Klein' });
    db.individuals.set('@I2@', husband);
    db.individuals.set('@I3@', wife);
    const fam = makeFamily('@F1@', { husband: '@I2@', wife: '@I3@' });
    fam.marriage.place = 'Münster';
    db.families.set('@F1@', fam);

    const events = collectAllEvents(db);

    expect(events).toContain(person.birth);
    expect(events).toContain(fam.marriage);
    // Person: birth/chr/death/buri (4) je Person + events[] (0 hier) = 4*3 = 12; Familie: engagement/marriage (2).
    expect(events.length).toBe(3 * 4 + 2);
  });
});

describe('buildPlaceCandidates — Kern-Aufruf über alle Events der Datenbank', () => {
  it('liefert Kandidaten für unaufgelöste Orte aus Personen- und Familien-Events', () => {
    const db = makeDatabase();
    const person = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    person.birth.place = 'Ochtrup';
    db.individuals.set('@I1@', person);
    const ctx = ctxFrom();

    const candidates = buildPlaceCandidates(db, ctx);

    expect(candidates.map((c) => c.title)).toEqual(['Ochtrup']);
    expect(candidates[0].sourceEventCount).toBe(1);
    expect(candidates[0].sampleEventType).toBe('BIRT');
  });

  it('schon aufgelöste Orte erzeugen keinen Kandidaten', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup', type: 'Town' }));
    const person = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    person.birth.place = 'Ochtrup';
    person.birth.placeId = '@P1@';
    db.individuals.set('@I1@', person);
    const ctx = ctxFrom(db.placeObjects);

    expect(buildPlaceCandidates(db, ctx)).toEqual([]);
  });
});

describe('makePlaceId — deterministischer Slug + Kollisions-Suffix (Vorbild makeHofId)', () => {
  it('erzeugt _place_<slug> ohne Kollision', () => {
    expect(makePlaceId('Ochtrup', placeMap())).toBe('_place_ochtrup');
  });

  it('hängt bei Basis-Kollision einen Suffix _2 an', () => {
    const existing = placeMap(place('_place_ochtrup', { title: 'Ochtrup (alt)' }));
    expect(makePlaceId('Ochtrup', existing)).toBe('_place_ochtrup_2');
  });

  it('erhöht den Suffix weiter, falls auch _2 schon belegt ist', () => {
    const existing = placeMap(
      place('_place_ochtrup', { title: 'x' }),
      place('_place_ochtrup_2', { title: 'y' }),
    );
    expect(makePlaceId('Ochtrup', existing)).toBe('_place_ochtrup_3');
  });

  it('Sonderzeichen/Leerzeichen werden zu Unterstrichen normalisiert', () => {
    expect(makePlaceId('Bad Säckingen', placeMap())).toBe('_place_bad_s_ckingen');
  });

  it('leerer Slug fällt auf "ort" zurück', () => {
    expect(makePlaceId('!!!', placeMap())).toBe('_place_ort');
  });
});

describe('draftPlaceObject — Entwurf aus bestätigtem Kandidaten', () => {
  it('baut ein PlaceObject mit Titel gesetzt, Rest leer/Standard', () => {
    const candidate = { title: 'Ochtrup', sourceEventCount: 3, sampleEventType: 'BIRT' };

    const draft = draftPlaceObject(candidate, placeMap());

    expect(draft.id).toBe('_place_ochtrup');
    expect(draft.title).toBe('Ochtrup');
    expect(draft.type).toBe('');
    expect(draft.pnames).toEqual([]);
    expect(draft.enclosedBy).toEqual([]);
    expect(draft.lat).toBeNull();
    expect(draft.long).toBeNull();
  });

  it('vermeidet ID-Kollision mit bestehenden PlaceObjects', () => {
    const existing = placeMap(place('_place_ochtrup', { title: 'Ochtrup (Bestand)' }));
    const candidate = { title: 'Ochtrup', sourceEventCount: 1, sampleEventType: 'DEAT' };

    const draft = draftPlaceObject(candidate, existing);

    expect(draft.id).toBe('_place_ochtrup_2');
  });
});
