// core/places/place-registry.ts — reiner, deterministischer Index über placeObjects.
// Ersetzt den lazy-gecachten, an AppState hängenden v8-getPlaceRegistry durch eine
// reine Funktion (context → registry). Kein Zustand, keine Mutation (TST-3, Spec 11 §4.1).
import type { PlaceId } from '../model/types';
import type { DatedRef, PlaceObject, PlaceObjects, Year } from './types';
import { normPlaceName, placeYear, placeTypeRank } from './normalize';
import {
  alsSpanne,
  beginnWert,
  istDatiert,
  jahrAus,
  spanneVonDatiert,
  trifft,
  type Spanne,
  type Zeitbezug,
} from './zeitbezug';

export interface EnclosureMeta {
  truncated: boolean;
  /**
   * Traf im Jahr MEHR ALS EINE datierte Zugehörigkeit zu? (BL-325, Spec 11 §5)
   *
   * Dann hat die Tie-Break-Regel entschieden („höheres `from` gewinnt"), nicht die Datenlage.
   * Das ist zulässig und deterministisch — aber es ist eine Wahl unter mehreren richtigen
   * Antworten, und die gehört sichtbar gemacht. Am maßgeblichen Bestand
   * (`Testdateien/orte-2.json`, rev 277) sind das 433 Paare — ausnahmslos Randberührungen
   * („…1810" trifft „1810…"), weil `from`/`to` Jahre sind und beide Enden einschließen.
   *
   * Bewusst ein eigenes Feld neben `truncated` und nicht mit ihm verrechnet: `truncated`
   * heißt „die Kette bricht ab, es gibt hier KEINE Antwort", `ueberlappt` heißt „es gibt
   * MEHRERE". Das sind gegensätzliche Befunde und für den Nutzer gegensätzliche Aufgaben.
   */
  ueberlappt: boolean;
}

export interface PlaceRegistry {
  byId: (id: PlaceId) => PlaceObject | undefined;
  /** Bester Kandidat gleichen Namens (spezifisch→allgemein), sonst null. */
  findByName: (name: string) => PlaceId | null;
  /** Alle Kandidaten gleichen Namens, spezifisch→allgemein sortiert (stabil). */
  findAllByName: (name: string) => PlaceId[];
  /** Periodenkorrekter Name: im Zeitbezug gültige pname, sonst title. */
  resolveAsOf: (id: PlaceId, when: Zeitbezug) => string | null;
  /** [Ort, übergeordnet, …] als periodenkorrekte Namen. Optional meta.truncated. */
  enclosureChainAsOf: (id: PlaceId, when: Zeitbezug, meta?: EnclosureMeta) => string[];
  /**
   * [Ort-Id, übergeordnete Id, …] — dieselbe periodenkorrekte Kettenwahl wie
   * `enclosureChainAsOf`, aber als Knoten-IDs statt Namen. Für Identitäts-/Verträglichkeits-
   * Prüfungen (`chainCompatible`), die pro Knoten gegen die VOLLE Namensmenge (title + alle
   * pnames) prüfen müssen — ein einzelner periodenkorrekter Name reicht nicht (ein PLAC-Segment
   * „Bayern" ist mit dem Knoten kompatibel, dessen periodenkorrekter Name „Königreich Bayern" ist).
   */
  enclosureIdsAsOf: (id: PlaceId, when: Zeitbezug, meta?: EnclosureMeta) => PlaceId[];
}

// Undatiert im PlaceObject-pname-Kontext gilt NICHT „jederzeit" — nur der Fallback
// auf title. Datierte Einträge matchen periodengerecht.
//
// Seit BL-324 über `zeitbezug.ts` statt über nackte Jahresvergleiche: für eine Angabe
// ohne `fromDate`/`toDate` ist das Ergebnis nachweislich unverändert (die Jahres-Kanten
// der Spanne sind genau die alte inklusive Semantik), mit ihnen wird es tagegenau.
function passtZu(d: { from: Year; to: Year; fromDate?: string | null; toDate?: string | null }, bezug: Spanne): boolean {
  if (!istDatiert(d)) return false;
  return trifft(spanneVonDatiert(d), bezug);
}

/** Volle normalisierte Namensmenge eines Knotens (title + alle pnames). */
function nodeNames(node: PlaceObject): Set<string> {
  const names = new Set<string>();
  for (const nm of [node.title, ...node.pnames.map((p) => p.value)]) {
    const k = normPlaceName(nm);
    if (k) names.add(k);
  }
  return names;
}

