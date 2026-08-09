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
  eventSpanne,
  normHofAddr,
  normPlaceName,
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
    const proj = buildPlacForGedcom(next, eventSpanne(next), ctx);
    if (proj != null) next.place = proj;
    return next;
  });
}

/**
 * Der Geschwister-Nachlauf zu `renameHofAddrInEvents` für die VOLLSPEICHERUNG eines Hofs
 * (`saveHof`, ADR-v9-223): dort gibt es kein alt→neu-Paar, sondern eine Adressliste, aus
 * der Werte verschwunden sein können — `HofDetail` legt Varianten über dieses Kommando an
 * und entfernt sie.
 *
 * `entfalleneWerte` sind die Adress-Bezeichnungen, die der Hof VORHER trug und jetzt nicht
 * mehr. Jedes Ereignis am Hof, dessen `ev.addr` einen davon trägt, bekommt die zum
 * EREIGNISJAHR gültige Adresse — dieselbe Wahl, die die Anzeige trifft
 * (`resolveAddrAsOf`). Deshalb je Ereignis neu bestimmt und nicht ein fester neuer Wert:
 * ein Hof kann datierte Adressvarianten führen, und dann ist „die neue Adresse" für ein
 * Ereignis von 1750 eine andere als für eines von 1900.
 *
 * GUARD wie in ADR-v9-81: umgeschrieben wird nur, was VORHER SAUBER war (der Wert stand
 * so in `addrs`). Eine quellen-eigene, byte-abweichende Schreibweise, die nie im Bestand
 * stand, bleibt unangetastet — sie ist Wire-Wahrheit, kein veralteter Cache (LP-1).
 */
export function reprojectHofAddrInEvents(
  db: ReadonlyDatabase,
  hofId: HofId,
  entfalleneWerte: readonly string[],
): Database {
  const base = db as unknown as Database;
  if (entfalleneWerte.length === 0) return base;
  const ctx: PlaceContext = {
    places: makePlaceRegistry(base.placeObjects),
    hofs: makeHofRegistry(base.hofObjects),
  };
  const entfallen = new Set(entfalleneWerte.map((v) => normHofAddr(v)));

  return mapAllEvents(db, (ev) => {
    if (ev.hofId !== hofId || !ev.addr || !entfallen.has(normHofAddr(ev.addr))) return null;
    const jetzt = ctx.hofs.resolveAddrAsOf(hofId, eventSpanne(ev));
    if (!jetzt || jetzt === ev.addr) return null;
    const next: Event = { ...ev, addr: jetzt };
    const proj = buildPlacForGedcom(next, eventSpanne(next), ctx);
    if (proj != null) next.place = proj;
    return next;
  });
}

/**
 * Kommando-Nachlauf zu jeder ORTSBEARBEITUNG (BL-291, ADR-v9-198): zieht die
 * `PLAC`-Projektion aller Ereignisse nach, die an DIESEM Ort hängen.
 *
 * WARUM DAS NICHT KOSMETIK IST. `placeId` steht nie in der Datei (Spec 11 §2) — die
 * Zuordnung wird bei jedem Laden neu berechnet, „Re-Derivation *ist* die Persistenz"
 * ([01](../../specs/v9/01-Vision-und-Prinzipien.md) LP-5). Damit ist der `PLAC`-Text die
 * EINGABE dieser Berechnung und die einzige Brücke zwischen Datei und kuratiertem Bestand.
 * Korrigiert der Nutzer eine Verwaltungskette (`Amt Meinersen` → `Vogtei Meinersen`) und
 * bleibt der Text stehen, findet der nächste Ladepass den Ort nicht wieder: der Seed legt
 * eine Dublette an, das Ereignis bindet dorthin, der kuratierte Ort bleibt referenzlos —
 * die Korrektur erzeugt genau das, was sie auflösen sollte.
 *
 * ABGRENZUNG zum Ladepass (BL-288): dort läuft KEINE Reprojektion mehr, weil Öffnen und
 * Speichern keine Entscheidung des Nutzers sind — das waren die 668 stillen Umschreibungen.
 * Hier gibt es einen Anlass: er hat den Ort bearbeitet. Deshalb auch nur die Ereignisse
 * DIESES Ortes, nicht der ganze Bestand.
 *
 * BETROFFEN IST NICHT NUR DER ORT SELBST, SONDERN SEIN GANZER TEILBAUM. Wer „Amt
 * Meinersen" in „Vogtei Meinersen" korrigiert, ändert die Projektion jedes Ereignisses in
 * *Arpke* — denn dessen Kette trägt den Elternnamen mit. Eine Fassung, die nur
 * `ev.placeId === placeId` erfasste, ließ genau diesen Fall liegen (vom Versprechen-Test
 * `place-curation-roundtrip.test.ts` gefangen: die Umbenennung kam nie in der Datei an).
 * Die Menge wird deshalb als Fixpunkt über `enclosedBy` gebildet — alle Orte, die
 * transitiv unter dem geänderten hängen.
 *
 * Erfasst beide Bindungsarten: direkt (`ev.placeId`) und über den Hof (`ev.hofId`, dessen
 * `villageId` im Teilbaum liegt) — die Hof-Projektion trägt den Dorfnamen mit.
 *
 * VORBEDINGUNG wie bei `renameHofAddrInEvents`: der geänderte Ort steht bereits in
 * `db.placeObjects`, damit der hier gebaute `PlaceContext` die neue Kette sieht.
 */
