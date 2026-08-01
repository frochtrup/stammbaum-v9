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
  return placeEnrichmentLevel(po) !== 'none';
}

/**
 * Anreicherungs-Grad (Spec 11 §9.1, ADR-v9-191): wie viel steht an diesem Objekt?
 *
 * Drei Stufen statt eines Ja/Nein, weil die Entscheidung, für die das Prädikat existiert
 * (welcher von zwei gleichnamigen Orten ist der gepflegte?), graduell ist: ein Ort, an dem
 * nur der Typ steht, ist etwas anderes als ein vollständig recherchierter, und binär
 * stehen beide in derselben Klasse.
 */
export type EnrichmentLevel = 'none' | 'sparse' | 'rich';

/**
 * Die sieben Facetten eines PlaceObject — je einmal gezählt, nicht je Eintrag: „hat
 * Namensvarianten" ist EIN Merkmal, egal ob eine oder zwölf. Zählt man Einträge, gewinnt
 * ein Ort mit acht Schreibvarianten gegen einen mit Typ, Koordinaten, Notiz und Historie.
 */
function placeFacetCount(po: PlaceObject): number {
  let n = 0;
  if (po.type !== '') n += 1;
  if (po.pnames.length !== 0) n += 1;
  // Zugehörigkeit zählt erst als Anreicherung, wenn sie ÜBER den Seed-Rohzustand hinausgeht:
  // ein einzelner undatierter Eintrag entsteht automatisch (Spec 11 §4.2 Schritt 0).
  if (po.enclosedBy.length > 1 || po.enclosedBy.some((e) => e.from !== null || e.to !== null)) n += 1;
  if (po.lat !== null || po.long !== null) n += 1;
  if (po.note !== '') n += 1;
  if (po.existsFrom !== null || po.existsTo !== null) n += 1;
  if (po.govId !== null || po.govTypes !== null) n += 1;
  return n;
}

/**
 * **Die Schwelle ist gemessen, nicht gewählt.** Facetten-Histogramm des Realbestands
 * (`Unsere Familie 2026.ged` + `orte.v9.json`, 310 Orte nach dem Laden):
 *
 * ```
 * Facetten  0    1   2   3    4    5    6    7
 * Orte    171   16  11   7   38   25   41    1
 * ```
 *
 * Die Verteilung ist zweigipflig mit einer klaren Senke bei **3** (nur 7 Orte). Unterhalb
 * davon stehen typische Einzelspuren (nur `coord` aus dem Massen-Geocoding, nur `type`),
 * oberhalb beginnt bei 4 das Muster `type+pnames+enc+coord` — ein Ort, an dem jemand
 * gearbeitet hat. Die Grenze liegt also im Tal der eigenen Verteilung, nicht bei einer
 * runden Zahl.
 */
export function placeEnrichmentLevel(po: PlaceObject): EnrichmentLevel {
  const n = placeFacetCount(po);
  if (n === 0) return 'none';
  return n >= 4 ? 'rich' : 'sparse';
}

/**
 * `false` genau dann, wenn `hof` bit-identisch dem `findOrCreateHof`-Bootstrap-Rohzustand
 * entspricht (Spec 11 §9.1): genau EINE undatierte `addrs`-Zeile, keine
 * Koordinaten/Notiz/Existenz-Spanne/Lebenszyklus-Verweise/GOV. Jede Abweichung → angereichert.
 */
export function isEnrichedHof(hof: HofObject): boolean {
  return hofEnrichmentLevel(hof) !== 'none';
}

/** Die sechs Facetten eines HofObject — dieselbe Zählweise wie bei `placeFacetCount`. */
function hofFacetCount(hof: HofObject): number {
  let n = 0;
  if (hof.addrs.length !== 1 || hof.addrs[0].from !== null || hof.addrs[0].to !== null) n += 1;
  if (hof.lat !== null || hof.long !== null) n += 1;
  if (hof.note !== '') n += 1;
  if (hof.existsFrom !== null || hof.existsTo !== null) n += 1;
  if (hof.predecessor !== null || hof.successor !== null) n += 1;
  if (hof.govId !== null || hof.govTypes !== null) n += 1;
  return n;
}

