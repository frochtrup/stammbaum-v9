// core/places/curation.ts — Kurations-Layer für orte.json (Spec 11 §9, ADR-v9-44/45/46).
//
// REINE, DETERMINISTISCHE, headless testbare Kern-Funktionen (INV-ARCH-1/2, TST-3):
//   - isEnrichedPlace / isEnrichedHof (§9.1) — Anzeige-Prädikat „weicht das Objekt vom
//     Seed-/Bootstrap-Rohzustand ab?". KEIN Schreibgate (orte.json wird ungefiltert
//     persistiert, ADR-v9-44), KEIN persistiertes Feld (würde veralten — LP-5 eine Ebene
//     tiefer: aus vorhandenen Feldern berechnet).
//   - hasReference (§9.3) — löst mind. ein Event der geladenen Datei via Chokepoints auf id auf?
//   - findPlaceDuplicates (§9.2) — Union-Find-Dubletten-Finder, kind-abhängig.
import type { Event, PlaceId, HofId } from '../model/types';
import type { PlaceObject, HofObject, PlaceObjects, HofObjects } from './types';
import type { PlaceContext } from './build-plac';
import { eventPlaceId, eventHofId } from './chokepoints';
import { makePlaceRegistry } from './place-registry';
import { normPlaceName, normHofAddr } from './normalize';
import { parentsCompatible } from './seed';

// ---------------------------------------------------------------------------
// §9.1 Anreicherungs-Prädikat (ADR-v9-44)
// ---------------------------------------------------------------------------

/**
 * `false` genau dann, wenn `po` bit-identisch dem `makeSeededPlace`-Rohzustand entspricht
 * (Spec 11 §9.1): `type=''`, `pnames=[]`, höchstens EIN undatiertes `enclosedBy`, keine
 * Koordinaten/Notiz/Existenz-Spanne/GOV/Typ. Jede Abweichung → angereichert.
 *
 * Hinweis zum enclosedBy-Zählstand: `makeSeededPlace` erzeugt bei einem Top-Level-Ort ohne
 * Elter `enclosedBy=[]` (Länder aus reinem PLAC-Seed) und sonst genau EINEN undatierten
 * Eintrag — beide Formen sind plain. Der Spec-Text §9.1 nennt nur den häufigeren 1-Eintrag-Fall;
 * die 0-Eintrag-Form folgt direkt aus dem echten Seed-Code (`core/places/seed.ts`) und muss
 * ebenfalls plain sein, sonst würde jedes geseedete Land fälschlich als „angereichert" gelten.
 */
export function isEnrichedPlace(po: PlaceObject): boolean {
  if (po.type !== '') return true;
  if (po.pnames.length !== 0) return true;
  if (po.enclosedBy.length > 1) return true;
  if (po.enclosedBy.length === 1) {
    const e = po.enclosedBy[0];
    if (e.from !== null || e.to !== null) return true;
  }
  if (po.lat !== null || po.long !== null) return true;
  if (po.note !== '') return true;
  if (po.existsFrom !== null || po.existsTo !== null) return true;
  if (po.govId !== null || po.govTypes !== null) return true;
  return false;
}

/**
 * `false` genau dann, wenn `hof` bit-identisch dem `findOrCreateHof`-Bootstrap-Rohzustand
 * entspricht (Spec 11 §9.1): genau EINE undatierte `addrs`-Zeile, keine
 * Koordinaten/Notiz/Existenz-Spanne/Lebenszyklus-Verweise/GOV. Jede Abweichung → angereichert.
 */
export function isEnrichedHof(hof: HofObject): boolean {
  if (hof.addrs.length !== 1) return true;
  const a = hof.addrs[0];
  if (a.from !== null || a.to !== null) return true;
  if (hof.lat !== null || hof.long !== null) return true;
  if (hof.note !== '') return true;
  if (hof.existsFrom !== null || hof.existsTo !== null) return true;
  if (hof.predecessor !== null || hof.successor !== null) return true;
  if (hof.govId !== null || hof.govTypes !== null) return true;
  return false;
}

// ---------------------------------------------------------------------------
// §9.3 Referenz-Sichtbarkeit (ADR-v9-46)
// ---------------------------------------------------------------------------

