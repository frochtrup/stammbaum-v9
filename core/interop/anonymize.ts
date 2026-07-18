// core/interop/anonymize.ts — Anonymisierter Export (Spec 13 §7, DSGVO).
//
// Klassifikation lebender Personen in drei Phasen:
//   (1) datumbasiert: kein Sterbedatum + Geburtsjahr ≥ (Bezugsjahr − 100) → lebend
//       Die Grenze schließt ein (ADR-v9-95): wer exakt 100 Jahre vor dem Bezugsjahr
//       geboren ist, gilt als lebend. Bei einer Datenschutz-Grenze ist der Fehler in
//       Richtung „zu viel geschwärzt" folgenlos, der in die andere Richtung nicht.
//   (2) BFS-Propagation über Verwandte (Ehepartner, Eltern↔Kinder)
//   (3) konservativ: Personen ganz ohne Datum → lebend
//
// Anonyme Records behalten nur NAME "Lebende Person" + SEX + Familienlinks
// (FAMC/FAMS). Reine Funktion (kein Wall-Clock — Bezugsjahr injiziert, TST-3).

import type { Database } from '../model/types';
import type { GedNode } from './gedcom-tree';

/** Extrahiert die erste vierstellige Jahreszahl aus einem GEDCOM-Datum. */
function yearOf(date: string | null): number | null {
  if (!date) return null;
  const m = /\b(\d{4})\b/.exec(date);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Bestimmt die Menge der als lebend klassifizierten Personen-IDs.
 * `referenceYear` wird injiziert (kein Wall-Clock im Kern).
 */
export function buildLivingSet(db: Database, referenceYear: number): Set<string> {
  const living = new Set<string>();
  const noDate = new Set<string>();

  // Phase 1 + 3: datumbasiert + konservativ.
  for (const p of db.individuals.values()) {
    const deathY = yearOf(p.death.date);
    const birthY = yearOf(p.birth.date) ?? yearOf(p.chr.date);
    const hasAnyDate = deathY != null || birthY != null;
    if (!hasAnyDate) {
      noDate.add(p.id);
      continue;
    }
    if (deathY == null && birthY != null && birthY >= referenceYear - 100) {
      living.add(p.id);
    }
  }
  // Phase 3: Personen ohne jedes Datum → konservativ lebend.
  for (const id of noDate) living.add(id);

  // Phase 2: BFS-Propagation über Familienbande.
  const queue = [...living];
  while (queue.length) {
    const id = queue.shift()!;
    const person = db.individuals.get(id);
    if (!person) continue;
    const neighbors: string[] = [];
    // Ehepartner + Kinder in Familien, in denen die Person Elternteil ist.
    for (const famId of person.parentIn) {
      const fam = db.families.get(famId);
      if (!fam) continue;
      if (fam.husband) neighbors.push(fam.husband);
      if (fam.wife) neighbors.push(fam.wife);
      neighbors.push(...fam.children);
    }
    // Eltern in Familien, in denen die Person Kind ist.
    for (const link of person.childOf) {
      const fam = db.families.get(link.familyId);
      if (!fam) continue;
      if (fam.husband) neighbors.push(fam.husband);
      if (fam.wife) neighbors.push(fam.wife);
    }
    for (const n of neighbors) {
      if (!living.has(n)) {
        living.add(n);
        queue.push(n);
      }
    }
  }
  return living;
}

const KEEP_TAGS = new Set(['SEX', 'FAMC', 'FAMS']);

/**
 * Anonymisiert einen INDI-Record-Baum: NAME → "Lebende Person", nur SEX/FAMC/FAMS
 * behalten (Sub-Bäume von FAMC/FAMS auf die reine Referenz reduziert).
 */
export function anonymizeIndi(rec: GedNode): GedNode {
  const kept: GedNode[] = [
    { level: 1, xref: null, tag: 'NAME', value: 'Lebende Person', children: [] },
  ];
  for (const c of rec.children) {
    if (c.tag === 'SEX') kept.push({ level: 1, xref: null, tag: 'SEX', value: c.value, children: [] });
    else if (c.tag === 'FAMC' || c.tag === 'FAMS')
      kept.push({ level: 1, xref: null, tag: c.tag, value: c.value, children: [] });
  }
  return { level: 0, xref: rec.xref, tag: 'INDI', value: '', children: kept };
}

export { KEEP_TAGS, yearOf };
