// core/interop/anonymize.ts — Anonymisierter Export (Spec 13 §7, DSGVO).
//
// Klassifikation lebender Personen in drei Phasen:
//   (1) datumbasiert: kein Sterbedatum + Geburtsjahr ≥ (Bezugsjahr − 100) → lebend
//       Die Grenze schließt ein (ADR-v9-95): wer exakt 100 Jahre vor dem Bezugsjahr
//       geboren ist, gilt als lebend. Bei einer Datenschutz-Grenze ist der Fehler in
//       Richtung „zu viel geschwärzt" folgenlos, der in die andere Richtung nicht.
//   (2) BFS-Propagation über Verwandte (Ehepartner, Eltern↔Kinder) — sie läuft
//       AUSSCHLIESSLICH über undatierte Verwandte: wer in Phase 1 als verstorben
//       eingestuft ist, wird nie durch Propagation lebend und leitet sie nicht weiter.
//       Ohne diese Bremse erreicht die Kante jede zusammenhängende Linie bis ins 17. Jh.
//       (gemessen: 2767 statt 689 von 2795 Personen, BL-138/ADR-v9-113).
//   (3) konservativ: Personen ganz ohne Datum → lebend
//
// Anonyme INDI-Records behalten nur NAME "Lebende Person" + SEX + Familienlinks
// (FAMC/FAMS); FAM-Records mit mindestens einem lebenden Partner behalten HUSB/WIFE/CHIL
// und verlieren ihre Ereignisdetails (MARR/DIV mit Datum/Ort/Quellen) — ein Hochzeitsdatum
// ist ein personenbezogenes Datum der Lebenden. Bewusste Abweichung vom v8-Orakel, das
// FAM-Records ungefiltert schrieb (s. tests/v8-abweichungen.md, DEV-06).
//
// Reine Funktionen (kein Wall-Clock — Bezugsjahr injiziert, TST-3). `anonymizeDoc` gibt
// ein NEUES Dokument zurück und lässt das übergebene unangetastet: liefe der geschwärzte
// Baum in den App-Zustand zurück, schriebe die stille Arbeitskopie die geschwärzte Fassung
// und aus einem Export würde Datenverlust am Original (Spec 13 §7 „Original unberührt").

import type { Database } from '../model/types';
import type { GedNode } from './gedcom-tree';
import type { ParsedGedcom } from './types';

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
  /** Phase-1-Verstorbene: die Bremse für Phase 2 — sie werden nie durch Propagation lebend. */
  const dead = new Set<string>();

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
    } else {
      dead.add(p.id);
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
      // `dead` ist die Bremse: ein datiert Verstorbener wird nicht lebend und gibt die
      // Kante nicht an seine eigenen Verwandten weiter (v8-Orakel `gedcom-writer.js:364`).
      if (!living.has(n) && !dead.has(n)) {
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

/**
 * Anonymisiert einen FAM-Record-Baum: nur HUSB/WIFE/CHIL behalten. Alles andere —
 * MARR/DIV samt DATE/PLAC/SOUR, NCHI, Notizen — fällt weg, weil es die Lebensumstände
 * der lebenden Partner beschreibt. Die reinen Links bleiben, sonst verlöre die Datei
 * ihre genealogische Struktur (Spec 13 §7).
 */
export function anonymizeFam(rec: GedNode): GedNode {
  const kept: GedNode[] = [];
  for (const c of rec.children) {
    if (c.tag === 'HUSB' || c.tag === 'WIFE' || c.tag === 'CHIL')
      kept.push({ level: 1, xref: null, tag: c.tag, value: c.value, children: [] });
  }
  return { level: 0, xref: rec.xref, tag: 'FAM', value: '', children: kept };
}

/**
 * Anonymisiert ein ganzes Dokument: alle INDI-Records lebender Personen und alle
 * FAM-Records mit mindestens einem lebenden Partner. Rein — das übergebene Dokument
 * wird nicht verändert, unbetroffene Records bleiben REFERENZGLEICH (der Writer schreibt
 * sie damit unverändert byte-treu, INV-PT). `db` wird durchgereicht, nicht kopiert: die
 * Schwärzung lebt allein im Baum, den der Serializer schreibt.
 */
export function anonymizeDoc(doc: ParsedGedcom, referenceYear: number): ParsedGedcom {
  const living = buildLivingSet(doc.db, referenceYear);

  // Eine Familie ist betroffen, sobald einer der PARTNER lebt — nicht schon wegen eines
  // lebenden Kindes: dessen eigener Record ist bereits geschwärzt, und das Hochzeitsdatum
  // der (verstorbenen) Eltern ist kein Datum über das Kind.
  const affectedFams = new Set<string>();
  for (const fam of doc.db.families.values()) {
    if ((fam.husband && living.has(fam.husband)) || (fam.wife && living.has(fam.wife)))
      affectedFams.add(fam.id);
  }

  const roots = doc.roots.map((rec) => {
    if (rec.xref == null) return rec;
    if (rec.tag === 'INDI' && living.has(rec.xref)) return anonymizeIndi(rec);
    if (rec.tag === 'FAM' && affectedFams.has(rec.xref)) return anonymizeFam(rec);
    return rec;
  });

  return { db: doc.db, roots };
}

export { KEEP_TAGS, yearOf };