/**
 * Reine Funktion (Spec 11 §9.3): löst mindestens ein Event der aktuell geladenen Datei via
 * `eventPlaceId`/`eventHofId` (Chokepoints, §5) auf `id` auf? Steuert die Trennung
 * referenziert / „Ohne Bezug" in der Orte-/Höfe-Liste ([20 §1.7/§1.8]) — kein zusätzlicher
 * persistierter Zustand, keine automatische Löschung.
 */
export function hasReference(id: PlaceId | HofId, events: readonly Event[], ctx: PlaceContext): boolean {
  for (const e of events) {
    if (eventPlaceId(e, ctx) === id) return true;
    if (eventHofId(e, ctx) === id) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// §9.2 Massen-Dedup (ADR-v9-45)
// ---------------------------------------------------------------------------

export type DedupKind = 'places' | 'farms' | 'all';

/**
 * Eine Kandidatengruppe (≥2 Mitglieder) wahrscheinlicher Dubletten.
 * `conflict` (nur bei Places, ADR-v9-50/Spec 11 §8 Restklasse 3): mindestens ein Mitglieder-
 * Paar hat WIDERSPRÜCHLICHE Elternketten (nicht `parentsCompatible`) — die Gruppe kam nur
 * zustande, weil Kriterium 4 (gleicher Name + mind. ein gemeinsamer Vorfahre irgendwo in
 * beiden Ketten) sie verbunden hat, nicht weil alle Mitglieder wechselseitig verträglich
 * wären. UI MUSS in diesem Fall die volle Namenskette zeigen (nicht nur den bloßen Titel)
 * und darf KEINEN Gewinner vorauswählen, ohne dass der Nutzer die abweichende Herkunft
 * gesehen hat — die Zusammenführung bleibt eine bewusste menschliche Entscheidung.
 */
export interface DuplicateGroup {
  ids: (PlaceId | HofId)[];
  conflict?: boolean;
}

const EARTH_R_KM = 6371;

/** Haversine-Distanz zweier Koordinatenpaare in km. */
function distKm(aLat: number, aLong: number, bLat: number, bLong: number): number {
  const rad = (d: number): number => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLong - aLong);
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R_KM * Math.asin(Math.min(1, Math.sqrt(x)));
}

/** Kleine, deterministische Union-Find-Struktur über String-IDs. */
function makeUnionFind(ids: readonly string[]): { find: (x: string) => string; union: (a: string, b: string) => void } {
  const parent = new Map<string, string>();
  for (const id of ids) parent.set(id, id);
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    // Pfad-Kompression
    let c = x;
    while (parent.get(c) !== r) {
      const next = parent.get(c)!;
      parent.set(c, r);
      c = next;
    }
    return r;
  };
  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  return { find, union };
}

/**
 * Findet Kandidatengruppen wahrscheinlicher Dubletten (Spec 11 §9.2, reine Funktion).
 * `items` ist `placeObjects` für `kind ∈ {'places','all'}`, `hofObjects` für `kind='farms'`.
 *
 * Drei Kriterien (Union-Find), kind-abhängig:
 *   1. Verträglichkeits-Key-Kollision —
 *      Places: gleicher normalisierter Leitname (title/pnames) UND verträgliche Elternketten
 *              (ADR-v9-29, NICHT roher Fold-Key — Oldenburg/NS ≠ Oldenburg/USA).
 *      Farms:  gleiche normalisierte Adresse (Konvention α, §4.4) UND gleiches villageId.
 *   2. Koordinaten-Nähe (≤ toleranceKm) bei gleichem Name-Fold — alle kind.
 *   3. Bare↔reich Cross-Achse — NUR Places: plain PO ohne enclosedBy/pnames mit Komma-Titel
 *      gegen reiches PO, dessen Titel dem Leitsegment entspricht. Bei Farms übersprungen.
 *
 * Deterministisch: Gruppen- und Mitglieder-Reihenfolge folgen der Map-Iterationsordnung.
 */
