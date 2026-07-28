// core/validate/context.ts — die DB-weiten Vorberechnungen, die VOR den Regelschleifen
// genau einmal laufen (Spec 20 §3, „Vernetzung ist eine Graph-Traversierung").
import type { Database, HofId, PersonId, SourceId } from '../model/types';
import type { RuleContext, ValidationConfig } from './types';
import { smallestPersonId } from '../model/queries';
import { eventHofId, makePlaceRegistry, makeHofRegistry, HOF_EVENT_TYPES, type PlaceContext } from '../places';

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

/**
 * Höfe mit Wohn-Semantik: mindestens ein hof-bindendes (= wohn-/besitz-semantisches)
 * Ereignis zeigt darauf. HOF_NO_COORD/HOF_FAR prüfen nur diese.
 *
 * Die Typmenge ist `HOF_EVENT_TYPES` (RESI/PROP/CENS) — dieselbe, über die ein Hof
 * überhaupt bindet. Seit OCCU dort entfernt wurde (Arbeitsstätte ≠ Hof, ADR-v9-143)
 * fallen „Hof-bindend" und „wohn-relevant" zusammen; eine zweite, driftende Typliste
 * entfällt. CENS (Volkszählung) ist bewusst dabei — sie erfasst den Wohnort.
 *
 * Die Zuordnung läuft über den `eventHofId`-Chokepoint (§11), NICHT über rohes `ev.hofId`:
 * letzteres ist laufzeit-only und nach Reload/Import oft `null` — der Hof wird dann erst
 * per `findByAddr` aufgelöst. Rohes `ev.hofId` zu lesen ließ genau diese (referenzierten,
 * koordinatenlosen) Höfe ungemeldet (Nutzer-Fund 2026-07-28; `hasReference`/Hof-Detail
 * lasen längst korrekt über den Chokepoint).
 */
export function hofsWithResidence(db: Database, ctx: PlaceContext): Set<HofId> {
  const out = new Set<HofId>();
  for (const p of db.individuals.values()) {
    for (const ev of p.events) {
      if (!HOF_EVENT_TYPES.has(ev.type)) continue;
      const hofId = eventHofId(ev, ctx);
      if (hofId) out.add(hofId);
    }
  }
  return out;
}

/** Vollständigen Auswertungs-Kontext aufbauen. Rein — kein Zugriff auf Wall-Clock/DOM. */
export function buildContext(db: Database, config: ValidationConfig): RuleContext {
  const { rootId, reachable } = reachableFrom(db, config.probandId);
  // Orts-/Hof-Registries für den eventHofId-Chokepoint (identisch zu app-state).
  const placeCtx: PlaceContext = {
    places: makePlaceRegistry(db.placeObjects),
    hofs: makeHofRegistry(db.hofObjects),
  };
  return {
    db,
    thresholds: config.thresholds,
    reachable,
    rootId,
    knownSourceIds: new Set<SourceId>(db.sources.keys()),
    hofsWithResidence: hofsWithResidence(db, placeCtx),
  };
}
