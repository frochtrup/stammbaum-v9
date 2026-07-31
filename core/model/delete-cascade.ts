// core/model/delete-cascade.ts — referenz-auflösendes Löschen der vier Modell-Entitäten
// (Person/Familie/Quelle/Archiv). ADR-v9-… / BL-….
//
// ABGRENZUNG ZU commands.ts: die dortigen `deletePerson`/`deleteFamily`/`deleteSource`/
// `deleteRepository` sind die NACKTEN Primitive — sie entfernen nur das Objekt und lassen
// verwaiste Referenzen bewusst stehen (von `findOrphanRefs`/INV-P2 gemeldet). Sie bleiben
// unverändert, weil `mergePersons` u. a. sich auf diese Semantik verlassen. Die Kommandos
// HIER sind der Gegenpart für den UI-Lösch-Weg: sie hängen jede Referenz sauber aus, sodass
// INV-P2 (0 Waisen) UND INV-P3 (INDI↔FAM-Konsistenz) nach dem Löschen erhalten bleiben.
//
// Gleiches Muster wie `saveFamily` (commands.ts): Copy-on-Write über `editDatabase` (Undo-
// sicher, ADR-v9-92) + die synchron haltenden Kommandos aus integrity.ts. Analog zu
// „Ort/Hof löschen" (deletePlaceCascade/deleteHofCascade) wird KEIN verwandtes Sach-Objekt
// kaskadierend mitgelöscht — mit EINER bewussten Ausnahme: eine Familie, die durch das
// Aushängen einer Person VÖLLIG leer wird (0 Eltern UND 0 Kinder), wird mitentfernt (sie hat
// keine eigene Bedeutung mehr).
import type { Database, PersonId, FamilyId, SourceId, RepoId, Citation } from './types';
import { editDatabase, type ReadonlyDatabase } from './draft';
import { removeChildFromFamily, removeParentFromFamily } from './integrity';

const PERSON_EVENT_FIELDS = ['birth', 'chr', 'death', 'buri'] as const;
const FAMILY_EVENT_FIELDS = ['marriage', 'engagement'] as const;

/**
 * Kommando: entfernt eine Person und hängt sie aus ALLEN Referenzen aus (Family.husband/
 * wife/children über die integrity-Kommandos, Association.personRef und Person.aliases
 * anderer Personen). Eine dadurch völlig leer werdende Familie wird mitgelöscht. No-Op bei
 * unbekannter id.
 */
export function deletePersonCascade(db: ReadonlyDatabase, id: PersonId): Database {
  return editDatabase(db, (d) => {
    const affected = new Set<FamilyId>();

    // 1. Aus Familien aushängen — beide Seiten hält integrity.ts synchron (INV-P3).
    for (const famId of d.familyIds()) {
      const fam = d.peekFamily(famId)!;
      if (fam.husband === id) {
        removeParentFromFamily(d, famId, 'husband');
        affected.add(famId);
      }
      if (fam.wife === id) {
        removeParentFromFamily(d, famId, 'wife');
        affected.add(famId);
      }
      if (fam.children.includes(id)) {
        removeChildFromFamily(d, famId, id);
        affected.add(famId);
      }
    }

    // 2. Assoziationen/Aliasse anderer Personen bereinigen (eine Assoziation ohne Ziel ist
    //    bedeutungslos — ganze Zeile entfernen, nicht nur personRef nullen).
    //    Hypothesen-`refs` (ADR-v9-174) sind derselbe Fall EINE Ebene feiner: gestrichen
    //    wird nur der tote Zeiger, nicht die Hypothese — ihr Text bleibt als Befund
    //    stehen. Ein Identitäts-Befund ohne Bezug ist danach kein Ausschluss mehr
    //    (INV-H3), was genau richtig ist: die Aussage „diese beiden sind dieselben"
    //    verliert ihren Sinn, wenn eine der beiden Seiten fort ist.
    for (const pid of d.personIds()) {
      if (pid === id) continue;
      const p = d.peekPerson(pid)!;
      const touched =
        p.associations.some((a) => a.personRef === id) ||
        p.aliases.includes(id) ||
        p.hypotheses.some((h) => h.refs.includes(id));
      if (!touched) continue;
      const person = d.person(pid)!;
      person.associations = person.associations.filter((a) => a.personRef !== id);
      person.aliases = person.aliases.filter((a) => a !== id);
      person.hypotheses = person.hypotheses.map((h) =>
        h.refs.includes(id) ? { ...h, refs: h.refs.filter((r) => r !== id) } : h,
      );
    }

    // 3. Person entfernen.
    d.removePerson(id);

    // 4. Leere Familien mitentfernen (0 Eltern UND 0 Kinder) — nur die eben berührten prüfen.
    for (const famId of affected) {
      const fam = d.family(famId);
      if (fam && fam.husband === null && fam.wife === null && fam.children.length === 0) {
        d.removeFamily(famId);
      }
    }
  });
}

