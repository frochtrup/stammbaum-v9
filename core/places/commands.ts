// core/places/commands.ts — Mutations-Kommandos für PlaceObject/HofObject (Spec 20
// §1.7/§1.8 [K] "Bearbeitung"). Analog core/model/integrity.ts: reine Kommando-
// Funktionen, die ein VOLLSTÄNDIGES Objekt entgegennehmen und die Map mutieren — keine
// verstreuten Feld-Setter aus dem DOM (Auftrags-Vorgabe "savePerson(model)"-Muster).
// Kein Zustand hier, kein DOM/I/O (INV-ARCH-1/2) — die UI-Schale ruft diese Kommandos
// über ein AppState-Kommando auf, das die Reaktivität auslöst (Svelte-Reassign obliegt
// der Schale, s. ui/shell/app-state.svelte.ts).
import type { Event, PlaceId, HofId } from '../model/types';
import type { PlaceObject, HofObject, PlaceObjects, HofObjects, DatedName, DatedRef, DatedAddress } from './types';
import { buildPlacForGedcom, eventYear, type PlaceContext } from './build-plac';
import { normPlaceName, normHofAddr } from './normalize';

/**
 * Kommando: legt ein PlaceObject an oder ersetzt es vollständig (Upsert per id).
 * `savePlaceObject(model)`-Muster — kein Feld-Setter, das Objekt kommt komplett von
 * der aufrufenden Formular-Komponente (dort bereits validiert/zusammengebaut).
 */
export function savePlaceObject(places: PlaceObjects, next: PlaceObject): void {
  places.set(next.id, next);
}

/** Kommando: entfernt ein PlaceObject. Referenzen (`enclosedBy`) werden NICHT nachgeführt
 * (das ist Sache eines künftigen Orts-Review-Workflows, außerhalb dieser Scheibe). */
export function deletePlaceObject(places: PlaceObjects, id: PlaceId): void {
  places.delete(id);
}

/** Kommando: legt ein HofObject an oder ersetzt es vollständig (Upsert per id). */
export function saveHofObject(hofs: HofObjects, next: HofObject): void {
  hofs.set(next.id, next);
}

/** Kommando: entfernt ein HofObject. */
export function deleteHofObject(hofs: HofObjects, id: HofId): void {
  hofs.delete(id);
}

/**
 * Hängt eine Namensvariante (`pnames`) mit optionalem Zeitraum an ein bestehendes
 * PlaceObject an. Reine Kopie — der Aufrufer speichert das Ergebnis über
 * savePlaceObject(). Keine Dedup-Logik hier (Nutzer-Intent bleibt erhalten, analog
 * addHofVariant in hof-id.ts).
 */
export function withAddedPname(pl: PlaceObject, value: string, from: number | null, to: number | null): PlaceObject {
  if (!value.trim()) return pl;
  const entry: DatedName = { value: value.trim(), from, to };
  return { ...pl, pnames: [...pl.pnames, entry] };
}

/** Entfernt eine pnames-Variante am angegebenen Index. */
export function withRemovedPname(pl: PlaceObject, index: number): PlaceObject {
  return { ...pl, pnames: pl.pnames.filter((_, i) => i !== index) };
}

/** Hängt eine enclosedBy-Zugehörigkeit (Verwaltungs-Zeitachse) an ein PlaceObject an. */
export function withAddedEnclosedBy(
  pl: PlaceObject,
  parentId: PlaceId,
  from: number | null,
  to: number | null,
): PlaceObject {
  if (!parentId) return pl;
  const entry: DatedRef = { placeId: parentId, from, to };
  return { ...pl, enclosedBy: [...pl.enclosedBy, entry] };
}

/** Entfernt eine enclosedBy-Zugehörigkeit am angegebenen Index. */
export function withRemovedEnclosedBy(pl: PlaceObject, index: number): PlaceObject {
  return { ...pl, enclosedBy: pl.enclosedBy.filter((_, i) => i !== index) };
}

