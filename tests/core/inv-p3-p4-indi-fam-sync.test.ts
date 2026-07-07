// INV-P3: INDI-Seite (childOf/parentIn) und FAM-Seite (children/husband/wife)
//         sind wechselseitig konsistent; die App hält beide Seiten synchron.
// INV-P4: Kind-Beziehungstyp wird ausschließlich INDI-seitig geführt/geschrieben.
// Spec 10 §6, §3.
import { describe, it, expect } from 'vitest';
import {
  makeDatabase,
  makePerson,
  makeFamily,
  addChildToFamily,
  addParentToFamily,
  removeChildFromFamily,
  removeParentFromFamily,
  checkIndiFamConsistency,
} from '../../core/model/index';

function seed() {
  const db = makeDatabase();
  const father = makePerson('@I1@', { sex: 'M' });
  const mother = makePerson('@I2@', { sex: 'F' });
  const child = makePerson('@I3@');
  const fam = makeFamily('@F1@');
  for (const p of [father, mother, child]) db.individuals.set(p.id, p);
  db.families.set(fam.id, fam);
  return { db, father, mother, child, fam };
}

describe('INV-P3: INDI↔FAM wechselseitig konsistent', () => {
  it('addChildToFamily setzt beide Seiten (FAM.children + INDI.childOf)', () => {
    const { db, child, fam } = seed();
    addChildToFamily(db, fam.id, child.id, 'birth');
    expect(fam.children).toContain(child.id);
    expect(child.childOf.map((c) => c.familyId)).toContain(fam.id);
    expect(checkIndiFamConsistency(db)).toEqual([]);
  });

  it('addParentToFamily setzt beide Seiten (FAM.husband/wife + INDI.parentIn)', () => {
    const { db, father, mother, fam } = seed();
    addParentToFamily(db, fam.id, father.id, 'husband');
    addParentToFamily(db, fam.id, mother.id, 'wife');
    expect(fam.husband).toBe(father.id);
    expect(fam.wife).toBe(mother.id);
    expect(father.parentIn).toContain(fam.id);
    expect(mother.parentIn).toContain(fam.id);
    expect(checkIndiFamConsistency(db)).toEqual([]);
  });

  it('removeChildFromFamily räumt beide Seiten ab', () => {
    const { db, child, fam } = seed();
    addChildToFamily(db, fam.id, child.id);
    removeChildFromFamily(db, fam.id, child.id);
    expect(fam.children).not.toContain(child.id);
    expect(child.childOf.map((c) => c.familyId)).not.toContain(fam.id);
    expect(checkIndiFamConsistency(db)).toEqual([]);
  });

  it('checkIndiFamConsistency findet einseitige FAM.children ohne INDI.childOf', () => {
    const { db, child, fam } = seed();
    fam.children.push(child.id); // absichtlich nur eine Seite
    const issues = checkIndiFamConsistency(db);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]).toMatchObject({ familyId: '@F1@', personId: '@I3@', side: 'fam-only' });
  });

  it('checkIndiFamConsistency findet einseitige INDI.parentIn ohne FAM.husband/wife', () => {
    const { db, father, fam } = seed();
    father.parentIn.push(fam.id); // nur INDI-Seite
    const issues = checkIndiFamConsistency(db);
    expect(issues.some((i) => i.side === 'indi-only' && i.personId === '@I1@')).toBe(true);
  });

  it('removeParentFromFamily leert den Slot und löst parentIn (beide Seiten konsistent)', () => {
    const { db, father, fam } = seed();
    addParentToFamily(db, fam.id, father.id, 'husband');
    removeParentFromFamily(db, fam.id, 'husband');
    expect(fam.husband).toBeNull();
    expect(father.parentIn).not.toContain(fam.id);
    expect(checkIndiFamConsistency(db)).toEqual([]);
  });

  it('removeParentFromFamily ist idempotent (leerer Slot bleibt leer)', () => {
    const { db, fam } = seed();
    removeParentFromFamily(db, fam.id, 'wife');
    expect(fam.wife).toBeNull();
    expect(checkIndiFamConsistency(db)).toEqual([]);
  });

  it('addChildToFamily ist idempotent (kein Duplikat auf beiden Seiten)', () => {
    const { db, child, fam } = seed();
    addChildToFamily(db, fam.id, child.id);
    addChildToFamily(db, fam.id, child.id);
    expect(fam.children.filter((c) => c === child.id)).toHaveLength(1);
    expect(child.childOf.filter((c) => c.familyId === fam.id)).toHaveLength(1);
  });
});

describe('INV-P4: Kind-Beziehungstyp ausschließlich INDI-seitig', () => {
  it('pedigree lebt im ChildLink (INDI), nicht auf der Familie', () => {
    const { db, child, fam } = seed();
    addChildToFamily(db, fam.id, child.id, 'adopted');
    const link = child.childOf.find((c) => c.familyId === fam.id);
    expect(link?.pedigree).toBe('adopted');
    // Family trägt keinerlei Beziehungstyp-Feld für Kinder.
    expect(Object.keys(fam)).not.toContain('childPedigrees');
    expect(Object.keys(fam)).not.toContain('childRel');
  });

  it('bewahrt bestehenden Beziehungstyp bei idempotentem Re-Add nicht ungewollt zurückgesetzt', () => {
    const { db, child, fam } = seed();
    addChildToFamily(db, fam.id, child.id, 'foster');
    addChildToFamily(db, fam.id, child.id); // ohne pedigree
    const link = child.childOf.find((c) => c.familyId === fam.id);
    expect(link?.pedigree).toBe('foster');
  });
});
