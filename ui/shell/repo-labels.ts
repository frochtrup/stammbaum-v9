// ui/shell/repo-labels.ts — DIE EINE deutsche Übersetzung für Archivtyp-Werte
// (`Repository.type`, BL-203). Geschwister-Modul von `place-labels.ts`; derselbe Vertrag
// (INV-UI-4/INV-UI-8-Geist, analog `eventTypeLabel`/`placeTypeLabel`).
//
// Der Wert reist über GRAMPS `<type>` und GEDCOM `_RTYPE` und wurde bislang an VIER
// Flächen roh englisch gezeigt (Archiv-Steckbrief, Archiv-Liste, Archiv-Picker) bzw. roh
// englisch getippt (Archiv-Editor, Freitextfeld) — derselbe v8-Altlast-Fall B7, den
// ADR-v9-149 für den Ortstyp geschlossen hat.
//
// **Werteliste bewusst NICHT aus dem v8-Orakel übernommen.** `ui-forms-repo.js::REPO_TYPES`
// nennt sich „GRAMPS-kompatible Standardwerte", ist es aber nur teilweise: `Registry`,
// `Private` und `Website` existieren in `gramps/gen/lib/repotype.py` nicht (dort heißt es
// `Web site`), und `Album`/`Bookstore`/`Safe` fehlen umgekehrt. Kuratiert wird deshalb
// gegen die öffentliche GRAMPS-Definition; die zwei genealogisch wichtigen deutschen
// Kategorien, die dort kein Gegenstück haben, bleiben als CUSTOM-Werte erhalten — dann
// aber DEUTSCH (Wert === Anzeige), weil ein englisches `Registry` in GRAMPS ohnehin als
// Custom-Typ landet und dort dann englisch angezeigt würde.
export const REPO_TYPE_LABELS: Record<string, string> = {
  // GRAMPS-Standard (gramps/gen/lib/repotype.py)
  Library: 'Bibliothek',
  Archive: 'Archiv',
  Church: 'Kirche / Pfarramt',
  Cemetery: 'Friedhof',
  Collection: 'Sammlung',
  'Web site': 'Webseite',
  Bookstore: 'Buchhandlung',
  Album: 'Album',
  Safe: 'Tresor',
  Unknown: 'Unbekannt',
  // GRAMPS-Custom-Werte für den deutschen Bestand (Wert === Anzeige)
  Standesamt: 'Standesamt',
  Privatbesitz: 'Privatbesitz',
};

/**
 * Deutsches Label für einen Archivtyp — für ANZEIGE-Flächen (Steckbrief-Zeile,
 * Listenzeile, Picker-Untertitel).
 *
 * Leerer Typ UND `Unknown` liefern `''`; die aufrufende Fläche blendet die Zeile dann
 * aus. Das ist dieselbe Polarität wie `placeTypeLabel` (ADR-v9-149): ein
 * Nicht-Informations-Zustand bekommt kein Dauer-Label.
 *
 * Ein unbekannter Custom-Wert kommt roh durch — keine Übersetzung erfunden.
 */
export function repoTypeLabel(type: string | null | undefined): string {
  if (!type || type === 'Unknown') return '';
  return REPO_TYPE_LABELS[type] ?? type;
}

/**
 * Die kuratierte Auswahl für den Archiv-Editor — „anzeigen nein, auswählen ja", dieselbe
 * Trennung wie `placeTypeCategory` (ADR-v9-149 Punkt 5).
 *
 * `Unknown` ist hier WÄHLBAR („Unbekannt"), obwohl `repoTypeLabel` dafür `''` liefert:
 * GRAMPS unterscheidet „kein Typ gesetzt" von „ausdrücklich unbekannt". Wäre nur der
 * leere Zustand wählbar, würde ein Öffnen+Speichern einen vorhandenen `Unknown` still in
 * `''` verwandeln — ein Wertverlust über den Editor (LP-1).
 */
export const REPO_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '— kein Typ —' },
  ...Object.entries(REPO_TYPE_LABELS).map(([value, label]) => ({ value, label })),
];
