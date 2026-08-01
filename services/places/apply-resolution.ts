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

import type { Database, Event, PlaceId, HofId } from '../../core/model/types';
import { mapAllEvents, type ReadonlyDatabase } from '../../core/model/draft';
import {
  resolveEvents,
  seedPlacesFromEvents,
  makePlaceRegistry,
  makeHofRegistry,
  isCuratedPlace,
  isCuratedHof,
  buildPlacForGedcom,
  eventYear,
  type ResolveResult,
  type PlaceContext,
} from '../../core/places';
import { deletePlaceObject, deleteHofObject } from '../../core/places/commands';

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

export interface ApplyResolutionOptions {
  /**
   * ADR-v9-74: setzt vor der Auflösung `placeId`/`hofId` auf Events zurück, deren
   * AKTUELLES Ziel (in `db.placeObjects`/`hofObjects`, wie zu Beginn dieses Aufrufs)
   * nicht kuratiert ist (`isCuratedPlace`/`isCuratedHof` = false, also weder geprüft
   * noch angereichert — ADR-v9-191). Der reguläre
   * „bereits gelinkt"-Kurzschluss in `resolveEvents` (Pfad REPROJECT, Spec 11 §4.1)
   * überspringt sonst jede Neu-Zuordnung für Events, die schon irgendeine — und sei es
   * nur eine automatisch geratene — `placeId` tragen: ein reiner Re-Resolve-Aufruf
   * (ohne frischen `parseGedcom()`) verbessert die Zuordnung dann NIE, selbst wenn
   * gerade reichhaltigere, kuratierte Orte importiert wurden. Kuratierte Ziele bleiben
   * unangetastet (schützt bewusste `linkEventToPlace`-Entscheidungen). Default `false`
   * (bestehendes Verhalten beim GEDCOM-Laden — dort sind alle Events ohnehin frisch aus
   * `parseGedcom()` und tragen noch keine `placeId`, dieser Schritt ist dort ein No-op).
   */
  resetUncuratedLinks?: boolean;
  /**
   * `false` überspringt den Village-Seed-Vorpass (Spec 11 §4.2 Schritt 0). Default `true`
   * — der reguläre Import lebt davon, dass fehlende Orte automatisch entstehen (ADR-v9-28).
   *
   * Gebraucht vom Standalone-Orte-Editor (Spec 22 §5, ADR-v9-163): dort ist eine
   * Genealogie-Datei nur KONTEXT, und `orte.json` ist das Dokument des Nutzers. Ein Seed
   * wäre dort ein stiller Schreibvorgang auf genau dieses Dokument — INV-ORTE-2 verbietet
   * ihn. Die Unterscheidung ist damit auch für das Hauptprogramm ausgesprochen:
   * „Ereignisse auflösen" und „fehlende Orte anlegen" sind zwei Schritte, die getrennt
   * bestellbar sein müssen.
   *
   * Der Hof-Bootstrap (Pfade C/B′) bleibt davon unberührt — er steckt in `resolveEvents`
   * selbst. Wer auch ihn ausschließen muss, lässt die Auflösung auf KOPIEN der Mengen
   * laufen und übernimmt nur die Verknüpfungen (so macht es der Editor).
   */
  seed?: boolean;
}

/**
 * Setzt `placeId`/`hofId` auf Events zurück, deren aktuelles Ziel (in `db`, VOR jeder
 * Mutation durch diesen Aufruf) nicht kuratiert ist — s. `ApplyResolutionOptions`.
 *
 * „Kuratiert" heißt seit ADR-v9-191 **geprüft ODER angereichert** (`isCuratedPlace`/
 * `isCuratedHof`, Spec 11 §9.1). Der Marker allein genügte nicht: weil ihn nur der
 * ausdrückliche Knopf setzt, verlöre ein von Hand gepflegter, aber nie geklickter Ort
 * sonst seine Zuordnungen.
 * Mutiert `db.individuals`/`db.families` in-place (gleiche Mutations-Disziplin wie
 * `applyPlaceResolution` selbst).
 */
function resetUncuratedLinks(db: Database): void {
  const shouldReset = (ev: Event): boolean => {
    if (ev.hofId != null) {
      const hof = db.hofObjects.get(ev.hofId);
      return !hof || !isCuratedHof(hof);
    }
    if (ev.placeId != null) {
      const place = db.placeObjects.get(ev.placeId);
      return !place || !isCuratedPlace(place);
    }
    return false;
  };
  const reset = (ev: Event): Event => (shouldReset(ev) ? { ...ev, placeId: null, hofId: null } : ev);

  for (const p of db.individuals.values()) {
    p.birth = reset(p.birth);
    p.chr = reset(p.chr);
    p.death = reset(p.death);
    p.buri = reset(p.buri);
    p.events = p.events.map(reset);
  }
  for (const f of db.families.values()) {
    f.engagement = reset(f.engagement);
    f.marriage = reset(f.marriage);
    f.events = f.events.map(reset);
  }
}