/**
 * Hängt eine Adressvariante an ein bestehendes HofObject an (Formular-Pfad — NICHT
 * addHofVariant aus hof-id.ts, die ist für den Review-Workflow reserviert und dedupliziert
 * per Norm; hier: Nutzer bearbeitet das Hof-Formular direkt, explizite Werte gewinnen).
 */
export function withAddedHofAddr(
  hof: HofObject,
  value: string,
  from: number | null,
  to: number | null,
): HofObject {
  if (!value.trim()) return hof;
  const entry: DatedAddress = { value: value.trim(), from, to };
  return { ...hof, addrs: [...hof.addrs, entry] };
}

/** Entfernt eine Adressvariante am angegebenen Index. */
export function withRemovedHofAddr(hof: HofObject, index: number): HofObject {
  return { ...hof, addrs: hof.addrs.filter((_, i) => i !== index) };
}

/**
 * Bearbeitet eine BESTEHENDE Adressvariante am angegebenen Index (Formular-Pfad —
 * u. a. der im Steckbrief angezeigte "Name" eines Hofes, `addrs[0].value`, den es sonst
 * nur per Löschen+Neu-Anhängen umbenennen ließe; das verlöre die Array-Position).
 * Ersetzt `addrs[index]` durch `{ value: value.trim(), from, to }` — gleiche Trim-Disziplin
 * wie `withAddedHofAddr`. No-Op-tolerant: leerer `value.trim()` oder Index außerhalb
 * `0..addrs.length-1` gibt `hof` unverändert zurück (kein Crash, kein stillschweigendes
 * Löschen). Reine, unveränderliche Funktion — mutiert weder `hof` noch das `addrs`-Array.
 *
 * `hof.id` bleibt UNVERÄNDERT: die Hof-`id` ist deterministisch aus der Adresse bei
 * ERSTANLAGE (Spec 11 §1, §6) und wird durch nachträgliche Edits nie neu berechnet
 * (analog `PlaceObject.title`, das sich ohne `id`-Neuberechnung ändern kann). Diese Funktion
 * ändert nur den Inhalt des Eintrags — kein Re-Resolve. Dass künftige Event-Zuordnungen gegen
 * `normHofAddr(a.value)` matchen (hof-registry.ts), ist bestehendes, gewolltes Verhalten
 * (Adressvarianten bestimmen ohnehin, wogegen gematcht wird) — keine Sorge dieser Funktion.
 */
export function withUpdatedHofAddr(
  hof: HofObject,
  index: number,
  value: string,
  from: number | null,
  to: number | null,
): HofObject {
  if (!value.trim()) return hof;
  if (index < 0 || index >= hof.addrs.length) return hof;
  const entry: DatedAddress = { value: value.trim(), from, to };
  return { ...hof, addrs: hof.addrs.map((a, i) => (i === index ? entry : a)) };
}

/**
 * Kommando (Spec 20 §1.7 [K] "String→PlaceObject verknüpfen"): setzt `ev.placeId` auf
 * ein bestehendes PlaceObject UND reprojiziert `ev.place` sofort (Spec 11 §3 INV-PLACE,
 * ADR-v9-19 — Sofort-Reprojektion im Kommando). Die Reprojektion läuft an ZWEI Stellen,
 * die INV-PLACE gemeinsam garantieren: beim Laden (voller `resolveEvents()`-Pass) UND in
 * jedem `placeId`/`hofId`-setzenden Modell-Kommando (Spec 11 §4.1). Das ist reine
 * Kern-Logik (`buildPlacForGedcom`), INV-ARCH-1-konform — KEINE UI-/DOM-Referenz; die
 * Schale reicht nur den `PlaceContext` (Chokepoints, Spec 11 §5) herein.
 * Es gibt keinen Zwischenzustand, in dem `placeId` gesetzt, `ev.place` aber veraltet ist.
 * Mutiert das Event in-place (Event-Objekte werden von Person/Family referenziert,
 * analog core/model/integrity.ts-Kommandos, die ihre Owner-Objekte ebenfalls in-place
 * mutieren statt zu kopieren). Persistiert wird nur `placeId`, nie `ev.place` (Spec 11 §2).
 */