/**
 * Eltern-Verträglichkeit über ALLE im Ereignisjahr gültigen `enclosedBy`-Pfade
 * (DFS/Backtracking).
 *
 * WARUM DFS statt linearem `enclosedBy[0]`-Walk (Bugfix 2026-07-12, ADR-v9-72): ein durch
 * `mergePlaceObjectPair` zusammengeführter Ort (z. B. der kuratierte `_po_ochtrup`, in den
 * 15 „Ochtrup"-Varianten gefaltet wurden) trägt MEHRERE `enclosedBy`-Einträge — jede der
 * gemergten historischen Verwaltungsketten. Ein PLAC-Segment, dessen Kette NICHT zufällig
 * der ERSTEN dieser Ketten entspricht, wurde vom Index-0-Walk fälschlich als „unbekannt"
 * gewertet → der Ort (bzw. seine Kette) wurde beim nächsten Laden/Seeden neu angelegt,
 * obwohl seine Kette bereits (an anderer Position) in `enclosedBy` steht (stille Verdopplung).
 *
 * WARUM AUCH FÜR DATIERTE EREIGNISSE (ADR-v9-195): ADR-v9-72 setzte diese Funktion nur im
 * `year==null`-Zweig von `resolve.ts::chainCompatible` ein — der datierte Zweig durchsuche
 * über `enclosureWinnerAsOf` „bereits korrekt ALLE datierten Einträge". Das traf nicht zu:
 * `enclosureWinnerAsOf` liefert GENAU EINEN Gewinner und fällt bei ausschließlich
 * undatierten Einträgen auf den ERSTEN zurück — also genau den `enclosedBy[0]`-Walk, den
 * ADR-v9-72 abgeschafft hat, nur auf der anderen Hälfte der Fälle. Da praktisch jedes Datum
 * einer Genealogie an einem Ereignis hängt, war das die GRÖSSERE Hälfte: am Realbestand
 * kostete ein Merge von vier „Arpke" elf Ereignisse ihre Zuordnung (Review-Klasse P statt
 * gebundenem Ort) — dauerhaft, weil auch der nächste Ladepass denselben Weg nimmt.
 *
 * `year` schaltet die Periodentreue scharf, HEBT SIE ABER NICHT AUF: je Knoten werden nur
 * die im Jahr gültigen Einträge verzweigt (datierter Treffer ODER undatiert = „ohne bekannte
 * Datierung", deshalb jederzeit zulässig). Ein datierter Eintrag, dessen Periode das Jahr
 * nicht abdeckt, vetoet weiterhin. Unterschied zu `enclosureWinnerAsOf`: mehrere gleichzeitig
 * gültige Einträge werden ALLE probiert, statt „spätestes `from` gewinnt" — das ist der
 * Unterschied zwischen einer PRÜFUNG (mehrdeutig erlaubt: es genügt EIN passender Pfad) und
 * einer PROJEKTION (`enclosureIdsAsOf`, muss eindeutig bleiben und ändert sich hier nicht).
 * `year == null` verhält sich unverändert: alle Einträge kommen in Frage.
 *
 * Verträglich = es EXISTIERT ein Pfad durch den `enclosedBy`-Graphen ab `leafId`, sodass
 * `statedParentsNorm[i]` einen Namen des i-ten Vorfahren trifft (Präfix-Semantik: läuft die
 * Modell-Kette vor den Stated-Segmenten aus, bleibt es verträglich). Deterministisch
 * (Eingabe-Ordnung der `enclosedBy`-Liste). Lenient bei fehlenden/zyklischen Knoten und bei
 * Knoten, die im Jahr nicht existierten (wie der frühere Einzelpfad-Walk: nicht
 * verifizierbar → ok).
 *
 * EIN gemeinsamer Mechanismus für `seed.ts::existingParentsCompatible` (grundsätzlich
 * undatiert) UND `resolve.ts::chainCompatible` (beide Jahres-Fälle) — nicht dreimal
 * geschrieben, und keine zweite Stelle mehr, an der die eine Hälfte nachgezogen werden kann
 * und die andere stehen bleibt.
 */
