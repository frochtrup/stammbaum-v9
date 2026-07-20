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
 * Wire-Daten (event.addr) bleiben unverändert; der Extract gilt NUR für die
 * Hof-Identität (Norm-Lookup + Bootstrap + addrs[].value bei Neuanlage).
 */
export function extractHofAddr(addr: string | null | undefined): string {
  if (!addr) return '';
  const m = String(addr).match(/^[^\n,]+/);
  return m ? m[0].trim() : '';
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

/** Deterministischer ID-Slug: nur [a-z0-9], Randstriche entfernt. */
export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
}