export function reprojectEventsOfPlace(db: ReadonlyDatabase, placeId: PlaceId): Database {
  return reprojectEventsOf(db, { places: [placeId] });
}

/**
 * Die Mengen-Fassung von `reprojectEventsOfPlace` — dieselbe Zusicherung für MEHRERE
 * geänderte Orte und/oder Höfe, in EINEM Durchlauf (ADR-v9-223).
 *
 * WARUM ES SIE BRAUCHT. Drei Kommandos ändern Orts-/Hof-INHALT, ohne dass ein einzelner
 * Ort der Anlass wäre, und alle drei ließen den Ereignistext zurück (gemessen 2026-08-05,
 * Anzeige gegen Wire):
 *   `replacePlacesAndHofs` (orte.json-Import / Standalone-Editor / zweites Gerät) —
 *     eine datierte Umbenennung an einem ELTERNGLIED wirkte in der Anzeige sofort,
 *     die Datei behielt die alte Kette. Für immer: der Ladepass reprojiziert seit
 *     ADR-v9-197 bewusst nicht mehr, das nächste Öffnen ist wieder nur ein Ladepass.
 *   `saveHof` — Adressvariante hinzugefügt/entfernt (HofDetail), Text blieb stehen.
 *   `mergeHof` — das Ereignis hängt danach am Überlebenden, ggf. in einem ANDEREN Dorf;
 *     der Text nannte weiter das alte.
 *
 * `hofs` ist dabei nicht nur Bequemlichkeit: ein Hof kann sich ändern, ohne dass sein
 * Dorf sich ändert (Adresse), und dann liegt er in keinem Orts-Teilbaum, den `places`
 * aufspannt.
 *
 * KEIN Rückfall in den Ladepass-Zustand von vor ADR-v9-197: dort wurde jedes Ereignis
 * reprojiziert, auch wenn niemand etwas geändert hatte (668 stille Umschreibungen). Hier
 * bestimmt der AUFRUFER die Menge, und er bildet sie aus dem, was der Nutzer tatsächlich
 * angefasst hat.
 */
export function reprojectEventsOf(
  db: ReadonlyDatabase,
  targets: { places?: Iterable<PlaceId>; hofs?: Iterable<HofId> },
): Database {
  const base = db as unknown as Database;
  const ctx: PlaceContext = {
    places: makePlaceRegistry(base.placeObjects),
    hofs: makeHofRegistry(base.hofObjects),
  };

  // Fixpunkt: die Orte und alles, was (transitiv) unter ihnen hängt. Über ALLE `enclosedBy`-
  // Einträge, nicht nur den ersten — ein gemergter Ort trägt mehrere Ketten (ADR-v9-72).
  const betroffeneOrte = new Set<PlaceId>(targets.places ?? []);
  for (let gewachsen = betroffeneOrte.size > 0; gewachsen; ) {
    gewachsen = false;
    for (const [id, pl] of base.placeObjects) {
      if (betroffeneOrte.has(id)) continue;
      if (pl.enclosedBy.some((e) => betroffeneOrte.has(e.placeId))) {
        betroffeneOrte.add(id);
        gewachsen = true;
      }
    }
  }
  const hofsHier = new Set<HofId>(targets.hofs ?? []);
  for (const h of base.hofObjects.values()) if (betroffeneOrte.has(h.villageId)) hofsHier.add(h.id);
  if (betroffeneOrte.size === 0 && hofsHier.size === 0) return base;

  return mapAllEvents(db, (ev) => {
    const betroffen =
      (ev.placeId != null && betroffeneOrte.has(ev.placeId)) ||
      (ev.hofId != null && hofsHier.has(ev.hofId));
    if (!betroffen) return null;
    const proj = buildPlacForGedcom(ev, eventSpanne(ev), ctx);
    // `null` → keine projizierbare Kette (Ort/Hof fehlt): dann den Wire-Wert stehen lassen,
    // statt ihn zu leeren. Gleicher Wert → kein Schreibvorgang, damit der Dirty-Check den
    // Record nicht grundlos als geändert meldet.
    if (proj == null || proj === ev.place) return null;
    return { ...ev, place: proj };
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
    const proj = buildPlacForGedcom(next, eventSpanne(next), ctx);
    if (proj != null) next.place = proj;
    return next;
  });
}