export function chainCompatibleAnyPath(
  byId: (id: PlaceId) => PlaceObject | undefined,
  leafId: PlaceId,
  statedParentsNorm: readonly string[],
  when: Zeitbezug = null,
): boolean {
  const bezug = alsSpanne(when);
  const y = bezug == null ? null : jahrAus(bezug);
  /** Im Zeitbezug gültige Zugehörigkeiten eines Knotens (undatiert = jederzeit). */
  const validEnclosures = (pl: PlaceObject): readonly DatedRef[] => {
    if (bezug == null) return pl.enclosedBy;
    return pl.enclosedBy.filter((e) => !istDatiert(e) || passtZu(e, bezug));
  };
  /**
   * Existierte der Ort im Ereignisjahr? Spiegelt `enclosureIdsAsOf`, das die Kette an einem
   * zeitlich unpassenden Knoten abbricht — ohne diese Prüfung wäre der neue gemeinsame Pfad
   * an einer Stelle STRENGER als der abgelöste datierte Walk (ein Ort, der 1990 längst nicht
   * mehr existierte, würde plötzlich gegen seine Elternkette geprüft statt lenient
   * durchgelassen).
   */
  const existsInYear = (pl: PlaceObject): boolean => {
    if (y == null || (pl.existsFrom == null && pl.existsTo == null)) return true;
    const ef = placeYear(pl.existsFrom);
    const et = placeYear(pl.existsTo);
    return !((ef != null && y < ef) || (et != null && y > et));
  };

  const dfs = (curId: PlaceId, depth: number, seen: ReadonlySet<PlaceId>): boolean => {
    if (depth >= statedParentsNorm.length) return true; // alle Stated getroffen
    const cur = byId(curId);
    if (!cur) return true; // Knoten fehlt → nicht verifizierbar, lenient
    if (!existsInYear(cur)) return true; // Kette endet zeitlich → Präfix ok
    const entries = validEnclosures(cur);
    if (entries.length === 0) return true; // Modell-Kette endet → Präfix ok
    const want = statedParentsNorm[depth];
    for (const e of entries) {
      const childId = e.placeId;
      if (seen.has(childId)) return true; // Zyklus → wie Einzelpfad-Walk (lenient)
      const child = byId(childId);
      if (!child) return true; // dangling → lenient
      if (!nodeNames(child).has(want)) continue; // dieser Elter passt nicht → nächster
      const nextSeen = new Set(seen);
      nextSeen.add(childId);
      if (dfs(childId, depth + 1, nextSeen)) return true;
    }
    return false;
  };
  return dfs(leafId, 0, new Set([leafId]));
}

/**
 * Baut eine reine PlaceRegistry aus der placeObjects-Sammlung.
 * Deterministisch: gleiche Eingabe → gleiche Registry (Iterationsreihenfolge der Map
 * = Einfügereihenfolge; byNormAll bewahrt sie).
 */
