// ui/views/research-search.ts — die EINE Textsuche der drei Forschungs-Segmente
// (BL-374, Spec 20 §1.11 a/b/d).
//
// WARUM GETEILT: Aufgaben, Protokoll und Hypothesen brauchen dieselbe Frage über
// verschiedene Felder. Drei eigene `matches…`-Funktionen wären drei Gelegenheiten, die
// Normalisierung leicht unterschiedlich zu machen — genau die Geschwister-Drift, gegen
// die INV-UI-4 steht. Geteilt ist die NORMALISIERUNG, nicht die Feldwahl: welche Felder
// zählen, weiß nur die jeweilige Fläche, und das steht dort neben ihrem Modell.
//
// Bewusst in `ui/views/` und nicht im Kern: es ist eine Anzeige-Frage über bereits
// aufbereitete Zeilen (Trägername, Kategorie-Label), nicht über das Domänenmodell.

/**
 * Trifft die Anfrage eines der Felder? Leere Anfrage trifft immer (kein Filter).
 *
 * `undefined`/leere Felder werden verworfen, damit ein fehlendes Feld nicht als leerer
 * Treffer durchgeht; verglichen wird auf einer zusammengesetzten Kleinschreibung — dieselbe
 * Form wie in `person-list-model.ts`/`source-list-model.ts`.
 */
export function matchesResearchQuery(
  felder: readonly (string | undefined | null)[],
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return felder
    .filter((f): f is string => !!f)
    .join(' ')
    .toLowerCase()
    .includes(q);
}
