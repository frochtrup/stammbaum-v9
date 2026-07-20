// Test-Fixtures der Validierungs-Engine. Reine Datenfabriken — keine Logik.
import { makeDatabase, makeEvent, makeFamily, makePerson, makeCitation } from '../../core/model/index';
import type { Citation, Database, Family, Person } from '../../core/model/types';
import { place, hof } from './places-fixtures';

export { place, hof };

/** Person mit Geburts-/Sterbejahr in einem Aufruf. */
export function personWith(
  id: string,
  patch: Partial<Person> & { birthDate?: string; deathDate?: string } = {},
): Person {
  const { birthDate, deathDate, ...rest } = patch;
  const p = makePerson(id, {
    given: 'Test',
    surname: 'Person',
    name: 'Test /Person/',
    sex: 'M',
    ...rest,
  });
  if (birthDate !== undefined) p.birth = makeEvent('BIRT', { date: birthDate, seen: true });
  if (deathDate !== undefined) p.death = makeEvent('DEAT', { date: deathDate, seen: true });
  return p;
}

export function familyWith(id: string, patch: Partial<Family> & { marrDate?: string } = {}): Family {
  const { marrDate, ...rest } = patch;
  const f = makeFamily(id, rest);
  if (marrDate !== undefined) f.marriage = makeEvent('MARR', { date: marrDate, seen: true });
  return f;
}

/** Zitat auf eine Quelle — der schnellste Weg, „hat Quellen" wahr zu machen. */
export function cite(sourceId: string, patch: Partial<Omit<Citation, 'sourceId'>> = {}): Citation {
  return makeCitation(sourceId, patch);
}

/** Datenbank aus Personen/Familien bauen; Orte/Höfe optional per Patch. */
export function dbWith(
  people: Person[],
  families: Family[] = [],
  patch: Partial<Database> = {},
): Database {
  const db = makeDatabase();
  for (const p of people) db.individuals.set(p.id, p);
  for (const f of families) db.families.set(f.id, f);
  return { ...db, ...patch };
}

/**
 * Eltern-Kind-Konstellation: Familie mit Vater/Mutter/Kind, wechselseitig verdrahtet.
 * Spart in den Regeltests je vier Zeilen Verdrahtung, die nichts über die Regel aussagen.
 */
export function familyTriple(opts: {
  fatherBirth?: string;
  fatherDeath?: string;
  motherBirth?: string;
  childBirth?: string;
  marrDate?: string;
}): { db: Database; father: Person; mother: Person; child: Person; family: Family } {
  const father = personWith('@I1@', { sex: 'M', birthDate: opts.fatherBirth, deathDate: opts.fatherDeath });
  const mother = personWith('@I2@', { sex: 'F', birthDate: opts.motherBirth });
  const child = personWith('@I3@', { sex: 'M', birthDate: opts.childBirth });
  const family = familyWith('@F1@', {
    husband: father.id,
    wife: mother.id,
    children: [child.id],
    marrDate: opts.marrDate,
  });
  father.parentIn = [family.id];
  mother.parentIn = [family.id];
  child.childOf = [
    { familyId: family.id, pedigree: '', fatherRel: '', motherRel: '', fatherRelSeen: false, motherRelSeen: false, citations: [] },
  ];
  return { db: dbWith([father, mother, child], [family]), father, mother, child, family };
}
