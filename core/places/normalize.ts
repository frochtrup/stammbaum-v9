// core/places/normalize.ts — Norm-/Extract-Primitive (Spec 11 §4.4, LP-6).
// Reine Funktionen, keine Wall-Clock/kein Zufall (TST-3). Diese Formen werden
// ausschließlich für Identitäts-Operationen benutzt (Lookup, Bootstrap, Dedup) —
// NIE für Anzeige/Speicherung: Wire-Daten (ev.place/ev.addr) bleiben verlustfrei.

/**
 * Kanonische Norm-Form eines Orts-/Adress-Strings: NFC + casefold + Whitespace-Kollaps.
 * Grundlage jedes Identitäts-Vergleichs (zwei Schreibweisen desselben Orts kollabieren).
 *
 * Unsicherheits-Marker „?" werden ABSICHTLICH NICHT entfernt (Korrektur 2026-07-12,
 * ADR-v9-73, revidiert einen Fix vom selben Tag): ein „?" direkt am Ortsnamen
 * (`, Ochtrup ?, …`) ist eine genealogische Aussage — „nicht sicher, ob das stimmt" —,
 * kein Schreibrauschen. Ein automatisches Gleichsetzen mit dem unmarkierten Ort würde
 * diese Unsicherheit für das jeweilige Ereignis stillschweigend behaupten (verschärft
 * durch INV-PLACE: sobald `placeId` gesetzt ist, wird `event.place` bei jeder Anzeige/
 * jedem Export durch die saubere Projektion ersetzt — das „?" wäre dann spurlos weg).
 * „Ochtrup ?" bleibt deshalb ein eigener, sichtbarer Ort — Zusammenführung ist eine
 * bewusste, manuelle Nutzer-Entscheidung (Dedup-Dialog), keine automatische.
 */
export function normPlaceName(s: string | null | undefined): string {
  if (!s) return '';
  return String(s).normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Norm-Form einer Hof-Adresse. Semantisch identisch zu normPlaceName. */
export const normHofAddr = normPlaceName;

/**
 * Konvention α (Spec 11 §4.4): extrahiert die Hof-Identität aus einem Adress-String —
 * alles VOR dem ersten Komma ODER Zeilenumbruch.
 *   „Wall 33"                             → „Wall 33"
 *   „Wall 33, 48607 Ochtrup, Deutschland" → „Wall 33"
 *   „Wall 33\n48607 Ochtrup"              → „Wall 33"
 *   „Schulze-Hof"                         → „Schulze-Hof"
 * AUSNAHME: ein Komma INNERHALB einer Klammer trennt nicht (s. `trennstelleKlammerbewusst`):
 *   „Oster 64 (110, Einhorst Leibzucht)"  → „Oster 64 (110, Einhorst Leibzucht)"
 * Wire-Daten (event.addr) bleiben unverändert; der Extract gilt NUR für die
 * Hof-Identität (Norm-Lookup + Bootstrap + addrs[].value bei Neuanlage).
 */
export function extractHofAddr(addr: string | null | undefined): string {
  if (!addr) return '';
  const s = String(addr);
  const klammer = trennstelleKlammerbewusst(s);
  // Rückfall auf die nackte Regel, wenn die Klammern nicht aufgehen (ein einzelnes
  // verirrtes „(" darf nicht den ganzen Rest der Adresse verschlucken).
  const i = klammer ?? s.search(/[\n,]/);
  return (i < 0 ? s : s.slice(0, i)).trim();
}

/**
 * Erste Trennstelle (Komma/Zeilenumbruch) AUSSERHALB von Klammern — oder `null`, wenn die
 * Klammern nicht aufgehen und der Scan deshalb nichts behaupten darf.
 *
 * WARUM (2026-08-27, [ADR-v9-294]). Konvention α schnitt am ersten Komma, auch wenn dieses
 * INNERHALB einer Klammer stand. Am Realbestand betrifft das eine Adresse mit acht
 * Ereignissen: `Oster 64 (110, Einhorst Leibzucht)` wurde zu `Oster 64 (110` — einem
 * Fragment mit offener Klammer. Der Schaden blieb nicht bei der Anzeige: weil der Extract
 * dadurch nicht mehr mit dem PLAC-Leitsegment übereinstimmte, erkannte weder `seed.ts`
 * noch der Resolver die Konvention 1 („PLAC Hof, Dorf, … + ADDR Hof") — der HOFNAME wurde
 * als ORT geseedet und darin ein abgeschnittener Hof angelegt.
 *
 * Eine Klammer ist eine Klammerung des Namens, kein Ebenenwechsel; ein Komma darin trennt
 * keine Adressebenen. Der Zeilenumbruch bleibt UNBEDINGT eine Trennstelle — er kommt in
 * einer Klammerung nicht vor und ist in GEDCOM ohnehin der Ebenenwechsel (CONT).
 */
function trennstelleKlammerbewusst(s: string): number | null {
  let tiefe = 0;
  let treffer = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\n') { treffer = treffer < 0 ? i : treffer; break; }
    if (c === '(' || c === '[') { tiefe++; continue; }
    if (c === ')' || c === ']') { if (tiefe > 0) tiefe--; else return null; continue; }
    if (c === ',' && tiefe === 0 && treffer < 0) treffer = i;
  }
  if (tiefe !== 0) return null; // unbalanciert → keine Aussage
  return treffer < 0 ? s.length : treffer;
}

