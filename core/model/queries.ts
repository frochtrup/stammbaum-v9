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
