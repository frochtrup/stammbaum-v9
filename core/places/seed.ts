// core/places/seed.ts — Village-Seed-Vorpass (Spec 11 §4.2 Schritt 0, ADR-v9-28/-29).
//
// REINE, DETERMINISTISCHE Kernfunktion (TST-3/INV-ARCH-1): erzeugt aus den distinkten
// PLAC-Hierarchien noch UNAUFGELÖSTER Events die fehlenden Village-PlaceObjects (+ ihre
// enclosedBy-Kette). Läuft VOR resolveEvents (der Verwaltungs-Match findet die POs dann
// vor) — der Match-Algorithmus selbst bleibt unverändert.
//
// DEDUP-REGEL (ADR-v9-29) = Name + Hierarchie-Verträglichkeit, WEDER name-only (verschmölze
// Oldenburg/NS + Oldenburg/USA) NOCH Voll-Hierarchie-String (spaltete Ochtrup nach
// Schreibtiefe):
//   - gleicher normalisierter Leitname + VERTRÄGLICHE Eltern (eine Elternkette ist Präfix
//     der anderen, oder leer) → EIN PlaceObject (hunderte „Ochtrup", auch atomar+reich
//     gemischt, bleiben ein Ort; die reichste Kette gewinnt für enclosedBy).
//   - WIDERSPRÜCHLICHE Eltern (auf gemeinsamer Ebene abweichend) → DISTINKTE POs.
//   - atomar (leere Eltern) trifft ≥2 widersprüchliche Cluster → mehrdeutig, KEIN stilles
//     Merge (der Fall wird bei der Auflösung Review-Klasse P, §6).
//
// HÖFE ENTSTEHEN NIE IM SEED: das Village-Segment wird mit demselben Konventions-Signal
// wie §4.3 gewählt (Konvention-1-Hof-Fall → Leitsegment ist der Hof → Village = segs[1..]).
import type { Event, PlaceId } from '../model/types';
import type { PlaceObject } from './types';
import type { PlaceContext } from './build-plac';
import { eventPlaceId } from './chokepoints';
import { chainCompatibleAnyPath } from './place-registry';
import { normPlaceName, extractHofAddr, slugify } from './normalize';

/** Hof-relevante Event-Typen (Spec 11 §4.2) — hier kann das Leitsegment ein Hof sein. */
const HOF_TYPES = new Set(['RESI', 'PROP', 'CENS', 'OCCU']);

