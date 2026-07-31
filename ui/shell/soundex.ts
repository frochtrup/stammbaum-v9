// ui/shell/soundex.ts — deutsch-adaptierter Soundex-Algorithmus (BL-10, ADR-v9-159).
//
// Wörtlich portiert aus dem v8-Orakel `ui-views-search.js:5-20` (Testframework TST-6,
// Wert-Ebene: die Kodierung IST das Verhalten, keine eigene Variante erfinden) — inkl.
// der Umlaut-/ß-Faltung, `ph`->`f`, der Konsonanten-Ziffern-Map und der Dopplungs-
// Zusammenziehung (zwei aufeinanderfolgende Konsonanten derselben Ziffernklasse zählen
// als EIN Codepunkt). Einzige Änderung gegenüber dem Orakel: TypeScript-Typisierung,
// keine Verhaltensänderung.
//
// DOM-frei (INV-ARCH-1: Schale darf reine Logik haben, aber kein Framework-/DOM-Zugriff
// hier); unit-getestet in tests/ui/soundex.test.ts.

const SOUNDEX_MAP: Record<string, number> = {
  b: 1, f: 1, p: 1, v: 1,
  c: 2, g: 2, j: 2, k: 2, q: 2, s: 2, x: 2, z: 2,
  d: 3, t: 3,
  l: 4,
  m: 5, n: 5,
  r: 6,
};

/**
 * Deutsch-adaptierter Soundex-Code: erster Buchstabe (groß) + 3 Ziffern (mit Nullen
 * aufgefüllt). Gleicher Code für phonetisch ähnliche Namen (Meyer/Maier/Mayr,
 * Schmidt/Schmitt, …). Leerer/nicht-alphabetischer Input liefert `''` (kein Code).
 */
export function germanSoundex(str: string): string {
  if (!str) return '';
  const s = str
    .toLowerCase()
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 's')
    .replace(/ph/g, 'f')
    .replace(/[^a-z]/g, '');
  if (!s) return '';

  const first = s[0].toUpperCase();
  let code = '';
  let prev = SOUNDEX_MAP[s[0]] || 0;
  for (let i = 1; i < s.length && code.length < 3; i++) {
    const c = SOUNDEX_MAP[s[i]];
    if (c && c !== prev) code += c;
    prev = c || 0;
  }
  return first + (code + '000').slice(0, 3);
}

/**
 * `true`, wenn die Anfrage ausschließlich aus Buchstaben (inkl. deutscher Umlaute/ß)
 * besteht — Guard für den Soundex-Modus (ADR-v9-159: „greift wie in v8 nur bei reinen
 * Buchstaben-Anfragen"; Orakel-Guard `/^[a-zäöüß]+$/i.test(lower)`).
 */
export function isPureLetterQuery(str: string): boolean {
  return /^[a-zäöüß]+$/i.test(str);
}
