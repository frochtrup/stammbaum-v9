// Spec 20 §2 ("Bearbeitung & Formulare", savePerson(model)-Muster) + Spec 10 §2 (Person).
// Reine Upsert-/Delete-Kommandos, analog core/places/commands.ts (savePlaceObject).
// KEINE Relationship-Graph-Seiteneffekte (childOf/parentIn/Family.* außerhalb Scope,
// Spec 20 §1.87 [S/E]) — analog deletePlaceObject, das enclosedBy auch nicht nachführt.
import { describe, it, expect } from 'vitest';
import { savePerson, deletePerson, saveFamily, deleteFamily } from '../../../core/model/commands';
import {
  makePerson,
  makeFamily,
  makeDatabase,
  addChildToFamily,
  checkIndiFamConsistency,
} from '../../../core/model/index';
import type { Person, PersonId } from '../../../core/model/types';

function fresh(): Map<PersonId, Person> {
  return new Map<PersonId, Person>();
}

describe('savePerson — Upsert per id', () => {
  it('legt eine neue Person an', () => {
    const map = fresh();
    const p = makePerson('@I1@');
    savePerson(map, p);
    expect(map.get('@I1@')).toBe(p);
    expect(map.size).toBe(1);
  });

  it('ersetzt eine bestehende Person vollständig (per id)', () => {
    const map = fresh();
    const p1 = makePerson('@I1@');
    p1.given = 'Alt';
    savePerson(map, p1);

    const p2 = makePerson('@I1@');
    p2.given = 'Neu';
    savePerson(map, p2);

    expect(map.size).toBe(1);
    expect(map.get('@I1@')).toBe(p2);
    expect(map.get('@I1@')!.given).toBe('Neu');
  });

  it('rührt andere Personen nicht an', () => {
    const map = fresh();
    const a = makePerson('@I1@');
    const b = makePerson('@I2@');
    savePerson(map, a);
    savePerson(map, b);
    expect(map.size).toBe(2);
    expect(map.get('@I1@')).toBe(a);
    expect(map.get('@I2@')).toBe(b);
  });

  it('fasst KEINE Beziehungs-Referenzen an (childOf/parentIn bleiben wie übergeben)', () => {
    const map = fresh();
    const p = makePerson('@I1@');
    p.parentIn = ['@F9@'];
    p.childOf = [];
    savePerson(map, p);
    // savePerson ersetzt nur das Objekt — kein Graph-Seiteneffekt.
    expect(map.get('@I1@')!.parentIn).toEqual(['@F9@']);
    expect(map.get('@I1@')!.childOf).toEqual([]);
  });
});

describe('deletePerson — Entfernen per id', () => {
  it('entfernt eine vorhandene Person', () => {
    const map = fresh();
    savePerson(map, makePerson('@I1@'));
    deletePerson(map, '@I1@');
    expect(map.has('@I1@')).toBe(false);
    expect(map.size).toBe(0);
  });

  it('ist ein No-Op bei unbekannter id', () => {
    const map = fresh();
    savePerson(map, makePerson('@I1@'));
    deletePerson(map, '@I999@');
    expect(map.size).toBe(1);
  });

  it('führt KEINE Familien-Referenzen nach (außerhalb Scope, wie deletePlaceObject)', () => {
    const map = fresh();
    const p = makePerson('@I1@');
    p.parentIn = ['@F1@'];
    savePerson(map, p);
    deletePerson(map, '@I1@');
    // Nur die Person selbst ist weg; keine Kaskade in Family-Objekte (die diese Funktion
    // gar nicht kennt) — bewusst außerhalb dieser Scheibe.
    expect(map.has('@I1@')).toBe(false);
  });
});

// --- saveFamily / deleteFamily (Spec 20 §2 Familie-Formular; Spec 10 §3, INV-P3/P4) ---

/** Frische DB mit vier freien Personen, ohne Familie. */
function seedFamilyDb() {
  const db = makeDatabase();
  const a = makePerson('@I1@', { sex: 'M' });
  const b = makePerson('@I2@', { sex: 'M' });
  const mother = makePerson('@I3@', { sex: 'F' });
  const c1 = makePerson('@I4@');
  const c2 = makePerson('@I5@');
  for (const p of [a, b, mother, c1, c2]) db.individuals.set(p.id, p);
  return { db, a, b, mother, c1, c2 };
}