export function findPlaceDuplicates(items: PlaceObjects, kind: 'places' | 'all', toleranceKm?: number): DuplicateGroup[];
export function findPlaceDuplicates(items: HofObjects, kind: 'farms', toleranceKm?: number): DuplicateGroup[];
export function findPlaceDuplicates(
  items: PlaceObjects | HofObjects,
  kind: DedupKind,
  toleranceKm = 1,
): DuplicateGroup[] {
  return kind === 'farms'
    ? findHofDuplicates(items as HofObjects, toleranceKm)
    : findPlaceObjectDuplicates(items as PlaceObjects, kind, toleranceKm);
}

/** Sammelt die Cluster (≥2) einer Union-Find über die gegebene Iterationsordnung. */
function collectGroups(order: readonly string[], find: (x: string) => string): DuplicateGroup[] {
  const clusters = new Map<string, string[]>();
  for (const id of order) {
    const root = find(id);
    const arr = clusters.get(root);
    if (arr) arr.push(id);
    else clusters.set(root, [id]);
  }
  const out: DuplicateGroup[] = [];
  for (const members of clusters.values()) if (members.length >= 2) out.push({ ids: members });
  return out;
}

function findPlaceObjectDuplicates(
  places: PlaceObjects,
  kind: 'places' | 'all',
  toleranceKm: number,
): DuplicateGroup[] {
  // 'places' schließt (defensiv) Farm/Building-Typen aus — v9-PlaceObjects tragen diese Typen
  // nie (Höfe sind separate Entität), der Filter ist damit i. d. R. no-op. 'all' nimmt alles.
  const inScope = (po: PlaceObject): boolean =>
    kind === 'all' || (po.type !== 'Farm' && po.type !== 'Building');
  const entries = [...places.values()].filter(inScope);
  const order = entries.map((p) => p.id);
  const { find, union } = makeUnionFind(order);

  const reg = makePlaceRegistry(places);
  const parentsNorm = (id: PlaceId): string[] =>
    reg.enclosureChainAsOf(id, null).slice(1).map(normPlaceName);

  // Kriterium 1: Name-Fold (title + pnames) gruppieren, dann paarweise NUR bei verträglichen
  // Elternketten unieren (ADR-v9-29-Guard statt rohem Fold-Key-Vergleich).
  const byName = new Map<string, PlaceId[]>();
  for (const po of entries) {
    const keys = new Set<string>();
    const t = normPlaceName(po.title);
    if (t) keys.add(t);
    for (const pn of po.pnames) {
      const k = normPlaceName(pn.value);
      if (k) keys.add(k);
    }
    for (const k of keys) {
      const arr = byName.get(k);
      if (arr) arr.push(po.id);
      else byName.set(k, [po.id]);
    }
  }
  for (const ids of byName.values()) {
    if (ids.length < 2) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        if (find(ids[i]) === find(ids[j])) continue;
        if (parentsCompatible(parentsNorm(ids[i]), parentsNorm(ids[j]))) union(ids[i], ids[j]);
      }
    }
  }

  // Kriterium 2: Koordinaten-Nähe (≤ toleranceKm) bei gleichem Titel-Fold. Fängt gleichnamige
  // Orte, die Kriterium 1 wegen unverträglicher Eltern übersprungen hat, aber physisch identisch
  // sind (Koordinaten beweisen es).
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];
      if (find(a.id) === find(b.id)) continue;
      if (a.lat == null || a.long == null || b.lat == null || b.long == null) continue;
      if (normPlaceName(a.title) !== normPlaceName(b.title)) continue;
      if (distKm(a.lat, a.long, b.lat, b.long) <= toleranceKm) union(a.id, b.id);
    }
  }

  // Kriterium 3 (bare↔reich Cross-Achse): plain PO ohne enclosedBy mit Komma-Titel gegen ein
  // reiches PO (mit enclosedBy), dessen Titel dem Leitsegment des Komma-Titels entspricht.
  for (const bare of entries) {
    if (bare.enclosedBy.length) continue;
    if (!bare.title.includes(',')) continue;
    const lead = bare.title.split(',').map((s) => s.trim()).find(Boolean) ?? '';
    const leadKey = normPlaceName(lead);
    if (!leadKey) continue;
    for (const rich of entries) {
      if (rich.id === bare.id) continue;
      if (find(rich.id) === find(bare.id)) continue;
      if (!rich.enclosedBy.length) continue;
      if (normPlaceName(rich.title) === leadKey) {
        union(bare.id, rich.id);
        break;
      }
    }
  }

  // Kriterium 4 (NEU, ADR-v9-50 — Spec 11 §8 Restklasse 3 „Arpke"): gleicher Name, Eltern
  // WIDERSPRÜCHLICH (Kriterium 1 hat übersprungen), aber die Ketten teilen irgendwo
  // mindestens einen gemeinsamen Vorfahren (z. B. dieselbe Region/dasselbe Land trotz
  // abweichender unmittelbarer Zugehörigkeit — Gebiets-/Kreisreform, uneinheitliche
  // Quellenkonvention, real derselbe Ort). Wird als CONFLICT-Kandidat gruppiert (Flag unten),
  // NIE automatisch vorausgewählt — der Nutzer entscheidet mit voller Namenskette sichtbar.
  // Völlig FREMDE Ketten (kein gemeinsamer Vorfahre auf irgendeiner Ebene, z. B.
  // verschiedene Länder — Oldenburg/Niedersachsen vs. Oldenburg/USA) bleiben unverändert
  // ausgeschlossen: das schützt den ADR-v9-29-Zweck exakt wie zuvor (s. Test-Guard).
  for (const ids of byName.values()) {
    if (ids.length < 2) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        if (find(ids[i]) === find(ids[j])) continue;
        const pa = parentsNorm(ids[i]);
        const pb = parentsNorm(ids[j]);
        if (pa.length === 0 || pb.length === 0) continue; // schon durch Kriterium 1 abgedeckt
        if (pa.some((x) => pb.includes(x))) union(ids[i], ids[j]);
      }
    }
  }

  const groups = collectGroups(order, find);
  // Conflict-Flag post-hoc je Gruppe: gibt es IRGENDEIN Mitglieder-Paar mit unverträglichen
  // Elternketten, kam die Gruppe nur durch Kriterium 2/4 (nicht durch strikte Kriterium-1-
  // Verträglichkeit) zustande — UI muss das sichtbar machen (volle Namenskette, kein Auto-Winner).
  for (const g of groups) {
    const pids = g.ids as PlaceId[];
    outer: for (let i = 0; i < pids.length; i++) {
      for (let j = i + 1; j < pids.length; j++) {
        if (!parentsCompatible(parentsNorm(pids[i]), parentsNorm(pids[j]))) {
          g.conflict = true;
          break outer;
        }
      }
    }
  }
  return groups;
}

