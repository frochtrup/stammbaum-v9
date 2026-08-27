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
import { eventSpanne, type PlaceContext } from './build-plac';
import { eventPlaceId } from './chokepoints';
import { chainCompatibleAnyPath } from './place-registry';
import {
  normPlaceName,
  extractHofAddr,
  slugify,
  istHofFaehigerOrt,
  splitPlacSegments,
  istKonvention1,
} from './normalize';
// Autoritaets-Satz (ADR-v9-224, Spec 11 §9.1): kuratiertes Wissen ist Autoritaet, ein
// Bootstrap-Objekt ist ein Spiegel des Textes. Hier entscheidet das, WEM der Seed glaubt.
import { isCuratedHof } from './curation';
// Hof-relevante Event-Typen (Spec 11 §4.2) — die EINE Quelle, kein Duplikat mehr: der
// Seed-Vorpass und der Resolver dürfen nicht auseinanderdriften (OCCU-Entfernung
// ADR-v9-143 muss beide zugleich treffen).
import { HOF_EVENT_TYPES } from './resolve';

/** Segmentsicht des Seeds = die des Resolvers (core/places/normalize.ts). */
const segments = splitPlacSegments;

/**
 * Kennt der Bestand das Leitsegment bereits als ADRESSE EINES HOFES in dem Dorf, das das
 * naechste Segment nennt? Dann ist es dieser Hof - und kein Dorf.
 *
 * WARUM DIESE FRAGE VOR DEN KONVENTIONEN STEHT. Die Konventionen unten schliessen vom
 * ereignis-eigenen TEXT auf die Rolle des Leitsegments: sie vergleichen `ev.addr` mit
 * `segs[0]` als Zeichenketten. Das trug, solange ein Hof genau EINE Adresse hatte - dann
 * waren die beiden Werte immer gleich, und Ungleichheit hiess verlaesslich "zwei
 * verschiedene Dinge". Seit ein Hof eine Adressliste fuehrt (ADR-v9-223) stimmt der Schluss
 * nicht mehr: `PLAC` wird live aus `addrs` berechnet, `ADDR` bleibt eingefroren (ADR-v9-47
 * fill-if-empty) - dieselbe Hofstelle steht dann links und rechts unter zwei ihrer eigenen
 * Bezeichnungen, und der Textvergleich las das als Beleg fuer ein Dorf. Gemessen am
 * Realbestand (2026-08-26, `orte-2.json` rev 448) hat das Hausnummern als `PlaceObject`
 * unter Ochtrup angelegt - `Oster 34`, `Oster 46 (9)`, `Oster 52 (15)`, `Weinerstr. 17`,
 * je einen pro kuratierter Hofadresse.
 *
 * Die Registry beantwortet die Frage direkt: `addrs` IST die Liste der Bezeichnungen EINES
 * Hofes. Am Objekt gefragt, kann keine Adressvariante mehr wie eine zweite Stelle wirken.
 *
 * NUR KURATIERTE HOEFE ZAEHLEN, keine rohen Bootstraps. Ein gebootstrappter Hof entsteht
 * aus demselben Ereignistext, den er hier interpretieren soll - ihn als Beleg zu nehmen
 * waere ein Zirkel: ein einzelnes `RESI` mit `ADDR=X` erzeugte beim ersten Laden einen
 * Hof X, und beim zweiten erklaerte dieser Hof das Leitsegment X aller uebrigen
 * Ereignisse zur Hofstelle - auch wenn X in Wahrheit ein Dorf ist (gemessen an
 * `Lehrdte`: 66 BIRT/CHR/DEAT/BURI/MARR, null `ADDR=Lehrdte` in der Quelle). Das ist
 * derselbe Satz wie in `alignCuratedEventTexts` (ADR-v9-224): kuratiertes Wissen ist
 * Autoritaet, ein Seed-/Bootstrap-Objekt spiegelt nur den Text. Am Bestand sind 17 von
 * 213 Hoefen rohe Bootstraps; alle vier Faelle, die diese Funktion loesen soll, sind
 * kuratiert.
 *
 * AUF DAS DORF EINGEGRENZT, nicht global: eine Hausnummer ist zwischen Doerfern nicht
 * eindeutig. Ist das Dorf (noch) nicht bekannt, wird NICHTS behauptet und die Konventionen
 * unten entscheiden wie bisher - der Seed soll eine echte, dem Bestand noch unbekannte
 * Ortsebene weiterhin anlegen duerfen.
 *
 * GILT FUER JEDEN EREIGNISTYP, nicht nur fuer `HOF_EVENT_TYPES`. Ob ein Ereignis an einen
 * Hof BINDEN darf, ist eine andere Frage (Spec 11 §4.2, dort bewusst auf RESI/PROP/CENS
 * beschraenkt) - hier geht es nur darum, aus einer bekannten Hofadresse keinen ORT zu
 * machen. Am Realbestand tragen acht Nicht-Hof-Ereignisse (BIRT 5, CHR 1, DEAT 2) eine
 * bekannte Hofadresse als Leitsegment; sie waren der zweite Weg zu denselben Objekten.
 */
