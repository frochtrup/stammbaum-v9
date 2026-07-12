// core/model/gedcom-date.ts — strukturierte Datums-Ein-/Ausgabe für das Formular
// (Spec 10 §5.2 · Spec 20 §2 "Datum: Qualifier-Dropdown + Tag/Monat/Jahr").
//
// `Event.date` (DateValue = string) ist ein normalisierter roher GEDCOM-Datumsstring
// (z. B. `12 MAR 1890`, `ABT 1875`, `BET 1880 AND 1890`, `FROM 1985 TO 2005`). Diese
// beiden reinen Funktionen zerlegen ihn in editierbare Teile (parseDateValue) und bauen
// ihn wieder zusammen (formatDateValue) — reine Formular-Hilfslogik, KEIN Bezug zum
// GEDCOM-Parser/Writer (core/interop bleibt unberührt).
//
// DOM-frei, framework-frei (INV-ARCH-1), build-frei testbar (INV-ARCH-2).

/** Kanonische 3-Buchstaben-Monatscodes (GEDCOM 5.5.1). */
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;
const MONTH_SET = new Set<string>(MONTHS);

/** Deutsche Vollnamen je kanonischem Monatscode, für formatDateForDisplay (Spec 10 §5.2).
 *  Bewusst keine Ableitung aus MONTH_NAME_TO_CODE (dessen Werte sind lowercase/normiert
 *  fürs Parsen, nicht fürs Anzeigen) — eine kleine, eigene Umkehr-Tabelle ist hier klarer. */
const MONTH_CODE_TO_LABEL_DE: Record<string, string> = {
  JAN: 'Januar', FEB: 'Februar', MAR: 'März', APR: 'April', MAY: 'Mai', JUN: 'Juni',
  JUL: 'Juli', AUG: 'August', SEP: 'September', OCT: 'Oktober', NOV: 'November', DEC: 'Dezember',
};

export type DateQualifier = 'EXACT' | 'ABT' | 'CAL' | 'EST' | 'BEF' | 'AFT' | 'BET' | 'FROM';

/** Zweistellige Qualifier haben eine zweite Grenze (`BET…AND…`, `FROM…TO…`). */
const RANGE_QUALIFIERS = new Set<DateQualifier>(['BET', 'FROM']);

/** Editierbare Teile eines GEDCOM-Datumsstrings. day2/month2/year2 nur bei BET/FROM. */
export interface DateParts {
  qualifier: DateQualifier;
  day: number | null;
  /** JAN..DEC, 3-stellig normiert; null wenn nicht angegeben/nicht parsbar. */
  month: string | null;
  year: number | null;
  day2: number | null;
  month2: string | null;
  year2: number | null;
}

/**
 * Normiert eine Monatseingabe auf `JAN`..`DEC`. Akzeptiert:
 *  - Zahlen 1–12 (auch als String, z. B. "03"),
 *  - deutsche Monatsnamen (voll + gebräuchliche Kurzform, case-insensitiv),
 *  - englische Monatsnamen (voll + Kurzform, case-insensitiv),
 *  - bereits kanonische Codes (`JAN`…).
 * Sonst `null`. Reine Formular-Normalisierung VOR formatDateValue.
 */
export function normalizeMonth(input: string | number): string | null {
  if (typeof input === 'number') {
    return Number.isInteger(input) && input >= 1 && input <= 12 ? MONTHS[input - 1] : null;
  }
  const raw = input.trim();
  if (raw === '') return null;

  // Reine Zahl (führende Nullen erlaubt).
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    return n >= 1 && n <= 12 ? MONTHS[n - 1] : null;
  }

  const key = raw.toLowerCase().replace(/ä/g, 'ae').replace(/\./g, '');
  return MONTH_NAME_TO_CODE.get(key) ?? null;
}

/** Namens-Lookup (DE + EN, voll + Kurzform) → kanonischer Code. Keys sind bereits
 *  lowercased, ä→ae normalisiert und punkt-frei (siehe normalizeMonth). */