/** Ein Ereignis, dessen Text NICHT angeglichen wurde, weil die Projektion ärmer wäre. */
export interface AngleichLuecke {
  /** Der Ort/Hof, an dem das Ereignis hängt — die Fundstelle der Kurationslücke. */
  placeId: PlaceId | null;
  hofId: HofId | null;
  /** Was in der Datei steht, und was die Projektion daraus machen wollte. */
  quelle: string;
  projektion: string;
}

export interface AngleichErgebnis {
  db: Database;
  /** Angeglichene Ereignisse. */
  geaendert: number;
  /** Übersprungene: die Projektion hätte Segmente verloren (Kurationslücke, s. u.). */
  luecken: AngleichLuecke[];
}

/** Segmente eines PLAC-Strings in Norm-Form — leere Template-Felder fallen weg. */
function placSegmente(s: string | null | undefined): string[] {
  return (s ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => normPlaceName(x));
}

/**
 * ALLE Namen, unter denen die projizierte Kette bekannt ist — Titel und `pnames` jedes
 * Knotens (periodenunabhängig), dazu die Adressvarianten des Hofs.
 *
 * WOZU: um eine UMBENENNUNG von einem VERLUST zu unterscheiden. Beide sehen im Text gleich
 * aus — ein Segment der Quelle taucht in der Projektion nicht auf. „Kreis X" -> „Amt X" ist
 * aber derselbe Knoten unter seinem periodengerechten Namen (nichts geht verloren), während
 * „…, NRW, Deutschland" -> „…, Nordrhein-Westfalen" eine Ebene WEGLÄSST, die der Bestand
 * nicht kennt. Auf Zeichenketten-Ebene ist das nicht zu trennen, auf Knoten-Ebene schon:
 * gehört das Segment zu irgendeinem Knoten der Kette, ist es abgedeckt; gehört es zu
 * keinem, fehlt die Ebene.
 */
function ketteNamen(
  kette: readonly PlaceId[],
  hofId: HofId | null,
  places: Database['placeObjects'],
  hofs: Database['hofObjects'],
): Set<string> {
  const namen = new Set<string>();
  for (const id of kette) {
    const po = places.get(id);
    if (!po) continue;
    namen.add(normPlaceName(po.title));
    for (const pn of po.pnames ?? []) namen.add(normPlaceName(pn.value));
    if (po.shortName) namen.add(normPlaceName(po.shortName));
  }
  const hof = hofId != null ? hofs.get(hofId) : undefined;
  for (const a of hof?.addrs ?? []) namen.add(normHofAddr(a.value));
  namen.delete('');
  return namen;
}

