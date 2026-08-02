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
import type { HofObject, HofObjects, PlaceObjects, Year } from './types';
import { makePlaceRegistry, chainCompatibleAnyPath } from './place-registry';
import { makeHofRegistry } from './hof-registry';
import { buildFormString, eventYear, type PlaceContext } from './build-plac';
import { findOrCreateHof } from './hof-id';
import { normPlaceName, extractHofAddr, normHofAddr } from './normalize';

/**
 * Event-Typen, für die ein Hof-Bootstrap überhaupt erlaubt ist (Spec 11 §4.2).
 *
 * Nur WOHN-/BESITZ-semantische Typen: eine Arbeitsstätte ist in der Regel kein Hof.
 * `OCCU` band bis 2026-07-28 ebenfalls einen Hof und erzeugte damit Phantom-Höfe aus
 * Orts-/Stadtangaben von Berufsereignissen (gemessen an Realdaten: „Berkeley/Kalifornien",
 * „Rothenburg/Oberlausitz", „Linden/Hannover") — bewusst entfernt (ADR-v9-143). CENS
 * (Volkszählung) erfasst dagegen den Wohnort und bleibt drin.
 *
 * Diese Menge ist zugleich die „Wohn-Semantik" für die Geo-Regeln (HOF_NO_COORD/HOF_FAR):
 * seit der OCCU-Entfernung ist jeder Hof-bindende Typ auch wohn-relevant, deshalb liest
 * `core/validate/context.ts::hofsWithResidence` direkt DIESE Konstante (eine Quelle).
 */
export const HOF_EVENT_TYPES = new Set(['RESI', 'PROP', 'CENS']);

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

export type ReviewClass = 'A' | 'C' | 'D' | 'P';