const MONTH_NAME_TO_CODE: Map<string, string> = (() => {
  const m = new Map<string, string>();
  const add = (code: string, ...names: string[]): void => {
    m.set(code.toLowerCase(), code);
    for (const n of names) m.set(n.toLowerCase().replace(/ä/g, 'ae'), code);
  };
  add('JAN', 'januar', 'jan', 'january');
  add('FEB', 'februar', 'feb', 'february');
  add('MAR', 'maerz', 'mrz', 'mar', 'march'); // "märz" → key "maerz"
  add('APR', 'april', 'apr');
  add('MAY', 'mai', 'may');
  add('JUN', 'juni', 'jun', 'june');
  add('JUL', 'juli', 'jul', 'july');
  add('AUG', 'august', 'aug');
  add('SEP', 'september', 'sep', 'sept');
  add('OCT', 'oktober', 'okt', 'oct', 'october');
  add('NOV', 'november', 'nov');
  add('DEC', 'dezember', 'dez', 'dec', 'december');
  return m;
})();

/** Parst ein Tag/Monat/Jahr-Tripel aus Tokens (bereits ohne Qualifier). */
function parseTriple(tokens: string[]): { day: number | null; month: string | null; year: number | null } {
  let day: number | null = null;
  let month: string | null = null;
  let year: number | null = null;

  for (const tok of tokens) {
    const up = tok.toUpperCase();
    if (MONTH_SET.has(up)) {
      month = up;
    } else if (/^\d+$/.test(tok)) {
      // Erste Zahl vor dem Monat = Tag; die Jahres-Zahl ist die letzte/größere.
      // Heuristik: 1–2-stellig und noch kein Jahr belegt UND Monat noch nicht gesehen? → Tag.
      const n = Number(tok);
      if (tok.length <= 2 && year === null && month === null) {
        day = n;
      } else {
        year = n;
      }
    }
    // Nicht-Monats-Buchstaben-Token (z. B. "FOO") werden ignoriert → month bleibt null.
  }
  return { day, month, year };
}

/**
 * Zerlegt einen rohen GEDCOM-Datumsstring in editierbare Teile. Defensiv: ein nicht
 * parsbarer Monat führt zu `month: null` statt zu einem Crash. Ein nicht erkannter
 * Qualifier wird als `EXACT` behandelt und die verbleibenden Tokens normal geparst.
 */
export function parseDateValue(raw: string): DateParts {
  const empty: DateParts = {
    qualifier: 'EXACT', day: null, month: null, year: null,
    day2: null, month2: null, year2: null,
  };
  const tokens = raw.trim().split(/\s+/).filter((t) => t !== '');
  if (tokens.length === 0) return empty;

  const head = tokens[0].toUpperCase();

  // Zweiteilige Qualifier: BET … AND … / FROM … TO …
  if (head === 'BET' || head === 'FROM') {
    const sep = head === 'BET' ? 'AND' : 'TO';
    const rest = tokens.slice(1);
    const sepIdx = rest.findIndex((t) => t.toUpperCase() === sep);
    if (sepIdx >= 0) {
      const left = parseTriple(rest.slice(0, sepIdx));
      const right = parseTriple(rest.slice(sepIdx + 1));
      return {
        qualifier: head as DateQualifier,
        day: left.day, month: left.month, year: left.year,
        day2: right.day, month2: right.month, year2: right.year,
      };
    }
    // Kein Trennwort gefunden → nur linke Grenze (defensiv).
    const left = parseTriple(rest);
    return { qualifier: head as DateQualifier, ...left, day2: null, month2: null, year2: null };
  }

  // Einteilige Qualifier
  if (head === 'ABT' || head === 'CAL' || head === 'EST' || head === 'BEF' || head === 'AFT') {
    const t = parseTriple(tokens.slice(1));
    return { qualifier: head as DateQualifier, ...t, day2: null, month2: null, year2: null };
  }

  // Kein Qualifier → EXACT.
  const t = parseTriple(tokens);
  return { qualifier: 'EXACT', ...t, day2: null, month2: null, year2: null };
}

/** Baut ein Tag/Monat/Jahr-Tripel als String zusammen (Teilangaben erlaubt). */
function formatTriple(day: number | null, month: string | null, year: number | null): string {
  const parts: string[] = [];
  if (day != null) parts.push(String(day));
  if (month != null) parts.push(month);
  if (year != null) parts.push(String(year));
  return parts.join(' ');
}

