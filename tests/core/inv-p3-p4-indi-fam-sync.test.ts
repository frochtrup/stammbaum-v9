// INV-P3: INDI-Seite (childOf/parentIn) und FAM-Seite (children/husband/wife)
//         sind wechselseitig konsistent; die App hält beide Seiten synchron.
// INV-P4: Kind-Beziehungstyp wird ausschließlich INDI-seitig geführt/geschrieben.
// Spec 10 §6, §3.
//
// Seit ADR-v9-92 (Copy-on-Write für Undo/Redo) mutieren die vier Sync-Kommandos nicht
// mehr die übergebene Datenbank, sondern einen Draft — geprüft wird deshalb der
// ZURÜCKGEGEBENE Stand, nicht mehr die beim Seeding gehaltene Objekt-Referenz. Die
// Invariante selbst ist unverändert: beide Seiten müssen nach jedem Kommando konsistent
// sein. Die `checkIndiFamConsistency`-Tests seeden bewusst einseitigen Zustand von Hand
// (ohne Kommando) und arbeiten deshalb weiterhin direkt auf der Datenbank.
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
  saveChildLink,
  makeCitation,
} from '../../core/model/index';
import { editDatabase, type DatabaseDraft } from '../../core/model/draft';
import type { Database } from '../../core/model/types';

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

/** Führt ein Sync-Kommando aus und liefert den neuen Stand (ADR-v9-92 Copy-on-Write). */
function edit(db: Database, fn: (d: DatabaseDraft) => void): Database {
  return editDatabase(db, fn);
}

const famOf = (db: Database) => db.families.get('@F1@')!;
const personOf = (db: Database, id: string) => db.individuals.get(id)!;

describe('INV-P3: INDI↔FAM wechselseitig konsistent', () => {
  it('addChildToFamily setzt beide Seiten (FAM.children + INDI.childOf)', () => {
    const { db, child, fam } = seed();
    const next = edit(db, (d) => addChildToFamily(d, fam.id, child.id, 'birth'));
    expect(famOf(next).children).toContain(child.id);
    expect(personOf(next, child.id).childOf.map((c) => c.familyId)).toContain(fam.id);
    expect(checkIndiFamConsistency(next)).toEqual([]);
  });

  it('addParentToFamily setzt beide Seiten (FAM.husband/wife + INDI.parentIn)', () => {
    const { db, father, mother, fam } = seed();
    const next = edit(db, (d) => {
      addParentToFamily(d, fam.id, father.id, 'husband');
      addParentToFamily(d, fam.id, mother.id, 'wife');
    });
    expect(famOf(next).husband).toBe(father.id);
    expect(famOf(next).wife).toBe(mother.id);
    expect(personOf(next, father.id).parentIn).toContain(fam.id);
    expect(personOf(next, mother.id).parentIn).toContain(fam.id);
    expect(checkIndiFamConsistency(next)).toEqual([]);
  });

  it('removeChildFromFamily räumt beide Seiten ab', () => {
    const { db, child, fam } = seed();
    const added = edit(db, (d) => addChildToFamily(d, fam.id, child.id));
    const next = edit(added, (d) => removeChildFromFamily(d, fam.id, child.id));
    expect(famOf(next).children).not.toContain(child.id);
    expect(personOf(next, child.id).childOf.map((c) => c.familyId)).not.toContain(fam.id);
    expect(checkIndiFamConsistency(next)).toEqual([]);
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
    const added = edit(db, (d) => addParentToFamily(d, fam.id, father.id, 'husband'));
    const next = edit(added, (d) => removeParentFromFamily(d, fam.id, 'husband'));
    expect(famOf(next).husband).toBeNull();
    expect(personOf(next, father.id).parentIn).not.toContain(fam.id);
    expect(checkIndiFamConsistency(next)).toEqual([]);
  });

  it('removeParentFromFamily ist idempotent (leerer Slot bleibt leer)', () => {
    const { db, fam } = seed();
    const next = edit(db, (d) => removeParentFromFamily(d, fam.id, 'wife'));
    expect(famOf(next).wife).toBeNull();
    expect(checkIndiFamConsistency(next)).toEqual([]);
  });

  it('addChildToFamily ist idempotent (kein Duplikat auf beiden Seiten)', () => {
    const { db, child, fam } = seed();
    const once = edit(db, (d) => addChildToFamily(d, fam.id, child.id));
    const next = edit(once, (d) => addChildToFamily(d, fam.id, child.id));
    expect(famOf(next).children.filter((c) => c === child.id)).toHaveLength(1);
    expect(personOf(next, child.id).childOf.filter((c) => c.familyId === fam.id)).toHaveLength(1);
  });

  it('lässt den Vorzustand unangetastet (Undo-Snapshot-Bedingung, ADR-v9-92)', () => {
    const { db, child, fam } = seed();
    const next = edit(db, (d) => addChildToFamily(d, fam.id, child.id, 'birth'));
    // Der Stand VOR dem Kommando darf die Verknüpfung nicht sehen — sonst wäre ein
    // zurückgehaltener Undo-Snapshot wertlos.
    expect(famOf(db).children).not.toContain(child.id);
    expect(personOf(db, child.id).childOf).toHaveLength(0);
    expect(famOf(next).children).toContain(child.id);
  });
});

