// core/interop/gramps-places.ts — GRAMPS-Orts-/Hof-Projektion (BL-143, ADR-v9-114 D3, Stufe 5).
//
// GRAMPS hält Orte als Top-Level-Records (`<places><placeobj>`), von Events per `<place hlink>`
// referenziert. BL-140/141 zog daraus nur den ptitle-STRING (`event.place`); BL-143 projiziert
// die VOLLE Struktur ins Modell, damit GRAMPS-Orte editierbar sind statt nur durchzulaufen:
//
//   <placeobj type>          → PlaceObject.type          (Verwaltungsebene, NIE „Building")
//   <ptitle>                 → PlaceObject.title
//   <pname value=… >         → PlaceObject.pnames[]      (datierbare Namensvarianten)
//   <coord lat= long= >      → PlaceObject.lat/long      (String mit Himmelsrichtung → Zahl)
//   <placeref hlink= >-Kette → PlaceObject.enclosedBy[]  (datierbare Verwaltungs-Zugehörigkeit)
//   <placeobj type="Building"> → HofObject               (Hof-Sonderfall, Spec 11 §7)
//
// Deterministische Aufteilung nach `type="Building"` (Spec 11 §7): Building-placeobjs werden
// zu Höfen (eigene Entität), alles andere zu PlaceObjects. Die `id` eines PlaceObject IST die
// GRAMPS-`id` (P0000) — sie ist damit direkt der Write-Back-Schlüssel (kein Fidelity-Feld
// nötig). Ein Hof behält seine deterministische `_hof_…`-id (formatunabhängige Identität) und
// merkt sich die placeobj-`id` im optionalen `grampsId`-Feld (Roundtrip-Fidelity).
//
// Reine Funktionen, DOM-/Plattform-frei (INV-ARCH-1).

import type { DatedName, DatedRef, HofObject, PlaceObject } from '../places/types';
import type { HofObjects } from '../places/types';
import type { PlaceId } from '../model/types';
import { makeHofId } from '../places/hof-id';
import { normHofAddr } from '../places/normalize';
import type { XmlNode } from './xml-tree';
import { attr, childrenByTag, firstChild } from './xml-tree';
import { parseCoord } from './gedcom-parse';
import { grampsDateOf } from './gramps-date';

/**
 * Datiertes Sub-Element (`<pname>`/`<placeref>`) → { from, to, dateRaw }. GRAMPS hängt eine
 * optionale Datums-Choice unter das Element (`<dateval type="from">`, `<daterange>`); wir
 * projizieren sie über denselben `grampsDateOf` wie bei Events und ziehen die Jahre. `dateRaw`
 * bewahrt die GEDCOM-Projektion des Datums (Anzeige-Konsistenz mit dem übrigen Modell) — die
 * BYTE-Treue des Original-Elements trägt ohnehin der Passthrough-Baum (unveränderter Knoten).
 */
function datedOf(node: XmlNode): { from: number | null; to: number | null; dateRaw: string | null } {
  const d = grampsDateOf(node);
  const raw = d.date;
  if (!raw) return { from: null, to: null, dateRaw: null };
  // „FROM a TO b" / „BET a AND b": erstes Jahr = from, zweites = to; sonst Punktdatum.
  const years = raw.match(/\d{3,4}/g)?.map((y) => parseInt(y, 10)) ?? [];
  const from = years[0] ?? null;
  const to = years.length > 1 ? years[years.length - 1] : null;
  return { from, to, dateRaw: raw };
}

/** `<pname>` → DatedName (value + optionale Datierung). `lang` bleibt am Knoten (Passthrough). */
function projectPname(node: XmlNode): DatedName {
  return { value: attr(node, 'value'), ...datedOf(node) };
}

/** `<coord lat long>` (Strings `N52.15`/`E7.33`) → { lat, long } als Zahlen, oder beide null. */
function projectCoord(node: XmlNode): { lat: number | null; long: number | null } {
  const coord = firstChild(node, 'coord');
  if (!coord) return { lat: null, long: null };
  return { lat: parseCoord(attr(coord, 'lat')), long: parseCoord(attr(coord, 'long')) };
}