/**
 * Baut aus den Teilen wieder den rohen GEDCOM-String zusammen (inverse zu parseDateValue).
 * Erfüllt formatDateValue(parseDateValue(raw)) === raw für alle Qualifier- und
 * Teildatum-Kombinationen. Monatswerte werden verbatim übernommen — Normalisierung von
 * Nutzereingaben ist Aufgabe von normalizeMonth VOR dem Aufruf.
 */
export function formatDateValue(parts: DateParts): string {
  const left = formatTriple(parts.day, parts.month, parts.year);

  if (RANGE_QUALIFIERS.has(parts.qualifier)) {
    const sep = parts.qualifier === 'BET' ? 'AND' : 'TO';
    const right = formatTriple(parts.day2, parts.month2, parts.year2);
    return `${parts.qualifier} ${left} ${sep} ${right}`;
  }

  if (parts.qualifier === 'EXACT') return left;
  return `${parts.qualifier} ${left}`;
}

/** Baut ein Tag/Monat/Jahr-Tripel als lokalisierte Anzeige-Form zusammen (Spec 10 §5.2):
 *  Tag+Monat+Jahr → "12. März 1890", nur Monat+Jahr → "März 1890", nur Jahr → "1890".
 *  Ein nicht übersetzbarer Monat (z. B. defensiver parseDateValue-Fehlerfall) fällt auf
 *  den rohen Code zurück statt die Information stillschweigend zu verwerfen. */
function formatTripleForDisplay(day: number | null, month: string | null, year: number | null): string {
  const monthLabel = month != null ? (MONTH_CODE_TO_LABEL_DE[month] ?? month) : null;
  if (day != null && monthLabel != null && year != null) return `${day}. ${monthLabel} ${year}`;
  if (day == null && monthLabel != null && year != null) return `${monthLabel} ${year}`;
  if (day == null && monthLabel == null && year != null) return String(year);
  // Degenerierter Rest (z. B. Tag ohne Monat, oder gar kein Jahr) — defensiv, verliert
  // keine geparsten Teile, statt sie stillschweigend wegzulassen.
  const parts: string[] = [];
  if (day != null) parts.push(`${day}.`);
  if (monthLabel != null) parts.push(monthLabel);
  if (year != null) parts.push(String(year));
  return parts.join(' ');
}

/**
 * Formatiert einen rohen GEDCOM-Datumsstring als VOLLES, lokalisiertes Anzeige-Datum
 * (Eigene-Ereignis-Kontext, [21 INV-UI-9](../../../specs/v9/21-UI-UX.md)) — Tag+Monat wo
 * vorhanden, deutscher Monatsname, Qualifier-Präfix (`ca.`/`errechnet`/`geschätzt`/`vor`/
 * `nach`), `zwischen X und Y`/`X–Y` bei `BET`/`FROM`. Nutzt denselben `parseDateValue`-
 * Parser wie das Formular (kein zweiter Parser, INV-UI-4) — nur die Formatierungstiefe
 * unterscheidet sich von `formatDateValue`/Jahr-only. Für die knappe Disambiguierungs-
 * Form siehe `ui/shell/person-display.ts::eventYearLabel`.
 */
export function formatDateForDisplay(raw: string | null): string {
  if (raw == null || raw.trim() === '') return '';
  const parts = parseDateValue(raw);
  const left = formatTripleForDisplay(parts.day, parts.month, parts.year);

  if (RANGE_QUALIFIERS.has(parts.qualifier)) {
    const right = formatTripleForDisplay(parts.day2, parts.month2, parts.year2);
    return parts.qualifier === 'BET' ? `zwischen ${left} und ${right}` : `${left}–${right}`;
  }

  switch (parts.qualifier) {
    case 'ABT': return `ca. ${left}`;
    case 'CAL': return `errechnet ${left}`;
    case 'EST': return `geschätzt ${left}`;
    case 'BEF': return `vor ${left}`;
    case 'AFT': return `nach ${left}`;
    default: return left;
  }
}