function leitsegmentIstBekannterHof(ev: Event, segs: string[], ctx: PlaceContext): boolean {
  const dorfId = ctx.places.findByName(segs[1]);
  if (dorfId == null) return false;
  return ctx.hofs.findAllByAddr(segs[0], eventSpanne(ev), dorfId).some((id) => {
    const h = ctx.hofs.byId(id);
    return h != null && isCuratedHof(h);
  });
}

/**
 * Verwaltungs-Kette (leaf-first) eines Events: Village + Eltern. Muss KONSISTENT zum
 * Resolver sein (sonst schattet der Seed die Hof-Erkennung): bei hof-relevanten Typen mit
 * reichem PLAC behandelt der Resolver das Leitsegment als (potenziellen) Hof (Pfad A/C) —
 * der Seed darf es dann NICHT als Ort anlegen, Dorf = segs[1..]. Ausnahme Konvention 2
 * (§4.3): eine explizite ADDR nennt einen ANDEREN Hof als das Leitsegment → das
 * Leitsegment ist das Dorf (behalten). Non-Hof-Typen: das Leitsegment ist immer der Ort.
 *
 * VORGESCHALTET (s. `leitsegmentIstBekannterHof`): kennt der Bestand das Leitsegment schon
 * als Adresse eines Hofes im selben Dorf, entscheidet dieses Wissen - Wissen ueber das
 * Objekt schlaegt den Schluss aus dem Text.
 */
/**
 * Welche Stellen nennt die DATEI selbst als Hofstelle? Genau Konvention 1: ein Hof-Typ-
 * Ereignis, dessen ADDR das Leitsegment WIEDERHOLT. Das ist das einzige Signal, mit dem
 * eine Quelle "hier wohnt jemand auf diesem Hof" sagt.
 *
 * WOZU. Der Seed laeuft VOR dem Resolver und entschied je Ereignis fuer sich. Ein `DEAT`
 * an "Oster 60, Ochtrup, ..." machte das Leitsegment deshalb zum ORT, bevor die beiden
 * `RESI` an derselben Adresse (mit `ADDR=Oster 60`) ihren Hof per Pfad C bootstrappen
 * konnten; danach band alles an diesen Ort, und der Hof entstand nie. Die REIHENFOLGE
 * zweier Ereignisse an derselben Stelle entschied, was dort entsteht.
 *
 * WARUM NUR MIT AUSGESCHRIEBENEM ADDR, und nicht auch bei leerem ADDR (Pfad C). Ein
 * Hof-Typ-Ereignis ohne ADDR ist KEIN Beleg fuer eine Hofstelle - "wohnhaft in X" ist
 * genauso oft ein Dorf. Gemessen am Realbestand (2026-08-26): `Lehrdte` traegt 66
 * Nicht-Hof-Ereignisse (BIRT/CHR/DEAT/BURI/MARR) und NULL Hof-Typ-Ereignisse mit
 * `ADDR=Lehrdte` - ein Dorf. `Oster 60` traegt 2 mit `ADDR=Oster 60`. Die erste Fassung
 * dieser Funktion zaehlte auch ADDR-lose Ereignisse und erklaerte damit Doerfer zu
 * Hofstellen; sie brach ADR-v9-222 (nach einem Merge kehrten zwei `Amtsvogtei Ilten`
 * zurueck), weil sie den 66 Lehrdte-Ereignissen ihr Leitsegment nahm.
 *
 * DIE QUELLE, NICHT DIE PROJEKTION: `ev.addr` kann von der App stammen (fill-if-empty,
 * ADR-v9-47). Das ist hier unschaedlich, weil ein von der App gesetztes ADDR bereits eine
 * Hof-Bindung VORAUSSETZT - es bestaetigt den Anspruch, es erfindet ihn nicht.
 */
function hofAnsprueche(events: readonly Event[]): Set<string> {
  const out = new Set<string>();
  for (const ev of events) {
    if (!HOF_EVENT_TYPES.has(ev.type)) continue;
    if (!ev.addr) continue;
    const segs = segments(ev.place ?? '');
    if (segs.length <= 1) continue;
    if (!istKonvention1(ev.addr, segs[0])) continue;
    out.add(normPlaceName(segs[0]) + ' >> ' + normPlaceName(segs[1]));
  }
  return out;
}