describe('saveFamily — Formular-Kommando, INV-P3-konform', () => {
  it('neue Familie mit Eltern + Kindern → beide Seiten gesetzt, Konsistenz leer', () => {
    const { db, a, mother, c1, c2 } = seedFamilyDb();
    const fam = makeFamily('@F1@', {
      husband: a.id,
      wife: mother.id,
      children: [c1.id, c2.id],
      noteText: 'Notiz',
    });
    saveFamily(db, fam);

    const stored = db.families.get('@F1@')!;
    expect(stored.husband).toBe(a.id);
    expect(stored.wife).toBe(mother.id);
    expect(stored.children).toEqual([c1.id, c2.id]);
    expect(stored.noteText).toBe('Notiz');
    // INDI-Seite nachgeführt
    expect(a.parentIn).toContain('@F1@');
    expect(mother.parentIn).toContain('@F1@');
    expect(c1.childOf.map((l) => l.familyId)).toContain('@F1@');
    expect(c2.childOf.map((l) => l.familyId)).toContain('@F1@');
    // Korrektheits-Kriterium
    expect(checkIndiFamConsistency(db)).toEqual([]);
  });

  it('Elternwechsel husband A → husband B: A sauber aus parentIn, B gesetzt', () => {
    const { db, a, b } = seedFamilyDb();
    saveFamily(db, makeFamily('@F1@', { husband: a.id }));
    expect(a.parentIn).toContain('@F1@');

    // Formular liefert das gesamte (geänderte) Objekt zurück.
    saveFamily(db, makeFamily('@F1@', { husband: b.id }));

    const stored = db.families.get('@F1@')!;
    expect(stored.husband).toBe(b.id);
    expect(a.parentIn).not.toContain('@F1@'); // A ist nirgends sonst Elternteil
    expect(b.parentIn).toContain('@F1@');
    expect(checkIndiFamConsistency(db)).toEqual([]);
  });

  it('Eltern-Slot auf null setzen → alte Person sauber aus parentIn', () => {
    const { db, a } = seedFamilyDb();
    saveFamily(db, makeFamily('@F1@', { husband: a.id }));
    expect(a.parentIn).toContain('@F1@');

    saveFamily(db, makeFamily('@F1@', { husband: null }));

    const stored = db.families.get('@F1@')!;
    expect(stored.husband).toBeNull();
    expect(a.parentIn).not.toContain('@F1@');
    expect(checkIndiFamConsistency(db)).toEqual([]);
  });

  it('Kind hinzufügen UND entfernen in einem Save → kein verwaistes childOf', () => {
    const { db, c1, c2 } = seedFamilyDb();
    saveFamily(db, makeFamily('@F1@', { children: [c1.id] }));
    expect(c1.childOf.map((l) => l.familyId)).toContain('@F1@');

    // Formular: c1 raus, c2 rein.
    saveFamily(db, makeFamily('@F1@', { children: [c2.id] }));

    const stored = db.families.get('@F1@')!;
    expect(stored.children).toEqual([c2.id]);
    expect(c1.childOf.map((l) => l.familyId)).not.toContain('@F1@');
    expect(c2.childOf.map((l) => l.familyId)).toContain('@F1@');
    expect(checkIndiFamConsistency(db)).toEqual([]);
  });

  it('bewahrt bestehende Pedigree eines nicht angetasteten Kindes', () => {
    const { db, c1, c2 } = seedFamilyDb();
    saveFamily(db, makeFamily('@F1@', { children: [c1.id] }));
    // Pedigree wird separat (z. B. über einen anderen Editor) gesetzt.
    addChildToFamily(db, '@F1@', c1.id, 'adopted');
    expect(c1.childOf.find((l) => l.familyId === '@F1@')!.pedigree).toBe('adopted');

    // Formular speichert erneut, fügt c2 hinzu — c1 bleibt unangetastet.
    saveFamily(db, makeFamily('@F1@', { children: [c1.id, c2.id] }));

    // Pedigree von c1 NICHT überschrieben (children[] trägt keine Pedigree-Info).
    expect(c1.childOf.find((l) => l.familyId === '@F1@')!.pedigree).toBe('adopted');
    expect(c2.childOf.find((l) => l.familyId === '@F1@')!.pedigree).toBe('');
    expect(checkIndiFamConsistency(db)).toEqual([]);
  });

  it('übernimmt Restfelder (marriage/engagement/events/citations/lastChanged) direkt', () => {
    const { db, a } = seedFamilyDb();
    const fam = makeFamily('@F1@', {
      husband: a.id,
      lastChanged: '2026-07-06',
    });
    fam.marriage.date = '12 MAR 1890';
    fam.noteText = 'Heirat';
    saveFamily(db, fam);

    const stored = db.families.get('@F1@')!;
    expect(stored.marriage.date).toBe('12 MAR 1890');
    expect(stored.noteText).toBe('Heirat');
    expect(stored.lastChanged).toBe('2026-07-06');
  });
});

describe('deleteFamily — Entfernen ohne Kaskade', () => {
  it('entfernt die Familie per Map-Delete', () => {
    const { db, a } = seedFamilyDb();
    saveFamily(db, makeFamily('@F1@', { husband: a.id }));
    deleteFamily(db, '@F1@');
    expect(db.families.has('@F1@')).toBe(false);
  });

  it('lässt Person.parentIn/childOf-Reste bewusst stehen (kein Cleanup, INV-P2 meldet)', () => {
    const { db, a, c1 } = seedFamilyDb();
    saveFamily(db, makeFamily('@F1@', { husband: a.id, children: [c1.id] }));
    deleteFamily(db, '@F1@');

    // Bewusst KEINE Kaskade: die verwaisten Verweise bleiben stehen (analog deletePerson).
    // findOrphanRefs (INV-P2) meldet sie an anderer Stelle — hier kein stiller Cleanup.
    expect(a.parentIn).toContain('@F1@');
    expect(c1.childOf.map((l) => l.familyId)).toContain('@F1@');
  });

  it('ist ein No-Op bei unbekannter id', () => {
    const { db } = seedFamilyDb();
    saveFamily(db, makeFamily('@F1@'));
    deleteFamily(db, '@F999@');
    expect(db.families.size).toBe(1);
  });
});