/**
 * Kommando: entfernt eine Familie und löst die Person-Seite (parentIn/childOf) aller
 * beteiligten Personen (die Personen selbst bleiben bestehen — kein Kaskaden-Löschen).
 * No-Op bei unbekannter id.
 */
export function deleteFamilyCascade(db: ReadonlyDatabase, id: FamilyId): Database {
  return editDatabase(db, (d) => {
    const fam = d.peekFamily(id);
    if (!fam) return;
    if (fam.husband !== null) removeParentFromFamily(d, id, 'husband');
    if (fam.wife !== null) removeParentFromFamily(d, id, 'wife');
    for (const cid of [...fam.children]) removeChildFromFamily(d, id, cid);
    // Tote Hypothesen-Zeiger auf DIESE Familie streichen (ADR-v9-174) — dieselbe Regel
    // wie in deletePersonCascade Schritt 2; `refs` ist der erste Zeiger im Modell, der
    // auf eine Familie zeigen kann, deshalb gab es hier bisher nichts zu bereinigen.
    for (const pid of d.personIds()) {
      if (!d.peekPerson(pid)!.hypotheses.some((h) => h.refs.includes(id))) continue;
      const person = d.person(pid)!;
      person.hypotheses = person.hypotheses.map((h) =>
        h.refs.includes(id) ? { ...h, refs: h.refs.filter((r) => r !== id) } : h,
      );
    }
    for (const fid of d.familyIds()) {
      if (fid === id) continue;
      if (!d.peekFamily(fid)!.hypotheses.some((h) => h.refs.includes(id))) continue;
      const other = d.family(fid)!;
      other.hypotheses = other.hypotheses.map((h) =>
        h.refs.includes(id) ? { ...h, refs: h.refs.filter((r) => r !== id) } : h,
      );
    }
    d.removeFamily(id);
  });
}

/**
 * Kommando: entfernt eine Quelle und alle Zitate, die auf sie zeigen — an JEDER Träger-
 * Stelle (Person: topLevelCitations/nameCitations/extraNames/childOf/associations/Events;
 * Familie: citations/Events). INV-P2 prüft selbst nur drei dieser Stellen — die übrigen
 * werden trotzdem bereinigt, damit keine stille Fremdreferenz zurückbleibt. No-Op bei
 * unbekannter id.
 */
export function deleteSourceCascade(db: ReadonlyDatabase, id: SourceId): Database {
  // `hit` liest nur `sourceId` — nimmt daher sowohl die eingefrorenen `peek*`-Zitate als
  // auch die aufgetauten. `strip` läuft ausschließlich auf den aufgetauten (mutablen) Arrays.
  const hit = (c: { sourceId: SourceId }): boolean => c.sourceId === id;
  const strip = (cits: Citation[]): Citation[] => cits.filter((c) => c.sourceId !== id);

  return editDatabase(db, (d) => {
    for (const pid of d.personIds()) {
      const p = d.peekPerson(pid)!;
      const touched =
        p.topLevelCitations.some(hit) ||
        p.nameCitations.some(hit) ||
        p.extraNames.some((n) => n.citations.some(hit)) ||
        p.childOf.some((l) => l.citations.some(hit)) ||
        p.associations.some((a) => a.citations.some(hit)) ||
        PERSON_EVENT_FIELDS.some((f) => p[f].citations.some(hit)) ||
        p.events.some((e) => e.citations.some(hit));
      if (!touched) continue;
      const person = d.person(pid)!;
      person.topLevelCitations = strip(person.topLevelCitations);
      person.nameCitations = strip(person.nameCitations);
      for (const n of person.extraNames) n.citations = strip(n.citations);
      for (const l of person.childOf) l.citations = strip(l.citations);
      for (const a of person.associations) a.citations = strip(a.citations);
      for (const f of PERSON_EVENT_FIELDS) person[f].citations = strip(person[f].citations);
      for (const e of person.events) e.citations = strip(e.citations);
    }

    for (const famId of d.familyIds()) {
      const f = d.peekFamily(famId)!;
      const touched =
        f.citations.some(hit) ||
        FAMILY_EVENT_FIELDS.some((k) => f[k].citations.some(hit)) ||
        f.events.some((e) => e.citations.some(hit));
      if (!touched) continue;
      const fam = d.family(famId)!;
      fam.citations = strip(fam.citations);
      for (const k of FAMILY_EVENT_FIELDS) fam[k].citations = strip(fam[k].citations);
      for (const e of fam.events) e.citations = strip(e.citations);
    }

    d.removeSource(id);
  });
}

/**
 * Kommando: entfernt ein Archiv und löst den `repo`-Verweis jeder darauf zeigenden Quelle
 * (loser Verweis, kein Graph — auf leer setzen). No-Op bei unbekannter id.
 */
export function deleteRepositoryCascade(db: ReadonlyDatabase, id: RepoId): Database {
  const base = db as unknown as Database;
  return editDatabase(db, (d) => {
    for (const s of base.sources.values()) {
      if (s.repo === id) d.setSource({ ...s, repo: '' });
    }
    d.removeRepository(id);
  });
}
