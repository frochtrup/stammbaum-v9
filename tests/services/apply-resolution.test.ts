// tests/services/apply-resolution.test.ts — Event-Sammel- + Rückschreib-Logik für den
// Import-Pfad (Spec 11 §4). Prüft, dass ALLE Event-Fundstellen einer Person/Familie
// (birth/chr/death/buri/events[] bzw. marriage/engagement/events[]) in EINEN
// resolveEvents()-Aufruf eingehen und die aufgelösten Kopien an der RICHTIGEN Stelle
// zurückgeschrieben werden — kein Event-Typ wird übersehen, keine Verwechslung der Slots.

import { describe, expect, it } from 'vitest';
import { makeDatabase, makePerson, makeFamily, makeEvent } from '../../core/model';
import { applyPlaceResolution } from '../../services/places/apply-resolution';
import { place } from '../core/places-fixtures';

describe('applyPlaceResolution — sammelt alle Event-Fundstellen', () => {
  it('löst birth/chr/death/buri/events[] einer Person und schreibt sie an die richtige Stelle zurück', () => {
    const db = makeDatabase();
    db.placeObjects.set('P1', place('P1', { title: 'Ochtrup' }));

    const p = makePerson('I1', {
      birth: makeEvent('BIRT', { place: 'Ochtrup' }),
      chr: makeEvent('CHR', { place: 'Ochtrup' }),
      death: makeEvent('DEAT', { place: 'Andernorts' }),
      buri: makeEvent('BURI', { place: 'Ochtrup' }),
      events: [makeEvent('RESI', { place: 'Ochtrup' })]
    });
    db.individuals.set(p.id, p);

    const result = applyPlaceResolution(db);

    const updated = db.individuals.get('I1')!;
    expect(updated.birth.placeId).toBe('P1');
    expect(updated.chr.placeId).toBe('P1');
    expect(updated.buri.placeId).toBe('P1');
    expect(updated.events[0].placeId).toBe('P1');
    // "Andernorts" matcht kein PlaceObject → bleibt unverlinkt, aber der Slot ist NICHT
    // mit einem falschen (z. B. verschobenen) Event vertauscht worden.
    expect(updated.death.placeId).toBeNull();
    expect(updated.death.place).toBe('Andernorts');
    expect(result.review).toEqual([]);
  });

  it('löst marriage/engagement/events[] einer Familie und schreibt sie an die richtige Stelle zurück', () => {
    const db = makeDatabase();
    db.placeObjects.set('P1', place('P1', { title: 'Ochtrup' }));

    const f = makeFamily('F1', {
      engagement: makeEvent('ENGA', { place: 'Ochtrup' }),
      marriage: makeEvent('MARR', { place: 'Ochtrup' }),
      events: [makeEvent('EVEN', { place: 'Ochtrup' })]
    });
    db.families.set(f.id, f);

    applyPlaceResolution(db);

    const updated = db.families.get('F1')!;
    expect(updated.engagement.placeId).toBe('P1');
    expect(updated.marriage.placeId).toBe('P1');
    expect(updated.events[0].placeId).toBe('P1');
  });

  it('mehrere Personen/Familien mit mehreren events[]-Einträgen werden nicht vertauscht', () => {
    const db = makeDatabase();
    db.placeObjects.set('P1', place('P1', { title: 'Ochtrup' }));
    db.placeObjects.set('P2', place('P2', { title: 'Wall' }));

    const p1 = makePerson('I1', { events: [makeEvent('RESI', { place: 'Ochtrup' }), makeEvent('OCCU', { place: 'Wall' })] });
    const p2 = makePerson('I2', { events: [makeEvent('RESI', { place: 'Wall' })] });
    db.individuals.set(p1.id, p1);
    db.individuals.set(p2.id, p2);

    applyPlaceResolution(db);

    expect(db.individuals.get('I1')!.events[0].placeId).toBe('P1');
    expect(db.individuals.get('I1')!.events[1].placeId).toBe('P2');
    expect(db.individuals.get('I2')!.events[0].placeId).toBe('P2');
  });

  it('Hof-Bootstrap (Pfad C) lässt db.hofObjects wachsen und wird als hofObjectsGrew=true gemeldet', () => {
    const db = makeDatabase();
    db.placeObjects.set('P1', place('P1', { title: 'Ochtrup' }));

    const p = makePerson('I1', {
      events: [makeEvent('RESI', { place: 'Wall 33, Ochtrup' })]
    });
    db.individuals.set(p.id, p);

    expect(db.hofObjects.size).toBe(0);
    const result = applyPlaceResolution(db);

    expect(result.hofObjectsGrew).toBe(true);
    expect(db.hofObjects.size).toBe(1);
    expect(db.individuals.get('I1')!.events[0].hofId).not.toBeNull();
  });

  it('ohne Bootstrap bleibt hofObjectsGrew=false und db.hofObjects unverändert in der Größe', () => {
    const db = makeDatabase();
    db.placeObjects.set('P1', place('P1', { title: 'Ochtrup' }));
    const p = makePerson('I1', { birth: makeEvent('BIRT', { place: 'Ochtrup' }) });
    db.individuals.set(p.id, p);

    const result = applyPlaceResolution(db);

    expect(result.hofObjectsGrew).toBe(false);
    expect(db.hofObjects.size).toBe(0);
  });

  it('Non-Hof-Event mit ADDR ohne Hof-Match erzeugt ein Review-Item (Klasse A)', () => {
    const db = makeDatabase();
    db.placeObjects.set('P1', place('P1', { title: 'Ochtrup' }));
    const p = makePerson('I1', { death: makeEvent('DEAT', { place: 'Ochtrup', addr: 'Wall 33' }) });
    db.individuals.set(p.id, p);

    const result = applyPlaceResolution(db);

    expect(result.review).toHaveLength(1);
    expect(result.review[0].klass).toBe('A');
  });
});
