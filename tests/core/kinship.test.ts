// tests/core/kinship.test.ts — die fünf Stufen der Verwandtschafts-Relevanz (BL-375,
// Spec 20 §1.11i). Reine Graph-Logik, headless (TST-5).
//
// Ein Baum mit BEKANNTER Struktur, damit jede Stufe an einer Person hängt, die genau in
// ihr liegt und in keiner anderen:
//
//        @I9@ Großvater
//          │
//        @I2@ Vater ── @I3@ Mutter
//          ├───────────────┬─────────────┐
//        @I1@ PROBAND    @I4@ Schwester
//          │ (⚭ @I5@ Ehefrau)
//        @I6@ Kind
//          │
//        @I7@ Enkel
//
//   @I8@ Fremder — in keiner Familie, also außerhalb des Kernbaums.
//
// Die Schwester ist der Fall, der die Achse überhaupt trägt: sie gehört zum Kernbaum,
// aber weder zur Ahnenlinie noch zur Nachkommenschaft. Ohne sie wäre „Kernbaum" von
// „Vorfahren ∪ Nachkommen" nicht unterscheidbar, und der Test bewiese nichts.
import { describe, expect, it } from 'vitest';
import { makeDatabase, makePerson, makeFamily } from '../../core/model/factory';
import { computeKinship, kinshipMembers, KINSHIP_CLASSES } from '../../core/model/kinship';
import type { Database } from '../../core/model/types';

function link(familyId: string) {
  return {
    familyId,
    pedigree: '' as const,
    fatherRel: '',
    motherRel: '',
    fatherRelSeen: false,
    motherRelSeen: false,
    citations: [],
  };
}

function baum(): Database {
  const db = makeDatabase();
  // Herkunftsfamilie des Probanden
  db.families.set('@F1@', makeFamily('@F1@', { husband: '@I2@', wife: '@I3@', children: ['@I1@', '@I4@'] }));
  // Ehefamilie des Probanden
  db.families.set('@F2@', makeFamily('@F2@', { husband: '@I1@', wife: '@I5@', children: ['@I6@'] }));
  // Familie des Kindes
  db.families.set('@F3@', makeFamily('@F3@', { husband: '@I6@', children: ['@I7@'] }));
  // Herkunftsfamilie des Vaters
  db.families.set('@F4@', makeFamily('@F4@', { husband: '@I9@', children: ['@I2@'] }));

  db.individuals.set('@I1@', makePerson('@I1@', { given: 'Proband', childOf: [link('@F1@')], parentIn: ['@F2@'] }));
  db.individuals.set('@I2@', makePerson('@I2@', { given: 'Vater', childOf: [link('@F4@')], parentIn: ['@F1@'] }));
  db.individuals.set('@I3@', makePerson('@I3@', { given: 'Mutter', parentIn: ['@F1@'] }));
  db.individuals.set('@I4@', makePerson('@I4@', { given: 'Schwester', childOf: [link('@F1@')] }));
  db.individuals.set('@I5@', makePerson('@I5@', { given: 'Ehefrau', parentIn: ['@F2@'] }));
  db.individuals.set('@I6@', makePerson('@I6@', { given: 'Kind', childOf: [link('@F2@')], parentIn: ['@F3@'] }));
  db.individuals.set('@I7@', makePerson('@I7@', { given: 'Enkel', childOf: [link('@F3@')] }));
  db.individuals.set('@I8@', makePerson('@I8@', { given: 'Fremder' }));
  db.individuals.set('@I9@', makePerson('@I9@', { given: 'Großvater', parentIn: ['@F4@'] }));
  return db;
}

const stufe = (db: Database, cls: Parameters<typeof kinshipMembers>[2]) => {
  const menge = kinshipMembers(db, computeKinship(db, '@I1@'), cls);
  return menge === null ? null : [...menge].sort();
};

describe('computeKinship — die fünf Stufen (BL-375)', () => {
  it('„Alle" ist KEINE Einschränkung — null, nicht die leere Menge', () => {
    expect(stufe(baum(), 'all')).toBeNull();
  });

  it('„Vorfahren" ist die Elternlinie samt Probandem, ohne Seitenlinien', () => {
    expect(stufe(baum(), 'ancestors')).toEqual(['@I1@', '@I2@', '@I3@', '@I9@']);
  });

  it('„Nachkommen" ist die Kindlinie samt Probandem, ohne den angeheirateten Zweig', () => {
    // @I5@ (Ehefrau) ist bewusst NICHT dabei: sie ist keine Nachkommin.
    expect(stufe(baum(), 'descendants')).toEqual(['@I1@', '@I6@', '@I7@']);
  });

  it('„Kernbaum" nimmt Seitenlinien und Angeheiratete mit — der Unterschied zu Vor+Nachfahren', () => {
    const kern = stufe(baum(), 'core')!;
    expect(kern).toContain('@I4@'); // Schwester: Seitenlinie
    expect(kern).toContain('@I5@'); // Ehefrau: angeheiratet
    expect(kern).not.toContain('@I8@');
    expect(kern).toHaveLength(8);
  });

  it('„Außerhalb" ist genau das Komplement des Kernbaums', () => {
    expect(stufe(baum(), 'outside')).toEqual(['@I8@']);
  });

  it('rechnet die Mengen relativ zum ÜBERGEBENEN Probanden, nicht zu einer festen Wurzel', () => {
    const db = baum();
    const vomEnkel = kinshipMembers(db, computeKinship(db, '@I7@'), 'ancestors')!;
    // @I5@ ist von HIER aus eine Vorfahrin (die Mutter des Kindes) — vom Probanden aus
    // war sie es nicht. Genau das soll die Achse leisten: sie hängt am Probanden.
    expect([...vomEnkel].sort()).toEqual(['@I1@', '@I2@', '@I3@', '@I5@', '@I6@', '@I7@', '@I9@']);
  });

  it('fällt ohne gültigen Probanden auf die kleinste Id zurück, statt leer zu laufen', () => {
    const db = baum();
    expect(computeKinship(db, null).rootId).toBe('@I1@');
    expect(computeKinship(db, '@GIBTESNICHT@').rootId).toBe('@I1@');
  });

  it('bleibt bei leerem Bestand harmlos', () => {
    const leer = makeDatabase();
    const sets = computeKinship(leer, null);
    expect(sets.rootId).toBeNull();
    expect(kinshipMembers(leer, sets, 'core')!.size).toBe(0);
  });

  it('führt genau die fünf Stufen aus Spec 20 §1.11i', () => {
    expect(KINSHIP_CLASSES.map((k) => k.key)).toEqual([
      'all',
      'ancestors',
      'descendants',
      'core',
      'outside',
    ]);
  });
});