export function linkEventToPlace(ev: Event, placeId: PlaceId, ctx: PlaceContext): void {
  ev.placeId = placeId;
  const proj = buildPlacForGedcom(ev, eventYear(ev), ctx);
  if (proj != null) ev.place = proj;
}

/**
 * Kommando (ADR-v9-42, Spec 20 §1.7 [K] "String→HofObject verknüpfen"): setzt `ev.hofId`
 * auf ein bestehendes HofObject UND reprojiziert sofort (Spec 11 §3 INV-PLACE, ADR-v9-19).
 * Exakt analog `linkEventToPlace`, aber für den Hof-Pfad — es gibt keinen Zwischenzustand,
 * in dem `hofId` gesetzt, `ev.place`/`ev.addr` aber veraltet sind (der frühere Drift in
 * hof-review-actions.ts, „Reprojektion erst beim nächsten Laden", widersprach ADR-v9-19).
 *
 * Reprojiziert IDENTISCH zum `reproject()`-Wrapper in resolve.ts (Spec 11 §4.1):
 *   - `ev.place` = periodengerechte Projektion via `buildPlacForGedcom` (Hof-Adresse,
 *     Komma-geschützt via Konvention α, + Dorf-Hierarchie). Nur setzen wenn Projektion
 *     != null (fehlt das HofObject, bleibt der Rohstring — kein Overwrite mit null).
 *   - `ev.addr` NUR füllen wenn leer — der volle Hof-Adresswert (mit evtl. Komma) aus
 *     `resolveAddrAsOf`. Eine bereits gesetzte, explizite `ev.addr` bleibt byte-identisch
 *     (Wire-ADDR-Roundtrip, LP-1). ADDR trägt den vollen Wert; beim Re-Import findet
 *     Pfad B (ADDR-basiert) den Hof wieder.
 *
 * Reine Kern-Logik, INV-ARCH-1-konform — KEINE UI-/DOM-Referenz; die Schale reicht nur
 * den `PlaceContext` (Chokepoints, Spec 11 §5) herein. Mutiert das Event in-place
 * (analog `linkEventToPlace`). Persistiert wird nur `hofId`, nie `ev.place` (Spec 11 §2).
 */
export function linkEventToHof(ev: Event, hofId: HofId, ctx: PlaceContext): void {
  ev.hofId = hofId;
  const year = eventYear(ev);
  const proj = buildPlacForGedcom(ev, year, ctx);
  if (proj != null) ev.place = proj;
  if (!ev.addr) {
    const a = ctx.hofs.resolveAddrAsOf(hofId, year);
    if (a) ev.addr = a;
  }
}

/**
 * Bearbeitbares Exemplar aus einer Entitäts-Map: klont beim ERSTEN Zugriff und schreibt
 * die Kopie zurück (Copy-on-Write, ADR-v9-92). Ohne diesen Schritt würden die Merges die
 * PlaceObject-/HofObject-OBJEKTE mutieren, die ein zurückgehaltener Undo-Snapshot noch
 * teilt — die Map-Kopie allein (`new Map(db.placeObjects)`) schützt nur die Map, nicht
 * ihre Werte. `thawed` hält fest, was in DIESEM Merge bereits aufgetaut wurde, damit
 * mehrfach berührte Objekte nicht mehrfach kopiert werden.
 */
function editableIn<K, V>(map: Map<K, V>, key: K, thawed: Set<K>): V | undefined {
  const current = map.get(key);
  if (current === undefined) return undefined;
  if (thawed.has(key)) return current;
  const copy = structuredClone(current);
  map.set(key, copy);
  thawed.add(key);
  return copy;
}

