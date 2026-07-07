// core/model/commands.ts — Mutations-Kommandos für Person (Spec 20 §2 "Bearbeitung &
// Formulare", savePerson(model)-Muster). Analog core/places/commands.ts: reine Kommando-
// Funktionen, die ein VOLLSTÄNDIGES Objekt entgegennehmen und die Map mutieren — keine
// verstreuten Feld-Setter aus dem DOM. Das Objekt kommt komplett von der aufrufenden
// Formular-Komponente (dort bereits validiert/zusammengebaut).
//
// Kein Zustand hier, kein DOM/I/O (INV-ARCH-1/2) — die UI-Schale ruft diese Kommandos
// über ein AppState-Kommando auf, das die Reaktivität auslöst.
import type {
  Database,
  Family,
  FamilyId,
  Person,
  PersonId,
  Repository,
  RepoId,
  Source,
  SourceId,
} from './types';
import {
  addChildToFamily,
  removeChildFromFamily,
  addParentToFamily,
  removeParentFromFamily,
} from './integrity';

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

/**
 * Kommando: legt eine Familie an oder aktualisiert sie aus dem Familie-Formular
 * (Spec 20 §2: "Eltern (Dropdown), Heirat + Verlobung, Kinder ±, Quellen").
 *
 * ANDERS als savePerson ist die Beziehungsseite (Eltern/Kinder) hier KERN des Formulars —
 * ein naives `families.set` würde die INDI-Seite (Person.parentIn/childOf) nicht nachführen
 * und INV-P3 (Spec 10 §6) verletzen. Daher werden Eltern-/Kind-Änderungen über die
 * synchron haltenden Kommandos aus integrity.ts angewandt, NICHT direkt geschrieben.
 *
 * Pedigree (INV-P4): `next.children` ist ein reines PersonId[] ohne Pedigree-Information.
 * addChildToFamily wird deshalb OHNE pedigree-Argument aufgerufen — bestehende ChildLinks
 * behalten ihren Pedigree-Wert unangetastet, neue erhalten den Default ''. Wer Pedigree
 * bearbeiten will, tut das über den ChildLink-Editor; dieses Formular fasst ihn nicht an.
 */
export function saveFamily(db: Database, next: Family): void {
  const prev = db.families.get(next.id);
  const prevHusband = prev ? prev.husband : null;
  const prevWife = prev ? prev.wife : null;
  const prevChildren = prev ? prev.children : [];

  // Sicherstellen, dass eine Familie existiert, bevor die integrity-Kommandos greifen
  // (sie no-op'en auf fehlende Familien). Restfelder werden am Ende endgültig gesetzt.
  if (!prev) {
    db.families.set(next.id, { ...next, husband: null, wife: null, children: [] });
  }

  // --- Eltern-Slots synchron nachführen (INV-P3) ---
  if (next.husband !== prevHusband) {
    if (next.husband === null) removeParentFromFamily(db, next.id, 'husband');
    else addParentToFamily(db, next.id, next.husband, 'husband');
  }
  if (next.wife !== prevWife) {
    if (next.wife === null) removeParentFromFamily(db, next.id, 'wife');
    else addParentToFamily(db, next.id, next.wife, 'wife');
  }

  // --- Kinder-Differenz synchron nachführen (INV-P3), Pedigree unangetastet (INV-P4) ---
  const nextSet = new Set(next.children);
  const prevSet = new Set(prevChildren);
  for (const cid of prevChildren) {
    if (!nextSet.has(cid)) removeChildFromFamily(db, next.id, cid);
  }
  for (const cid of next.children) {
    if (!prevSet.has(cid)) addChildToFamily(db, next.id, cid); // ohne pedigree → Default/erhalten
  }

  // --- Restfelder als reines Upsert übernehmen (keine Beziehungs-Seiteneffekte) ---
  // husband/wife/children stehen bereits konsistent im aktuellen Family-Objekt; children in
  // der vom Formular gewünschten Reihenfolge übernehmen. Beziehungslose Felder kommen aus next.
  const fam = db.families.get(next.id)!;
  db.families.set(next.id, {
    ...next,
    husband: fam.husband,
    wife: fam.wife,
    children: next.children.slice(),
  });
}

/**
 * Kommando: entfernt eine Familie (per id). No-Op bei unbekannter id.
 *
 * BEWUSST OHNE Kaskade auf Person.childOf/parentIn (analog deletePerson/deletePlaceObject):
 * verwaiste Referenzen werden von findOrphanRefs (INV-P2) gemeldet, nicht hier still
 * aufgeräumt — konsistentes Muster, kein Bug.
 */
export function deleteFamily(db: Database, id: FamilyId): void {
  db.families.delete(id);
}

// --- Quelle / Archiv (Spec 10 §4, Spec 20 §2 Quelle-/Archiv-Formular) ---
//
// Source und Repository sind FLACHE Modelle ohne Beziehungs-Graph: Source.repo ist nur eine
// lose Referenz (RepoId | Freitext), kein bidirektionales Sync-Bedürfnis wie Family.husband /
// Person.parentIn. Deshalb reicht — anders als saveFamily — reines Whole-Object-Upsert
// (savePlaceObject-/savePerson-Muster), KEINE Sync-Logik.

/**
 * Kommando: legt eine Quelle an oder ersetzt sie vollständig (Upsert per id).
 *
 * BEWUSST OHNE Nachführung der repo-Referenz — sie ist ein loser Verweis, kein Graph.
 */
export function saveSource(sources: Map<SourceId, Source>, next: Source): void {
  sources.set(next.id, next);
}

/**
 * Kommando: entfernt eine Quelle (per id). No-Op bei unbekannter id.
 *
 * BEWUSST OHNE Kaskade auf referenzierende Citations (analog deletePerson/deletePlaceObject):
 * verwaiste citation.sourceId werden von findOrphanRefs (INV-P2, Spec 10 §6) gemeldet, nicht
 * hier still aufgeräumt.
 */
export function deleteSource(sources: Map<SourceId, Source>, id: SourceId): void {
  sources.delete(id);
}

/**
 * Kommando: legt ein Archiv an oder ersetzt es vollständig (Upsert per id).
 */
export function saveRepository(repositories: Map<RepoId, Repository>, next: Repository): void {
  repositories.set(next.id, next);
}

/**
 * Kommando: entfernt ein Archiv (per id). No-Op bei unbekannter id.
 *
 * BEWUSST OHNE Kaskade auf Source.repo-Referenzen (gleiches Prinzip wie deleteSource):
 * verwaiste Verweise werden von findOrphanRefs (INV-P2) gemeldet, nicht hier aufgeräumt.
 */
export function deleteRepository(repositories: Map<RepoId, Repository>, id: RepoId): void {
  repositories.delete(id);
}
