// core/model/commands.ts — Mutations-Kommandos für Person (Spec 20 §2 "Bearbeitung &
// Formulare", savePerson(model)-Muster). Analog core/places/commands.ts: reine Kommando-
// Funktionen, die ein VOLLSTÄNDIGES Objekt entgegennehmen und die Map mutieren — keine
// verstreuten Feld-Setter aus dem DOM. Das Objekt kommt komplett von der aufrufenden
// Formular-Komponente (dort bereits validiert/zusammengebaut).
//
// Kein Zustand hier, kein DOM/I/O (INV-ARCH-1/2) — die UI-Schale ruft diese Kommandos
// über ein AppState-Kommando auf, das die Reaktivität auslöst.
import type { Person, PersonId } from './types';

/**
 * Kommando: legt eine Person an oder ersetzt sie vollständig (Upsert per id).
 * `savePerson(model)`-Muster (analog savePlaceObject) — kein Feld-Setter.
 *
 * BEWUSST OHNE Relationship-Graph-Seiteneffekte: `childOf`/`parentIn` bzw. die FAM-Seite
 * (Family.children/husband/wife) werden NICHT nachgeführt. Das Verdrahten von Beziehungen
 * ist ein eigenes Feature (Spec 20 §1.87 [S/E]), außerhalb dieser Scheibe — analog
 * savePlaceObject, das enclosedBy-Referenzen auch nicht anfasst.
 */
export function savePerson(individuals: Map<PersonId, Person>, next: Person): void {
  individuals.set(next.id, next);
}

/**
 * Kommando: entfernt eine Person (per id). No-Op bei unbekannter id.
 *
 * BEWUSST OHNE Nachführung von Familien-Referenzen (Family.children/husband/wife bzw.
 * andere Personen.childOf/parentIn) — genau wie deletePlaceObject verwaiste Verweise nicht
 * aufräumt. Kaskade/Integritäts-Report ist Sache eines separaten Features.
 */
export function deletePerson(individuals: Map<PersonId, Person>, id: PersonId): void {
  individuals.delete(id);
}
