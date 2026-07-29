// ui/shell/place-labels.ts — DIE EINE deutsche Übersetzung für GRAMPS/GEDCOM-Ortstyp-Werte
// (INV-UI-4/INV-UI-8-Geist, analog event-labels.ts::eventTypeLabel).
//
// Regression-Fund (ADR-v9-149, Design-Kritik 2026-07-29): die Orte-Liste und der
// Ort-Steckbrief rendern den ROHEN englischen GRAMPS-Wert (`Town`/`State`/`Unknown`) als
// Pille — genau der v8-Altlast-Fall B7 („`Unknown`-Badge → Unbekannt"), auf einer neuen
// Fläche wiederaufgetaucht. Die deutsche Übersetzung existierte längst, aber ZWEIFACH und
// nur in Report/Story: `place-gazetteer.ts` (Nominal „Stadt"/„Dorf") und `place-context.ts`
// (Artikel-Form „eine Stadt"/„ein Dorf"), NIE in Liste/Detail. Hier konsolidiert.
export const PLACE_TYPE_DE: Record<string, string> = {
  Country: 'Land', State: 'Bundesland', Region: 'Region', Province: 'Provinz',
  County: 'Kreis', District: 'Bezirk', Municipality: 'Gemeinde', City: 'Stadt',
  Town: 'Stadt', Village: 'Dorf', Hamlet: 'Weiler', Parish: 'Pfarrei',
  Borough: 'Stadtteil', Locality: 'Ortslage', Neighborhood: 'Nachbarschaft',
  Building: 'Gebäude', Farm: 'Hof', Cemetery: 'Friedhof', Church: 'Kirche',
};

/**
 * Deutsches Label für einen GRAMPS/GEDCOM-Ortstyp.
 *
 * Leerer Typ UND der explizite Wert `Unknown` (= „Typ nicht bekannt", keine echte
 * Kategorie-Information) liefern `''` — die aufrufende Anzeige blendet den Chip dann aus.
 * Das ist die bewusste Polarität aus ADR-v9-149: ein Nicht-Informations-Zustand bekommt
 * KEINEN Dauer-Chip (dieselbe Entscheidung wie das Entfernen der „ohne Zusatzangaben"-
 * Pille) — statt „Unbekannt" auf der Mehrheit der Zeilen anzuzeigen. Ein Filter-Dropdown,
 * das den Wert dennoch anbieten muss, ersetzt `''` selbst durch „Unbekannt".
 *
 * Ein unbekannter, aber NICHT-`Unknown` Wert (z. B. ein GRAMPS-Custom-Typ) kommt roh durch
 * — keine Übersetzung erfunden (gleicher Vertrag wie `eventTypeLabel`).
 */
export function placeTypeLabel(type: string | null | undefined): string {
  if (!type || type === 'Unknown') return '';
  return PLACE_TYPE_DE[type] ?? type;
}

/** Fallback-Kategorie für nicht kategorisierte Orte — s. `placeTypeCategory`. */
export const PLACE_TYPE_UNKNOWN = 'Unbekannt';

/**
 * Wie `placeTypeLabel`, aber für FILTER/Gruppierung: der nicht kategorisierte Zustand
 * bekommt hier den echten Namen „Unbekannt" statt `''`.
 *
 * Der Unterschied ist Absicht und trägt denselben Gedanken wie ADR-v9-149 insgesamt: als
 * DAUER-CHIP auf jeder Zeile ist „unbekannt" Rauschen (der Regelfall nach dem Import) — als
 * ABFRAGE ist es nützlich („welche Orte muss ich noch kategorisieren?"). Anzeigen: nein;
 * filtern: ja. Genau die Trennung, mit der auch die „ohne Zusatzangaben"-Pille zum Filter
 * „nur unvollständige" wurde.
 */
export function placeTypeCategory(type: string | null | undefined): string {
  return placeTypeLabel(type) || PLACE_TYPE_UNKNOWN;
}