/**
 * **Höfe brauchen eine eigene Schwelle — auch das ist gemessen, nicht gewählt.** Dieselbe
 * Zählung am selben Bestand (183 Höfe):
 *
 * ```
 * Facetten   0     1    2
 * Höfe       2   163   18        Kombinationen: coord 163× · coord+note 14× · addrs+coord 4×
 * ```
 *
 * Eine völlig andere Form als bei den Orten: praktisch jeder Hof trägt genau eine Facette,
 * und zwar dieselbe — die Koordinate aus dem Massen-Geocoding. Die Orts-Schwelle (≥ 4)
 * ergäbe hier NULL reiche Höfe und machte die Stufe wertlos; das liegt nicht am Bestand,
 * sondern daran, dass ein Hof weniger Felder HAT (sechs statt sieben, davon `type`/`pnames`
 * gar nicht). Die Senke der Hof-Verteilung liegt bei **2**, und sie trennt fachlich genau
 * das Richtige: „automatisch verortet" von „jemand hat eine Notiz oder eine Adress-Historie
 * hinterlassen". Eine gemeinsame Zahl für zwei verschieden große Feldmengen wäre die
 * elegantere Regel und die falsche Aussage.
 */
export function hofEnrichmentLevel(hof: HofObject): EnrichmentLevel {
  const n = hofFacetCount(hof);
  if (n === 0) return 'none';
  return n >= 2 ? 'rich' : 'sparse';
}

// ---------------------------------------------------------------------------
// §9.1 zweite Achse: Prüf-Marker (ADR-v9-191)
// ---------------------------------------------------------------------------

/**
 * Hat ein Mensch über dieses Objekt ausdrücklich entschieden? (Spec 11 §9.1.)
 *
 * Der EINE erlaubte Leseweg auf `reviewedAt` — das Feld ist optional (eine `orte.json`
 * ohne es ist gültig), und `undefined` bedeutet dasselbe wie `null`: nie geprüft. Ein
 * roher `!== null`-Vergleich läse `undefined` fälschlich als „geprüft".
 */
export function isReviewed(obj: { reviewedAt?: number | null }): boolean {
  return obj.reviewedAt != null;
}

/**
 * „Kuratiert" im Sinne des Reset-Schutzes (Spec 11 §3/§9.1, ADR-v9-191): geprüft ODER
 * angereichert.
 *
 * **Warum beide Signale.** Der Marker ERWEITERT den Schutz, er ersetzt ihn nicht. Weil ihn
 * ausschließlich der ausdrückliche Knopf setzt, wäre ein von Hand gepflegter, aber nie
 * geklickter Ort sonst „unkuratiert" — und `resetUncuratedLinks` würfe beim nächsten
 * `orte.json`-Import genau die Zuordnungen weg, die heute schon geschützt sind. Die neue
 * Achse dient der Anzeige und der menschlichen Entscheidung; der Reset-Schutz ist eine
 * Sicherheitsfrage und nimmt, was er kriegen kann.
 */
export function isCuratedPlace(po: PlaceObject): boolean {
  return isReviewed(po) || isEnrichedPlace(po);
}