/**
 * Gleicht den Dateitext an das kuratierte Ortswissen an (ADR-v9-224).
 *
 * DER AUTORITÄTS-SATZ, den diese Funktion umsetzt: hängt ein Ereignis an einem
 * **kuratierten** Ort/Hof (§9.1: geprüft ODER angereichert), ist `orte.json` die Autorität
 * — der Dateitext IST die periodengerechte Projektion. Hängt es an einem SEED-Objekt oder
 * gar nicht, ist die Quelle die Autorität und der Text bleibt unangetastet.
 *
 * WARUM DIESE GRENZE UND NICHT „Laden gegen Bearbeiten" (ADR-v9-197). Am Realbestand
 * gemessen (2026-08-05, `Unsere Familie 2026.ged` + `orte.v9.json`) fällt die Abweichung
 * zwischen Datei und Anzeige sauber in zwei Hälften:
 *   an KURATIERTEM Wissen  4860 Ereignisse, 279 abweichend — 232 periodengerechte
 *     Umbenennungen („Herzogtum Oldenburg" 1905 -> „Großherzogtum Oldenburg"),
 *     14 Anreicherungen, 19 Leerfelder, 14 sonstige, **0 Kürzungen**
 *   an SEED-Objekten        297 Ereignisse, 235 abweichend — ausschließlich Leerfelder
 *     und KÜRZUNGEN („…, Rheine, , , NRW, Deutschland" -> „Rheine, Nordrhein-Westfalen")
 * Ein Seed-Objekt ist ein Spiegel des Dateitexts; aus ihm kann die Projektion nichts
 * hinzufügen, aber Ebenen verlieren, die er nie modelliert hat. Die 668 stillen
 * Umschreibungen aus ADR-v9-197 waren die Summe beider Hälften — getrennt betrachtet sind
 * es 279 Gewinne und 235 Schäden.
 *
 * DIE VERARMUNGS-SPERRE ist trotzdem eine Regel, kein Zufall: enthält die Projektion nicht
 * jedes Segment der Quelle, wird NICHT geschrieben, und das Ereignis erscheint als
 * `AngleichLuecke`. Am heutigen Bestand trifft das auf der kuratierten Seite null Fälle —
 * tritt es auf, ist es ein Kurations-Befund („der Bestand kennt über NRW nichts mehr"),
 * kein Schreibanlass. Verglichen wird über Norm-Segmente, damit ein reines Leerfeld oder
 * eine Groß-/Kleinschreibung nicht als Verlust zählt.
 *
 * REIN und idempotent: gleiche Eingabe, gleiche Ausgabe; ein zweiter Lauf ändert nichts
 * mehr (die Projektion ist dann bereits der Text). Copy-on-write über `mapAllEvents` —
 * nur Owner mit tatsächlich geändertem Ereignis werden geklont.
 */
export function alignCuratedEventTexts(db: ReadonlyDatabase): AngleichErgebnis {
  const base = db as unknown as Database;
  const ctx: PlaceContext = {
    places: makePlaceRegistry(base.placeObjects),
    hofs: makeHofRegistry(base.hofObjects),
  };
  const luecken: AngleichLuecke[] = [];
  let geaendert = 0;

  const naechste = mapAllEvents(db, (ev) => {
    if (ev.placeId == null && ev.hofId == null) return null;

    // Kuratiert? Die Frage gilt der GANZEN Kette, nicht nur dem gebundenen Objekt: die
    // Projektion baut sich aus jedem Knoten von unten bis oben, und das kuratierte Wissen
    // sitzt oft am VORFAHREN — „Bayern" -> „Freistaat Bayern" ist eine Aussage über den
    // Elter, nicht über das Dorf darunter. Eine Prüfung nur am gebundenen Objekt ließ genau
    // den Fall liegen, mit dem dieser ADR angefangen hat (datierte Umbenennung am
    // Elternglied); ein Test hat es sofort gezeigt.
    const hof = ev.hofId != null ? base.hofObjects.get(ev.hofId) : undefined;
    const ankerId = hof ? hof.villageId : ev.placeId;
    const jahr = eventYear(ev);
    const kette = ankerId != null ? ctx.places.enclosureIdsAsOf(ankerId, jahr) : [];
    const kuratiert =
      (hof != null && isCuratedHof(hof)) ||
      kette.some((id) => {
        const po = base.placeObjects.get(id);
        return po != null && isCuratedPlace(po);
      });
    if (!kuratiert) return null;

    const proj = buildPlacForGedcom(ev, jahr, ctx);
    if (proj == null || proj === ev.place) return null;

    // Verarmungs-Sperre auf KNOTEN-Ebene (s. `ketteNamen`): jedes Segment der Quelle muss
    // von einem Knoten der Kette getragen werden — unter irgendeinem seiner Namen. Ein
    // Segment, das zu keinem Knoten gehört, ist eine Ebene, die der Bestand nicht kennt;
    // sie zu überschreiben hieße, Wissen der Quelle zu löschen (LP-1).
    const abgedeckt = ketteNamen(kette, ev.hofId, base.placeObjects, base.hofObjects);
    const quelle = placSegmente(ev.place);
    if (!quelle.every((seg) => abgedeckt.has(seg))) {
      luecken.push({
        placeId: ev.placeId,
        hofId: ev.hofId,
        quelle: ev.place ?? '',
        projektion: proj,
      });
      return null;
    }

    geaendert += 1;
    return { ...ev, place: proj };
  });

  return { db: naechste, geaendert, luecken };
}
