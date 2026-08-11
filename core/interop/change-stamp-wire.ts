// core/interop/change-stamp-wire.ts — BL-337: der Änderungszeitpunkt auf dem Draht.
//
// Zwei Formate für dieselbe Sache, und deshalb genau EIN Modul: GEDCOM schreibt
// `1 CHAN / 2 DATE 3 APR 2026 / 3 TIME 12:03:12`, GRAMPS ein Pflichtattribut
// `change="1743675792"` (Epochensekunden). Das Modell hält den GEDCOM-Wortlaut
// (`Person.lastChanged` & Geschwister, Spec 10 §4); die GRAMPS-Seite rechnet hier um.
//
// WARUM NICHT ZWEI MONATSTABELLEN: `gedcom-serialize.ts` brauchte die Datums-/Zeitform
// bereits für den HEAD-DATE-Rewrite. Eine zweite Kopie für CHAN wäre die klassische
// Drift-Quelle (drei Zeilen, die zu 99 % gleich aussehen und irgendwann nicht mehr sind) —
// also wandert sie hierher, und `gedcom-serialize.ts` holt sie sich.
//
// Alles hier ist rein und uhrfrei (INV-ARCH-1, TST-3): das `Date` kommt von außen.

const MONATE = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;

/** `3 APR 2026` — die GEDCOM-Datumsform (UTC, wie der HEAD-DATE-Rewrite seit jeher). */
export function gedcomDate(d: Date): string {
  return `${d.getUTCDate()} ${MONATE[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** `12:03:12` — die GEDCOM-Zeitform. */
export function gedcomTime(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

/**
 * Der Änderungsstempel fürs Modell — `3 APR 2026 12:03:12`, exakt die Form, die
 * `parseChan` liest und `chanNode` wieder in `DATE`+`TIME` zerlegt.
 */
export function gedcomChangeStamp(now: Date): string {
  return `${gedcomDate(now)} ${gedcomTime(now)}`;
}

/**
 * Modell-Stempel → GRAMPS-`change` (Epochensekunden als String).
 *
 * `'0'` bei leerem oder unlesbarem Stempel — das ist der Wert, den GRAMPS selbst für
 * „unbekannt" führt und den v9 bis BL-337 für JEDEN Record schrieb. Der Rückfall ist also
 * kein neuer Notbehelf, sondern der bisherige Zustand als Untergrenze.
 *
 * Bewusst tolerant im Datumsteil: der Stempel kann aus einer Fremddatei stammen und dann
 * jede Schreibweise tragen, die GEDCOM erlaubt. Was nicht `TT MMM JJJJ [hh:mm:ss]` ist,
 * wird nicht geraten — `'0'` ist ehrlicher als ein erfundener Zeitpunkt.
 */
export function changeStampToEpoch(stamp: string): string {
  const m = /^(\d{1,2})\s+([A-Z]{3})\s+(\d{3,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(stamp.trim().toUpperCase());
  if (!m) return '0';
  const monat = MONATE.indexOf(m[2] as (typeof MONATE)[number]);
  if (monat < 0) return '0';
  const ms = Date.UTC(
    Number(m[3]), monat, Number(m[1]),
    Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0),
  );
  return Number.isFinite(ms) ? String(Math.floor(ms / 1000)) : '0';
}

/**
 * GRAMPS-`change` → Modell-Stempel. Umkehr von `changeStampToEpoch`; `'0'`/leer/unlesbar
 * ergibt den leeren Stempel (das Modell führt „kein Datum" als `''`, nicht als 1.1.1970 —
 * sonst zeigte die Oberfläche für jeden GRAMPS-Record „Geändert 1. Januar 1970").
 */
export function epochToChangeStamp(epoch: string): string {
  const n = Number(epoch);
  if (!Number.isFinite(n) || n <= 0) return '';
  return gedcomChangeStamp(new Date(n * 1000));
}