export interface ReviewItem {
  /** Index des Events in der Eingabeliste (stabile Referenz). */
  index: number;
  klass: ReviewClass;
  addr: string;
  eventType: string;
  /** Mehrdeutige Kandidaten: Höfe bei Klasse C, PlaceObjects bei Klasse P. */
  candidates: (HofId | PlaceId)[];
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

/**
 * Segmentiert einen PLAC-String in getrimmte, NICHT-LEERE Komma-Segmente. Leere Segmente
 * (führend, innen oder abschließend, z. B. `, Ochtrup, , , NRW, Deutschland` — Ancestris/
 * MyHeritage schreiben Fixed-Template-PLAC mit Leerfeldern auf nicht belegten Ebenen)
 * bedeuten „keine Angabe auf dieser Ebene" und werden verworfen — das Leitsegment ist der
 * erste NICHT-leere Wert, nicht positionsstarr segs[0]. Ohne diese Filterung würde ein
 * führendes Leerfeld leadSeg='' erzeugen und das Event bliebe unaufgelöst (Symptom 2).
 * KONSISTENT zum Seed-Vorpass (`seed.ts::segments`), der bereits so filtert — sonst
 * schattet der Seed die Auflösung (unterschiedliche Segment-Sicht).
 */
function placSegments(plac: string): string[] {
  return plac.split(',').map((s) => s.trim()).filter(Boolean);
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
 * Konsistenz-Guard (ADR-v9-29, §4.2): Ist die modellierte Elternkette des Kandidaten mit
 * den PLAC-Folgesegmenten verträglich? Verträglich = an jeder gemeinsamen Position gleich
 * (eine Kette ist Präfix der anderen; fehlende Eltern sind kein Widerspruch). Ein
 * widersprechender Elter (`Oldenburg, USA` vs. modellierte Kette `Niedersachsen`) macht den
 * Kandidaten unverträglich → kein Match (verhindert stille Falschattribution).
 */
function chainCompatible(
  reg: PlaceContext['places'],
  candidateId: PlaceId,
  placParents: readonly string[],
  year: Year,
): boolean {
  // Knoten-ID-Kette, pro Knoten gegen die VOLLE Namensmenge (title + alle pnames) prüfen —
  // NICHT nur gegen den einen periodenkorrekten Namen: ein PLAC-Segment „Bayern" (Titel-Form)
  // ist mit dem Knoten kompatibel, dessen im Ereignisjahr gültiger Name „Königreich Bayern"
  // ist. Ein reiner Namensketten-Vergleich (title vs. pname) vetote hier fälschlich →
  // eindeutiges Ereignis kippte grundlos in Review-Klasse P (Bugfix 2026-07-12, ADR-v9-71).
  // Prefix-Semantik: nur die gemeinsame Länge zählt.
  //
  // EIN Pfad für datierte UND undatierte Ereignisse (ADR-v9-195). Bis dahin standen hier
  // zwei Zweige: der undatierte durchsuchte seit ADR-v9-72 ALLE `enclosedBy`-Ketten (ein
  // gemergter Ort trägt mehrere), der datierte lief weiter über die EINE Kette aus
  // `enclosureWinnerAsOf` — und damit bei undatierten Einträgen über `enclosedBy[0]`, genau
  // den Walk, den ADR-v9-72 abgeschafft hatte. Ergebnis: jeder Merge machte die datierten
  // Ereignisse seiner Verlierer unauflösbar (Review-Klasse P). `chainCompatibleAnyPath`
  // nimmt das Jahr jetzt selbst entgegen und bleibt periodentreu — die Zwei-Zweig-Struktur,
  // in der eine Hälfte nachgezogen werden konnte und die andere stehen blieb, entfällt.
  const stated = placParents.map(normPlaceName);
  return chainCompatibleAnyPath(reg.byId, candidateId, stated, year);
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
  ctx: PlaceContext,
): { resolved: ResolvedEvent; review: ReviewItem | null } {
  // ctx wird EINMAL je resolveEvents()-Lauf gebaut und hier nur gelesen. Die Hof-Registry
  // wird beim Bootstrap (Pfade C/B') über `ctx.hofs.indexHof()` fortgeschrieben — bis
  // ADR-v9-88 stand hier stattdessen ein vollständiger Neubau BEIDER Registries pro
  // Ereignis (O(events × (places + hofs)), gemessen 89 s bei 20.000 Personen). Die
  // Zusicherung, die den Neubau motivierte, gilt unverändert: ein während der Auflösung
  // entstandener Hof MUSS für alle folgenden Ereignisse auffindbar sein — dafür sorgt
  // jetzt die Fortschreibung. `places` ändert sich während des Laufs nicht (der
  // Village-Seed, Spec 11 §4.2 Schritt 0, läuft VOR resolveEvents), die Orts-Registry
  // ist also ohnehin über den ganzen Lauf konstant.
  const ev: Event = { ...input };
  const year = eventYear(ev);
  const type = ev.type;
  const hofTypeAllowed = HOF_EVENT_TYPES.has(type);
  let review: ReviewItem | null = null;

  const reproject = (path: ResolvePath): ResolvedEvent => {
    // KEINE PLAC-Reprojektion mehr im Ladepass (ADR-v9-197, BL-288). Bis dahin schrieb
    // dieser Schritt `ev.place` bei jedem Laden neu — und weil der Writer den Wert
    // anschließend in die Datei schreibt, änderte ein reines Öffnen-und-Speichern an
    // `Unsere Familie 2026.ged` **668 PLAC-Werte** an Ereignissen, die niemand angefasst
    // hatte. Eine byte-verändernde Projektion braucht einen user-induzierten Anlass;
    // Laden ist keiner.
    //
    // Die Reprojektion ist damit nicht abgeschafft, sondern VERLEGT (Lesart b): sie
    // gehört an den Kurationszeitpunkt und steht dort bereits — `linkEventToPlace`/
    // `linkEventToHof` (core/places/commands.ts), `renameHofAddrInEvents`/
    // `relinkHofVillageInEvents` (services/places/apply-resolution.ts). Alle vier sind
    // ausdrückliche Nutzerhandlungen mit Undo.
    //
    // Die ANZEIGE verliert dadurch nichts: sie projiziert ohnehin live aus `placeId`
    // (`eventPlaceLabel` → `buildFormString`), `ev.place` ist dort nur der Fallback für
    // ungebundene Ereignisse. Was der Nutzer sieht, bleibt periodengerecht; was in der
    // Datei steht, bleibt seine Quelle.
    // ev.addr NUR füllen wenn leer — Wire-ADDR bleibt byte-identisch (ADDR-Roundtrip).
    if (ev.hofId != null && !ev.addr) {
      const a = ctx.hofs.resolveAddrAsOf(ev.hofId, year);
      if (a) ev.addr = a;
    }
    return { event: ev, path };
  };

  // 1. Durchreich-REPROJECT — bereits gelinkt. AUSNAHME (BL-143): ein GRAMPS-nativ ans DORF
  //    gebundenes RESI/PROP-Event (placeId vom Parser aus `<place hlink>`) mit noch offener
  //    ADDR trägt seinen Hof NICHT — es fällt zu den ADDR-Hof-Pfaden B/B' durch (Dorf-Scope =
  //    ev.placeId). Das ist genau die Orthogonalität von Konvention 2 (PLAC=Dorf, ADDR=Hof,
  //    s. Schritt 3), nur ist das Dorf hier schon vom Parser gebunden statt aus Schritt 3.
  //    Die dazwischenliegenden PLAC→Dorf-Pfade 2–5 sind dann gegenstandslos (placeId != null
  //    ⇒ sie greifen ohnehin nicht) und werden übersprungen.
  const offenerAddrHof =
    ev.hofId == null && ev.placeId != null && ev.addr !== '' && hofTypeAllowed &&
    !isAddrJustVillage(ev.addr, ev.placeId, ctx);
  if (!offenerAddrHof && (ev.placeId != null || ev.hofId != null)) {
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
  //    `ev.placeId == null`-Guard (BL-143): bei nativ vorgebundenem Dorf (GRAMPS) NICHT das
  //    PLAC-Leitsegment als Hof deuten und die placeId überschreiben — der Hof kommt dort aus
  //    der ADDR (B/B'). Für den regulären Fluss ist der Guard ein No-op (Schritt 1 hätte bei
  //    gesetzter placeId längst returniert), er ändert nur den neuen Durchfall-Pfad.
  if (hofTypeAllowed && ev.placeId == null && isRich && leadSeg && anchorVillageId != null) {
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
  // 3a. atomare PLAC matcht placeObject. Bei ≥2 gleichnamigen POs mehrdeutig →
  //     Review-Klasse P (ADR-v9-29), kein stilles Raten auf den spezifischsten.
  if (ev.placeId == null && isAtomic && leadSeg) {
    const ids = ctx.places.findAllByName(leadSeg);
    if (ids.length === 1) {
      ev.placeId = ids[0];
      villageOnlyPath = 'atomic-po';
      if (!ev.addr) return { resolved: reproject('atomic-po'), review: null };
    } else if (ids.length >= 2 && !ev.addr) {
      review = { index, klass: 'P', addr: ev.addr ?? '', eventType: type, candidates: ids };
      return { resolved: reproject('none'), review };
    }
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
  // 3c/3c′. Hierarchie-PLAC → Dorf über Leitname, mit Konsistenz-Guard + Eltern-
  //   Disambiguierung (ADR-v9-29): ein eindeutiger Leitname genügt NICHT — die
  //   PLAC-Folgesegmente müssen mit der modellierten enclosureChain des Kandidaten
  //   verträglich sein (widersprechender Elter = Veto). Bei mehreren gleichnamigen
  //   Kandidaten gewinnt der eindeutig verträgliche (3c′). Sonst bleibt placeId null —
  //   die Rest-Mehrdeutigkeit wird als Review-Klasse P sichtbar (Slice 1.1c).
  if (ev.placeId == null && isRich && leadSeg) {
    const plsParents = segs.slice(1);
    const leadIds = ctx.places.findAllByName(leadSeg);
    const compatible = leadIds.filter((id) => chainCompatible(ctx.places, id, plsParents, year));
    if (compatible.length === 1) {
      ev.placeId = compatible[0];
      villageOnlyPath = 'hierarchy-lead';
      if (!ev.addr) return { resolved: reproject('hierarchy-lead'), review: null };
    } else if (leadIds.length >= 1 && !ev.addr) {
      // Guard-Veto (0 verträglich) ODER Mehrdeutigkeit (≥2 verträglich) → Ort mehrdeutig,
      //   Review-Klasse P (ADR-v9-29, §6). Nicht binden, kein stiller Guess.
      review = { index, klass: 'P', addr: ev.addr ?? '', eventType: type,
                 candidates: compatible.length ? compatible : leadIds };
      return { resolved: reproject('none'), review };
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
      if (res.created) {
        workingHofs.set(res.created.id, res.created);
        ctx.hofs.indexHof(res.created); // sofort sichtbar für alle folgenden Ereignisse
      }
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
        if (res.created) {
          workingHofs.set(res.created.id, res.created);
          ctx.hofs.indexHof(res.created); // sofort sichtbar für alle folgenden Ereignisse
        }
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

  // EIN Registry-Paar für den ganzen Lauf (ADR-v9-88). Die Hof-Registry indiziert
  // `workingHofs` und wird beim Bootstrap in `resolveOne` fortgeschrieben.
  const ctx: PlaceContext = {
    places: makePlaceRegistry(places),
    hofs: makeHofRegistry(workingHofs),
  };

  const out: ResolvedEvent[] = [];
  const review: ReviewItem[] = [];
  events.forEach((ev, index) => {
    const { resolved, review: r } = resolveOne(ev, index, workingHofs, ctx);
    out.push(resolved);
    if (r) review.push(r);
  });

  return { events: out, hofObjects: workingHofs, review };
}

/** Hilfs-Prädikat für Tests/UI: hat ein HofObject eine gültige Norm-Adresse? */
export function hofHasAddr(h: HofObject): boolean {
  return h.addrs.some((a) => normHofAddr(a.value) !== '');
}
