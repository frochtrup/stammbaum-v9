// tests/services/hof-umzug-nachlauf.test.ts — der Ereignis-Nachlauf zum Hof-Umzug
// (ADR-v9-172, Spec 11 §3/§4.1).
//
// WARUM DIESER TEST DER WICHTIGERE DER BEIDEN IST: `buildPlacForGedcom` liest das Dorf aus
// `hof.villageId` — Anzeige und Export folgen dem Umzug also von selbst, und ein flüchtiger
// Blick sagt „passt". `event.placeId` ist die Hälfte, die niemand sieht, und sie ist die,
// die den nächsten VOLLEN Lade-Pass steuert: `hofId` wird nie persistiert, das Ereignis
// wird über seinen Dorfanker neu aufgelöst. Bliebe der stehen, entstünde beim nächsten
// Laden ein frisch gebootstrappter Hof im ALTEN Dorf — der Umzug hielte bis zum Reload.
//
// Dieselbe Lehre wie ADR-v9-81 (Hof-Umbenennung): ein Edit an einem Feld, das anderswo
// gespiegelt ist, ist erst fertig, wenn ALLE Repräsentationen mitziehen.
import { describe, expect, it } from 'vitest';
import { moveHofToVillage } from '../../core/places';
import { relinkHofVillageInEvents } from '../../services/places';
import { makeDatabase, makePerson } from '../../core/model';
import { place, hof } from '../core/places-fixtures';
import type { Database } from '../../core/model/types';

const adresse = (v: string) => [{ value: v, lang: 'deu', from: null, to: null, dateRaw: null }];

function bestand(): Database {
  const db = makeDatabase();
  db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup', type: 'Village' }));
  db.placeObjects.set('@P2@', place('@P2@', { title: 'Rheine', type: 'Village' }));
  db.hofObjects.set('_hof_wall33_@P1@', hof('_hof_wall33_@P1@', '@P1@', { addrs: adresse('Wall 33') }));

  const p = makePerson('@I1@');
  p.birth.hofId = '_hof_wall33_@P1@';
  p.birth.placeId = '@P1@';
  p.birth.addr = 'Wall 33';
  db.individuals.set('@I1@', p);
  return db;
}

describe('relinkHofVillageInEvents', () => {
  it('zieht den Dorfanker referenzierender Ereignisse mit', () => {
    const db = bestand();
    const next = relinkHofVillageInEvents(db, '_hof_wall33_@P1@', '@P2@');
    expect(next.individuals.get('@I1@')?.birth.placeId).toBe('@P2@');
  });

  it('reprojiziert den PLAC-Cache auf das neue Dorf', () => {
    const db = bestand();
    db.hofObjects.set('_hof_wall33_@P1@', { ...db.hofObjects.get('_hof_wall33_@P1@')!, villageId: '@P2@' });
    const next = relinkHofVillageInEvents(db, '_hof_wall33_@P1@', '@P2@');
    expect(next.individuals.get('@I1@')?.birth.place).toContain('Rheine');
  });

  it('lässt Ereignisse anderer Höfe unberührt', () => {
    const db = bestand();
    const q = makePerson('@I2@');
    q.birth.placeId = '@P1@';
    db.individuals.set('@I2@', q);

    const next = relinkHofVillageInEvents(db, '_hof_wall33_@P1@', '@P2@');
    expect(next.individuals.get('@I2@')?.birth.placeId).toBe('@P1@');
  });

  it('hängt Ereignisse eines beim Umzug konsolidierten Hofes auf den Überlebenden um', () => {
    const db = bestand();
    db.hofObjects.set('_hof_wall33_@P2@', hof('_hof_wall33_@P2@', '@P2@', { addrs: adresse('Wall 33') }));

    const hofs = new Map(db.hofObjects);
    const r = moveHofToVillage(hofs, '_hof_wall33_@P1@', '@P2@', []);
    expect(r.merged).toBe(1);

    const next = relinkHofVillageInEvents({ ...db, hofObjects: hofs }, '_hof_wall33_@P1@', '@P2@', r.remap);
    const ev = next.individuals.get('@I1@')!.birth;
    expect(hofs.has(ev.hofId!)).toBe(true);
    expect(ev.placeId).toBe('@P2@');
  });

  it('überlebt einen vollen Lade-Pass — der Umzug hält (Kern des Nachlaufs)', async () => {
    // Der eigentliche Beweis: `hofId` wird nie persistiert. Nach dem Umzug MUSS eine
    // erneute Auflösung denselben Hof im NEUEN Dorf finden, statt im alten einen zweiten
    // zu bootstrappen.
    const { applyPlaceResolution } = await import('../../services/places');
    const db = bestand();

    const hofs = new Map(db.hofObjects);
    moveHofToVillage(hofs, '_hof_wall33_@P1@', '@P2@', []);
    const bewegt = relinkHofVillageInEvents({ ...db, hofObjects: hofs }, '_hof_wall33_@P1@', '@P2@');

    // Lade-Pass simulieren: BEIDE Ids vergessen. Nur `hofId` zurückzusetzen wäre keine
    // Simulation, sondern ein Kunstzustand — bei gesetzter `placeId` greift der
    // REPROJECT-Kurzschluss (Spec 11 §4.2 Schritt 1, ADR-v9-74) und es wird gar nicht neu
    // gematcht. Frisch geparste Ereignisse tragen keine von beiden.
    const p = bewegt.individuals.get('@I1@')!;
    p.birth = { ...p.birth, hofId: null, placeId: null };
    const vorher = bewegt.hofObjects.size;
    applyPlaceResolution(bewegt, { seed: false });

    // Der reprojizierte PLAC („Wall 33, Rheine") führt zurück auf denselben Hof im NEUEN
    // Dorf — kein zweiter Bootstrap, keine Karteileiche im alten.
    expect(bewegt.hofObjects.size, 'kein zweiter Hof entstanden').toBe(vorher);
    expect(bewegt.individuals.get('@I1@')?.birth.hofId).toBe('_hof_wall33_@P1@');
    expect(bewegt.individuals.get('@I1@')?.birth.placeId).toBe('@P2@');
  });
});
