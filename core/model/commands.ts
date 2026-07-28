// core/model/commands.ts — Mutations-Kommandos für Person (Spec 20 §2 "Bearbeitung &
// Formulare", savePerson(model)-Muster). Analog core/places/commands.ts: reine Kommando-
// Funktionen, die ein VOLLSTÄNDIGES Objekt entgegennehmen und die Map mutieren — keine
// verstreuten Feld-Setter aus dem DOM. Das Objekt kommt komplett von der aufrufenden
// Formular-Komponente (dort bereits validiert/zusammengebaut).
//
// Kein Zustand hier, kein DOM/I/O (INV-ARCH-1/2) — die UI-Schale ruft diese Kommandos
// über ein AppState-Kommando auf, das die Reaktivität auslöst.
//
// COPY-ON-WRITE (ADR-v9-92 Punkt 3, BL-01): Alle Kommandos hier geben einen NEUEN Stand
// zurück, statt die übergebene Struktur in-place zu mutieren — Bedingung dafür, dass ein
// zurückgehaltener Undo-Snapshot nicht nachträglich mitmutiert.
//
// WAS DER COMPILER DABEI LEISTET — und was nicht: Die `ReadonlyMap`-/`ReadonlyDatabase`-
// Parameter machen jede In-Place-MUTATION zum Typfehler, und das ist die Hälfte, auf die
// es ankommt (still in einen Snapshot schreiben ist der gefährliche Fehler). Einen
// IGNORIERTEN Rückgabewert meldet TypeScript dagegen NICHT — beim Bau von BL-01 am echten
// Code geprüft: `savePerson(map, p);` ohne Zuweisung kompiliert anstandslos und schlug
// erst in den Tests fehl (ADR-v9-92 nahm hier mehr Compiler-Zwang an, als es gibt).
// Diese Hälfte tragen die Tests, nicht der Typ — deshalb hat jedes Kommando einen.
import type {
  Citation,
  Database,
  Family,
  FamilyId,
  Media,
  MediaCitation,
  MediaId,
  Person,
  PersonId,
  Repository,
  RepoId,
  Source,
  SourceId,
} from './types';
import { editDatabase, type ReadonlyDatabase } from './draft';
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
export function savePerson(
  individuals: ReadonlyMap<PersonId, Person>,
  next: Person,
): Map<PersonId, Person> {
  const out = new Map(individuals);
  out.set(next.id, next);
  return out;
}

/**
 * Kommando: entfernt eine Person (per id). No-Op bei unbekannter id.
 *
 * BEWUSST OHNE Nachführung von Familien-Referenzen (Family.children/husband/wife bzw.
 * andere Personen.childOf/parentIn) — genau wie deletePlaceObject verwaiste Verweise nicht
 * aufräumt. Kaskade/Integritäts-Report ist Sache eines separaten Features.
 */
