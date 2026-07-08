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
import { normPlaceName } from './normalize';

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
 * Kommando: Dubletten-Merge (Spec 20 §1.7 [K] „Dubletten-Merge, verlustfrei"). Führt das
 * PlaceObject `mergedId` in `survivorId` zusammen und entfernt `mergedId`. VERLUSTFREI:
 * Titel + `pnames` des zusammengeführten Orts überleben als Namensvarianten (dedupliziert
 * über die Norm-Form); fehlende Koordinaten/Notiz/Typ/Metadaten des Überlebenden werden
 * gefüllt; `enclosedBy` wird vereinigt. Alle Fremd-Referenzen werden umgehängt: andere
 * `PlaceObjects.enclosedBy` und alle `HofObjects.villageId`, die auf `mergedId` zeigten,
 * verweisen danach auf `survivorId`. `event.placeId` ist runtime-only (Spec 11 §2) und wird
 * beim nächsten `resolveEvents()` neu abgeleitet — hier nichts zu tun.
 * Mutiert die beiden übergebenen Maps in place (analog `addChildToFamily` in
 * `core/model/integrity.ts`). No-Op bei gleicher ID oder fehlendem Ort.
 */
export function mergePlaceObjects(
  places: PlaceObjects,
  hofObjects: HofObjects,
  survivorId: PlaceId,
  mergedId: PlaceId,
): void {
  if (survivorId === mergedId) return;
  const survivor = places.get(survivorId);
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
  for (const pl of places.values()) {
    if (pl.id === mergedId) continue;
    for (const e of pl.enclosedBy) if (e.placeId === mergedId) e.placeId = survivorId;
  }
  // 5. HofObjects.villageId umhängen.
  for (const h of hofObjects.values()) {
    if (h.villageId === mergedId) h.villageId = survivorId;
  }

  // 6. Zusammengeführten Ort entfernen.
  places.delete(mergedId);
}
