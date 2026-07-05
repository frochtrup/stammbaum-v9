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
