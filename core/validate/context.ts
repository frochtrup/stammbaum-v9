// core/validate/context.ts — die DB-weiten Vorberechnungen, die VOR den Regelschleifen
// genau einmal laufen (Spec 20 §3, „Vernetzung ist eine Graph-Traversierung").
import type { Database, Event, HofId, SourceId } from '../model/types';
import type { OrtOhneKette, RuleContext, ValidationConfig } from './types';
import { reachableFrom } from '../model/kinship';
import { ebenenBefund, eventHofId, makePlaceRegistry, makeHofRegistry, HOF_EVENT_TYPES, type PlaceContext } from '../places';
import type { PlaceId } from '../model/types';

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

/**
 * Was an EINEM Ort fehlt, gehört als Befund AN DIESEN ORT (Nutzer-Befund 2026-08-28).
 *
 * Trägt ein Ankerort keine `enclosedBy`-Einträge, kann die Projektion keine Kette bauen —
 * jedes Elternsegment der Quelle gilt dann als „unbekannte Ebene". Als Personen-Befund war
 * das dreifach falsch: es stand an der Person statt am Ort, es wiederholte sich je
 * Ereignis, und es behauptete einen Datenfehler, wo Kurationsarbeit fehlt (am Bestand des
 * Nutzers: `Vardel` mit drei Ereignissen und vier Ebenen, jede davon ein existierender Ort).
 *
 * Die Vorberechnung läuft EINMAL über alle Ereignisse — dieselbe Bauform wie
 * `hofsWithResidence` daneben. Ein `place`-Prädikat sieht nur seinen Ort und könnte die
 * Frage „welche Ereignisse zeigen hierher?" sonst nur mit einem zweiten Lauf über den
 * ganzen Bestand je Ort beantworten (O(Orte × Ereignisse)).
 */
export function orteOhneKette(db: Database, ctx: PlaceContext): Map<PlaceId, OrtOhneKette> {
  const out = new Map<PlaceId, OrtOhneKette>();
  const sammle = (ev: Event): void => {
    const b = ebenenBefund(ev, ctx);
    if (b.ursache !== 'ankerOhneKette' || b.ankerId == null) return;
    let eintrag = out.get(b.ankerId);
    if (!eintrag) {
      eintrag = { ereignisse: 0, ebenen: new Set<string>() };
      out.set(b.ankerId, eintrag);
    }
    eintrag.ereignisse += 1;
    for (const e of b.ebenen) eintrag.ebenen.add(e);
  };
  for (const p of db.individuals.values()) {
    for (const ev of [p.birth, p.chr, p.death, p.buri]) sammle(ev);
    for (const ev of p.events) sammle(ev);
  }
  for (const f of db.families.values()) {
    sammle(f.marriage);
    for (const ev of f.events) sammle(ev);
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
    orteOhneKette: orteOhneKette(db, placeCtx),
  };
}