/** Ergebnis eines Dorf-Merges — meldet den automatischen Hof-Nachlauf (§9.2, für UI-Toast). */
export interface MergeResult {
  /** Anzahl automatisch nachkonsolidierter Hof-Dubletten (Verlierer-Höfe) unter dem Gewinner-Dorf. */
  hofsMerged: number;
  /** Dorf, unter dem konsolidiert wurde (null, wenn nichts nachkonsolidiert wurde). */
  villageId: PlaceId | null;
  /**
   * Verlierer-Hof → Überlebender-Hof. Der Merge hängt `event.hofId` NICHT mehr selbst um
   * (das mutierte db-ansässige Ereignisse in-place und damit auch gehaltene Undo-
   * Snapshots, ADR-v9-92); stattdessen zieht der Aufrufer die Referenzen copy-on-write
   * nach (`mapAllEvents`). Leer, wenn kein Hof zusammengeführt wurde.
   */
  hofRemap: ReadonlyMap<HofId, HofId>;
}

/**
 * Kommando: Dubletten-Merge (Spec 20 §1.7 [K] „Dubletten-Merge, verlustfrei", §9.2 Punkt 2).
 * Führt ein ODER mehrere PlaceObjects (`mergedIds`) in `survivorId` zusammen und entfernt sie.
 * Dünner Wrapper über die paarweise Merge-Logik (`mergePlaceObjectPair`) — keine Duplizierung.
 *
 * Anschließend läuft der **automatische, verlustfreie Hof-Nachlauf** (ADR-v9-45 Nachtrag
 * 2026-07-10, Schritt 6/7): sind durch die `HofObjects.villageId`-Umhängung Höfe mit identischer
 * normalisierter Adresse unter dem Gewinner-Dorf entstanden, werden sie automatisch per
 * `mergeHofObjects` konsolidiert (Gewinner-Heuristik: Verwendungszahl → Koordinaten → Notiz →
 * kleinste ID). Grund: `hof-registry.ts::findByAddr` liefert bei ≥2 Kandidaten `null` (strikt
 * eindeutig — sonst Review-Klasse C); ohne den Nachlauf kippten zuvor eindeutig auflösbare
 * Events beim nächsten Reload auf „mehrdeutig" — eine echte Resolver-Regression. Der Nachlauf
 * braucht KEINE neue Nutzer-Entscheidung: `(villageId, norm. Adresse)` ist bereits die
 * strukturelle Hof-Identität (§4.4), die der Nutzer mit „Dorf A = Dorf B" schon bestätigt hat.
 *
 * `events` dient NUR der Verwendungszahl-Heuristik (rein, kein I/O) — bleibt eine reine
 * Funktion (INV-ARCH-1/2) und wird NICHT mutiert. `event.hofId`-Referenzen auf einen
 * konsolidierten Verlierer-Hof meldet die Rückgabe als `hofRemap`; der Aufrufer zieht sie
 * copy-on-write nach (ADR-v9-92 — früher geschah das hier per In-Place-Mutation, was in
 * gehaltene Undo-Snapshots schrieb). Rückgabe meldet außerdem den Nachlauf für den
 * UI-Toast. No-Op-tolerant (gleiche/fehlende IDs werden übersprungen).
 */
export function mergePlaceObjects(
  places: PlaceObjects,
  hofObjects: HofObjects,
  survivorId: PlaceId,
  mergedIds: PlaceId | readonly PlaceId[],
  events: readonly Event[] = [],
): MergeResult {
  const losers = Array.isArray(mergedIds) ? mergedIds : [mergedIds as PlaceId];
  const thawedPlaces = new Set<PlaceId>();
  const thawedHofs = new Set<HofId>();
  for (const mergedId of losers) {
    mergePlaceObjectPair(places, hofObjects, survivorId, mergedId, thawedPlaces, thawedHofs);
  }
  const hofRemap = new Map<HofId, HofId>();
  const hofsMerged = reconcileHofsUnderVillage(hofObjects, survivorId, events, thawedHofs, hofRemap);
  return { hofsMerged, villageId: hofsMerged > 0 ? survivorId : null, hofRemap };
}