/**
 * Spiegel von `resolve.ts::bootstrapAnkerErlaubt` (Spec 11 §4.2, [ADR-v9-293]): kann in dem
 * Ort, den `segs[1..]` nennt, überhaupt ein Hof liegen?
 *
 * WARUM DER SPIEGEL PFLICHT IST. Die Zweige unten geben das Leitsegment dem Hof-Bootstrap
 * frei, indem sie es NICHT seeden. Lehnt der Resolver den Bootstrap anschließend ab (weil
 * der Anker ein Kreis/Département ist), entsteht dort WEDER Hof NOCH Ort — das Leitsegment
 * fiele still aus dem Bestand. Der Kopfkommentar von `adminChain` sagt es bereits: „Muss
 * KONSISTENT zum Resolver sein (sonst schattet der Seed die Hof-Erkennung)"; das gilt in
 * beide Richtungen.
 *
 * Kein bekannter Anker → `true`: der Bestand sagt dann nichts, und der Seed legt die
 * Elternkette ohnehin selbst an (ungetypt, Rang 6) — der Resolver findet danach einen
 * erlaubten Anker vor. Der Textschluss bleibt also, wo er war.
 */
function hofAnkerMoeglich(segs: string[], ctx: PlaceContext): boolean {
  for (let i = 1; i < segs.length; i++) {
    const id = ctx.places.findByName(segs[i]);
    if (id) return istHofFaehigerOrt(ctx.places.byId(id)?.type ?? null);
  }
  return true;
}

function adminChain(
  ev: Event,
  segs: string[],
  ctx: PlaceContext,
  ansprueche: ReadonlySet<string>,
): string[] {
  if (segs.length <= 1) return segs;
  // (i) Ein BESTEHENDER kuratierter Hof gilt überall — Nutzerentscheidung, kein
  //     Textschluss (ADR-v9-286). Kein Anker-Guard.
  if (leitsegmentIstBekannterHof(ev, segs, ctx)) return segs.slice(1);
  if (HOF_EVENT_TYPES.has(ev.type)) {
    if (ev.addr) {
      // Konvention 2: ADDR-Hof ≠ Leitsegment → Leitsegment ist das Dorf.
      if (extractHofAddr(ev.addr) && !istKonvention1(ev.addr, segs[0])) return segs;
      // (ii) Konvention 1: DIESES Ereignis behauptet die Hofstelle selbst (ADDR wiederholt
      //      das Leitsegment). Auch hier KEIN Anker-Guard — lehnt der Resolver den
      //      Bootstrap ab, wird die Behauptung an genau diesem Ereignis als Review
      //      sichtbar (Klasse A, Pfad B′). Ein Seed würde daraus stattdessen einen ORT
      //      machen, in dem dann derselbe Name noch einmal als Hof landet.
      return segs.slice(1);
    }
    // (iii) Pfad C OHNE ADDR: die Datei behauptet nichts, das ist ein reiner Textschluss.
    //       Er gilt nur, wo überhaupt ein Hof liegen kann — sonst entstünde dort weder
    //       Hof noch Ort (ADR-v9-293).
    return hofAnkerMoeglich(segs, ctx) ? segs.slice(1) : segs;
  }
  // (iv) Nicht-Hof-Typ: das Leitsegment ist der Ort - es sei denn, die Datei selbst nennt
  //      dieselbe Stelle anderswo als Hofstelle (s. `hofAnsprueche`). Auch das ist für
  //      DIESES Ereignis ein Schluss von außen, also mit Anker-Guard.
  return ansprueche.has(normPlaceName(segs[0]) + ' >> ' + normPlaceName(segs[1])) &&
    hofAnkerMoeglich(segs, ctx)
    ? segs.slice(1)
    : segs;
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
    shortName: '', // Anzeige-Kuration folgt nachgelagert; leer ⇒ `title` (ADR-v9-90).
    type: '', // unbekannt — Kuration (Typ, Koordinaten, GOV) folgt nachgelagert (Spec 11 §2).
    pnames: [],
    translations: [], // Sprachachse (BL-59) — app-privat, Kuration folgt nachgelagert.
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
  // Vorpass VOR der Schleife: welche Stellen nennt die Datei selbst als Hofstelle?
  // Ohne ihn entschiede die Reihenfolge der Ereignisse, was dort entsteht.
  const ansprueche = hofAnsprueche(events);
  for (const ev of events) {
    if (eventPlaceId(ev, ctx) != null) continue;
    const segs = segments(ev.place ?? '');
    const admin = adminChain(ev, segs, ctx, ansprueche);
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
