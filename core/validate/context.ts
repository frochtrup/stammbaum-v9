// core/validate/context.ts — die DB-weiten Vorberechnungen, die VOR den Regelschleifen
// genau einmal laufen (Spec 20 §3, „Vernetzung ist eine Graph-Traversierung").
import type { Database, HofId, SourceId } from '../model/types';
import type { RuleContext, ValidationConfig } from './types';
import { reachableFrom } from '../model/kinship';
import { eventHofId, makePlaceRegistry, makeHofRegistry, HOF_EVENT_TYPES, type PlaceContext } from '../places';

/**
 * Erreichbarkeitsmenge des Kernbaums — die Definition ist mit BL-375 in den
 * Modell-Kern gezogen (`core/model/kinship.ts`), weil seither auch die
 * Forschungsfläche danach fragt und zwei BFS über dieselben Kanten zwei Wahrheiten
 * wären. Hier steht nur noch der Re-Export: `buildContext` unten und die Aufrufer
 * über `core/validate/index.ts` bleiben unverändert.
 */
export { reachableFrom } from '../model/kinship';

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
    places: placeCtx,
    hofsWithResidence: hofsWithResidence(db, placeCtx),
  };
}