/**
 * Paarweiser, verlustfreier Orts-Merge (interne Kern-Logik, §9.2 Punkt 2). Titel + `pnames`
 * überleben als Namensvarianten (dedupliziert über die Norm-Form); fehlende Metadaten des
 * Überlebenden werden gefüllt; `enclosedBy` vereinigt; alle Fremd-Referenzen (andere
 * `PlaceObjects.enclosedBy`, `HofObjects.villageId`) umgehängt. `event.placeId` ist
 * runtime-only (Spec 11 §2) → beim nächsten `resolveEvents()` neu abgeleitet, hier nichts zu tun.
 * No-Op bei gleicher ID oder fehlendem Ort. Der Hof-Nachlauf läuft NICHT hier, sondern einmal
 * im Wrapper `mergePlaceObjects` (nach allen Verlierern).
 */
function mergePlaceObjectPair(
  places: PlaceObjects,
  hofObjects: HofObjects,
  survivorId: PlaceId,
  mergedId: PlaceId,
  thawedPlaces: Set<PlaceId>,
  thawedHofs: Set<HofId>,
): void {
  if (survivorId === mergedId) return;
  // Der Überlebende wird geändert → bearbeitbares Exemplar (Copy-on-Write, ADR-v9-92).
  // `merged` wird nur gelesen und am Ende entfernt — kein Auftauen nötig.
  const survivor = editableIn(places, survivorId, thawedPlaces);
  const merged = places.get(mergedId);
  if (!survivor || !merged) return;

  // 1. Namen verlustfrei falten (Titel + pnames des Merged → pnames des Überlebenden),
  //    dedupliziert über die Norm-Form (survivor.title + bestehende pnames zählen bereits).
  const seen = new Set<string>([
    normPlaceName(survivor.title),
    ...survivor.pnames.map((p) => normPlaceName(p.value)),
  ]);
  const addName = (value: string, from: DatedName['from'], to: DatedName['to']): void => {
    const k = normPlaceName(value);
    if (!k || seen.has(k)) return;
    seen.add(k);
    survivor.pnames.push({ value, from, to });
  };
  addName(merged.title, null, null);
  for (const pn of merged.pnames) addName(pn.value, pn.from, pn.to);

  // 2. enclosedBy vereinigen (Selbst-/Kreis-Referenzen weglassen, dedupliziert).
  const encKey = (e: DatedRef): string => `${e.placeId}|${e.from}|${e.to}`;
  const encSeen = new Set(survivor.enclosedBy.map(encKey));
  for (const e of merged.enclosedBy) {
    if (e.placeId === survivorId || e.placeId === mergedId) continue;
    if (encSeen.has(encKey(e))) continue;
    encSeen.add(encKey(e));
    survivor.enclosedBy.push({ ...e });
  }

  // 3. Fehlende Metadaten des Überlebenden aus dem Merged füllen (nie überschreiben).
  if (!survivor.type && merged.type) survivor.type = merged.type;
  if (survivor.lat == null && merged.lat != null) survivor.lat = merged.lat;
  if (survivor.long == null && merged.long != null) survivor.long = merged.long;
  if (!survivor.note) survivor.note = merged.note;
  else if (merged.note && merged.note !== survivor.note) survivor.note = `${survivor.note}\n${merged.note}`;
  if (survivor.existsFrom == null) survivor.existsFrom = merged.existsFrom;
  if (survivor.existsTo == null) survivor.existsTo = merged.existsTo;
  if (!survivor.govId && merged.govId) survivor.govId = merged.govId;
  if (!survivor.govTypes && merged.govTypes) survivor.govTypes = merged.govTypes;

  // 4. Fremd-Referenzen umhängen: andere PlaceObjects.enclosedBy, die auf mergedId zeigen.
  //    Erst prüfen (auf dem geteilten Objekt), dann NUR die Treffer auftauen — sonst wäre
  //    jeder Merge eine Tiefkopie aller Orte.
  for (const id of [...places.keys()]) {
    if (id === mergedId) continue;
    const pl = places.get(id)!;
    if (!pl.enclosedBy.some((e) => e.placeId === mergedId)) continue;
    const target = editableIn(places, id, thawedPlaces)!;
    for (const e of target.enclosedBy) if (e.placeId === mergedId) e.placeId = survivorId;
  }
  // 5. HofObjects.villageId umhängen (gleiches Muster: prüfen, dann nur Treffer auftauen).
  for (const id of [...hofObjects.keys()]) {
    if (hofObjects.get(id)!.villageId !== mergedId) continue;
    editableIn(hofObjects, id, thawedHofs)!.villageId = survivorId;
  }

  // 6. Zusammengeführten Ort entfernen.
  places.delete(mergedId);
}

