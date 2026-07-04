// core/model/integrity.ts — INV-P2 (verwaiste Refs melden), INV-P3/P4 (INDI↔FAM-Konsistenz).
// Spec 10 §6, §3. Rein: keine Mutation in den find*/check*-Funktionen.
import type { Citation, Database, FamilyId, PersonId } from './types';

// --- INV-P2: verwaiste Referenzen ---

export interface OrphanRef {
  kind: 'missing-ref';
  ownerId: string; // ID des referenzierenden Objekts
  field: string; // wo die Referenz sitzt
  targetId: string; // die fehlende Ziel-ID
}

function citationOrphans(
  cits: Citation[],
  db: Database,
  ownerId: string,
  fieldPrefix: string,
  out: OrphanRef[],
): void {
  for (const c of cits) {
    if (!db.sources.has(c.sourceId)) {
      out.push({ kind: 'missing-ref', ownerId, field: `${fieldPrefix}.citation.sourceId`, targetId: c.sourceId });
    }
  }
}

/**
 * INV-P2: sammelt alle verwaisten ID-Referenzen. Nichts wird still ignoriert —
 * jede fehlende Referenz wird als OrphanRef gemeldet.
 */
export function findOrphanRefs(db: Database): OrphanRef[] {
  const out: OrphanRef[] = [];

  for (const fam of db.families.values()) {
    if (fam.husband !== null && !db.individuals.has(fam.husband)) {
      out.push({ kind: 'missing-ref', ownerId: fam.id, field: 'husband', targetId: fam.husband });
    }
    if (fam.wife !== null && !db.individuals.has(fam.wife)) {
      out.push({ kind: 'missing-ref', ownerId: fam.id, field: 'wife', targetId: fam.wife });
    }
    for (const c of fam.children) {
      if (!db.individuals.has(c)) {
        out.push({ kind: 'missing-ref', ownerId: fam.id, field: 'children', targetId: c });
      }
    }
    citationOrphans(fam.citations, db, fam.id, 'fam', out);
  }

  for (const p of db.individuals.values()) {
    for (const fid of p.parentIn) {
      if (!db.families.has(fid)) {
        out.push({ kind: 'missing-ref', ownerId: p.id, field: 'parentIn', targetId: fid });
      }
    }
    for (const link of p.childOf) {
      if (!db.families.has(link.familyId)) {
        out.push({ kind: 'missing-ref', ownerId: p.id, field: 'childOf.familyId', targetId: link.familyId });
      }
    }
    for (const a of p.associations) {
      if (a.personRef !== null && !db.individuals.has(a.personRef)) {
        out.push({ kind: 'missing-ref', ownerId: p.id, field: 'association.personRef', targetId: a.personRef });
      }
    }
    for (const al of p.aliases) {
      if (!db.individuals.has(al)) {
        out.push({ kind: 'missing-ref', ownerId: p.id, field: 'aliases', targetId: al });
      }
    }
    citationOrphans(p.topLevelCitations, db, p.id, 'indi', out);
    citationOrphans(p.nameCitations, db, p.id, 'indi.name', out);
  }

  for (const s of db.sources.values()) {
    if (typeof s.repo === 'string' && s.repo.startsWith('@R') && !db.repositories.has(s.repo)) {
      out.push({ kind: 'missing-ref', ownerId: s.id, field: 'repo', targetId: s.repo });
    }
  }

  return out;
}

// --- INV-P3/P4: INDI↔FAM-Konsistenz + synchron haltende Kommandos ---

export interface ConsistencyIssue {
  familyId: FamilyId;
  personId: PersonId;
  /** 'fam-only' = FAM-Seite gesetzt, INDI-Seite fehlt; 'indi-only' = umgekehrt. */
  side: 'fam-only' | 'indi-only';
  relation: 'child' | 'parent';
}

/**
 * INV-P3: prüft, ob die INDI-Seite (childOf/parentIn) und die FAM-Seite
 * (children/husband/wife) wechselseitig konsistent sind. Nur bei existierenden Objekten
 * (fehlende IDs deckt INV-P2 ab).
 */
