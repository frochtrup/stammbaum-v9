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

  it('A1: Anreicherungs-GRAD und Prüf-Marker pro Mitglied (ADR-v9-191, ersetzt das Ja/Nein)', () => {
    const db = makeDatabase();
    // Drei Stufen an einer Gruppe — genau die Unterscheidung, die ein Ja/Nein einebnete:
    // @A@ trägt nur eine Koordinate (Massen-Geocoding), @C@ ist wirklich bearbeitet.
    db.placeObjects.set('@A@', place('@A@', { title: 'Ochtrup', lat: 52.2, long: 7.2 }));
    db.placeObjects.set('@B@', place('@B@', { title: 'Ochtrup' }));
    db.placeObjects.set(
      '@C@',
      place('@C@', {
        title: 'Ochtrup',
        type: 'Town',
        pnames: [{ value: 'Ochtorpe', from: 1200, to: 1500 }],
        lat: 52.2,
        long: 7.2,
        note: 'Kirchspiel',
      }),
    );
    // Der Marker hängt an keiner Stufe: @B@ ist inhaltlich leer UND ausdrücklich geprüft.
    db.placeObjects.set('@B@', place('@B@', { title: 'Ochtrup', reviewedAt: 1_700_000_000_000 }));

    const groups = buildPlaceDedupGroups(db, ctxOf(db), []);
    const byId = new Map(groups[0].members.map((m) => [m.id, m]));

    expect(byId.get('@A@')!.level).toBe('sparse');
    expect(byId.get('@B@')!.level).toBe('none');
    expect(byId.get('@C@')!.level).toBe('rich');
    expect(byId.get('@B@')!.reviewed).toBe(true);
    expect(byId.get('@C@')!.reviewed).toBe(false);
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

// ─────────────────────────────────────────────────────────────────────────────────────
// [ADR-v9-296] — die Ebenen ÜBER dem Dorf. Bis dahin entschied dort der ID-String: eine
// Verwaltungseinheit bindet fast nie ein Ereignis direkt (das hängt am Dorf), also war die
// Verwendungszahl für alle Mitglieder 0, und Koordinaten/Notiz haben kuratierte Knoten
// ohnehin beide. Am Realbestand betraf das 2 von 6 Dubletten-Gruppen.
describe('buildPlaceDedupGroups — Verwaltungsebenen (ADR-v9-296)', () => {
  /** Zwei gleichnamige Provinzen, beide kuratiert, beide mit Koordinaten UND Notiz — der
   *  gemessene Schlesien-Fall. Unterscheidbar allein über die datierten Perioden. */
  const schlesienDb = () => {
    const db = makeDatabase();
    db.placeObjects.set('@A_ARM@', place('@A_ARM@', {
      title: 'Provinz Niederschlesien', type: 'Province', lat: 51, long: 16, note: 'x',
      pnames: [{ value: 'Schlesien', from: null, to: null }],
      enclosedBy: [{ placeId: '@DE@', from: 1742, to: 1945 }],
    }));
    db.placeObjects.set('@Z_REICH@', place('@Z_REICH@', {
      title: 'Schlesien', type: 'Province', lat: 51, long: 16, note: 'y',
      pnames: [
        { value: 'Provinz Schlesien', from: 1815, to: 1919 },
        { value: 'Provinz Niederschlesien', from: 1919, to: 1938 },
        { value: 'Provinz Schlesien', from: 1938, to: 1941 },
      ],
      enclosedBy: [{ placeId: '@DE@', from: 1742, to: 1945 }],
    }));
    db.placeObjects.set('@DE@', place('@DE@', { title: 'Deutschland', type: 'Country' }));
    return db;
  };

  it('datierte Perioden entscheiden, wo Verwendung/Koordinaten/Notiz gleichstehen', () => {
    const db = schlesienDb();
    const groups = buildPlaceDedupGroups(db, ctxOf(db), []);
    expect(groups).toHaveLength(1);
    // Gegenprobe zur Prämisse: der ID-Tie-Break hätte den ÄRMEREN gewählt (@A_ < @Z_).
    expect(groups[0].members.map((m) => m.id).sort()[0]).toBe('@A_ARM@');
    expect(groups[0].suggestedWinnerId).toBe('@Z_REICH@');
  });

  it('die Verwendungszahl kippt das NICHT mehr (Nutzer-Entscheidung 2026-08-27)', () => {
    const db = schlesienDb();
    const events = [ev('BIRT', { placeId: '@A_ARM@' }), ev('DEAT', { placeId: '@A_ARM@' })];
    expect(buildPlaceDedupGroups(db, ctxOf(db), events)[0].suggestedWinnerId).toBe('@Z_REICH@');
  });

  it('Gruppen sind nach transitiver Reichweite geordnet, nicht nach ID', () => {
    const db = makeDatabase();
    // Gruppe 1: zwei gleichnamige Länder, unter dem einen hängt ein Dorf mit Ereignissen.
    db.placeObjects.set('@Z_LAND@', place('@Z_LAND@', { title: 'Grossland', type: 'Country' }));
    db.placeObjects.set('@Z_LAND2@', place('@Z_LAND2@', { title: 'Grossland', type: 'Country' }));
    db.placeObjects.set('@DORF@', place('@DORF@', {
      title: 'Dorf', type: 'Village', enclosedBy: [{ placeId: '@Z_LAND@', from: null, to: null }],
    }));
    // Gruppe 2: zwei gleichnamige Weiler ganz ohne Bezug — alphabetisch VOR Gruppe 1.
    db.placeObjects.set('@A_KLEIN@', place('@A_KLEIN@', { title: 'Winzig', type: 'Village' }));
    db.placeObjects.set('@A_KLEIN2@', place('@A_KLEIN2@', { title: 'Winzig', type: 'Village' }));
    const events = [ev('BIRT', { placeId: '@DORF@' }), ev('DEAT', { placeId: '@DORF@' })];

    const groups = buildPlaceDedupGroups(db, ctxOf(db), events);

    expect(groups).toHaveLength(2);
    expect(groups[0].members[0].title).toBe('Grossland'); // 2 Ereignisse darunter
    expect(groups[0].reach).toBe(2);
    expect(groups[1].members[0].title).toBe('Winzig'); // 0 — trotz kleinerer ID hinten
    expect(groups[1].reach).toBe(0);
  });

  it('bei gleicher Reichweite bleibt die Ordnung deterministisch (stabiler Schlüssel)', () => {
    const db = makeDatabase();
    db.placeObjects.set('@B1@', place('@B1@', { title: 'Bravo' }));
    db.placeObjects.set('@B2@', place('@B2@', { title: 'Bravo' }));
    db.placeObjects.set('@A1@', place('@A1@', { title: 'Alpha' }));
    db.placeObjects.set('@A2@', place('@A2@', { title: 'Alpha' }));

    const keys = buildPlaceDedupGroups(db, ctxOf(db), []).map((g) => g.key);

    expect(keys).toEqual(['@A1@', '@B1@']);
  });
});