/**
 * Getrimmte, NICHT-LEERE Segmente eines PLAC-Strings — die EINE Segmentsicht für Seed und
 * Resolver (`seed.ts::segments`, `resolve.ts::placSegments` rufen beide hierher).
 *
 * Leere Segmente (führend, innen, abschließend — Ancestris/MyHeritage schreiben
 * Fixed-Template-PLAC mit Leerfeldern auf nicht belegten Ebenen) bedeuten „keine Angabe
 * auf dieser Ebene" und werden verworfen: das Leitsegment ist der erste NICHT-leere Wert,
 * nicht positionsstarr `segs[0]`.
 *
 * KLAMMERBEWUSST, wie `extractHofAddr` ([ADR-v9-294]) — dieselbe Regel, zweite Stelle: ein
 * Komma INNERHALB einer Klammer trennt keine Ortsebenen, es klammert einen Namen.
 * `„Oster 64 (110, Einhorst Leibzucht), Ochtrup"` sind ZWEI Ebenen, nicht drei. Ohne das
 * zerfiel der Hofname in ein Fragment plus eine erfundene Ortsebene — und weil der Extract
 * dann nicht mehr zum Leitsegment passte, kippte die Konvention-1-Erkennung dazu.
 * Gehen die Klammern nicht auf, gilt die nackte Komma-Regel (kein Verschlucken).
 */
export function splitPlacSegments(plac: string | null | undefined): string[] {
  if (!plac) return [];
  const s = String(plac);
  const roh = klammerSegmente(s) ?? s.split(',');
  return roh.map((x) => x.trim()).filter(Boolean);
}

/** Rohe Segmente an Kommas AUSSERHALB von Klammern — `null` bei unbalancierten Klammern. */
function klammerSegmente(s: string): string[] | null {
  const out: string[] = [];
  let tiefe = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '[') { tiefe++; continue; }
    if (c === ')' || c === ']') { if (tiefe > 0) tiefe--; else return null; continue; }
    if (c === ',' && tiefe === 0) { out.push(s.slice(start, i)); start = i + 1; }
  }
  if (tiefe !== 0) return null;
  out.push(s.slice(start));
  return out;
}

/**
 * Behauptet DIESES Ereignis Konvention 1 („PLAC Hof, Dorf, …" + „ADDR Hof")? — die EINE
 * Fassung dieser Frage; Seed und Resolver dürfen sie nicht verschieden beantworten.
 *
 * LIES TOLERANT (LP-6, Spec 11 §4.4). Verglichen wird gegen BEIDE Lesarten der Adresse:
 * die klammerbewusste ([ADR-v9-294]) und die nackte Komma-Regel. Grund ist eine echte
 * Datei: `PLAC „Oster 64 (110, Ochtrup (Westf.)"` hat eine offene Klammer, zerfällt
 * deshalb weiter nach der nackten Regel und trägt das Leitsegment `„Oster 64 (110"` —
 * während `ADDR „Oster 64 (110, Einhorst Leibzucht)"` aufgeht und ganz bleibt. Beide
 * meinen dieselbe Hofstelle. Ohne die Toleranz läse der Seed hier Konvention 2 und legte
 * das Hof-Fragment als ORTSEBENE an.
 */
