// core/places/resolve.ts — Identitätsauflösung Events → Orte/Höfe (Spec 11 §4).
//
// REINE, TOTALE, DETERMINISTISCHE Funktion (Spec 11 §4.1, TST-3):
//   (events, placeObjects, hofObjects) → (resolvedEvents, hofObjects', review)
// Kein Zustand, kein DOM/I/O/Wall-Clock. Gleiche Eingabe → gleiche Ausgabe.
// Das ist die Property-Test-Naht (fast-check).
//
// INV-PLACE (Spec 11 §3): am Ende JEDES Pfads läuft REPROJECT — bei gesetztem
// placeId/hofId ist ev.place ausschließlich buildPlacForGedcom(ev, year). Es gibt
// keinen Pfad ohne Reprojektion → Stale-Cache strukturell ausgeschlossen.
import type { Event, PlaceId, HofId } from '../model/types';
import type { HofObject, HofObjects, PlaceObjects } from './types';
import { makePlaceRegistry } from './place-registry';
import { makeHofRegistry } from './hof-registry';
import { buildPlacForGedcom, buildFormString, eventYear, type PlaceContext } from './build-plac';
import { findOrCreateHof } from './hof-id';
import { normPlaceName, extractHofAddr, normHofAddr } from './normalize';

/** Event-Typen, für die ein Hof-Bootstrap überhaupt erlaubt ist (Spec 11 §4.2). */
export const HOF_EVENT_TYPES = new Set(['RESI', 'PROP', 'CENS', 'OCCU']);

/** Wodurch ein Event aufgelöst wurde — für Konventions-Matrix-Tests (Spec 11 §4.3). */
export type ResolvePath =
  | 'reproject' // 1. bereits gelinkt
  | 'A' // PLAC-Leitsegment matcht Hof im Dorf
  | 'atomic-po' // 3a atomare PLAC → placeObject
  | 'hierarchy-exact' // 3b Hierarchie voll-projektions-exakt
  | 'hierarchy-lead' // 3c Leitname eindeutig + Anker
  | "A'" // atomare PLAC ohne PO → globaler Hof
  | 'C' // rich-PLAC ohne Hof → Bootstrap
  | 'B' // event.addr matcht Hof im Dorf
  | "B'" // event.addr ohne Hof + Hof-Typ → Bootstrap
  | 'none'; // nichts aufgelöst (→ evtl. Review)

export type ReviewClass = 'A' | 'C' | 'D';

export interface ReviewItem {
  /** Index des Events in der Eingabeliste (stabile Referenz). */
  index: number;
  klass: ReviewClass;
  addr: string;
  eventType: string;
  /** Kandidaten-Höfe bei Klasse C (mehrdeutig). */
  candidates: HofId[];
}

export interface ResolvedEvent {
  event: Event;
  path: ResolvePath;
}

export interface ResolveResult {
  events: ResolvedEvent[];
  /** hofObjects inkl. neu gebootstrappter Höfe (Bootstrap-Pfade C/B'). */
  hofObjects: HofObjects;
  review: ReviewItem[];
}

/** Segmentiert einen PLAC-String in getrimmte, nicht-leere Komma-Segmente. */
function placSegments(plac: string): string[] {
  return plac.split(',').map((s) => s.trim());
}

/**
 * Prüft, ob ADDR semantisch nur der Dorfname ist (ADDR=Village-Redundanz, Spec 11 §4.4):
 * manche Programme schreiben den Ortsnamen selbst in ADDR → kein Pseudo-Hof.
 * Konservativ: Match nur gegen Village-Titel + pnames.
 */
function isAddrJustVillage(addr: string, villageId: PlaceId | null, ctx: PlaceContext): boolean {
  if (!addr || villageId == null) return false;
  const pl = ctx.places.byId(villageId);
  if (!pl) return false;
  const clean = extractHofAddr(addr);
  if (!clean) return false;
  const addrNorm = normPlaceName(clean);
  if (pl.title && normPlaceName(pl.title) === addrNorm) return true;
  return pl.pnames.some((pn) => pn.value && normPlaceName(pn.value) === addrNorm);
}

/**
 * Auflösung EINES Events. Mutiert eine übergebene Arbeitskopie von hofObjects nur additiv
 * (Bootstrap). Gibt Pfad + optionalen Review-Eintrag zurück. Das Event wird als KOPIE
 * zurückgegeben (Eingabe bleibt unangetastet — reine Funktion).
 */