/**
 * Kommando: verlustfreier Hof-Merge (Spec 11 §9.2). Führt ein ODER mehrere HofObjects
 * (`mergedIds`) in `survivorId` zusammen und entfernt sie. VERLUSTFREI, analog zum Orts-Merge:
 * `addrs`-Historie vereinigt (dedupliziert über die Norm-Form, Konvention α); fehlende
 * Koordinaten/Notiz/Existenz-Spanne/Lebenszyklus-Verweise/GOV des Überlebenden werden gefüllt
 * (nie überschrieben); `event.hofId`-Referenzen der Verlierer werden für die Session-Konsistenz
 * auf `survivorId` umgehängt (persistiert wird `hofId` nie, Spec 11 §2 — beim nächsten Load
 * ohnehin neu abgeleitet). Mutiert `hofs` in place. No-Op bei gleicher/fehlender ID.
 */
export function mergeHofObjects(
  hofs: HofObjects,
  survivorId: HofId,
  mergedIds: HofId | readonly HofId[],
  thawed: Set<HofId> = new Set(),
  remap: Map<HofId, HofId> = new Map(),
): ReadonlyMap<HofId, HofId> {
  const losers = Array.isArray(mergedIds) ? mergedIds : [mergedIds as HofId];
  // Bearbeitbares Exemplar (Copy-on-Write, ADR-v9-92) — der Überlebende wird verändert.
  const survivor = editableIn(hofs, survivorId, thawed);
  if (!survivor) return remap;
  const loserSet = new Set(losers);

  for (const mergedId of losers) {
    if (mergedId === survivorId) continue;
    const merged = hofs.get(mergedId);
    if (!merged) continue;

    // 1. addrs vereinigen (dedupliziert über die Norm-Form — Nutzer-/Quellen-Varianten bleiben).
    const seen = new Set(survivor.addrs.map((a) => normHofAddr(a.value)));
    for (const a of merged.addrs) {
      const k = normHofAddr(a.value);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      survivor.addrs.push({ ...a });
    }

    // 2. Fehlende Metadaten des Überlebenden aus dem Merged füllen (nie überschreiben).
    if (survivor.lat == null && merged.lat != null) survivor.lat = merged.lat;
    if (survivor.long == null && merged.long != null) survivor.long = merged.long;
    if (!survivor.note) survivor.note = merged.note;
    else if (merged.note && merged.note !== survivor.note) survivor.note = `${survivor.note}\n${merged.note}`;
    if (survivor.existsFrom == null) survivor.existsFrom = merged.existsFrom;
    if (survivor.existsTo == null) survivor.existsTo = merged.existsTo;
    // Lebenszyklus nur adoptieren, wenn er nicht auf den Überlebenden/einen Verlierer zeigt.
    if (survivor.predecessor == null && merged.predecessor != null
      && merged.predecessor !== survivorId && !loserSet.has(merged.predecessor)) {
      survivor.predecessor = merged.predecessor;
    }
    if (survivor.successor == null && merged.successor != null
      && merged.successor !== survivorId && !loserSet.has(merged.successor)) {
      survivor.successor = merged.successor;
    }
    if (!survivor.govId && merged.govId) survivor.govId = merged.govId;
    if (!survivor.govTypes && merged.govTypes) survivor.govTypes = merged.govTypes;

    // 3. Umhängung MELDEN statt ausführen: `event.hofId` zeigt auf einen Hof, der gleich
    //    verschwindet — der Aufrufer zieht das copy-on-write nach (ADR-v9-92). Bereits
    //    eingetragene Ziele mitziehen, falls in derselben Runde weitergemergt wird.
    remap.set(mergedId, survivorId);
    for (const [loser, target] of remap) {
      if (target === mergedId) remap.set(loser, survivorId);
    }

    // 4. Verlierer entfernen.
    hofs.delete(mergedId);
  }
  return remap;
}

