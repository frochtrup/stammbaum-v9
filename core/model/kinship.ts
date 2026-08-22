// core/model/kinship.ts — die Verwandtschafts-Mengen relativ zum Probanden (BL-375,
// Spec 20 §1.11i). Framework-/DOM-frei (INV-ARCH-1), rein und deterministisch (TST-3).
//
// WARUM HIER UND NICHT IN `core/validate`: die Kernbaum-Erreichbarkeit (`reachableFrom`)
// wohnte dort, weil bis BL-375 nur die Validierung sie brauchte (`DISCONNECTED_FROM_ROOT`).
// Jetzt fragt auch die Forschungsfläche danach. Sie ein zweites Mal zu schreiben wäre ein
// zweiter Rechenweg für dieselbe Frage — also ist sie eine Ebene tiefer gezogen, dorthin,
// wo `getParentIds` und `smallestPersonId` schon stehen (derselbe Schluss und dieselbe
// Bewegung wie bei `getParentIds` selbst, BL-231). `core/validate/context.ts`
// re-exportiert sie, damit kein Aufrufer sich ändern muss.
//
// DREI MENGEN, DREI KANTEN-ARTEN — und der Unterschied ist der ganze Punkt:
//   `reachable`   Eltern- UND Ehe-Kanten, ungerichtet: „hängt überhaupt an meinem Baum".
//   `ancestors`   nur aufwärts: „meine Ahnenlinie".
//   `descendants` nur abwärts: „meine Nachkommen".
// Vor- und Nachfahren schließen den Probanden EIN. Er ist weder sein eigener Vorfahr noch
// sein Nachkomme, aber wer nach seiner Ahnenlinie filtert, will die Aufgaben an sich
// selbst nicht verlieren — und die Alternative wäre eine sechste Stufe für eine Person.
import type { Database, PersonId } from './types';
import { getParentIds, smallestPersonId } from './queries';

/**
 * Erreichbarkeitsmenge des Kernbaums: BFS vom Probanden über alle Eltern- und
 * Ehe-Kanten. Alles nicht Erreichte ist „verwaist" (DISCONNECTED_FROM_ROOT).
 *
 * Die Wurzel ist der konfigurierte Proband; ohne ihn die kleinste Personen-ID in
 * SORTIERTER Reihenfolge — nicht die erste der Map. Das ist bewusst: die Map-Reihenfolge
 * hängt an der Einlese-Reihenfolge der Datei, die Wurzel-Wahl würde sonst zwischen zwei
 * Importen derselben Daten springen und den Befund-Bestand mitverschieben.
 */
export function reachableFrom(
  db: Database,
  probandId: PersonId | null,
): { rootId: PersonId | null; reachable: Set<PersonId> } {
  const reachable = new Set<PersonId>();
  let rootId = probandId;
  if (!rootId || !db.individuals.has(rootId)) {
    // Dieselbe Proband-Default-Definition wie die UI (`resolveProband`), ADR-v9-135/139.
    rootId = smallestPersonId(db);
  }
  if (rootId === null) return { rootId: null, reachable };

  const queue: PersonId[] = [rootId];
  reachable.add(rootId);
  while (queue.length) {
    const pid = queue.shift()!;
    const p = db.individuals.get(pid);
    if (!p) continue;
    const famIds = [...p.childOf.map((c) => c.familyId), ...p.parentIn];
    for (const fid of famIds) {
      const f = db.families.get(fid);
      if (!f) continue;
      const members = [f.husband, f.wife, ...f.children].filter((x): x is PersonId => !!x);
      for (const mid of members) {
        if (!reachable.has(mid)) {
          reachable.add(mid);
          queue.push(mid);
        }
      }
    }
  }
  return { rootId, reachable };
}

/** Transitive Elternhülle ab `startId`, die Wurzel eingeschlossen. Eigenes `visited`-Set
 *  als Zyklus-Guard (ein Baum kann sich durch fehlerhafte Daten schließen). */
function ancestorsOf(db: Database, startId: PersonId): Set<PersonId> {
  const out = new Set<PersonId>([startId]);
  const queue: PersonId[] = [startId];
  while (queue.length) {
    const { father, mother } = getParentIds(db, queue.shift()!);
    for (const id of [father, mother]) {
      if (id && !out.has(id)) {
        out.add(id);
        queue.push(id);
      }
    }
  }
  return out;
}

/**
 * Transitive Kindhülle ab `startId`, die Wurzel eingeschlossen.
 *
 * Bewusst über ALLE Ehefamilien (`parentIn`), nicht nur die erste — anders als die
 * Aufwärtskante, die per `getParentIds` der ersten Herkunftsfamilie folgt (Orakel-Parität,
 * s. dort). Abwärts gibt es keinen entsprechenden Grund zur Beschränkung: Kinder aus einer
 * zweiten Ehe sind ohne Einschränkung Nachkommen.
 */
function descendantsOf(db: Database, startId: PersonId): Set<PersonId> {
  const out = new Set<PersonId>([startId]);
  const queue: PersonId[] = [startId];
  while (queue.length) {
    const p = db.individuals.get(queue.shift()!);
    if (!p) continue;
    for (const fid of p.parentIn) {
      for (const child of db.families.get(fid)?.children ?? []) {
        if (child && !out.has(child)) {
          out.add(child);
          queue.push(child);
        }
      }
    }
  }
  return out;
}

export interface KinshipSets {
  /** Die tatsächlich verwendete Wurzel (aufgelöster Proband), `null` bei leerem Bestand. */
  rootId: PersonId | null;
  reachable: Set<PersonId>;
  ancestors: Set<PersonId>;
  descendants: Set<PersonId>;
}

/** Die fünf Stufen der Relevanz-Achse (Spec 20 §1.11i). */
export type KinshipClass = 'all' | 'ancestors' | 'descendants' | 'core' | 'outside';

export const KINSHIP_CLASSES: { key: KinshipClass; label: string }[] = [
  { key: 'all', label: 'Alle' },
  { key: 'ancestors', label: 'Vorfahren' },
  { key: 'descendants', label: 'Nachkommen' },
  { key: 'core', label: 'Kernbaum' },
  { key: 'outside', label: 'Außerhalb' },
];

/** Alle drei Mengen in EINEM Durchgang — die Aufrufer sollen nicht dreimal traversieren. */
export function computeKinship(db: Database, probandId: PersonId | null): KinshipSets {
  const { rootId, reachable } = reachableFrom(db, probandId);
  if (rootId === null) {
    return { rootId: null, reachable, ancestors: new Set(), descendants: new Set() };
  }
  return {
    rootId,
    reachable,
    ancestors: ancestorsOf(db, rootId),
    descendants: descendantsOf(db, rootId),
  };
}

/**
 * Die Personenmenge einer Stufe — `null` für „Alle" (= keine Einschränkung, NICHT die
 * leere Menge; der Unterschied entscheidet, ob ein Aufrufer überhaupt filtert).
 *
 * `outside` ist das Komplement des Kernbaums und wird deshalb aus dem Bestand gebildet:
 * es ist die einzige Stufe, die nicht durch Traversierung entsteht.
 */
export function kinshipMembers(
  db: Database,
  sets: KinshipSets,
  cls: KinshipClass,
): ReadonlySet<PersonId> | null {
  if (cls === 'all') return null;
  if (cls === 'ancestors') return sets.ancestors;
  if (cls === 'descendants') return sets.descendants;
  if (cls === 'core') return sets.reachable;
  const out = new Set<PersonId>();
  for (const id of db.individuals.keys()) {
    if (!sets.reachable.has(id)) out.add(id);
  }
  return out;
}
