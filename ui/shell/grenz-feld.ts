// ui/shell/grenz-feld.ts — die EINE Reaktion auf eine unlesbare Perioden-Grenze
// (BL-324-Nachtrag, ADR-v9-243).
//
// DER BEFUND, DER DAS AUSLÖSTE. Die erste Fassung der Zeitraum-Felder war ein freies
// Textfeld, das Unlesbares still als „offen" las. Am laufenden System gemessen: „xyz" in
// ein Von-Feld leerte die Zuordnung — und weil eine nach unten offene Zuordnung in der
// Liste nach VORN sortiert wird (Spec 11 §1), sprang die Zeile, und die unmittelbar
// folgende Korrektur traf eine andere. Ergebnis war eine invertierte Periode
// (`von: 1 OCT 1810`, `bis: 30 SEP 1810`), die niemand beanstandete. Das ist genau der
// stille Verlust, gegen den das vorherige `<input type="number">` schützte, indem es
// Buchstaben gar nicht erst annahm.
//
// DIE ANTWORT IST ABLEHNEN, NICHT RATEN. Eine Grenze ist Auswertungsgrundlage
// ([11 §5](../../../specs/v9/11-Orte-Hoefe-Identitaet.md): sie speist `enclosureWinnerAsOf`
// und damit die PLAC-Projektion) — bei einer unverständlichen Eingabe ist „nichts tun und
// den alten Wert zurückstellen" die einzige Antwort, die keine Behauptung aufstellt.
// Sichtbar ist sie, weil das Feld vor den Augen des Nutzers zurückspringt.
//
// EIN Mechanismus für beide Flächen (INV-UI-4): `PlaceEnclosureEditModal` und
// `PlaceNamesSection` haben dieselbe Zeitraum-Zeile, und eine zweite Fassung dieser
// Entscheidung wäre die nächste, die auseinanderläuft.
import { grenzeAusEingabe, type Grenze } from '../../core/places';

/**
 * Liest ein Zeitraum-Feld nach einem `change`. Bei lesbarer Eingabe die Grenze, sonst
 * `null` — und das Feld springt sichtbar auf `bisher` zurück.
 *
 * Der Aufrufer MUSS auf `null` prüfen; der Typ lässt nichts anderes zu (`Grenze | null`
 * ist hier ungefährlich, anders als beim Kern-Rückgabewert: `updatePname`/
 * `updateEnclosedBySpan` nehmen `Grenze`, kein `GrenzEingabe`, also ist ein
 * durchgereichtes `null` ein Typfehler statt einer stillen Löschung).
 */
export function grenzeAusFeld(feld: HTMLInputElement, bisher: string): Grenze | null {
  const lesung = grenzeAusEingabe(feld.value);
  if (!lesung.ok) {
    feld.value = bisher;
    return null;
  }
  return lesung.grenze;
}