export function istKonvention1(addr: string | null | undefined, leadSeg: string): boolean {
  const lead = normPlaceName(leadSeg);
  if (!lead || !addr) return false;
  const s = String(addr);
  const nackt = s.split(/[\n,]/)[0];
  return normPlaceName(extractHofAddr(s)) === lead || normPlaceName(nackt) === lead;
}

/** Erste 3–4-stellige Jahreszahl aus einem GEDCOM/ISO/Freitext-Datum. */
export function placeYear(d: string | number | null | undefined): number | null {
  if (d == null) return null;
  if (typeof d === 'number') return d;
  const m = String(d).match(/\d{3,4}/);
  return m ? parseInt(m[0], 10) : null;
}

// Typ-Spezifität für die Disambiguierung gleichnamiger Orte (Spec 11 §5, Aggregatoren
// id-basiert). Niedriger Rang = spezifischer (Siedlung, wo Ereignisse stattfinden);
// hoher Rang = allgemeiner (Verwaltungs-Container). „geboren in Münster" meint die
// Ortschaft, nicht den Kreis. Unknown/null liegt bewusst dazwischen.
const PLACE_SPECIFICITY: Record<string, number> = {
  Building: 0, Farm: 0, Cemetery: 0, Church: 1, Borough: 1, Neighborhood: 1, Locality: 1,
  Hamlet: 2, Parish: 2, Village: 3, Town: 4, City: 4, Municipality: 5,
  District: 7, County: 7, Region: 8, Province: 8, State: 9, Country: 10,
};

export function placeTypeRank(type: string | null | undefined): number {
  if (type == null) return 6;
  const r = PLACE_SPECIFICITY[type];
  return r == null ? 6 : r;
}

/**
 * Ab diesem Rang ist ein Ort eine VERWALTUNGSEBENE (District/County 7, Region/Province 8,
 * State 9, Country 10) und keine Stelle mehr, an der eine Hofstelle liegen kann.
 * Unbekannt/ungetypt ist 6 und liegt bewusst DARUNTER — ein frisch geseedeter Ort ohne
 * Typ darf nichts blockieren (67 von 416 Orten des Realbestands tragen keinen Typ).
 */
export const VERWALTUNGS_RANG = 7;

/**
 * Kann in einem Ort dieses Typs überhaupt ein HOF liegen? (Spec 11 §4.2, [ADR-v9-293])
 *
 * Der Hof-Bootstrap (Pfade B′/C) verankerte bis dahin an JEDEM PlaceObject, das ein
 * PLAC-Segment traf — auch an einem Landkreis oder einem Département. Gemessener Fall
 * (2026-08-27): `RESI · PLAC „Kreis Cloppenburg, Großherzogtum Oldenburg, Deutsches
 * Reich" · ADDR „Altenoythe"` erzeugte still einen Hof „Altenoythe" im PlaceObject
 * `Landkreis Cloppenburg` (type=County). In einem Kreis liegt kein Hof; dort liegen
 * Siedlungen. Was die ADDR dort nennt, ist eine dem Bestand unbekannte ORTSEBENE — und
 * damit eine Frage an den Menschen (Review), kein stiller Bootstrap.
 *
 * Bewusst über den vorhandenen `placeTypeRank` statt über eine zweite Typ-Liste: die
 * Staffelung „Siedlung … Verwaltungs-Container" ist dieselbe Frage, die die
 * Disambiguierung gleichnamiger Orte schon stellt.
 */
export function istHofFaehigerOrt(type: string | null | undefined): boolean {
  return placeTypeRank(type) < VERWALTUNGS_RANG;
}

/** Deterministischer ID-Slug: nur [a-z0-9], Randstriche entfernt. */
export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
}
