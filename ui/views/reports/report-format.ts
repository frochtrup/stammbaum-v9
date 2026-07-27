// ui/views/reports/report-format.ts — geteilte Präsentations-Helfer der Druck-Ausgaben
// (BL-170…, Spec 20 §4). Reine Funktionen über core-Felder; DOM-frei, damit die Report-
// Builder headless goldfile-testbar bleiben.
//
// Bewusst in ui/views/reports (nicht services/): die Builder teilen sich hier bereits
// vorhandene ui-Projektionen (displayName, eventYearLabel) — „kein zweiter Rechenweg"
// (Spec 20 §4). Die geteilte HÜLLE (renderReport/esc) liegt darunter in services/reports
// und wird nach unten importiert (INV-ARCH-1).
import type { Event, Person } from '../../../core/model/types';
import { formatDateForDisplay } from '../../../core/model/gedcom-date';
import { displayName, eventYearLabel } from '../../shell/person-display';

export { esc } from '../../../services/reports';

/** Anzeigename einer Person für den Druck — dieselbe Quelle wie Listen/Detail (INV-UI-4). */
export function personName(p: Person): string {
  return displayName(p);
}

/**
 * Lebensklammer „(*1850 †1920)" aus Geburt/Taufe bzw. Tod/Beerdigung (Orakel
 * `_poLifeYears`). Leere Klammer wird zu '' — der Aufrufer hängt sie nur an, wenn belegt.
 */
export function lifeYears(p: Person): string {
  const b = eventYearLabel(p.birth) || eventYearLabel(p.chr);
  const d = eventYearLabel(p.death) || eventYearLabel(p.buri);
  if (!b && !d) return '';
  return `(${b ? '*' + b : ''}${b && d ? ' ' : ''}${d ? '†' + d : ''})`;
}

/** Kompakte Ereigniszeile „Datum, Ort" (Orakel `_poEvLine`). Nutzt den rohen `ev.place`
 *  (die originale GEDCOM-Angabe) — ein Druck-Report ist eine getreue Wiedergabe der Daten. */
export function eventLine(ev: Event | null | undefined): string {
  if (!ev) return '';
  return [formatDateForDisplay(ev.date), (ev.place ?? '').trim()].filter(Boolean).join(', ');
}

/** Jahr als 4-stellige Zeichenkette oder '' (Sortier-/Kurzanzeige). */
export function yearOf(ev: Event | null | undefined): string {
  return ev ? eventYearLabel(ev) : '';
}