/** Alle normalisierten Adress-Schlüssel eines Hofs (Read-Tolerance nutzt der Resolver separat). */
function hofAddrKeys(h: HofObject): Set<string> {
  const keys = new Set<string>();
  for (const a of h.addrs) {
    const k = normHofAddr(a.value);
    if (k) keys.add(k);
  }
  return keys;
}

function findHofDuplicates(hofs: HofObjects, toleranceKm: number): DuplicateGroup[] {
  const entries = [...hofs.values()];
  const order = entries.map((h) => h.id);
  const { find, union } = makeUnionFind(order);

  // Kriterium 1: gleiche normalisierte Adresse (irgendeine addrs-Zeile) UND gleiches villageId.
  // Der Schlüssel bindet das Dorf ein — Hof-Identität ist dorf-scoped (§4.4, §9.2).
  const byKey = new Map<string, HofId[]>();
  for (const h of entries) {
    for (const k of hofAddrKeys(h)) {
      const scoped = `${h.villageId} ${k}`;
      const arr = byKey.get(scoped);
      if (arr) arr.push(h.id);
      else byKey.set(scoped, [h.id]);
    }
  }
  for (const ids of byKey.values()) for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);

  // Kriterium 2: Koordinaten-Nähe bei gleichem Adress-Fold (Kriterium 3 bare↔reich entfällt für Höfe).
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];
      if (find(a.id) === find(b.id)) continue;
      if (a.lat == null || a.long == null || b.lat == null || b.long == null) continue;
      if (a.villageId !== b.villageId) continue; // dorf-scoped
      const ka = hofAddrKeys(a);
      const shared = [...hofAddrKeys(b)].some((k) => ka.has(k));
      if (!shared) continue;
      if (distKm(a.lat, a.long, b.lat, b.long) <= toleranceKm) union(a.id, b.id);
    }
  }

  return collectGroups(order, find);
}
