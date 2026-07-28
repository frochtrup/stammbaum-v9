// core/places/coords.ts — Koordinaten-Eingabe aus Freitext (Spec 20 §1.7 „Bearbeitung:
// Koordinaten"). Reine Funktionen, DOM-/Framework-frei (INV-ARCH-1).
//
// Verhaltens-Orakel: legacy-v8/gedcom.js `parseCoordInput`. Kernwunsch: EIN Feld, in das
// eine komplette Apple-Maps-Koordinate eingefügt wird („52,22779° N, 7,17310° O"), wird
// automatisch in Breite/Länge zerlegt. Fällt die Eingabe nicht als Paar durch, gilt jedes
// Feld einzeln (GEDCOM `N52.2` oder Dezimalgrad, deutsches Komma erlaubt).

/** Ein aufgelöstes Koordinatenpaar (Dezimalgrad, WGS84). */
export interface CoordPair {
  lat: number;
  long: number;
}

/** Dezimalgrad-Bereich prüfen; gibt das Paar zurück oder null bei Unplausiblem. */
function bounded(lat: number, long: number): CoordPair | null {
  if (!Number.isFinite(lat) || !Number.isFinite(long)) return null;
  if (Math.abs(lat) > 90 || Math.abs(long) > 180) return null;
  return { lat, long };
}

/** Deutsches Dezimalkomma → Punkt (nur das erste Komma, wie im v8-Orakel). */
function num(s: string): number {
  return parseFloat(s.replace(',', '.'));
}

/**
 * Ein einzelner Koordinaten-Wert aus GEDCOM-/Dezimal-Text.
 * `N52.2073` → 52.2073, `S52.2073` → -52.2073, `7,17310° O` → 7.1731, `-3.48` → -3.48.
 * Richtungsbuchstabe (führend ODER nachgestellt) bestimmt das Vorzeichen: S/W negativ,
 * N/E/O positiv. Ohne Buchstabe zählt das Zahlen-Vorzeichen. `null` bei leer/unparsbar.
 */
export function parseCoordAxis(raw: string | null | undefined): number | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  const m = /^([NSEOWnseow])?\s*([-+]?[\d.,]+)\s*°?\s*([NSEOWnseow])?$/.exec(t);
  if (!m) return null;
  if (m[1] && m[3]) return null; // zwei Richtungsbuchstaben an einem Wert → ungültig
  let n = num(m[2]);
  if (!Number.isFinite(n)) return null;
  const dir = (m[1] || m[3] || '').toUpperCase();
  if (dir === 'S' || dir === 'W') n = -Math.abs(n);
  else if (dir === 'N' || dir === 'E' || dir === 'O') n = Math.abs(n);
  return n;
}

/**
 * Versucht, aus EINEM Freitext-Feld ein komplettes Breite/Länge-Paar zu lesen.
 * Erkennt drei Formen; gibt `null`, wenn keine greift (dann ist es ein Einzelwert):
 *   1. Apple-Maps deutsch:  „52,22779° N, 7,17310° O"  (Zahl, Richtung nachgestellt)
 *   2. GEDCOM führend:      „N52.2073 E7.1845" / „N52.2073, W3.48"
 *   3. reines Dezimal-Paar: „52.22779, 7.17310" / „52.22779 7.17310"
 */
export function parseCoordPair(raw: string | null | undefined): CoordPair | null {
  const s = (raw ?? '').trim();
  if (!s) return null;

  // 1. Nachgestellte Richtung (Apple Maps): <zahl>°<N/S> <sep> <zahl>°<E/O/W>.
  const trailing = /^([\d.,]+)\s*°?\s*([NSns])\s*[,;\s]+\s*([\d.,]+)\s*°?\s*([EOWeow])\s*°?$/.exec(s);
  if (trailing) {
    let lat = num(trailing[1]);
    let long = num(trailing[3]);
    if (trailing[2].toUpperCase() === 'S') lat = -lat;
    if (trailing[4].toUpperCase() === 'W') long = -long;
    return bounded(lat, long);
  }

  // 2. Führende Richtung (GEDCOM): <N/S><zahl> <sep> <E/O/W><zahl>.
  const leading = /^([NSns])\s*([\d.,]+)\s*[,;\s]+\s*([EOWeow])\s*([\d.,]+)$/.exec(s);
  if (leading) {
    let lat = num(leading[2]);
    let long = num(leading[4]);
    if (leading[1].toUpperCase() === 'S') lat = -lat;
    if (leading[3].toUpperCase() === 'W') long = -long;
    return bounded(lat, long);
  }

  // 3. Reines Dezimal-Paar ohne Richtungsbuchstaben (Punkt = Dezimal, Komma/Leerraum = Trenner).
  const parts = s.split(/\s*[,;]\s*|\s+/).filter(Boolean);
  if (parts.length === 2) {
    const lat = parseFloat(parts[0]);
    const long = parseFloat(parts[1]);
    if (Number.isFinite(lat) && Number.isFinite(long)) return bounded(lat, long);
  }
  return null;
}

/**
 * Das UI-Verhalten „Paar-vor-Einzel": zuerst versuchen, das erste Feld als komplettes
 * Paar zu lesen (Einfüge-Fall); sonst beide Felder einzeln auflösen. Leere Felder → null.
 */
export function resolveCoordFields(
  latRaw: string,
  longRaw: string,
): { lat: number | null; long: number | null } {
  const pair = parseCoordPair(latRaw);
  if (pair) return pair;
  return { lat: parseCoordAxis(latRaw), long: parseCoordAxis(longRaw) };
}