/** Geschwister von `isCuratedPlace` für Höfe (Spec 11 §9.1). */
export function isCuratedHof(hof: HofObject): boolean {
  return isReviewed(hof) || isEnrichedHof(hof);
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
 * Paar hat WIDERSPRÜCHLICHE Elternketten (nicht `parentsCompatible`) — Namensgleichheit allein
 * hat die Gruppe verbunden, nicht wechselseitige Verträglichkeit ALLER Mitglieder. UI MUSS
 * in diesem Fall die volle Namenskette zeigen (nicht nur den bloßen Titel) — Zusammenführen
 * bleibt in JEDEM Fall eine bewusste menschliche Entscheidung, `conflict` ist reine
 * Zusatz-Information, kein Gate.
 */
export interface DuplicateGroup {
  ids: (PlaceId | HofId)[];
  conflict?: boolean;
  /**
   * Nur Places (ADR-v9-77): mindestens ein Mitglieder-Paar trägt ZWEI verschiedene,
   * BEIDE nicht-leere `type`-Werte (z. B. „Town" vs. „District") — der häufige Fall
   * „Stadt X" und „Kreis X" teilen sich einen Namen, sind aber unterschiedliche
   * Entitäten und sollten NICHT zusammengeführt werden. Ein leerer `type` (Seed-
   * Rohzustand, noch nicht kategorisiert) triggert KEIN Mismatch — das ist der normale,
   * unauffällige Fall „ein Mitglied noch nicht klassifiziert". Reine Zusatz-Information
   * wie `conflict`, kein Gate — Zusammenführen bleibt immer eine bewusste Entscheidung.
   */
  typeMismatch?: boolean;
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
 * Places: ZWEI Kriterien (Union-Find) —
 *   1. Name-Fold-Kollision (title/pnames) — ALLE gleichnamigen Orte werden vorgeschlagen,
 *      UNABHÄNGIG von Eltern-Verträglichkeit (ADR-v9-50, Korrektur von ADR-v9-45/29-
 *      Übernahme). Der ADR-v9-29-Verträglichkeits-Guard bleibt für den Event-Resolver/
 *      Seed-Dedup (`resolve.ts`/`seed.ts`) unverändert bindend — dort wird STILL/AUTOMATISCH
 *      entschieden, ein falscher Guard-Verzicht würde `Oldenburg, USA` an den deutschen
 *      Oldenburg binden. Massen-Dedup dagegen führt NIE automatisch zusammen (§9.2) — hier
 *      ist die Verträglichkeits-Frage keine Algorithmus-, sondern eine Menschen-Entscheidung:
 *      „Ochtrup, Amt Ochtrup, Königreich Preußen, Deutsches Reich" und „Ochtrup, Kreis
 *      Steinfurt, Nordrhein-Westfalen, Deutschland" sind derselbe Ort trotz komplett
 *      fremder Ketten — strukturell nicht von Oldenburg/NDS vs. Oldenburg/USA unterscheidbar,
 *      aber inhaltlich das Gegenteil. Kein Heuristik-Kompromiss (z. B. „teilt einen
 *      Vorfahren") kann diese Fälle zuverlässig trennen — der Mensch entscheidet, mit voller
 *      Namenskette sichtbar (`conflict`-Flag unten, `buildFullPlaceName`).
 *      Farms: gleiche normalisierte Adresse (Konvention α, §4.4) UND gleiches `villageId` —
 *      Hof-Identität läuft über Adresse+Dorf, keine Namens-Hierarchie-Frage, Guard bleibt hier
 *      ohnehin nicht einschlägig.
 *   2. Bare↔reich Cross-Achse — NUR Places: plain PO ohne enclosedBy/pnames mit Komma-Titel
 *      gegen reiches PO, dessen Titel dem Leitsegment entspricht (kein Name-Fold-Treffer,
 *      da unterschiedliche Titel-Strings — eigenes Kriterium nötig). Bei Farms übersprungen.
 *
 * `conflict: true` markiert Gruppen mit mindestens einem unverträglichen Mitglieder-Paar
 * (Elternketten widersprechen sich) — UI-Pflicht: volle Namenskette statt bloßem Titel zeigen.
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
    : findPlaceObjectDuplicates(items as PlaceObjects, kind);
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

function findPlaceObjectDuplicates(places: PlaceObjects, kind: 'places' | 'all'): DuplicateGroup[] {
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

  // Kriterium 1 (ADR-v9-50): Name-Fold (title + pnames) gruppieren — ALLE gleichnamigen Orte
  // werden unioniert, UNABHÄNGIG von Eltern-Verträglichkeit. Kein Koordinaten-Fangnetz mehr
  // nötig (entfiel mit dem alten, kompatibilitätsgegateten Kriterium 1 — s. Docstring oben).
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
      for (let j = i + 1; j < ids.length; j++) union(ids[i], ids[j]);
    }
  }

  // Kriterium 2 (bare↔reich Cross-Achse): plain PO ohne enclosedBy mit Komma-Titel gegen ein
  // reiches PO (mit enclosedBy), dessen Titel dem Leitsegment des Komma-Titels entspricht.
  // Kein Name-Fold-Treffer (unterschiedliche Titel-Strings) — eigenes Kriterium nötig.
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

  const groups = collectGroups(order, find);
  // Conflict-Flag post-hoc je Gruppe: gibt es IRGENDEIN Mitglieder-Paar mit unverträglichen
  // Elternketten, ist die Namensgleichheit die einzige Klammer, nicht wechselseitige
  // Verträglichkeit ALLER Mitglieder — UI muss das sichtbar machen (volle Namenskette).
  const typeOf = (id: PlaceId): string => places.get(id)?.type ?? '';
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
    // typeMismatch (ADR-v9-77): zwei BEIDE nicht-leere, verschiedene `type`-Werte im
    // selben Namens-Cluster — z. B. „Stadt Steinfurt" (Town) und „Kreis Steinfurt"
    // (District) teilen den Namen, sind aber unterschiedliche Verwaltungsebenen.
    outerType: for (let i = 0; i < pids.length; i++) {
      const ti = typeOf(pids[i]);
      if (!ti) continue;
      for (let j = i + 1; j < pids.length; j++) {
        const tj = typeOf(pids[j]);
        if (tj && tj !== ti) {
          g.typeMismatch = true;
          break outerType;
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
