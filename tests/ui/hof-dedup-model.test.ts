// tests/ui/hof-dedup-model.test.ts — Massen-Dedup-Modell für Höfe (Spec 20 §1.8 [K],
// Spec 11 §9.2, ADR-v9-45). Reine Funktion (TST-5), inkl. TST-7-Kapazitätsfall.
import { describe, expect, it } from 'vitest';
import { makeDatabase } from '../../core/model';
import { place, hof, ev } from '../core/places-fixtures';
import { makePlaceRegistry, makeHofRegistry } from '../../core/places';
import type { PlaceContext } from '../../core/places';
import { buildHofDedupGroups } from '../../ui/views/hof/hof-dedup-model';

function ctxOf(db: ReturnType<typeof makeDatabase>): PlaceContext {
  return { places: makePlaceRegistry(db.placeObjects), hofs: makeHofRegistry(db.hofObjects) };
}

describe('buildHofDedupGroups — Kandidatengruppen + Gewinner-Vorschlag', () => {
  it('gruppiert gleiche normalisierte Adresse + gleiches Dorf', () => {
    const db = makeDatabase();
    db.placeObjects.set('@V@', place('@V@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@V@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    db.hofObjects.set('@H2@', hof('@H2@', '@V@', { addrs: [{ value: 'wall 33', from: null, to: null }] }));

    const groups = buildHofDedupGroups(db, ctxOf(db), []);

    expect(groups).toHaveLength(1);
    expect(groups[0].villageTitle).toBe('Ochtrup');
    expect(groups[0].members.map((m) => m.id).sort()).toEqual(['@H1@', '@H2@']);
  });

  it('gleiche Adresse, unterschiedliches Dorf → KEINE Gruppe (dorf-scoped)', () => {
    const db = makeDatabase();
    db.placeObjects.set('@V1@', place('@V1@', { title: 'Ochtrup' }));
    db.placeObjects.set('@V2@', place('@V2@', { title: 'Münster' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@V1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    db.hofObjects.set('@H2@', hof('@H2@', '@V2@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));

    expect(buildHofDedupGroups(db, ctxOf(db), [])).toEqual([]);
  });

  it('Gewinner-Vorschlag: höhere Verwendungszahl gewinnt', () => {
    const db = makeDatabase();
    db.placeObjects.set('@V@', place('@V@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@V@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    db.hofObjects.set('@H2@', hof('@H2@', '@V@', { addrs: [{ value: 'wall 33', from: null, to: null }] }));
    const events = [ev('RESI', { hofId: '@H2@' })];

    const groups = buildHofDedupGroups(db, ctxOf(db), events);

    expect(groups[0].suggestedWinnerId).toBe('@H2@');
  });

  it('A1: Anreicherungs-GRAD und Prüf-Marker pro Mitglied (ADR-v9-191, eigene Hof-Schwelle)', () => {
    const db = makeDatabase();
    db.placeObjects.set('@V@', place('@V@', { title: 'Ochtrup' }));
    // Nur die Koordinate = der Massen-Geocoding-Fall (am Realbestand 163 von 183 Höfen):
    // „wenig ergänzt", NICHT ausführlich. Erst eine zweite Angabe hebt die Stufe.
    db.hofObjects.set('@H1@', hof('@H1@', '@V@', { addrs: [{ value: 'Wall 33', from: null, to: null }], lat: 52.2, long: 7.2 }));
    db.hofObjects.set('@H2@', hof('@H2@', '@V@', { addrs: [{ value: 'wall 33', from: null, to: null }] }));
    db.hofObjects.set(
      '@H3@',
      hof('@H3@', '@V@', { addrs: [{ value: 'Wall  33', from: null, to: null }], lat: 52.2, long: 7.2, note: 'Hofchronik', reviewedAt: 1 }),
    );

    const groups = buildHofDedupGroups(db, ctxOf(db), []);
    const byId = new Map(groups[0].members.map((m) => [m.id, m]));

    expect(byId.get('@H1@')!.level).toBe('sparse');
    expect(byId.get('@H2@')!.level).toBe('none');
    expect(byId.get('@H3@')!.level).toBe('rich');
    expect(byId.get('@H3@')!.reviewed).toBe(true);
    expect(byId.get('@H1@')!.reviewed).toBe(false);
  });

  it('TST-7 Kapazitätsfall: viele überlappende Gruppen gleichzeitig, deterministisch', () => {
    const db = makeDatabase();
    db.placeObjects.set('@V@', place('@V@', { title: 'Ochtrup' }));
    for (let i = 0; i < 20; i++) {
      db.hofObjects.set(`@A${i}@`, hof(`@A${i}@`, '@V@', { addrs: [{ value: `Straße ${i}`, from: null, to: null }] }));
      db.hofObjects.set(`@B${i}@`, hof(`@B${i}@`, '@V@', { addrs: [{ value: `straße ${i}`, from: null, to: null }] }));
    }

    const groups = buildHofDedupGroups(db, ctxOf(db), []);

    expect(groups).toHaveLength(20);
    for (const g of groups) expect(g.members).toHaveLength(2);
    expect(JSON.stringify(buildHofDedupGroups(db, ctxOf(db), []))).toBe(JSON.stringify(groups));
  });
});