/** Ein Verwaltungs-`<placeobj>` (NICHT Building) → PlaceObject. `resolveRefId`: handle→id. */
export function projectPlaceobj(node: XmlNode, resolveRefId: (h: string) => string): PlaceObject {
  const { lat, long } = projectCoord(node);
  const enclosedBy: DatedRef[] = childrenByTag(node, 'placeref').map((pr) => ({
    placeId: resolveRefId(attr(pr, 'hlink')),
    ...datedOf(pr),
  }));
  return {
    id: attr(node, 'id') || attr(node, 'handle'),
    title: firstChild(node, 'ptitle')?.text ?? '',
    shortName: '', // App-privat, nicht aus GRAMPS (ADR-v9-90).
    type: attr(node, 'type'),
    pnames: childrenByTag(node, 'pname').map(projectPname),
    // App-privat, nicht aus GRAMPS (BL-59, analog shortName) — die GRAMPS-`<pname lang>`
    // bleibt Passthrough am Knoten; die Sprachachse wird in der App kuratiert, nicht aus
    // dem Wire geraten (sonst Roundtrip-/Semantik-Drift).
    translations: [],
    enclosedBy,
    lat,
    long,
    note: '',
    existsFrom: null,
    existsTo: null,
    govId: null,
    govTypes: null,
  };
}

/**
 * Ein `<placeobj type="Building">` → HofObject (Spec 11 §7). Das enthaltende Dorf ist die
 * erste `<placeref>`-Kette (→ villageId per handle→id); die Adresse ist ptitle bzw. der erste
 * pname. Die HofId bleibt deterministisch (`_hof_<addrSlug>_<villageSlug>`, kollisionsfrei
 * gegen `existing`); die placeobj-`id` wird als `grampsId`-Fidelity gemerkt.
 */
export function projectBuildingHof(
  node: XmlNode,
  resolveRefId: (h: string) => string,
  existing: HofObjects,
): HofObject {
  const grampsId = attr(node, 'id') || attr(node, 'handle');
  const refs = childrenByTag(node, 'placeref');
  const villageId: PlaceId = refs.length ? resolveRefId(attr(refs[0], 'hlink')) : '';
  const ptitle = firstChild(node, 'ptitle')?.text ?? '';
  const firstName = firstChild(node, 'pname');
  const addr = ptitle || (firstName ? attr(firstName, 'value') : '');
  const { lat, long } = projectCoord(node);
  const id = makeHofId(normHofAddr(addr) || grampsId, villageId, existing);
  return {
    id,
    villageId,
    addrs: [{ value: addr, lang: 'deu', from: null, to: null, dateRaw: null }],
    lat,
    long,
    note: '',
    existsFrom: null,
    existsTo: null,
    predecessor: null,
    successor: null,
    govId: null,
    govTypes: null,
    schemaVersion: 1,
    grampsId,
  };
}

export interface GrampsPlaces {
  placeObjects: Map<PlaceId, PlaceObject>;
  hofObjects: HofObjects;
  /**
   * placeobj-Datei-Handle → wohin ein `<place hlink>` bindet. Ein Verwaltungs-placeobj bindet
   * `placeId`; ein Building bindet `hofId` UND `placeId` (= das umschließende Dorf) — genau die
   * Dual-Bindung, die `resolveEvents` bei Hof-Auflösung erzeugt. Ohne das gesetzte Dorf sähe
   * der Village-Seed den Building-ptitle als unaufgelösten Ort und legte ihn spurios an.
   */
  linkByHandle: Map<string, { placeId?: PlaceId; hofId?: string }>;
}

/**
 * Projiziert die ganze `<places>`-Sektion: Verwaltungs-placeobjs → placeObjects, Building →
 * hofObjects, plus ein handle→{placeId|hofId}-Index für die Event-Bindung (`<place hlink>`).
 * Reine Funktion — `resolveRefId` (handle→id, aus `buildRefIndex`) löst die placeref-/village-
 * Verweise auf Modell-ids auf.
 */
export function projectPlaces(root: XmlNode, resolveRefId: (h: string) => string): GrampsPlaces {
  const placeObjects = new Map<PlaceId, PlaceObject>();
  const hofObjects: HofObjects = new Map();
  const linkByHandle = new Map<string, { placeId?: PlaceId; hofId?: string }>();
  const sec = firstChild(root, 'places');
  if (!sec) return { placeObjects, hofObjects, linkByHandle };
  for (const node of childrenByTag(sec, 'placeobj')) {
    const handle = attr(node, 'handle');
    if (attr(node, 'type') === 'Building') {
      const hof = projectBuildingHof(node, resolveRefId, hofObjects);
      hofObjects.set(hof.id, hof);
      if (handle) linkByHandle.set(handle, { hofId: hof.id, placeId: hof.villageId || undefined });
    } else {
      const po = projectPlaceobj(node, resolveRefId);
      placeObjects.set(po.id, po);
      if (handle) linkByHandle.set(handle, { placeId: po.id });
    }
  }
  return { placeObjects, hofObjects, linkByHandle };
}