/**
 * Kommando (ADR-v9-78 Punkt 1): löscht ein PlaceObject UND räumt jede darauf zeigende
 * `event.placeId`-Referenz vorher auf (`null`) — sonst blieben hängende Fremdreferenzen
 * zurück (`deletePlaceObject` in core/places/commands.ts kennt `db` nicht und fasst nur
 * die Map an, s. dortiger Kommentar). Gleiche Slot-Iteration wie `resetUncuratedLinks`
 * (birth/chr/death/buri/events[] bei Person, engagement/marriage/events[] bei Family),
 * aber simplere Bedingung: „zeigt exakt auf `id`" statt einer Kurations-Heuristik. KEIN
 * Kaskaden-Löschen von Events/Personen/Familien — nur die Referenz wird `null`. Mutiert
 * `db.individuals`/`db.families` in-place (gleiche Mutations-Disziplin wie
 * `resetUncuratedLinks`/`applyPlaceResolution`).
 */
export function deletePlaceCascade(db: ReadonlyDatabase, id: PlaceId): Database {
  const next = mapAllEvents(db, (ev) => (ev.placeId === id ? { ...ev, placeId: null } : null));
  const places = new Map(next.placeObjects);
  deletePlaceObject(places, id);
  return { ...next, placeObjects: places };
}

/**
 * Kommando (ADR-v9-78 Punkt 1): löscht ein HofObject UND räumt jede darauf zeigende
 * `event.hofId`-Referenz vorher auf (`null`) — exakt analog `deletePlaceCascade`, aber
 * für den Hof-Pfad. KEIN Kaskaden-Löschen von Events/Personen/Familien — nur die
 * Referenz wird `null`.
 */
export function deleteHofCascade(db: ReadonlyDatabase, id: HofId): Database {
  const next = mapAllEvents(db, (ev) => (ev.hofId === id ? { ...ev, hofId: null } : null));
  const hofs = new Map(next.hofObjects);
  deleteHofObject(hofs, id);
  return { ...next, hofObjects: hofs };
}

/**
 * Kommando: zieht eine EXPLIZITE Hof-Adress-Umbenennung (Nutzeraktion, z. B. via
 * `withUpdatedHofAddr`) auf alle referenzierenden Events mit. Der „Name" eines Hofes IST
 * `addrs[i].value` (HofObject hat kein eigenes `title`-Feld) — der Sinn einer
 * Umbenennung ist, dass sie durchgängig sichtbar wird. ADR-v9-47 (schützt `ev.addr` als
 * eingefrorenes, byte-identisches „fill-if-empty"-Feld vor AUTOMATISCHEN/ungewollten
 * Änderungen, s. `linkEventToHof`) gilt hier NICHT — das ist eine bewusste, explizite
 * Nutzeraktion auf den Hof selbst, keine automatische Reprojektion.
 *
 * Ohne diesen Nachlauf würde eine Umbenennung zwar `PLAC` live ändern (der Writer baut
 * `PLAC` bei jedem Export frisch aus den aktuellen Hof-`addrs`, s. `write-back-emit.ts`),
 * aber `ev.addr` bliebe der alte Wert — unsichtbar in der Ereigniszeile (die `ev.addr`
 * roh anzeigt) UND beim nächsten Laden würde das alte `ADDR` den alten Hof-Namen erneut
 * bootstrappen (Pfad B, Spec 11 §4.2).
 *
 * VORBEDINGUNG: der Aufrufer hat die aktualisierten Hof-`addrs` (mit `newValue`) bereits
 * in `db.hofObjects` gespeichert, BEVOR diese Funktion gerufen wird — der hier intern
 * gebaute `PlaceContext` muss den neuen Namen sehen, damit `buildPlacForGedcom` korrekt
 * mit `newValue` projiziert.
 *
 * Trifft NUR Events mit `hofId === hofId` UND `addr === oldValue` (exakter String-
 * Vergleich, BEIDE Bedingungen) — das ist ein LP-1-Schutz: Events, deren `addr` vom
 * erwarteten alten Wert abweicht (seltener Altbestand, z. B. eine Komma-Variante wie
 * „Oster 82a, Wester 141" oder eine Adressbuch-Übernahme), sind kein „sauberer"
 * Projektions-Cache mehr und bleiben BYTE-IDENTISCH unangetastet (GEDCOM-ADDR-
 * Roundtrip-Treue). Events mit leerem `addr` matchen den Guard nicht (schreiben ohnehin
 * kein ADDR, ihr PLAC berechnet sich live) — ebenfalls unangetastet.
 *
 * Für jeden Treffer: `addr` wird `newValue`; `place` wird per `buildPlacForGedcom` neu
 * berechnet, aber NUR übernommen, wenn das Ergebnis `!= null` ist (sonst bleibt `place`
 * unverändert — analog `linkEventToHof`/`linkEventToPlace`, kein Overwrite mit null).
 *
 * Gleiche Slot-Iteration/Mutations-Disziplin wie `deleteHofCascade` (In-Place-Mutation
 * von `db.individuals`/`db.families`, gleiche Person-/Family-Slots).
 */