describe('INV-P4: Kind-Beziehungstyp ausschließlich INDI-seitig', () => {
  it('pedigree lebt im ChildLink (INDI), nicht auf der Familie', () => {
    const { db, child, fam } = seed();
    const next = edit(db, (d) => addChildToFamily(d, fam.id, child.id, 'adopted'));
    const link = personOf(next, child.id).childOf.find((c) => c.familyId === fam.id);
    expect(link?.pedigree).toBe('adopted');
    // Family trägt keinerlei Beziehungstyp-Feld für Kinder.
    expect(Object.keys(famOf(next))).not.toContain('childPedigrees');
    expect(Object.keys(famOf(next))).not.toContain('childRel');
  });

  it('bewahrt bestehenden Beziehungstyp bei idempotentem Re-Add nicht ungewollt zurückgesetzt', () => {
    const { db, child, fam } = seed();
    const once = edit(db, (d) => addChildToFamily(d, fam.id, child.id, 'foster'));
    const next = edit(once, (d) => addChildToFamily(d, fam.id, child.id)); // ohne pedigree
    const link = personOf(next, child.id).childOf.find((c) => c.familyId === fam.id);
    expect(link?.pedigree).toBe('foster');
  });
});

// `saveChildLink` (BL-329) ist das erste Kommando, das einen ChildLink BESCHREIBT statt
// ihn zu verknüpfen. Geprüft wird genau diese Grenze: es ändert den Link — und die
// Beziehungsstruktur nicht (die bleibt, wo sie ist: bei `saveFamily`, INV-P3).
describe('saveChildLink: beschreibt den ChildLink, ohne die Beziehung anzufassen', () => {
  const mitKind = () => {
    const { db, child, fam } = seed();
    return { db: edit(db, (d) => addChildToFamily(d, fam.id, child.id)), child, fam };
  };

  it('setzt Kind-Verhältnis und Belege am bestehenden Link', () => {
    const { db, child } = mitKind();
    const link = personOf(db, child.id).childOf[0];
    const next = saveChildLink(db, child.id, {
      ...link,
      pedigree: 'adopted',
      citations: [makeCitation('@S1@')],
    });
    const neu = personOf(next, child.id).childOf[0];
    expect(neu.pedigree).toBe('adopted');
    expect(neu.citations.map((c) => c.sourceId)).toEqual(['@S1@']);
    // INV-P3 unberührt: beide Seiten stehen unverändert.
    expect(famOf(next).children).toEqual([child.id]);
    expect(checkIndiFamConsistency(next)).toEqual([]);
  });

  it('hängt die Beziehung NICHT um: eine fremde familyId bleibt wirkungslos', () => {
    const { db, child } = mitKind();
    const link = personOf(db, child.id).childOf[0];
    const next = saveChildLink(db, child.id, { ...link, familyId: '@F9@', pedigree: 'foster' });
    expect(personOf(next, child.id).childOf.map((l) => l.familyId)).toEqual(['@F1@']);
    expect(personOf(next, child.id).childOf[0].pedigree).toBe('');
  });

  it('ohne Person oder ohne Link passiert nichts', () => {
    const { db, child, fam } = mitKind();
    const link = personOf(db, child.id).childOf[0];
    expect(personOf(saveChildLink(db, '@IX@', link), child.id).childOf[0].pedigree).toBe('');
    const ohneLink = edit(db, (d) => removeChildFromFamily(d, fam.id, child.id));
    expect(personOf(saveChildLink(ohneLink, child.id, link), child.id).childOf).toEqual([]);
  });
});
