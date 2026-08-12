// ui/shell/source-label.ts — die Kurzbeschriftung EINER Quelle, an EINER Stelle (INV-UI-4).
//
// `abbr || title || id` stand bis BL-350 wortgleich in LogView, HypothesesView und
// EventCitationsSection (und sinngleich in weiteren Ansichten). Genau diese Kopier-Klasse
// hat der Steckbrief schon zweimal bezahlt (BL-342 Überschrift, BL-343 Abstand): solange
// alle Kopien gleich sind, fällt nichts auf — die erste Ansicht, die den Fallback anders
// ordnet, zeigt dann still eine andere Quelle als ihre Nachbarin.
//
// Die Reihenfolge ist eine Entscheidung, kein Zufall: `abbr` ist die Kurzform, die der
// Nutzer für genau diesen Zweck gepflegt hat; `title` ist der volle Titel (in einer
// Zeile schnell zu lang); die `id` ist der letzte Ausweg, damit eine Zeile nie leer
// bleibt. Fehlt der Datensatz ganz (gelöschte Quelle, fremde Datei), bleibt die
// referenzierte Id stehen — sichtbar kaputt ist besser als unsichtbar weg.
import type { Database } from '../../core/model/types';

export function sourceLabel(db: Database, sourceId: string): string {
  const s = db.sources.get(sourceId);
  return s ? s.abbr || s.title || s.id : sourceId;
}
