// core/model/birth-from-age.ts — Geburtsdatum aus Sterbedatum + Sterbealter errechnen
// (BL-212, ADR-v9-156). Reine Funktion, DOM-/framework-frei (INV-ARCH-1).
//
// Herkunft der KODIERUNG: v8-Orakel `ui-quicktpl.js::_qtCalcBirthFromAge`. Übernommen wird
// dessen Byte-Verhalten, nicht nur die Idee (TST-6 Wert-Ebene) — namentlich:
//   * Qualifier `CAL` („errechnet"), NICHT `ABT` („ungefähr"): der Wert ist gerechnet.
//   * Die Genauigkeit des Ergebnisses folgt der des Sterbedatums — aus `MAR 1832` wird
//     nie ein taggenaues Geburtsdatum. Kirchenbuchangaben sind oft nur monats-/jahresgenau;
//     ein erfundener Tag wäre eine Genauigkeit, die die Quelle nicht hergibt.
//
// Kein eigener Datumsparser: `parseDateValue`/`formatDateValue` sind bereits DIE
// Formular-Datumslogik (INV-UI-4). Das erledigt zugleich das Qualifier-Abstreifen, für das
// das Orakel eine handgepflegte Whitelist brauchte (damit `MAR` nicht als Qualifier
// missverstanden wird).
import { parseDateValue, formatDateValue } from './gedcom-date';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;

/** Obergrenze wie im Orakel (`age < 0 || age > 130` verwirft dort das Ergebnis) — eine
 *  Tippfehler-Bremse, keine biologische Aussage. */
const MAX_AGE_YEARS = 130;

/**
 * Errechnet das Geburtsdatum aus Sterbedatum und Sterbealter.
 *
 * @param deathDate roher GEDCOM-Datumsstring (`Event.date`), auch mit Qualifier; `null`/leer erlaubt.
 * @returns rohes GEDCOM-Datum mit `CAL`-Qualifier, oder `null`, wenn nichts Belastbares
 *          errechenbar ist (kein Jahr im Sterbedatum, keine/unsinnige Altersangabe).
 */
export function birthDateFromDeathAge(
  deathDate: string | null,
  years: number | null,
  months: number | null,
  days: number | null,
): string | null {
  if (!deathDate) return null;
  const y = years ?? 0;
  const m = months ?? 0;
  const d = days ?? 0;
  // Alles 0 heißt „keine Altersangabe gemacht" — nicht „bei der Geburt gestorben".
  if (y === 0 && m === 0 && d === 0) return null;
  if (y < 0 || m < 0 || d < 0 || y > MAX_AGE_YEARS) return null;

  const parts = parseDateValue(deathDate);
  if (parts.year == null) return null;

  const leer = { qualifier: 'CAL' as const, day2: null, month2: null, year2: null };

  // (a) Taggenaues Sterbedatum → echte Kalenderarithmetik (Monatslängen/Schaltjahre),
  //     in derselben Reihenfolge wie das Orakel: Jahre, dann Monate, dann Tage.
  if (parts.day != null && parts.month != null) {
    const monthIndex = MONTHS.indexOf(parts.month as (typeof MONTHS)[number]);
    if (monthIndex >= 0) {
      const dt = new Date(parts.year, monthIndex, parts.day);
      dt.setFullYear(dt.getFullYear() - y);
      dt.setMonth(dt.getMonth() - m);
      dt.setDate(dt.getDate() - d);
      return formatDateValue({ ...leer, day: dt.getDate(), month: MONTHS[dt.getMonth()], year: dt.getFullYear() });
    }
  }

  // (b) Monat+Jahr → monatsgenau; Tage können daran nichts verfeinern.
  if (parts.month != null) {
    const monthIndex = MONTHS.indexOf(parts.month as (typeof MONTHS)[number]);
    if (monthIndex >= 0) {
      let bm = monthIndex - m;
      let by = parts.year - y;
      while (bm < 0) {
        bm += 12;
        by -= 1;
      }
      return formatDateValue({ ...leer, day: null, month: MONTHS[bm], year: by });
    }
  }

  // (c) Nur Jahr → jahresgenau.
  return formatDateValue({ ...leer, day: null, month: null, year: parts.year - y });
}
