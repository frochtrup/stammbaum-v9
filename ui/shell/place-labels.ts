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

/**
 * Die kuratierte Auswahl für den Ort-Editor (BL-203-Geschwister, `TypeSelect.svelte`).
 *
 * ADR-v9-149 hat die ANZEIGE des Ortstyps auf Deutsch umgestellt, die BEARBEITUNG aber
 * als englisches Freitextfeld stehen lassen (`z. B. Village, City, County…`) — der Nutzer
 * tippte englisch, die Liste zeigte deutsch. Dieselbe Lücke, die BL-203 für den Archivtyp
 * beschreibt; hier mit demselben Mechanismus geschlossen.
 *
 * `Unknown` ist WÄHLBAR („Unbekannt"), obwohl `placeTypeLabel` dafür '' liefert — die
 * Trennung „anzeigen nein, auswählen ja" (analog `placeTypeCategory`). Bewusst NICHT in
 * `PLACE_TYPE_DE` aufgenommen: dort gilt der Vertrag „Schlüssel → sein Anzeige-Label",
 * den `Unknown` gerade nicht erfüllt.
 */
export const PLACE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '— kein Typ —' },
  ...Object.entries(PLACE_TYPE_DE).map(([value, label]) => ({ value, label })),
  { value: 'Unknown', label: PLACE_TYPE_UNKNOWN },
];

/**
 * Überschrift eines Orts bzw. Hofs, wenn er (noch) keinen Namen trägt (BL-237).
 *
 * WARUM NICHT DIE ID: `placeDisplayName` endet als letzten Rückfall bei `po.id`, und die
 * Hof-Ansichten taten dasselbe inline mit `addrs[0]?.value || hof.id`. Eine Id wie
 * `_hof_bauernschaft_rummler_nr_16_ep_3fff290c` beantwortet die Frage „welcher Hof ist
 * das?" nicht — sie ist ein Schlüssel und trägt nach einem Dorfwechsel (ADR-v9-172) sogar
 * den Slug des ALTEN Dorfes, ist also nicht nur unlesbar, sondern irreführend.
 *
 * Der Rückfall greift nur, wenn ein Objekt tatsächlich keinen Namen hat — bei Orten nie
 * direkt nach dem Import (der Seed setzt den Titel), bei Höfen nie nach dem Bootstrap (der
 * setzt `addrs[0]`). Er entsteht erst, wenn jemand alle Namen entfernt.
 *
 * In Klammern gesetzt: das ist eine Aussage ÜBER den Eintrag, kein Name.
 */
export const OHNE_NAMEN = '(ohne Namen)';
export const OHNE_ADRESSE = '(ohne Adresse)';

/** Überschrift eines Orts — `placeDisplayName` (INV-UI-14) mit lesbarem Rückfall. */
export function placeHeading(po: { shortName?: string; title?: string } | null | undefined): string {
  if (!po) return OHNE_NAMEN;
  return po.shortName || po.title || OHNE_NAMEN;
}

/** Überschrift eines Hofs — sein „Name" IST `addrs[0].value` (Spec 11 §1). */
export function hofHeading(hof: { addrs?: readonly { value: string }[] } | null | undefined): string {
  return hof?.addrs?.[0]?.value || OHNE_ADRESSE;
}

/**
 * Deutsches Label des Anreicherungs-Grads (ADR-v9-191) — DIE EINE Quelle, analog
 * `placeTypeLabel` (INV-UI-4): Dedup-Dialog, Orts-Review und Listen-Filter greifen alle
 * hierher, damit dieselbe Stufe überall dasselbe Wort trägt.
 *
 * `none` liefert bewusst einen Text (nicht `''` wie beim Typ): dort, wo der Grad überhaupt
 * gezeigt wird, ist er Entscheidungsgrundlage, und „hier steht nichts" ist genau die
 * Auskunft, die gebraucht wird. Auf Listenzeilen erscheint er deshalb NICHT (ADR-v9-149).
 *
 * Die Wörter beschreiben den Datenstand, nicht die Arbeit des Nutzers — „dürftig" oder
 * „ungepflegt" wären ein Urteil über den Forschenden, nicht über den Eintrag.
 */
export function enrichmentLabel(level: 'none' | 'sparse' | 'rich'): string {
  if (level === 'none') return 'ohne Zusatzangaben';
  return level === 'sparse' ? 'wenig ergänzt' : 'ausführlich';
}