/** Getrimmte, nicht-leere Komma-Segmente eines PLAC-Strings. */
function segments(plac: string): string[] {
  return plac.split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Verwaltungs-Kette (leaf-first) eines Events: Village + Eltern. Muss KONSISTENT zum
 * Resolver sein (sonst schattet der Seed die Hof-Erkennung): bei hof-relevanten Typen mit
 * reichem PLAC behandelt der Resolver das Leitsegment als (potenziellen) Hof (Pfad A/C) —
 * der Seed darf es dann NICHT als Ort anlegen, Dorf = segs[1..]. Ausnahme Konvention 2
 * (§4.3): eine explizite ADDR nennt einen ANDEREN Hof als das Leitsegment → das
 * Leitsegment ist das Dorf (behalten). Non-Hof-Typen: das Leitsegment ist immer der Ort.
 */
function adminChain(ev: Event, segs: string[]): string[] {
  if (segs.length <= 1) return segs;
  if (HOF_TYPES.has(ev.type)) {
    if (ev.addr) {
      const extractNorm = normPlaceName(extractHofAddr(ev.addr));
      // Konvention 2: ADDR-Hof ≠ Leitsegment → Leitsegment ist das Dorf.
      if (extractNorm && extractNorm !== normPlaceName(segs[0])) return segs;
    }
    // Konvention 1 / Pfad-C (auch ohne ADDR): Leitsegment = Hof → nicht seeden.
    return segs.slice(1);
  }
  return segs;
}

/**
 * Eltern-Verträglichkeit (ADR-v9-29): zwei Elternketten sind verträglich, wenn eine ein
 * Präfix der anderen ist (an jeder gemeinsamen Position gleich). Widerspruch an einer
 * gemeinsamen Position → unverträglich (distinkte Orte).
 *
 * Exportiert, damit der Massen-Dedup (`findPlaceDuplicates`, §9.2, ADR-v9-45) exakt
 * dieselbe Verträglichkeits-Regel benutzt wie der Seed-Dedup — NICHT neu erfinden.
 */
export function parentsCompatible(a: readonly string[], b: readonly string[]): boolean {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false;
  return true;
}

interface SeedCluster {
  /** Normalisierte Elternkette der reichsten (zuerst verarbeiteten) Fassung. */
  repParentsNorm: string[];
  id: PlaceId;
}

function makeSeededPlace(id: PlaceId, title: string, parentId: PlaceId | null): PlaceObject {
  return {
    id,
    title,
    type: '', // unbekannt — Kuration (Typ, Koordinaten, GOV) folgt nachgelagert (Spec 11 §2).
    pnames: [],
    enclosedBy: parentId ? [{ placeId: parentId, from: null, to: null }] : [],
    lat: null,
    long: null,
    note: '',
    existsFrom: null,
    existsTo: null,
    govId: null,
    govTypes: null,
  };
}

/**
 * Seedet fehlende Village-PlaceObjects aus den Events. Gibt die NEU zu erzeugenden
 * PlaceObjects zurück (der Aufrufer übernimmt sie in db.placeObjects) — mutiert weder
 * Events noch den übergebenen Kontext. Deterministisch: gleiche Eingabe → gleiche Ausgabe.
 */
export function seedPlacesFromEvents(events: readonly Event[], ctx: PlaceContext): PlaceObject[] {
  // 1. Verwaltungs-Ketten (leaf-first) + alle Suffixe (jede Ebene ist ein Ort) sammeln —
  //    nur aus noch UNAUFGELÖSTEN Events (placeId ODER findByName trifft → schon vorhanden).
  const chains: string[][] = [];
  for (const ev of events) {
    if (eventPlaceId(ev, ctx) != null) continue;
    const segs = segments(ev.place ?? '');
    const admin = adminChain(ev, segs);
    for (let i = 0; i < admin.length; i++) chains.push(admin.slice(i));
  }

  // 2. Deterministische Ordnung: LÄNGSTE zuerst (die reichste Kette pro Ort gewinnt und
  //    prägt den Cluster), bei Gleichstand normalisiert-lexikographisch.
  const normJoin = (c: string[]): string => c.map(normPlaceName).join('|');
  chains.sort((a, b) => b.length - a.length || normJoin(a).localeCompare(normJoin(b)));

  const created: PlaceObject[] = [];
  const usedIds = new Set<string>();
  const clustersByLeaf = new Map<string, SeedCluster[]>();

  const mintId = (leafNorm: string, parentNorm: string): PlaceId => {
    const base = '_plac_' + (slugify(leafNorm) || 'x') + (parentNorm ? '__' + (slugify(parentNorm) || 'x') : '');
    let id = base;
    let n = 1;
    while (usedIds.has(id) || ctx.places.byId(id) !== undefined) id = `${base}_${++n}`;
    return id;
  };

  /**
   * Cross-load-robuste Elternverträglichkeit gegen ein BESTEHENDES PlaceObject.
   *
   * WARUM NICHT `enclosureChainAsOf(...).map(normPlaceName)`: jene Kette liefert pro Knoten
   * nur den periodenkorrekten TITEL (via resolveAsOf). Ein PLAC-Segment kann denselben
   * Knoten aber über eine PNAME getroffen haben — z. B. Segment „Deutsches Reich" trifft
   * `_po_de` (title „Deutschland", pname „Deutsches Reich"). Ein positionsweiser Titel-
   * Vergleich schlägt dann fehl, obwohl es DERSELBE Ort ist, und der Seed mintet bei JEDEM
   * Reload ein Duplikat der ganzen Verwaltungskette (Idempotenz-Bug, ADR-v9-71). Deshalb
   * gegen die volle Namensmenge (title + alle pnames) JEDES Kettenknotens prüfen: das
   * gestellte Segment ist verträglich, wenn es EINEN Namen des Knotens trifft.
   *
   * Und WARUM `chainCompatibleAnyPath` statt eines linearen `enclosedBy[0]`-Walks (ADR-v9-72):
   * ein gemergter Ort trägt MEHRERE undatierte `enclosedBy`-Ketten (je gemergter Variante
   * eine); ein Index-0-Walk sähe nur die erste und legte Ketten neu an, die bereits (an
   * anderer Position) modelliert sind. Der DFS durchsucht ALLE Pfade. Gemeinsame reine
   * Funktion mit `resolve.ts::chainCompatible` (year==null) — nicht zweimal geschrieben.
   */
  const existingParentsCompatible = (leafId: PlaceId, parentsNorm: readonly string[]): boolean =>
    chainCompatibleAnyPath(ctx.places.byId, leafId, parentsNorm);

  /**
   * Cluster-Verträglichkeit ZWISCHEN zwei im selben Lauf geseedeten Ketten.
   *
   * Wie `parentsCompatible` positionsweise über die gemeinsame Länge (leere/kürzere Kette
   * bleibt mit allem verträglich — „hunderte Ochtrup, auch atomar+reich gemischt, bleiben
   * ein Ort", §4.2), ABER pro Position mit KNOTEN-Identität statt rohem String-Vergleich:
   * zwei verschiedene Schreibweisen können denselben kuratierten Knoten treffen — Segment
   * „Deutsches Reich" und Segment „Deutschland" lösen beide auf `_po_de` auf (title
   * „Deutschland", pname „Deutsches Reich" 1871–1945).
   *
   * WARUM eine zweite Funktion neben `parentsCompatible` (Befund 2026-07-16): ADR-v9-71
   * hat exakt dieses Problem bereits gelöst — aber nur für Pfad (a), den Abgleich gegen
   * KURATIERTE POs (`existingParentsCompatible` oben). Pfad (b), der Abgleich gegen die im
   * selben Lauf frisch geseedeten Cluster, behielt den nackten String-Vergleich. Folge am
   * echten Datenbestand: vier Ortspaare (Bremen/Essen/Hildesheim/Bottrop) existierten
   * doppelt — je `_plac_X__deutsches_reich` UND `_plac_X__deutschland`, BEIDE mit demselben
   * Elter `_po_de` —, wodurch 23 Ereignisse unbindbar in Review-Klasse P landeten, obwohl
   * ihr Ort eindeutig war. Spec 11 §4.2 schließt genau das aus: der Dedup-Schlüssel ist
   * „weder name-only NOCH Voll-Hierarchie-String".
   *
   * `parentsCompatible` (exportiert, rein, ohne Registry-Zugriff) bleibt bewusst unangetastet.
   */
  const seedParentsCompatible = (a: readonly string[], b: readonly string[]): boolean => {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      if (a[i] === b[i]) continue;
      // Verschiedene Schreibweisen, aber derselbe kuratierte Knoten? Nur bei EINDEUTIGER
      // Auflösung beider Seiten — bei mehreren gleichnamigen Kandidaten wäre die Gleichheit
      // selbst geraten (genau die Mehrdeutigkeit, die Klasse P dem Menschen vorlegt).
      const idsA = ctx.places.findAllByName(a[i]);
      if (idsA.length !== 1) return false;
      const idsB = ctx.places.findAllByName(b[i]);
      if (idsB.length !== 1 || idsA[0] !== idsB[0]) return false;
    }
    return true;
  };

  /**
   * Stellt sicher, dass es für die Kette einen Ort gibt (neu oder bestehend) und gibt
   * dessen PlaceId zurück. null, wenn die Kette leer oder (atomar/kurz) mehrdeutig ist.
   */
  function ensure(chain: string[]): PlaceId | null {
    if (chain.length === 0) return null;
    const leaf = chain[0];
    const leafNorm = normPlaceName(leaf);
    if (!leafNorm) return null;
    const parents = chain.slice(1);
    const parentsNorm = parents.map(normPlaceName);

    // (a) Bestehendes, kuratiertes PlaceObject wiederverwenden — aber NUR bei verträglicher
    //     Elternkette (sonst würde „Oldenburg, USA" an das deutsche Oldenburg gebunden).
    const existingCompat = ctx.places
      .findAllByName(leaf)
      .filter((id) => existingParentsCompatible(id, parentsNorm));
    if (existingCompat.length === 1) return existingCompat[0];
    if (existingCompat.length > 1) return null; // mehrdeutig gegen kuratierte Daten → Klasse P

    // (b) Bereits geseedeten Cluster wiederverwenden (verträglich) — KNOTEN-Identität,
    //     nicht roher String-Vergleich (s. seedParentsCompatible, Befund 2026-07-16).
    const bucket = clustersByLeaf.get(leafNorm) ?? [];
    const seedCompat = bucket.filter((c) => seedParentsCompatible(c.repParentsNorm, parentsNorm));
    if (seedCompat.length === 1) return seedCompat[0].id;
    if (seedCompat.length > 1) return null; // atomar/kurz gegen ≥2 Cluster → mehrdeutig → Klasse P

    // (c) Neu anlegen — zuerst die Elternkette sicherstellen (für enclosedBy).
    const parentId = ensure(parents);
    const id = mintId(leafNorm, parentsNorm[0] ?? '');
    usedIds.add(id);
    created.push(makeSeededPlace(id, leaf, parentId));
    bucket.push({ repParentsNorm: parentsNorm, id });
    clustersByLeaf.set(leafNorm, bucket);
    return id;
  }

  for (const chain of chains) ensure(chain);
  return created;
}
