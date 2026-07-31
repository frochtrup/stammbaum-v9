// tests/ui/map-explore-model.test.ts — Orts-Explorationspanel der Karte (BL-210,
// Spec 20 §1.9). Reine Funktion (TST-5), build-frei.
//
// TST-16 / feedback_test_precondition_masks_bug: der Hof-Fall wird BEWUSST über den
// unangereicherten Weg geprüft — Ereignis mit `addr`, OHNE gesetztes `ev.hofId`. Wer
// das Zielfeld direkt setzt, prüft nur den seltenen Ast; der Regelfall direkt nach dem
// Import ist die Auflösung über den `eventHofId`-Chokepoint (Spec 11 §5).
import { describe, expect, it } from 'vitest';
import { makeDatabase, makePerson, makeEvent } from '../../core/model';
import { makePlaceRegistry, makeHofRegistry, type PlaceContext } from '../../core/places';
import { place, hof } from '../core/places-fixtures';
import { buildMapExplore } from '../../ui/views/map/map-explore-model';

function ctxFor(db: ReturnType<typeof makeDatabase>): PlaceContext {
  return { places: makePlaceRegistry(db.placeObjects), hofs: makeHofRegistry(db.hofObjects) };
}

describe('buildMapExplore (BL-210)', () => {
  it('Ortsmarker: liefert die Ortszeitgenossen-Zeilen mit Titel über den Anzeigenamen-Chokepoint', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup', shortName: 'Ochtrup (Westf.)' }));
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.birth.placeId = '@P1@';
    p.birth.date = '1 JAN 1850';
    db.individuals.set('@I1@', p);

    const model = buildMapExplore(db, ctxFor(db), '@P1@');

    expect(model).not.toBeNull();
    expect(model!.kind).toBe('place');
    // `placeDisplayName` bevorzugt den Kurznamen (INV-UI-14) — kein roher `title`.
    expect(model!.title).toBe('Ochtrup (Westf.)');
    expect(model!.rows).toHaveLength(1);
    expect(model!.rows[0].personName).toBe('Anna Bauer');
    expect(model!.rows[0].year).toBe(1850);
  });

  it('Hofmarker: liefert Bewohner/Eigentümer mit der Rolle als Detail — auch OHNE gesetztes ev.hofId (Chokepoint-Auflösung, TST-16)', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));

    const p = makePerson('@I1@', { given: 'Otto', surname: 'Meyer' });
    // BEWUSST kein `hofId` — nur Ort + Adresse, wie direkt nach dem Import.
    p.events.push(makeEvent('RESI', { placeId: '@P1@', addr: 'Wall 33', date: '1 JAN 1900' }));
    db.individuals.set('@I1@', p);

    const model = buildMapExplore(db, ctxFor(db), '@H1@');

    expect(model).not.toBeNull();
    expect(model!.kind).toBe('hof');
    expect(model!.title).toBe('Wall 33');
    expect(model!.rows.map((r) => r.personName)).toEqual(['Otto Meyer']);
    expect(model!.rows[0].detail).toBe('Bewohner');
  });

  it('Ortsmarker: ein Ereignis an einem Hof DIESES Orts trägt den Hof-Namen als Detail', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    const p = makePerson('@I1@', { given: 'Otto', surname: 'Meyer' });
    p.events.push(makeEvent('RESI', { placeId: '@P1@', addr: 'Wall 33', date: '1 JAN 1900' }));
    db.individuals.set('@I1@', p);

    const model = buildMapExplore(db, ctxFor(db), '@P1@');

    expect(model!.rows[0].detail).toBe('Wall 33');
  });

  it('gibt null zurück, wenn die Marker-Id in keinem Register liegt (definierter Fallback, Spec 21 §5)', () => {
    const db = makeDatabase();
    expect(buildMapExplore(db, ctxFor(db), '@weg@')).toBeNull();
  });

  it('Ort ohne verknüpfte Personen: Modell existiert, Zeilenliste ist leer (kein null)', () => {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Leerdorf' }));
    const model = buildMapExplore(db, ctxFor(db), '@P1@');
    expect(model!.rows).toEqual([]);
  });
});
