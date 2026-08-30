// ui/shell/entity-id.ts — DIE EINE Anzeigeform der technischen Datensatz-Kennung
// (`Person.id`/`Family.id`, INV-UI-4).
//
// WARUM SIE ÜBERHAUPT SICHTBAR IST. Die Kennung ist nicht bloß ein interner Schlüssel:
// sie steht als `@I566053080@` in der GEDCOM-Datei, in Fehlermeldungen anderer Programme
// und in jeder Notiz, die ein Mitforscher über einen Datensatz schreibt. Wer mit einer
// zweiten Anwendung, einem Prüfbericht oder dem Dateitext arbeitet, braucht den Weg von
// dort in die App — und zurück. Genau dafuer traegt der CSV-Export der gefilterten Liste
// die Entitäts-ID bereits mit ([20 §1.4](specs/v9/20-Funktionen.md)); sichtbar war sie
// dabei nirgends.
//
// KEIN WIDERSPRUCH ZU ADR-v9-172/BL-237 („Technische Kennung nicht mehr in der
// Oberfläche"). Dort ging es um die HOF-Id: `_hof_<addr>_<village>` ist ein aus Feldern
// zusammengesetzter Schlüssel, der nach einem Umzug den Slug des ALTEN Dorfes weiterträgt
// und damit etwas Falsches BEHAUPTET. Die GEDCOM-Kennung behauptet nichts — sie benennt
// den Satz, und zwar genau so, wie die Datei ihn benennt.
//
// FORM: ohne die `@`-Klammern. Sie sind die GEDCOM-Zeigersyntax, nicht Teil des Namens;
// GRAMPS schreibt dieselbe Kennung ohnehin ohne sie (`I0001`, ADR-v9-126). Eine Form für
// beide Herkünfte, damit die Anzeige nicht vom geladenen Dateiformat abhängt. Die SUCHE
// arbeitet unverändert auf dem rohen Wert und trifft damit beide Schreibweisen.
export function entityIdLabel(id: string): string {
  return id.replace(/^@/, '').replace(/@$/, '');
}
