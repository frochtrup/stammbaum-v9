// tests/islands/tree-fixtures.ts — synthetische Test-DB-Bauhelfer für die Sanduhr-Insel.
// Analog tests/core/places-fixtures.ts: kleine, deterministische Familien-Graphen statt
// die große Roundtrip-Fixture zu laden (diese Insel-Tests prüfen reine Layout-/Traversal-
// Logik, kein Interop).
import type { Database } from '../../core/model/types';
import { makeDatabase, makeFamily, makePerson } from '../../core/model';

function link(db: Database, familyId: string, childId: string): void {
  const child = db.individuals.get(childId)!;
  child.childOf.push({
    familyId,
    pedigree: 'birth',
    fatherRel: '',
    motherRel: '',
    fatherRelSeen: false,
    motherRelSeen: false,
    citations: [],
  });
}

export function addPerson(db: Database, id: string, name: string = id, sex: 'M' | 'F' | 'U' = 'U'): void {
  db.individuals.set(id, makePerson(id, { name, given: name, sex }));
}

/** Verheiratet husbandId x wifeId (legt Familie an falls nötig) und hängt Kinder an. */
export function marry(
  db: Database,
  familyId: string,
  husbandId: string | null,
  wifeId: string | null,
  children: string[] = [],
): void {
  db.families.set(familyId, makeFamily(familyId, { husband: husbandId, wife: wifeId, children: [...children] }));
  if (husbandId) db.individuals.get(husbandId)!.parentIn.push(familyId);
  if (wifeId) db.individuals.get(wifeId)!.parentIn.push(familyId);
  for (const c of children) link(db, familyId, c);
}

/**
 * Baut einen 4-Generationen-Stammbaum um `@I1@` (Proband):
 * Eltern @I2@(Vater)/@I3@(Mutter), Großeltern @I4@..@I7@, Urgroßeltern @I8@..@I15@,
 * Ehepartner @I20@, Kinder @I30@/@I31@ — deckt bis zu 3 Ahnen-Ebenen + Ehepartner + Kinder ab.
 */
export function buildFourGenTree(): Database {
  const db = makeDatabase();
  const names: Record<string, string> = {
    I1: 'Proband Testperson',
    I2: 'Vater Testperson',
    I3: 'Mutter Testperson',
    I4: 'Großvater vv',
    I5: 'Großmutter vv',
    I6: 'Großvater mv',
    I7: 'Großmutter mv',
    I8: 'Urgroßvater vvv',
    I9: 'Urgroßmutter vvv',
    I10: 'Urgroßvater vvm',
    I11: 'Urgroßmutter vvm',
    I12: 'Urgroßvater mvv',
    I13: 'Urgroßmutter mvv',
    I14: 'Urgroßvater mvm',
    I15: 'Urgroßmutter mvm',
    I20: 'Ehepartner Testperson',
    I30: 'Kind Eins',
    I31: 'Kind Zwei',
  };
  for (const [id, name] of Object.entries(names)) addPerson(db, id, name);

  marry(db, 'F8', 'I8', 'I9', ['I4']);
  marry(db, 'F9', 'I10', 'I11', ['I5']);
  marry(db, 'F10', 'I12', 'I13', ['I6']);
  marry(db, 'F11', 'I14', 'I15', ['I7']);
  marry(db, 'F4', 'I4', 'I5', ['I2']);
  marry(db, 'F5', 'I6', 'I7', ['I3']);
  marry(db, 'F1', 'I2', 'I3', ['I1']);
  marry(db, 'F2', 'I1', 'I20', ['I30', 'I31']);

  return db;
}
