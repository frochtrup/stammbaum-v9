// ui/shell/command-palette-model.ts — was die Befehlspalette (⌘K) anzeigt, als reine
// Funktion (Spec 21 §3, BL-93).
//
// Zwei Quellen, keine eigene:
//   1. die Navigationsziele aus dem EINEN Register (nav-model.ts, INV-UI-15) — "Gehe zu"
//   2. die Treffer der EINEN globalen Suche (global-search-model.ts, BL-14)
//
// `globalSearch` trägt in seinem eigenen Kopfkommentar bereits die Zusage
// "Command-Palette-tauglich" (reine Funktion, kein eigener Zustand). Diese Datei löst
// sie ein, statt einen zweiten Suchkern zu bauen — die Palette ist laut Spec 21 §3 das
// "Desktop-Pendant zur Suche" und muss dieselben Treffer liefern wie die Suchfläche,
// sonst hätte der Nutzer zwei Suchen mit unterschiedlichem Ergebnis.
//
// DOM-frei und rune-frei: die Tastaturnavigation (rauf/runter/Enter) läuft über den
// Index in einer FLACHEN Liste, und genau die liefert `buildCommands`. Damit ist der
// heikelste Teil der Palette ohne Browser testbar.
import type { Database } from '../../core/model/types';
import type { PlaceContext } from '../../core/places';
import { NAV_TARGETS, type NavTargetId } from './nav-model';
import { globalSearch, MIN_QUERY_LENGTH, type SearchResultRow } from '../views/search/global-search-model';

export type CommandKind = 'nav' | 'person' | 'family' | 'source' | 'place' | 'hof';

export interface Command {
  kind: CommandKind;
  /** Ziel-Id bei `nav`, sonst die Entitäts-Id. */
  id: string;
  primary: string;
  secondary: string;
  /** Volle Ortskette für den Tooltip (INV-UI-14) — nur bei Personen/Familien gesetzt. */
  secondaryFull?: string;
  /** Überschrift, unter der der Befehl in der Liste steht. */
  group: string;
}

/**
 * Höchstens so viele Treffer je Entitätsgruppe.
 *
 * Nicht kosmetisch: eine zweistellige Anfrage trifft im Referenzbestand (3.180 Personen)
 * dreistellig, und eine Palette, die 400 Zeilen rendert, ist als Sprungwerkzeug wertlos —
 * man tippt weiter, statt zu scrollen. Wer wirklich alle Treffer sehen will, ist auf der
 * Suchfläche richtig (Spec 20 §1.1), nicht in der Palette.
 */
export const MAX_PER_GROUP = 8;

const GROUP_LABEL: Record<Exclude<CommandKind, 'nav'>, string> = {
  person: 'Personen',
  family: 'Familien',
  source: 'Quellen',
  place: 'Orte',
  hof: 'Höfe',
};

function toCommands(kind: Exclude<CommandKind, 'nav'>, rows: SearchResultRow[]): Command[] {
  return rows.slice(0, MAX_PER_GROUP).map((r) => ({
    kind,
    id: r.id,
    primary: r.primary,
    secondary: r.secondary,
    secondaryFull: r.secondaryFull,
    group: GROUP_LABEL[kind],
  }));
}

/**
 * Baut die flache Befehlsliste zur aktuellen Eingabe.
 *
 * Reihenfolge: Navigationsziele zuerst, dann Treffer. Grund ist die leere Eingabe —
 * ⌘K ohne Tippen soll sofort etwas Nützliches zeigen (wohin kann ich springen?), nicht
 * eine leere Fläche mit Cursor. Ungebaute Ziele (`implemented: false`) erscheinen nicht:
 * ein Befehl, der nichts tut, ist schlimmer als ein fehlender.
 */
export function buildCommands(db: Database, ctx: PlaceContext, query: string): Command[] {
  const q = query.trim().toLowerCase();

  const nav: Command[] = NAV_TARGETS.filter((t) => t.implemented)
    .filter((t) => q === '' || t.label.toLowerCase().includes(q))
    .map((t) => ({
      kind: 'nav' as const,
      id: t.id,
      primary: t.label,
      secondary: '',
      group: 'Gehe zu',
    }));

  if (q.length < MIN_QUERY_LENGTH) return nav;

  const found = globalSearch(db, ctx, query);
  return [
    ...nav,
    ...toCommands('person', found.persons),
    ...toCommands('family', found.families),
    ...toCommands('source', found.sources),
    ...toCommands('place', found.places),
    ...toCommands('hof', found.hofs),
  ];
}

/**
 * Bewegt die Auswahl in der flachen Liste und läuft dabei um.
 *
 * Umlaufen statt an den Enden zu klemmen: in einer Palette ist "vom ersten Eintrag
 * einmal hoch" der schnellste Weg zum letzten. Bei leerer Liste bleibt es bei 0 —
 * kein `-1`, das der Aufrufer gesondert behandeln müsste.
 */
export function moveSelection(current: number, delta: number, length: number): number {
  if (length === 0) return 0;
  return (((current + delta) % length) + length) % length;
}

/** Ist dieser Befehl ein Navigationsziel? Schmale Typwache für den Aufrufer. */
export function isNavCommand(cmd: Command): cmd is Command & { kind: 'nav'; id: NavTargetId } {
  return cmd.kind === 'nav';
}