function resolveOne(
  input: Event,
  index: number,
  workingHofs: HofObjects,
  places: PlaceObjects,
): { resolved: ResolvedEvent; review: ReviewItem | null } {
  // Registries pro Event neu bauen — workingHofs wächst durch Bootstrap.
  const ctx: PlaceContext = {
    places: makePlaceRegistry(places),
    hofs: makeHofRegistry(workingHofs),
  };
  const ev: Event = { ...input };
  const year = eventYear(ev);
  const type = ev.type;
  const hofTypeAllowed = HOF_EVENT_TYPES.has(type);
  let review: ReviewItem | null = null;

  const reproject = (path: ResolvePath): ResolvedEvent => {
    // INV-PLACE: am Ende jedes Pfads. Bei gesetztem placeId/hofId ist ev.place
    // ausschließlich die periodengerechte Projektion.
    const rebuiltCtx: PlaceContext = {
      places: ctx.places,
      hofs: makeHofRegistry(workingHofs),
    };
    if (ev.hofId != null || ev.placeId != null) {
      const proj = buildPlacForGedcom(ev, year, rebuiltCtx);
      if (proj != null) ev.place = proj;
    }
    // ev.addr NUR füllen wenn leer — Wire-ADDR bleibt byte-identisch (ADDR-Roundtrip).
    if (ev.hofId != null && !ev.addr) {
      const a = rebuiltCtx.hofs.resolveAddrAsOf(ev.hofId, year);
      if (a) ev.addr = a;
    }
    return { event: ev, path };
  };

  // 1. Durchreich-REPROJECT — bereits gelinkt (GRAMPS-Parser / voriger Load).
  if (ev.placeId != null || ev.hofId != null) {
    return { resolved: reproject('reproject'), review: null };
  }

  const plac = ev.place ?? '';
  const segs = plac ? placSegments(plac) : [];
  const leadSeg = segs.length ? segs[0] : '';
  const isRich = segs.filter(Boolean).length > 1;
  const isAtomic = segs.filter(Boolean).length === 1;

  // Village-Anker: bester PO-Match für ein Hierarchie-Segment ab Position 1.
  const anchorVillageId = ((): PlaceId | null => {
    for (let i = 1; i < segs.length; i++) {
      const id = ctx.places.findByName(segs[i]);
      if (id) return id;
    }
    // atomares PLAC: das einzige Segment selbst könnte ein Dorf sein
    if (isAtomic && leadSeg) return ctx.places.findByName(leadSeg);
    return null;
  })();

  // 2. Pfad A — PLAC-Leitsegment matcht Hof im Dorf-Anker (existierender Hof).
  if (hofTypeAllowed && isRich && leadSeg && anchorVillageId != null) {
    const hid = ctx.hofs.findByAddr(leadSeg, year, anchorVillageId);
    if (hid != null) {
      ev.hofId = hid;
      ev.placeId = anchorVillageId;
      return { resolved: reproject('A'), review: null };
    }
  }

  // 3. Verwaltungs-Match. Setzt (nur) placeId. Wenn eine explizite ev.addr vorliegt
  //    (Konvention 2), wird das Dorf hier verankert, aber NICHT zurückgegeben — der
  //    Hof-Link läuft danach über Pfad B/B' (PLAC=Dorf, ADDR=Hof sind orthogonal,
  //    v8 _link: _placeLink ohne return, dann _tryHofAddrLink). Ohne ev.addr ist der
  //    Verwaltungs-Match die finale Auflösung.
  let villageOnlyPath: ResolvePath = 'none';
  // 3a. atomare PLAC matcht placeObject.
  if (isAtomic && leadSeg && ctx.places.findByName(leadSeg) != null) {
    ev.placeId = ctx.places.findByName(leadSeg);
    villageOnlyPath = 'atomic-po';
    if (!ev.addr) return { resolved: reproject('atomic-po'), review: null };
  }
  // 3b. Hierarchie-PLAC matcht voll-projektions-exakt.
  if (ev.placeId == null && isRich && anchorVillageId != null) {
    const proj = buildFormString(ctx.places, anchorVillageId, year);
    if (proj != null && normPlaceName(proj) === normPlaceName(plac)) {
      ev.placeId = anchorVillageId;
      villageOnlyPath = 'hierarchy-exact';
      if (!ev.addr) return { resolved: reproject('hierarchy-exact'), review: null };
    }
  }
  // 3c. Hierarchie-PLAC: Leitname eindeutig + Anker (Leitsegment als Dorf-Identität).
  if (ev.placeId == null && isRich && leadSeg) {
    const leadIds = ctx.places.findAllByName(leadSeg);
    if (leadIds.length === 1) {
      ev.placeId = leadIds[0];
      villageOnlyPath = 'hierarchy-lead';
      if (!ev.addr) return { resolved: reproject('hierarchy-lead'), review: null };
    }
  }

  // 4. Pfad A' — atomare PLAC ohne PO-Match → globaler Hof-Lookup.
  if (hofTypeAllowed && isAtomic && leadSeg && !ev.addr && ev.placeId == null) {
    const hid = ctx.hofs.findByAddr(leadSeg, year);
    if (hid != null) {
      const hof = ctx.hofs.byId(hid)!;
      ev.hofId = hid;
      ev.placeId = hof.villageId;
      return { resolved: reproject("A'"), review: null };
    }
  }

  // 5. Pfad C — rich-PLAC ohne aufgelöstes Dorf-Blatt → Bootstrap aus Komma-Hierarchie
  //    (Konvention 1: Leitsegment IST der Hof, segs[1..] das Dorf). Feuert nur, wenn
  //    Schritt 3 kein Dorf verankert hat (ev.placeId == null) — sonst ist das
  //    Leitsegment selbst das Dorf (Konvention 2), und der ADDR-Hof läuft über B/B'.
  if (hofTypeAllowed && ev.placeId == null && isRich && leadSeg && anchorVillageId != null) {
    const res = findOrCreateHof(leadSeg, anchorVillageId, workingHofs);
    if (res) {
      if (res.created) workingHofs.set(res.created.id, res.created);
      ev.hofId = res.hofId;
      ev.placeId = anchorVillageId;
      return { resolved: reproject('C'), review: null };
    }
  }

  // Dorf-Scope für ADDR-Pfade: bevorzugt das in Schritt 3 verankerte Dorf (ev.placeId).
  // Sonst der Hierarchie-Anker (segs[1..], das eigentliche Dorf bei Konvention 1
  // „Hof, Dorf, …"). Nur bei atomarem PLAC ohne Anker ist das Leitsegment das Dorf.
  const villageForAddr: PlaceId | null =
    ev.placeId ?? anchorVillageId ?? (leadSeg ? ctx.places.findByName(leadSeg) : null);

  // 6. Pfad B — event.addr matcht Hof im Dorf-Scope (existierender Hof).
  if (ev.addr && villageForAddr != null && !isAddrJustVillage(ev.addr, villageForAddr, ctx)) {
    const all = ctx.hofs.findAllByAddr(ev.addr, year, villageForAddr);
    if (all.length === 1) {
      ev.hofId = all[0];
      ev.placeId = villageForAddr;
      return { resolved: reproject('B'), review: null };
    }
    if (all.length > 1) {
      // ≥2 Höfe gleicher Adresse im Dorf → mehrdeutig (Review Klasse C).
      review = { index, klass: 'C', addr: ev.addr, eventType: type, candidates: all };
      return { resolved: reproject(ev.placeId != null ? villageOnlyPath : 'none'), review };
    }
  }

  // 7. Pfad B' — event.addr ohne Hof.
  if (ev.addr && villageForAddr != null && !isAddrJustVillage(ev.addr, villageForAddr, ctx)) {
    if (hofTypeAllowed) {
      // Hof-Typ → Bootstrap aus Event-Typ-Semantik.
      const res = findOrCreateHof(ev.addr, villageForAddr, workingHofs);
      if (res) {
        if (res.created) workingHofs.set(res.created.id, res.created);
        ev.hofId = res.hofId;
        ev.placeId = villageForAddr;
        return { resolved: reproject("B'"), review: null };
      }
    } else {
      // Non-Hof-Typ mit ADDR ohne Hof-Match → Review (Spec 11 §4.3/§6):
      //   Klasse D wenn im Dorf bereits Höfe existieren (Norm-Drift), sonst Klasse A.
      const hofsInVillage = ctx.hofs.byVillage(villageForAddr);
      const klass: ReviewClass = hofsInVillage.length > 0 ? 'D' : 'A';
      review = { index, klass, addr: ev.addr, eventType: type, candidates: [] };
      return { resolved: reproject(ev.placeId != null ? villageOnlyPath : 'none'), review };
    }
  }

  // Kein Hof-Pfad. Wenn Schritt 3 ein Dorf verankert hat, ist das die Auflösung
  // (village-only, z.B. Non-Hof-Event mit reichem PLAC). Sonst reines Durchreichen
  // ohne Link. REPROJECT läuft in beiden Fällen (No-Op ohne placeId/hofId) — kein
  // Pfad ohne Reprojektion (INV-PLACE).
  const path: ResolvePath = ev.placeId != null ? villageOnlyPath : 'none';
  return { resolved: reproject(path), review };
}

/**
 * Löst alle Events auf. REINE Funktion: die Eingabe-Sammlungen bleiben unangetastet,
 * eine Arbeitskopie von hofObjects nimmt Bootstraps auf und wird zurückgegeben.
 * Deterministisch: gleiche Eingabe → gleiche Ausgabe (Property-Naht).
 */
export function resolveEvents(
  events: readonly Event[],
  places: PlaceObjects,
  hofObjects: HofObjects,
): ResolveResult {
  const workingHofs: HofObjects = new Map();
  for (const [id, h] of hofObjects) workingHofs.set(id, h);

  const out: ResolvedEvent[] = [];
  const review: ReviewItem[] = [];
  events.forEach((ev, index) => {
    const { resolved, review: r } = resolveOne(ev, index, workingHofs, places);
    out.push(resolved);
    if (r) review.push(r);
  });

  return { events: out, hofObjects: workingHofs, review };
}

/** Hilfs-Prädikat für Tests/UI: hat ein HofObject eine gültige Norm-Adresse? */
export function hofHasAddr(h: HofObject): boolean {
  return h.addrs.some((a) => normHofAddr(a.value) !== '');
}