/**
 * Gewinner-Heuristik (ADR-v9-45, wie v8 `_pickFarmWinner`): Verwendungszahl im Baum →
 * hat Koordinaten → hat Notiz → kleinste ID (deterministisch). Verwendung = Events mit
 * `ev.hofId === id` (der aufgelöste/gesetzte Link; `eventHofId` bräuchte einen Kontext,
 * die runtime-gesetzte `hofId` genügt und hält die Funktion kontextfrei).
 */
function pickHofWinner(ids: readonly HofId[], hofs: HofObjects, events: readonly Event[]): HofId {
  const usage = new Map<HofId, number>(ids.map((id) => [id, 0]));
  for (const ev of events) {
    if (ev.hofId != null && usage.has(ev.hofId)) usage.set(ev.hofId, usage.get(ev.hofId)! + 1);
  }
  return ids
    .slice()
    .sort((a, b) => {
      const ua = usage.get(a) ?? 0;
      const ub = usage.get(b) ?? 0;
      if (ub !== ua) return ub - ua;
      const ha = hofs.get(a);
      const hb = hofs.get(b);
      const ca = ha && ha.lat != null ? 1 : 0;
      const cb = hb && hb.lat != null ? 1 : 0;
      if (cb !== ca) return cb - ca;
      const na = ha && ha.note ? 1 : 0;
      const nb = hb && hb.note ? 1 : 0;
      if (nb !== na) return nb - na;
      return String(a).localeCompare(String(b));
    })[0];
}

/**
 * Automatischer Hof-Nachlauf nach Dorf-Merge (ADR-v9-45 Nachtrag). Gruppiert die Höfe unter
 * `villageId` per Union-Find über gemeinsame normalisierte Adress-Schlüssel (exakt die
 * Bedingung, unter der `findByAddr` mehrdeutig würde) und konsolidiert jede Gruppe ≥2
 * verlustfrei via `mergeHofObjects`. Gibt die Anzahl zusammengeführter Verlierer-Höfe zurück.
 */
function reconcileHofsUnderVillage(
  hofs: HofObjects,
  villageId: PlaceId,
  events: readonly Event[],
  thawed: Set<HofId>,
  remap: Map<HofId, HofId>,
): number {
  const inVillage = [...hofs.values()].filter((h) => h.villageId === villageId);
  if (inVillage.length < 2) return 0;

  const parent = new Map<HofId, HofId>();
  for (const h of inVillage) parent.set(h.id, h.id);
  const find = (x: HofId): HofId => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  const union = (a: HofId, b: HofId): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const byKey = new Map<string, HofId[]>();
  for (const h of inVillage) {
    const seen = new Set<string>();
    for (const a of h.addrs) {
      const k = normHofAddr(a.value);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      const arr = byKey.get(k);
      if (arr) arr.push(h.id);
      else byKey.set(k, [h.id]);
    }
  }
  for (const ids of byKey.values()) for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);

  const clusters = new Map<HofId, HofId[]>();
  for (const h of inVillage) {
    const root = find(h.id);
    const arr = clusters.get(root);
    if (arr) arr.push(h.id);
    else clusters.set(root, [h.id]);
  }

  let merged = 0;
  for (const ids of clusters.values()) {
    if (ids.length < 2) continue;
    const winner = pickHofWinner(ids, hofs, events);
    const clusterLosers = ids.filter((x) => x !== winner);
    mergeHofObjects(hofs, winner, clusterLosers, thawed, remap);
    merged += clusterLosers.length;
  }
  return merged;
}