export function renameHofAddrInEvents(
  db: ReadonlyDatabase,
  hofId: HofId,
  oldValue: string,
  newValue: string,
): Database {
  const base = db as unknown as Database;
  const ctx: PlaceContext = {
    places: makePlaceRegistry(base.placeObjects),
    hofs: makeHofRegistry(base.hofObjects),
  };

  return mapAllEvents(db, (ev) => {
    if (ev.hofId !== hofId || ev.addr !== oldValue) return null;
    const next: Event = { ...ev, addr: newValue };
    const proj = buildPlacForGedcom(next, eventYear(next), ctx);
    if (proj != null) next.place = proj;
    return next;
  });
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
export function applyPlaceResolution(db: Database, opts: ApplyResolutionOptions = {}): ApplyResolutionResult {
  if (opts.resetUncuratedLinks) resetUncuratedLinks(db);
  const { events, slots } = collectEventSlots(db);

  // Schritt 0 (Spec 11 §4.2, ADR-v9-28/-29): Village-Seed VOR der Auflösung — erzeugt die
  // fehlenden PlaceObjects, damit der (unveränderte) Verwaltungs-Match sie danach vorfindet.
  const seedCtx = { places: makePlaceRegistry(db.placeObjects), hofs: makeHofRegistry(db.hofObjects) };
  const seeded = opts.seed === false ? [] : seedPlacesFromEvents(events, seedCtx);
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

/**
 * Kommando-Nachlauf zum Hof-Umzug (`moveHofToVillage`, BL-236/OE-12, ADR-v9-172): zieht den
 * DORFANKER `event.placeId` aller referenzierenden Ereignisse mit.
 *
 * WARUM DAS NICHT OPTIONAL IST. `buildPlacForGedcom` liest das Dorf aus `hof.villageId` und
 * ignoriert `ev.placeId`, solange `hofId` gesetzt ist — Anzeige und Export folgen dem Umzug
 * also von selbst. `ev.placeId` bleibt aber die Hälfte, die niemand nachzieht, und sie ist
 * die, die den nächsten VOLLEN Lade-Pass steuert: `hofId` wird nie persistiert (Spec 11 §2),
 * das Ereignis wird über seinen Dorfanker neu aufgelöst — und fände dort den umgezogenen Hof
 * nicht mehr. Ergebnis wäre ein frisch gebootstrappter Hof im ALTEN Dorf neben dem
 * umgezogenen im neuen: der Umzug hielte genau bis zum nächsten Laden.
 *
 * Dieselbe Lehre und dieselbe Form wie `renameHofAddrInEvents` (ADR-v9-81): ein Edit an einem
 * Feld, das anderswo gespiegelt ist, ist erst fertig, wenn ALLE Repräsentationen mitziehen.
 *
 * `remap` hängt zusätzlich Ereignisse um, deren Hof beim Umzug konsolidiert wurde.
 */
export function relinkHofVillageInEvents(
  db: ReadonlyDatabase,
  hofId: HofId,
  villageId: PlaceId,
  remap: ReadonlyMap<HofId, HofId> = new Map(),
): Database {
  const base = db as unknown as Database;
  const ctx: PlaceContext = {
    places: makePlaceRegistry(base.placeObjects),
    hofs: makeHofRegistry(base.hofObjects),
  };
  const zielIds = new Set<HofId>([hofId, ...remap.keys()]);

  return mapAllEvents(db, (ev) => {
    if (ev.hofId == null || !zielIds.has(ev.hofId)) return null;
    const next: Event = { ...ev, hofId: remap.get(ev.hofId) ?? ev.hofId, placeId: villageId };
    const proj = buildPlacForGedcom(next, eventYear(next), ctx);
    if (proj != null) next.place = proj;
    return next;
  });
}
