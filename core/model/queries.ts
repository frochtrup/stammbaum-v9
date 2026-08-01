// core/model/queries.ts — reine Nachschlage-Helfer über die Datenbank (Spec 10).
// Framework-frei, DOM-frei (INV-ARCH-1). EINE Quelle für Fragen, die sonst an jeder
// aufrufenden Stelle neu (und leicht abweichend) beantwortet würden.
import type { Database, PersonId } from './types';

/**
 * Die lexikografisch kleinste Personen-ID — der **Proband-Default** (ADR-v9-135: transient,
 * nicht persistiert, Default = kleinste ID) UND die Reachability-Wurzel der Validierung
 * (`reachableFrom`). Beide sprachen zuvor ihren eigenen `[...keys()].sort()[0]`; das hier ist
 * die eine gemeinsame Definition (im Kern, damit `core/validate` sie ohne Schichtbruch nutzt
 * und die UI-Schicht `resolveProband` darauf aufsetzt). `null` bei leerer Datenbank.
 *
 * Einpass-Minimum statt vollständigem Sortieren (gleiches Ergebnis, billiger).
 */
export function smallestPersonId(db: Database): PersonId | null {
  let min: PersonId | null = null;
  for (const id of db.individuals.keys()) {
    if (min === null || id < min) min = id;
  }
  return min;
}

/** Eltern-Paar aus der ERSTEN Herkunftsfamilie (Orakel: `famc[0]` in v8). */
export interface ParentIds {
  father: PersonId | null;
  mother: PersonId | null;
}

/**
 * Erste Herkunftsfamilie einer Person → Eltern-Paar. Lag bis BL-231 in
 * `ui/islands/tree/tree-model.ts` und war damit für den Kern unerreichbar (INV-ARCH-1:
 * Abhängigkeiten nur nach unten). `ancestorBranches` (core/research) braucht dieselbe
 * Aufwärts-Kante wie Sanduhr, Fächer, Beziehungsrechner und Ahnenliste — deshalb hier
 * unten, statt sie im Kern ein zweites Mal zu schreiben (INV-UI-4 auf Datenebene).
 * `tree-model.ts` re-exportiert sie, damit die bestehenden Aufrufer unverändert bleiben.
 */
export function getParentIds(db: Database, personId: PersonId | null | undefined): ParentIds {
  if (!personId) return { father: null, mother: null };
  const person = db.individuals.get(personId);
  if (!person || person.childOf.length === 0) return { father: null, mother: null };
  const fam = db.families.get(person.childOf[0].familyId);
  return { father: fam?.husband ?? null, mother: fam?.wife ?? null };
}
