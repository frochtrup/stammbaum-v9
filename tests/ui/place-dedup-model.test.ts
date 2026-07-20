// tests/ui/place-dedup-model.test.ts — Massen-Dedup-Modell für Orte (Spec 20 §1.7 [K],
// Spec 11 §9.2, ADR-v9-45). Reine Funktion (TST-5), inkl. TST-7-Kapazitätsfall.
import { describe, expect, it } from 'vitest';
import { makeDatabase } from '../../core/model';
import { place, ev } from '../core/places-fixtures';
import { makePlaceRegistry, makeHofRegistry } from '../../core/places';
import type { PlaceContext } from '../../core/places';
import { buildPlaceDedupGroups } from '../../ui/views/place/place-dedup-model';

function ctxOf(db: ReturnType<typeof makeDatabase>): PlaceContext {
  return { places: makePlaceRegistry(db.placeObjects), hofs: makeHofRegistry(db.hofObjects) };
}

describe('buildPlaceDedupGroups — Kandidatengruppen + Gewinner-Vorschlag', () => {
  it('gruppiert Namens-Varianten (gleicher Leitname, verträgliche Eltern)', () => {
    const db = makeDatabase();
    db.placeObjects.set('@A@', place('@A@', { title: 'Ochtrup' }));
    db.placeObjects.set('@B@', place('@B@', { title: 'Ochtrup' }));

    const groups = buildPlaceDedupGroups(db, ctxOf(db), []);

    expect(groups).toHaveLength(1);
    expect(groups[0].members.map((m) => m.id).sort()).toEqual(['@A@', '@B@']);
  });

  it('kein Duplikat → leere Gruppen-Liste', () => {
    const db = makeDatabase();
    db.placeObjects.set('@A@', place('@A@', { title: 'Ochtrup' }));
    db.placeObjects.set('@B@', place('@B@', { title: 'Völlig Anders' }));

    expect(buildPlaceDedupGroups(db, ctxOf(db), [])).toEqual([]);
  });

  it('Gewinner-Vorschlag: höhere Verwendungszahl gewinnt', () => {
    const db = makeDatabase();
    db.placeObjects.set('@A@', place('@A@', { title: 'Ochtrup' }));
    db.placeObjects.set('@B@', place('@B@', { title: 'Ochtrup' }));
    const events = [ev('BIRT', { placeId: '@B@' }), ev('DEAT', { placeId: '@B@' })];

    const groups = buildPlaceDedupGroups(db, ctxOf(db), events);

    expect(groups[0].suggestedWinnerId).toBe('@B@');
  });

  it('Gewinner-Vorschlag: bei gleicher Verwendungszahl gewinnen Koordinaten', () => {
    const db = makeDatabase();
    db.placeObjects.set('@A@', place('@A@', { title: 'Ochtrup' }));
    db.placeObjects.set('@B@', place('@B@', { title: 'Ochtrup', lat: 52.2, long: 7.2 }));

    const groups = buildPlaceDedupGroups(db, ctxOf(db), []);

    expect(groups[0].suggestedWinnerId).toBe('@B@');
  });

  it('ADR-v9-50: gleicher Name, widersprüchliche Eltern, gemeinsamer Vorfahre → Gruppe mit conflict:true UND voller Namenskette pro Mitglied', () => {
    const db = makeDatabase();
    db.placeObjects.set('@A@', place('@A@', { title: 'Arpke', enclosedBy: [{ placeId: '@BURGDORF@', from: null, to: null }] }));
    db.placeObjects.set('@B@', place('@B@', { title: 'Arpke', enclosedBy: [{ placeId: '@UETZE@', from: null, to: null }] }));
    db.placeObjects.set('@BURGDORF@', place('@BURGDORF@', { title: 'Burgdorf', enclosedBy: [{ placeId: '@REGION@', from: null, to: null }] }));
    db.placeObjects.set('@UETZE@', place('@UETZE@', { title: 'Uetze', enclosedBy: [{ placeId: '@REGION@', from: null, to: null }] }));
    db.placeObjects.set('@REGION@', place('@REGION@', { title: 'Region Hannover' }));

    const groups = buildPlaceDedupGroups(db, ctxOf(db), []);

    expect(groups).toHaveLength(1);
    expect(groups[0].conflict).toBe(true);
    const names = groups[0].members.map((m) => m.fullName).sort();
    expect(names).toEqual(['Arpke, Burgdorf, Region Hannover', 'Arpke, Uetze, Region Hannover']);
  });

  it('A1: enriched-Kennzeichen pro Mitglied (kuratiert vs. Seed-Rohzustand)', () => {
    const db = makeDatabase();
    // @A@ kuratiert (hat Koordinaten) → enriched; @B@ blanker Seed-Rohzustand → nicht enriched.
    db.placeObjects.set('@A@', place('@A@', { title: 'Ochtrup', lat: 52.2, long: 7.2 }));
    db.placeObjects.set('@B@', place('@B@', { title: 'Ochtrup' }));

    const groups = buildPlaceDedupGroups(db, ctxOf(db), []);
    const byId = new Map(groups[0].members.map((m) => [m.id, m.enriched]));

    expect(byId.get('@A@')).toBe(true);
    expect(byId.get('@B@')).toBe(false);
  });

  it('ADR-v9-77: "Stadt X" + "Kreis X" → typeMismatch:true, type pro Mitglied sichtbar', () => {
    const db = makeDatabase();
    db.placeObjects.set('@STADT@', place('@STADT@', { title: 'Steinfurt', type: 'Town' }));
    db.placeObjects.set('@KREIS@', place('@KREIS@', { title: 'Steinfurt', type: 'District' }));

    const groups = buildPlaceDedupGroups(db, ctxOf(db), []);

    expect(groups).toHaveLength(1);
    expect(groups[0].typeMismatch).toBe(true);
    const typeById = new Map(groups[0].members.map((m) => [m.id, m.type]));
    expect(typeById.get('@STADT@')).toBe('Town');
    expect(typeById.get('@KREIS@')).toBe('District');
  });

  it('ADR-v9-77: gleicher type auf beiden Seiten → typeMismatch:false', () => {
    const db = makeDatabase();
    db.placeObjects.set('@A@', place('@A@', { title: 'Ochtrup', type: 'Town' }));
    db.placeObjects.set('@B@', place('@B@', { title: 'Ochtrup', type: 'Town' }));

    const groups = buildPlaceDedupGroups(db, ctxOf(db), []);

    expect(groups[0].typeMismatch).toBe(false);
  });

  it('verträgliche Namens-Varianten → conflict:false, fullName weiterhin gefüllt', () => {
    const db = makeDatabase();
    db.placeObjects.set('@A@', place('@A@', { title: 'Ochtrup', enclosedBy: [{ placeId: '@DE@', from: null, to: null }] }));
    db.placeObjects.set('@B@', place('@B@', { title: 'Ochtrup' }));
    db.placeObjects.set('@DE@', place('@DE@', { title: 'Deutschland' }));

    const groups = buildPlaceDedupGroups(db, ctxOf(db), []);

    expect(groups[0].conflict).toBe(false);
    expect(groups[0].members.every((m) => m.fullName.startsWith('Ochtrup'))).toBe(true);
  });

  it('TST-7 Kapazitätsfall: viele überlappende Gruppen gleichzeitig, deterministisch', () => {
    const db = makeDatabase();
    for (let i = 0; i < 20; i++) {
      db.placeObjects.set(`@A${i}@`, place(`@A${i}@`, { title: `Ort${i}` }));
      db.placeObjects.set(`@B${i}@`, place(`@B${i}@`, { title: `Ort${i}` }));
    }

    const groups = buildPlaceDedupGroups(db, ctxOf(db), []);

    expect(groups).toHaveLength(20);
    for (const g of groups) expect(g.members).toHaveLength(2);
    // Determinismus: zweiter Lauf liefert identisches Ergebnis.
    expect(JSON.stringify(buildPlaceDedupGroups(db, ctxOf(db), []))).toBe(JSON.stringify(groups));
  });
});