export function checkIndiFamConsistency(db: Database): ConsistencyIssue[] {
  const out: ConsistencyIssue[] = [];

  for (const fam of db.families.values()) {
    // Kinder: FAM.children ↔ INDI.childOf
    for (const cid of fam.children) {
      const child = db.individuals.get(cid);
      if (child && !child.childOf.some((l) => l.familyId === fam.id)) {
        out.push({ familyId: fam.id, personId: cid, side: 'fam-only', relation: 'child' });
      }
    }
    // Eltern: FAM.husband/wife ↔ INDI.parentIn
    for (const pid of [fam.husband, fam.wife]) {
      if (pid === null) continue;
      const parent = db.individuals.get(pid);
      if (parent && !parent.parentIn.includes(fam.id)) {
        out.push({ familyId: fam.id, personId: pid, side: 'fam-only', relation: 'parent' });
      }
    }
  }

  for (const p of db.individuals.values()) {
    for (const link of p.childOf) {
      const fam = db.families.get(link.familyId);
      if (fam && !fam.children.includes(p.id)) {
        out.push({ familyId: link.familyId, personId: p.id, side: 'indi-only', relation: 'child' });
      }
    }
    for (const fid of p.parentIn) {
      const fam = db.families.get(fid);
      if (fam && fam.husband !== p.id && fam.wife !== p.id) {
        out.push({ familyId: fid, personId: p.id, side: 'indi-only', relation: 'parent' });
      }
    }
  }

  return out;
}

/**
 * Kommando (INV-P3): fügt ein Kind zu einer Familie hinzu und hält BEIDE Seiten synchron.
 * Idempotent. INV-P4: pedigree wird nur INDI-seitig (ChildLink) geführt.
 * pedigree=undefined lässt einen bestehenden Wert unangetastet.
 */
export function addChildToFamily(
  db: Database,
  familyId: FamilyId,
  personId: PersonId,
  pedigree?: 'birth' | 'adopted' | 'foster' | 'sealing' | '',
): void {
  const fam = db.families.get(familyId);
  const child = db.individuals.get(personId);
  if (!fam || !child) return;

  if (!fam.children.includes(personId)) fam.children.push(personId);

  let link = child.childOf.find((l) => l.familyId === familyId);
  if (!link) {
    link = {
      familyId,
      pedigree: pedigree ?? '',
      fatherRel: '',
      motherRel: '',
      fatherRelSeen: false,
      motherRelSeen: false,
      citations: [],
    };
    child.childOf.push(link);
  } else if (pedigree !== undefined) {
    link.pedigree = pedigree;
  }
}

/** Kommando (INV-P3): entfernt ein Kind — räumt BEIDE Seiten ab. */
export function removeChildFromFamily(db: Database, familyId: FamilyId, personId: PersonId): void {
  const fam = db.families.get(familyId);
  if (fam) fam.children = fam.children.filter((c) => c !== personId);
  const child = db.individuals.get(personId);
  if (child) child.childOf = child.childOf.filter((l) => l.familyId !== familyId);
}

/** Kommando (INV-P3): setzt einen Elternteil — hält FAM.husband/wife + INDI.parentIn synchron. */
export function addParentToFamily(
  db: Database,
  familyId: FamilyId,
  personId: PersonId,
  slot: 'husband' | 'wife',
): void {
  const fam = db.families.get(familyId);
  const parent = db.individuals.get(personId);
  if (!fam || !parent) return;

  const previous = fam[slot];
  fam[slot] = personId;
  // Alten Insassen des Slots aus parentIn lösen, falls er nirgends sonst Elternteil ist.
  if (previous !== null && previous !== personId) {
    const stillParent = fam.husband === previous || fam.wife === previous;
    if (!stillParent) {
      const old = db.individuals.get(previous);
      if (old) old.parentIn = old.parentIn.filter((f) => f !== familyId);
    }
  }
  if (!parent.parentIn.includes(familyId)) parent.parentIn.push(familyId);
}
