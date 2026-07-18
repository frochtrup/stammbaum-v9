// core/validate/context.ts — die DB-weiten Vorberechnungen, die VOR den Regelschleifen
// genau einmal laufen (Spec 20 §3, „Vernetzung ist eine Graph-Traversierung").
import type { Database, HofId, PersonId, SourceId } from '../model/types';
import type { RuleContext, ValidationConfig } from './types';

/**
 * Erreichbarkeitsmenge des Kernbaums: BFS vom Probanden über alle Eltern- und
 * Ehe-Kanten. Alles nicht Erreichte ist „verwaist" (DISCONNECTED_FROM_ROOT).
 *
 * Die Wurzel ist der konfigurierte Proband; ohne ihn die kleinste Personen-ID in
 * SORTIERTER Reihenfolge — nicht die erste der Map. Das ist bewusst: die Map-Reihenfolge
 * hängt an der Einlese-Reihenfolge der Datei, die Wurzel-Wahl würde sonst zwischen zwei
 * Importen derselben Daten springen und den Befund-Bestand mitverschieben.
 */
export function reachableFrom(db: Database, probandId: PersonId | null): {
  rootId: PersonId | null;
  reachable: Set<PersonId>;
} {
  const reachable = new Set<PersonId>();
  let rootId = probandId;
  if (!rootId || !db.individuals.has(rootId)) {
    const ids = [...db.individuals.keys()].sort();
    rootId = ids.length > 0 ? ids[0] : null;
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

/**
 * Höfe mit Wohn-Semantik: mindestens ein RESI- oder PROP-Ereignis zeigt darauf.
 *
 * HOF_NO_COORD/HOF_FAR prüfen nur diese (v8-Orakel `buildHofIndex`). Ein Hof, der
 * ausschließlich aus einem CENS-/OCCU-/EDUC-Ereignis entstanden ist, gehört nicht auf
 * die Karte — ein Koordinaten-Befund wäre dort nur Rauschen.
 */
export function hofsWithResidence(db: Database): Set<HofId> {
  const out = new Set<HofId>();
  for (const p of db.individuals.values()) {
    for (const ev of p.events) {
      if (ev.type !== 'RESI' && ev.type !== 'PROP') continue;
      if (ev.hofId) out.add(ev.hofId);
    }
  }
  return out;
}

/** Vollständigen Auswertungs-Kontext aufbauen. Rein — kein Zugriff auf Wall-Clock/DOM. */
export function buildContext(db: Database, config: ValidationConfig): RuleContext {
  const { rootId, reachable } = reachableFrom(db, config.probandId);
  return {
    db,
    thresholds: config.thresholds,
    reachable,
    rootId,
    knownSourceIds: new Set<SourceId>(db.sources.keys()),
    hofsWithResidence: hofsWithResidence(db),
  };
}
