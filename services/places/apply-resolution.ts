// services/places/apply-resolution.ts — verdrahtet core/places.resolveEvents() in den
// Lade-/Import-Pfad (Spec 11 §4, Behebung des in ADR-v9-19 dokumentierten Befunds:
// resolveEvents() wurde bislang an KEINER Stelle der laufenden App aufgerufen).
//
// Sammelt ALLE Event-Fundstellen aus Person/Family (core/model/types.ts: birth/chr/
// death/buri/events[] bei Person; marriage/engagement/events[] bei Family), ruft
// resolveEvents() EINMAL über die vollständige, flache Liste auf und schreibt die
// aufgelösten Kopien an ihre ursprüngliche Stelle zurück — resolveEvents() ist rein
// (gibt Kopien zurück, mutiert die Eingabe nicht, s. core/places/resolve.ts Kommentarkopf).
//
// Bewusst KEINE eigene Auflösungslogik hier — nur Sammeln + Zurückschreiben. Das ist
// dieselbe Sammel-Strategie wie ui/views/hof/hof-review-model.ts (`collectAllEvents`);
// beide Aufrufer müssen dieselbe Datenlage sehen (Spec-Vorgabe dieser Aufgabe) — hier
// bewusst dieselbe Reihenfolge/Auswahl repliziert (Person: birth/chr/death/buri/events[],
// Family: engagement/marriage/events[]), damit ein resolveEvents()-Aufruf beim Import und
// ein späterer on-the-fly-Aufruf im Hof-Review dieselben Events in derselben Fasson sehen.
//
// core/places bleibt UNVERÄNDERT (INV-ARCH-1) — nur seine öffentliche API wird aufgerufen.

import type { Database, Event } from '../../core/model/types';
import {
  resolveEvents,
  seedPlacesFromEvents,
  makePlaceRegistry,
  makeHofRegistry,
  type ResolveResult,
} from '../../core/places';

/** Ein Rückschreib-Ziel: Funktion, die die aufgelöste Event-Kopie an ihrer Stelle einsetzt. */
type EventSlot = (resolved: Event) => void;

/**
 * Sammelt alle Events der Datenbank in Aufrufreihenfolge + eine parallele Liste von
 * Rückschreib-Funktionen (gleicher Index). Reine Sammel-Funktion, keine Auflösung.
 */
function collectEventSlots(db: Database): { events: Event[]; slots: EventSlot[] } {
  const events: Event[] = [];
  const slots: EventSlot[] = [];
  const push = (ev: Event, slot: EventSlot) => {
    events.push(ev);
    slots.push(slot);
  };

  for (const p of db.individuals.values()) {
    push(p.birth, (r) => (p.birth = r));
    push(p.chr, (r) => (p.chr = r));
    push(p.death, (r) => (p.death = r));
    push(p.buri, (r) => (p.buri = r));
    p.events.forEach((ev, i) => push(ev, (r) => (p.events[i] = r)));
  }
  for (const f of db.families.values()) {
    push(f.engagement, (r) => (f.engagement = r));
    push(f.marriage, (r) => (f.marriage = r));
    f.events.forEach((ev, i) => push(ev, (r) => (f.events[i] = r)));
  }

  return { events, slots };
}

export interface ApplyResolutionResult {
  /** Review-Klassen A/C/D/P (Spec 11 §6) — Index bezieht sich auf die interne Slot-Reihenfolge. */
  review: ResolveResult['review'];
  /** true, wenn Hof-Bootstrap (Pfade C/B') neue Höfe erzeugt hat — orte.json muss neu gespeichert werden. */
  hofObjectsGrew: boolean;
  /** true, wenn der Village-Seed (Spec 11 §4.2 Schritt 0) neue PlaceObjects erzeugt hat. */
  placeObjectsGrew: boolean;
}

/**
 * Löst ALLE Events der Datenbank auf (Schritte 1–4 aus der Aufgabenstellung) und
 * schreibt die Ergebnisse IN-PLACE an ihre ursprüngliche Stelle zurück (Person/Family-
 * Objekte werden mutiert — das ist hier explizit gewollt, weil `db` frisch aus
 * parseGedcom() kommt und noch nicht an die reaktive Schale übergeben wurde; die Schale
 * bekommt anschließend eine fertig aufgelöste Datenbank über den EINEN Ladepfad,
 * `AppState.loadDatabase()` — kein zweiter Invalidierungspfad).
 *
 * `db.placeObjects` wächst um die vom Village-Seed (Schritt 0, ADR-v9-28/-29) erzeugten
 * PlaceObjects; `db.hofObjects` wird auf das ggf. durch Hof-Bootstrap gewachsene Ergebnis
 * gesetzt.
 */
export function applyPlaceResolution(db: Database): ApplyResolutionResult {
  const { events, slots } = collectEventSlots(db);

  // Schritt 0 (Spec 11 §4.2, ADR-v9-28/-29): Village-Seed VOR der Auflösung — erzeugt die
  // fehlenden PlaceObjects, damit der (unveränderte) Verwaltungs-Match sie danach vorfindet.
  const seedCtx = { places: makePlaceRegistry(db.placeObjects), hofs: makeHofRegistry(db.hofObjects) };
  const seeded = seedPlacesFromEvents(events, seedCtx);
  const placeObjectsGrew = seeded.length > 0;
  if (placeObjectsGrew) {
    const nextPlaces = new Map(db.placeObjects);
    for (const po of seeded) nextPlaces.set(po.id, po);
    db.placeObjects = nextPlaces;
  }

  const result = resolveEvents(events, db.placeObjects, db.hofObjects);

  result.events.forEach((resolved, i) => slots[i](resolved.event));

  const hofObjectsGrew = result.hofObjects.size !== db.hofObjects.size;
  db.hofObjects = result.hofObjects;

  return { review: result.review, hofObjectsGrew, placeObjectsGrew };
}