export function deletePerson(
  individuals: ReadonlyMap<PersonId, Person>,
  id: PersonId,
): Map<PersonId, Person> {
  const out = new Map(individuals);
  out.delete(id);
  return out;
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
export function saveFamily(db: ReadonlyDatabase, next: Family): Database {
  return editDatabase(db, (d) => {
    const prev = d.family(next.id);
    const prevHusband = prev ? prev.husband : null;
    const prevWife = prev ? prev.wife : null;
    // Kopie: `prev` wird unten von den integrity-Kommandos verändert, die Differenz muss
    // aber gegen den Stand VOR der Änderung gebildet werden.
    const prevChildren = prev ? prev.children.slice() : [];

    // Sicherstellen, dass eine Familie existiert, bevor die integrity-Kommandos greifen
    // (sie no-op'en auf fehlende Familien). Restfelder werden am Ende endgültig gesetzt.
    if (!prev) {
      d.setFamily({ ...next, husband: null, wife: null, children: [] });
    }

    // --- Eltern-Slots synchron nachführen (INV-P3) ---
    if (next.husband !== prevHusband) {
      if (next.husband === null) removeParentFromFamily(d, next.id, 'husband');
      else addParentToFamily(d, next.id, next.husband, 'husband');
    }
    if (next.wife !== prevWife) {
      if (next.wife === null) removeParentFromFamily(d, next.id, 'wife');
      else addParentToFamily(d, next.id, next.wife, 'wife');
    }

    // --- Kinder-Differenz synchron nachführen (INV-P3), Pedigree unangetastet (INV-P4) ---
    const nextSet = new Set(next.children);
    const prevSet = new Set(prevChildren);
    for (const cid of prevChildren) {
      if (!nextSet.has(cid)) removeChildFromFamily(d, next.id, cid);
    }
    for (const cid of next.children) {
      if (!prevSet.has(cid)) addChildToFamily(d, next.id, cid); // ohne pedigree → Default/erhalten
    }

    // --- Restfelder als reines Upsert übernehmen (keine Beziehungs-Seiteneffekte) ---
    // husband/wife/children stehen bereits konsistent im aktuellen Family-Objekt; children in
    // der vom Formular gewünschten Reihenfolge übernehmen. Beziehungslose Felder kommen aus next.
    const fam = d.family(next.id)!;
    d.setFamily({
      ...next,
      husband: fam.husband,
      wife: fam.wife,
      children: next.children.slice(),
    });
  });
}

/**
 * Kommando: entfernt eine Familie (per id). No-Op bei unbekannter id.
 *
 * BEWUSST OHNE Kaskade auf Person.childOf/parentIn (analog deletePerson/deletePlaceObject):
 * verwaiste Referenzen werden von findOrphanRefs (INV-P2) gemeldet, nicht hier still
 * aufgeräumt — konsistentes Muster, kein Bug.
 */
export function deleteFamily(db: ReadonlyDatabase, id: FamilyId): Database {
  return editDatabase(db, (d) => d.removeFamily(id));
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
export function saveSource(
  sources: ReadonlyMap<SourceId, Source>,
  next: Source,
): Map<SourceId, Source> {
  const out = new Map(sources);
  out.set(next.id, next);
  return out;
}

/**
 * Kommando: entfernt eine Quelle (per id). No-Op bei unbekannter id.
 *
 * BEWUSST OHNE Kaskade auf referenzierende Citations (analog deletePerson/deletePlaceObject):
 * verwaiste citation.sourceId werden von findOrphanRefs (INV-P2, Spec 10 §6) gemeldet, nicht
 * hier still aufgeräumt.
 */
export function deleteSource(
  sources: ReadonlyMap<SourceId, Source>,
  id: SourceId,
): Map<SourceId, Source> {
  const out = new Map(sources);
  out.delete(id);
  return out;
}

/**
 * Kommando: legt ein Archiv an oder ersetzt es vollständig (Upsert per id).
 */
export function saveRepository(
  repositories: ReadonlyMap<RepoId, Repository>,
  next: Repository,
): Map<RepoId, Repository> {
  const out = new Map(repositories);
  out.set(next.id, next);
  return out;
}

/**
 * Kommando: entfernt ein Archiv (per id). No-Op bei unbekannter id.
 *
 * BEWUSST OHNE Kaskade auf Source.repo-Referenzen (gleiches Prinzip wie deleteSource):
 * verwaiste Verweise werden von findOrphanRefs (INV-P2) gemeldet, nicht hier aufgeräumt.
 */
export function deleteRepository(
  repositories: ReadonlyMap<RepoId, Repository>,
  id: RepoId,
): Map<RepoId, Repository> {
  const out = new Map(repositories);
  out.delete(id);
  return out;
}

// --- Medien (Spec 10 §4, Spec 20 §1.4 [S] "Medien-Verwaltung", BL-126) ---
//
// `Media` ist Top-Level (`db.media`), `MediaCitation` eine referenz-spezifische
// Verknüpfung an Person/Event/Citation/Source (ADR-v9-124/125). Wie Source/Citation ist
// die globale Entität ein FLACHES Modell ohne Beziehungsgraph — `saveMedia` ist deshalb
// exakt das `saveSource`-Muster (reines Whole-Object-Upsert auf der Map).
//
// `deleteMedia` ist ANDERS als `deleteSource`/`deletePerson` oben BEWUSST MIT Kaskade
// (Auftragsvorgabe: "Auflösen aller MediaCitation-Verweise an Ownern — 0 Waisen, analog
// delete-cascade-Geist", vgl. `deleteSourceCascade` in delete-cascade.ts): eine tote
// MediaCitation (Verweis auf eine gelöschte Media-id) macht JEDE Referenzzeile sofort
// sichtbar kaputt (kein Titel/keine Datei mehr auflösbar, `buildMediaDetail`/
// `buildMediaTiles` können das Ziel nicht mehr finden) — anders als eine tote
// `citation.sourceId`, die INV-P2 nur als Waisen-BEFUND meldet, ohne dass jede Ansicht
// sofort einen kaputten Verweis zeigt. Lebt hier statt in delete-cascade.ts, weil dieser
// Bauabschnitt (BL-126) nur `core/model/commands.ts` anfasst.

/** Kommando: legt ein Medium an oder ersetzt es vollständig (Upsert per id). `Media` ist
 *  ein flaches Modell ohne Beziehungsgraph (analog Source) — reines Whole-Object-Upsert. */
export function saveMedia(media: ReadonlyMap<MediaId, Media>, next: Media): Map<MediaId, Media> {
  const out = new Map(media);
  out.set(next.id, next);
  return out;
}

/** Die Sonder-Ereignisslots von Person bzw. Familie (neben dem freien `events[]`-Array) —
 *  dieselbe kleine, bewusste Duplikation wie zwischen draft.ts und delete-cascade.ts
 *  (kein geteiltes Modul dafür, um innerhalb der Datei-Grenze dieses Bauabschnitts zu
 *  bleiben). */
const PERSON_EVENT_FIELDS = ['birth', 'chr', 'death', 'buri'] as const;
const FAMILY_EVENT_FIELDS = ['marriage', 'engagement'] as const;

function hasMediaRef(cits: readonly Pick<MediaCitation, 'mediaId'>[], id: MediaId): boolean {
  return cits.some((m) => m.mediaId === id);
}

function stripMediaRefs(cits: readonly MediaCitation[], id: MediaId): MediaCitation[] {
  return cits.filter((m) => m.mediaId !== id);
}

function citationTouchesMedia(cits: readonly { media: readonly Pick<MediaCitation, 'mediaId'>[] }[], id: MediaId): boolean {
  return cits.some((c) => hasMediaRef(c.media, id));
}

function stripCitationMedia(cits: readonly Citation[], id: MediaId): Citation[] {
  return cits.map((c) => (hasMediaRef(c.media, id) ? { ...c, media: stripMediaRefs(c.media, id) } : c));
}

function personTouchesMedia(p: Person, id: MediaId): boolean {
  return (
    hasMediaRef(p.media, id) ||
    PERSON_EVENT_FIELDS.some((f) => hasMediaRef(p[f].media, id) || citationTouchesMedia(p[f].citations, id)) ||
    p.events.some((e) => hasMediaRef(e.media, id) || citationTouchesMedia(e.citations, id)) ||
    citationTouchesMedia(p.topLevelCitations, id) ||
    citationTouchesMedia(p.nameCitations, id) ||
    p.extraNames.some((n) => citationTouchesMedia(n.citations, id)) ||
    p.childOf.some((l) => citationTouchesMedia(l.citations, id)) ||
    p.associations.some((a) => citationTouchesMedia(a.citations, id))
  );
}

/** Entfernt JEDEN Verweis auf `id` aus einer bereits aufgetauten, mutierbaren Person —
 *  Top-Level `.media`, alle Event-Slots (`.media` + verschachtelte Zitate) UND jede
 *  Zitat-Fundstelle der Person selbst (Name/Kindschaft/Assoziation). Mutiert `p` direkt
 *  (sicher: `p` ist bereits eine `structuredClone`-Kopie aus `editDatabase`s Draft, exakt
 *  wie `delete-cascade.ts`s Kommandos ihre `d.person(id)!`-Ergebnisse mutieren). */
function stripPersonMedia(p: Person, id: MediaId): void {
  p.media = stripMediaRefs(p.media, id);
  for (const f of PERSON_EVENT_FIELDS) {
    p[f] = { ...p[f], media: stripMediaRefs(p[f].media, id), citations: stripCitationMedia(p[f].citations, id) };
  }
  p.events = p.events.map((e) =>
    hasMediaRef(e.media, id) || citationTouchesMedia(e.citations, id)
      ? { ...e, media: stripMediaRefs(e.media, id), citations: stripCitationMedia(e.citations, id) }
      : e,
  );
  p.topLevelCitations = stripCitationMedia(p.topLevelCitations, id);
  p.nameCitations = stripCitationMedia(p.nameCitations, id);
  p.extraNames = p.extraNames.map((n) => ({ ...n, citations: stripCitationMedia(n.citations, id) }));
  p.childOf = p.childOf.map((l) => ({ ...l, citations: stripCitationMedia(l.citations, id) }));
  p.associations = p.associations.map((a) => ({ ...a, citations: stripCitationMedia(a.citations, id) }));
}

function familyTouchesMedia(f: Family, id: MediaId): boolean {
  return (
    citationTouchesMedia(f.citations, id) ||
    FAMILY_EVENT_FIELDS.some((k) => hasMediaRef(f[k].media, id) || citationTouchesMedia(f[k].citations, id)) ||
    f.events.some((e) => hasMediaRef(e.media, id) || citationTouchesMedia(e.citations, id))
  );
}

/** Entfernt JEDEN Verweis auf `id` aus einer bereits aufgetauten, mutierbaren Familie —
 *  Familie hat KEIN eigenes `.media` (Spec 10 §4: "Familien-Medien hängen an den
 *  Familien-Ereignissen") — nur Ereignis-Slots + Zitate sind zu bereinigen. */
function stripFamilyMedia(fam: Family, id: MediaId): void {
  fam.citations = stripCitationMedia(fam.citations, id);
  for (const k of FAMILY_EVENT_FIELDS) {
    fam[k] = {
      ...fam[k],
      media: stripMediaRefs(fam[k].media, id),
      citations: stripCitationMedia(fam[k].citations, id),
    };
  }
  fam.events = fam.events.map((e) =>
    hasMediaRef(e.media, id) || citationTouchesMedia(e.citations, id)
      ? { ...e, media: stripMediaRefs(e.media, id), citations: stripCitationMedia(e.citations, id) }
      : e,
  );
}

/**
 * Kommando: entfernt ein Medium UND löst JEDEN `MediaCitation`-Verweis darauf auf — an
 * Person (Top-Level/Events/Zitate), Familie (Events/Zitate, kein eigenes `.media`) UND
 * Source (Top-Level). 0 Waisen danach (s. Modul-Kommentar oben — bewusst MIT Kaskade,
 * anders als das nackte `deleteSource`). No-Op bei unbekannter id.
 */
export function deleteMedia(db: ReadonlyDatabase, id: MediaId): Database {
  const stripped = editDatabase(db, (d) => {
    for (const pid of d.personIds()) {
      // Cast wie `mapAllEvents` in draft.ts — Lese-Zugriff auf den eingefrorenen Stand,
      // der Draft selbst hält die Readonly-Zusicherung für Schreibzugriffe.
      const p = d.peekPerson(pid)! as unknown as Person;
      if (!personTouchesMedia(p, id)) continue;
      stripPersonMedia(d.person(pid)!, id);
    }
    for (const fid of d.familyIds()) {
      const f = d.peekFamily(fid)! as unknown as Family;
      if (!familyTouchesMedia(f, id)) continue;
      stripFamilyMedia(d.family(fid)!, id);
    }
    for (const s of (db as unknown as Database).sources.values()) {
      if (hasMediaRef(s.media, id)) {
        d.setSource({ ...s, media: stripMediaRefs(s.media, id) });
      }
    }
  });

  const media = new Map(stripped.media);
  media.delete(id);
  return { ...stripped, media };
}

// --- MediaCitation an einem Owner verknüpfen/lösen/editieren (Spec 20 §1.4 [S]
// "Referenzliste + Verknüpfen") ---
//
// Person/Event/Citation/Source teilen dieselbe Form (`{ media: MediaCitation[] }`) — EIN
// generisches Funktionstrio statt vier eigener, fast identischer Owner-Varianten
// (INV-UI-4-Geist, analog `withAddedPname`/`withRemovedPname` in core/places/commands.ts).
// Familie hat kein eigenes `.media` (s. o.) — ihr "Owner" ist eines ihrer Events
// (die UI-Schale nutzt `family.marriage`), der Aufrufer wendet diese Funktionen darauf an
// und baut die Familie mit dem aktualisierten Event-Feld neu zusammen (`saveFamily(model)`).
//
// Reine Funktionen — der Aufrufer (UI-Modell/Komponente) übernimmt das Ergebnis in ein
// vollständiges Person-/Family-/Source-Objekt und ruft den passenden Save-Chokepoint
// (`appState.savePerson`/`saveFamily`/`saveSource`) auf. Keine eigenen Database-weiten
// Kommandos nötig, weil Person/Source bereits direkt speicherbar sind und Family-Events
// über `saveFamily(model)` laufen (Spec 02 §3: Kommando-Chokepoint, kein Feld-Setter).

/** Hängt eine neue Medienverknüpfung an (Duplikat-Prüfung obliegt dem Aufrufer, analog
 *  `withAddedPname`). */
export function withAddedMediaCitation<T extends { media: MediaCitation[] }>(entity: T, mc: MediaCitation): T {
  return { ...entity, media: [...entity.media, mc] };
}

/** Entfernt die Medienverknüpfung zu `mediaId` (No-Op, falls keine vorhanden). */
export function withRemovedMediaCitation<T extends { media: MediaCitation[] }>(entity: T, mediaId: MediaId): T {
  return { ...entity, media: stripMediaRefs(entity.media, mediaId) };
}

/** Bearbeitet die REFERENZ-SPEZIFISCHEN Felder (Titel-Override/Datum/Notiz/Primär-Flag,
 *  Spec 20 §1.4 [S] "referenz-spezifische Felder") einer bestehenden Medienverknüpfung.
 *  No-Op, falls `mediaId` an dieser Entität nicht verknüpft ist. */
export function withUpdatedMediaCitation<T extends { media: MediaCitation[] }>(
  entity: T,
  mediaId: MediaId,
  patch: Partial<Omit<MediaCitation, 'mediaId'>>,
): T {
  return {
    ...entity,
    media: entity.media.map((m) => (m.mediaId === mediaId ? { ...m, ...patch } : m)),
  };
}