export function makePlaceRegistry(places: PlaceObjects): PlaceRegistry {
  const byNorm = new Map<string, PlaceId>();
  const byNormAll = new Map<string, PlaceId[]>();

  for (const pl of places.values()) {
    const names = [pl.title, ...pl.pnames.map((p) => p.value)];
    const seenForThis = new Set<string>(); // ein PO zählt pro norm nur einmal
    for (const nm of names) {
      const k = normPlaceName(nm);
      if (!k || seenForThis.has(k)) continue;
      seenForThis.add(k);
      if (!byNorm.has(k)) byNorm.set(k, pl.id);
      const arr = byNormAll.get(k);
      if (arr) arr.push(pl.id);
      else byNormAll.set(k, [pl.id]);
    }
  }

  const candidatesByName = (str: string): PlaceId[] => {
    const k = normPlaceName(str);
    const ids = (k && byNormAll.get(k)) || [];
    if (ids.length < 2) return ids.slice();
    return ids
      .slice()
      .sort((a, b) => placeTypeRank(places.get(a)?.type) - placeTypeRank(places.get(b)?.type));
  };

  const enclosureWinnerAsOf = (
    id: PlaceId,
    bezug: Spanne,
  ): { placeId: PlaceId | null; truncated: boolean; ueberlappt: boolean } => {
    const pl = places.get(id);
    if (!pl) return { placeId: null, truncated: false, ueberlappt: false };
    const encs = pl.enclosedBy;
    let bestFrom = -Infinity;
    let bestId: PlaceId | null = null;
    let undated: PlaceId | null = null;
    // Wie viele DATIERTE Einträge treffen den Zeitbezug? Zwei oder mehr heißt: der
    // Tie-Break unten hat gewählt, nicht die Datenlage (BL-325). Undatierte zählen NICHT
    // mit — sie sind der Rückfall („ohne bekannte Datierung"), kein konkurrierender
    // Anspruch. Seit BL-324 kann ein tagegenauer Zeitbezug diese Zahl von 2 auf 1 senken:
    // genau darin besteht der Gewinn.
    let treffer = 0;
    for (const e of encs) {
      if (!istDatiert(e)) {
        if (undated == null) undated = e.placeId;
        continue;
      }
      if (passtZu(e, bezug)) {
        treffer += 1;
        const f = beginnWert(spanneVonDatiert(e));
        // `bestId == null` MUSS mitgeprüft werden: eine nach unten offene Zuordnung
        // (`from` fehlt, `to` gesetzt — „seit jeher bis X", Spec 11 §1) trägt
        // `f = -Infinity` und wäre gegen den Startwert `bestFrom = -Infinity` nie „größer".
        // Sie konnte deshalb NIE gewinnen: `enclosureWinnerAsOf` gab für jedes Jahr
        // innerhalb dieser Periode `null` zurück und meldete `truncated` — der Ort galt
        // dort als ohne Zugehörigkeit. Das traf die periodengerechte PLAC-Projektion
        // ebenso wie die Verwaltungsgeschichte (ADR-v9-181, BL-249). Die Vorrangregel
        // „spätestes `from` gewinnt" bleibt unverändert: ein datierter Eintrag überschreibt
        // den offenen, sobald seine Periode ebenfalls trifft.
        if (bestId == null || f > bestFrom) {
          bestFrom = f;
          bestId = e.placeId;
        }
      }
    }
    const chosen = bestId ?? undated;
    const hasDated = encs.some(istDatiert);
    return { placeId: chosen, truncated: chosen == null && hasDated, ueberlappt: treffer > 1 };
  };

  const reg: PlaceRegistry = {
    byId: (id) => places.get(id),
    findByName: (str) => {
      const c = candidatesByName(str);
      return c.length ? c[0] : null;
    },
    findAllByName: candidatesByName,
    resolveAsOf: (id, when) => {
      const pl = places.get(id);
      if (!pl) return null;
      const bezug = alsSpanne(when);
      if (bezug != null) {
        let bestFrom = -Infinity;
        let bestVal: string | null = null;
        for (const pn of pl.pnames) {
          if (!passtZu(pn, bezug)) continue;
          const f = beginnWert(spanneVonDatiert(pn));
          // Gleicher Grund wie in `enclosureWinnerAsOf` (ADR-v9-181): eine nach unten
          // offene Namensvariante („hieß bis 1400 Ochtorpe") trägt `-Infinity` und hätte
          // den Startwert nie überboten — sie fiel durch und der Ort hieß auch 1350 noch
          // nach seinem heutigen `title`.
          if (bestVal == null || f > bestFrom) {
            bestFrom = f;
            bestVal = pn.value;
          }
        }
        if (bestVal != null) return bestVal;
      }
      return pl.title || pl.pnames[0]?.value || '';
    },
    enclosureIdsAsOf: (id, when, meta) => {
      const out: PlaceId[] = [];
      const seen = new Set<PlaceId>();
      const bezug = alsSpanne(when);
      // `existsFrom`/`existsTo` bleiben Jahres-Skalare (s. `jahrAus`): sie entscheiden, OB
      // ein Knoten existiert, und tragen keinen Tie-Break — die Randberührung, um die es
      // bei BL-324 geht, gibt es hier nicht.
      const y = bezug == null ? null : jahrAus(bezug);
      let cur: PlaceId | null = id;
      while (cur && places.has(cur) && !seen.has(cur)) {
        seen.add(cur);
        const pl: PlaceObject = places.get(cur)!;
        if (y != null && (pl.existsFrom != null || pl.existsTo != null)) {
          const ef = placeYear(pl.existsFrom);
          const et = placeYear(pl.existsTo);
          if ((ef != null && y < ef) || (et != null && y > et)) break;
        }
        out.push(cur);
        if (bezug != null) {
          const w = enclosureWinnerAsOf(cur, bezug);
          if (w.truncated && meta) meta.truncated = true;
          // Gilt für die GANZE Kette, nicht nur für den Blattknoten: eine mehrdeutige
          // Ebene weiter oben bestimmt den Rest der Kette genauso.
          if (w.ueberlappt && meta) meta.ueberlappt = true;
          cur = w.placeId;
        } else {
          cur = pl.enclosedBy[0]?.placeId ?? null;
        }
      }
      return out;
    },
    enclosureChainAsOf: (id, when, meta) => {
      // Namenskette = periodenkorrekter Name JEDES Knotens der ID-Kette (gleiche Auswahl-Logik).
      const out: string[] = [];
      for (const nid of reg.enclosureIdsAsOf(id, when, meta)) {
        const name = reg.resolveAsOf(nid, when);
        if (name != null) out.push(name);
      }
      return out;
    },
  };

  return reg;
}
