// tests/ui/person-associations.test.ts — Assoziationen als Detail-Projektion (BL-127,
// Spec 20 §1.4 [S], Spec 10 §2). Reine Funktionen → hier statt als Component-Test
// (Testpyramide, TST-5).
//
// Zwei Richtungen, die leicht verwechselt werden:
//   `A.associations = [{ personRef: B, role: 'Taufpate' }]` heißt „B ist Pate VON A"
//   (GEDCOM: `INDI @A@ / ASSO @B@ / RELA godfather`).
// Auf A's Seite steht damit die Zeile „Taufpate: B", auf B's Seite die BERECHNETE
// Rückverknüpfung „Patenkind: A". Wer die Richtung dreht, baut die Patenkinder-Liste
// falsch herum — deshalb hier ausdrücklich in beide Richtungen geprüft.
import { describe, expect, it } from 'vitest';
import { makeDatabase, makePerson, makeAssociation } from '../../core/model';
import { makePlaceRegistry, makeHofRegistry, type PlaceContext } from '../../core/places';
import { buildPersonDetail } from '../../ui/views/person/person-detail-model';

function emptyContext(): PlaceContext {
  return { places: makePlaceRegistry(new Map()), hofs: makeHofRegistry(new Map()) };
}

/** Täufling @I1@ mit Pate @I2@ und Zeugin @I3@. */
function seeded() {
  const db = makeDatabase();
  const kind = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
  const pate = makePerson('@I2@', { given: 'Josef', surname: 'Meyer' });
  pate.birth.date = '3 MAR 1820';
  const zeugin = makePerson('@I3@', { given: 'Klara', surname: 'Schmitt' });
  kind.associations.push(makeAssociation('@I2@', { role: 'Taufpate', note: 'aus dem Kirchenbuch' }));
  kind.associations.push(makeAssociation('@I3@', { role: 'Zeugin' }));
  db.individuals.set('@I1@', kind);
  db.individuals.set('@I2@', pate);
  db.individuals.set('@I3@', zeugin);
  return db;
}

describe('BL-127 — eigene Assoziationen der Person', () => {
  it('projiziert Name, Rolle und Notiz je Zeile, in Erfassungsreihenfolge', () => {
    const detail = buildPersonDetail(seeded(), emptyContext(), '@I1@')!;
    expect(detail.associations).toHaveLength(2);
    expect(detail.associations[0]).toMatchObject({
      index: 0,
      personId: '@I2@',
      name: 'Josef Meyer',
      role: 'Taufpate',
      note: 'aus dem Kirchenbuch',
    });
    expect(detail.associations[1]).toMatchObject({ index: 1, personId: '@I3@', name: 'Klara Schmitt', role: 'Zeugin' });
  });

  it('trägt das disambiguierende Sekundärmerkmal wie jede andere Personenzeile (INV-UI-6)', () => {
    const detail = buildPersonDetail(seeded(), emptyContext(), '@I1@')!;
    expect(detail.associations[0].summary).toContain('1820');
  });

  it('`index` adressiert den Eintrag im ursprünglichen Array — auch wenn eine Referenz ins Leere zeigt', () => {
    const db = seeded();
    // Verweis auf eine Person, die es nicht (mehr) gibt: die Zeile darf NICHT verschwinden,
    // sonst verschöbe sich der Index und das ✕ löschte den falschen Eintrag.
    db.individuals.get('@I1@')!.associations.splice(1, 0, makeAssociation('@I999@', { role: 'Informant' }));
    const detail = buildPersonDetail(db, emptyContext(), '@I1@')!;
    expect(detail.associations.map((a) => a.index)).toEqual([0, 1, 2]);
    expect(detail.associations[1]).toMatchObject({ personId: null, role: 'Informant' });
    expect(detail.associations[2].personId).toBe('@I3@');
  });

  it('eine GRAMPS-Assoziation ohne auflösbare id bleibt sichtbar, aber nicht anklickbar', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.associations.push(makeAssociation(null, { grampsHandle: '_abc123', role: 'Zeuge' }));
    db.individuals.set('@I1@', p);
    const detail = buildPersonDetail(db, emptyContext(), '@I1@')!;
    expect(detail.associations).toHaveLength(1);
    expect(detail.associations[0].personId).toBeNull();
    expect(detail.associations[0].name).toBe('(unbekannte Person)');
  });
});

describe('BL-127 — berechnete Rückverknüpfung „Patenkinder"', () => {
  it('zeigt beim Paten die Kinder, deren Assoziation auf ihn zeigt (Gegenrichtung)', () => {
    const detail = buildPersonDetail(seeded(), emptyContext(), '@I2@')!;
    expect(detail.godchildren).toHaveLength(1);
    expect(detail.godchildren[0]).toMatchObject({ personId: '@I1@', name: 'Anna Bauer', role: 'Taufpate' });
    // Beim Paten selbst steht KEINE eigene Assoziation — die Wahrheit liegt beim Täufling.
    expect(detail.associations).toEqual([]);
  });

  it('nur Paten-Rollen zählen — eine Zeugin bekommt keine Patenkinder-Liste', () => {
    const detail = buildPersonDetail(seeded(), emptyContext(), '@I3@')!;
    expect(detail.godchildren).toEqual([]);
  });

  it('erkennt die gebräuchlichen Schreibweisen inkl. der englischen GEDCOM-Werte', () => {
    const db = makeDatabase();
    const pate = makePerson('@I9@', { given: 'Josef', surname: 'Meyer' });
    db.individuals.set('@I9@', pate);
    const rollen = ['Taufpate', 'Taufpatin', 'Pate', 'Patin', 'godfather', 'Godmother', 'godparent'];
    rollen.forEach((role, i) => {
      const kind = makePerson(`@K${i}@`, { given: `Kind${i}`, surname: 'Test' });
      kind.associations.push(makeAssociation('@I9@', { role }));
      db.individuals.set(`@K${i}@`, kind);
    });
    // Gegenprobe: eine Nicht-Paten-Rolle auf dieselbe Person darf NICHT mitzählen.
    const zeuge = makePerson('@Z@', { given: 'Zeuge', surname: 'Test' });
    zeuge.associations.push(makeAssociation('@I9@', { role: 'Trauzeuge' }));
    db.individuals.set('@Z@', zeuge);

    const detail = buildPersonDetail(db, emptyContext(), '@I9@')!;
    expect(detail.godchildren).toHaveLength(rollen.length);
    expect(detail.godchildren.map((g) => g.name)).not.toContain('Zeuge Test');
  });

  it('ist eine reine Projektion — sie legt kein Feld an der Person an', () => {
    const db = seeded();
    buildPersonDetail(db, emptyContext(), '@I2@');
    expect(db.individuals.get('@I2@')!.associations).toEqual([]);
  });
});
