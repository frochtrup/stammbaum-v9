// ui/shell/picker-dismiss.ts — WANN schließt die Trefferliste des Pickers, und wann
// ausdrücklich nicht (Spec 21 §6i, ADR-v9-182/185, BL-250/254/300).
//
// Herausgelöst aus `Picker.svelte`, als die dritte Schließ-Bedingung dazukam und die Datei
// über die 600-Zeilen-Grenze hob. Die drei Funktionen hier gehören zusammen: sie
// beantworten EINE Frage aus drei Richtungen — Fokus wandert weg, Zeiger geht daneben,
// Zeiger geht INS Panel (dann gerade NICHT schließen). Wer eine davon ändert, muss die
// anderen beiden gelesen haben; getrennt in der Komponente standen sie 130 Zeilen
// auseinander.
//
// DIE ZWEI-TEILBAUM-FRAGE zieht sich durch alle drei: seit das Panel an den <body>
// portaliert ist (INV-UI-13), ist „innerhalb des Pickers" nicht mehr `contains` EINES
// Knotens. Feld und Panel sind zwei getrennte Teilbäume und EIN Bedienelement.

/** Feld-Wurzel und portaliertes Panel — die beiden Knoten, die zusammen „der Picker" sind. */
export interface PickerTeile {
  root: () => HTMLElement | undefined;
  panel: () => HTMLElement | undefined;
}

/**
 * Gehört dieser Knoten zum Picker?
 *
 * Ein Klick INNERHALB (Feld, Zeile, Fußbereich) darf nicht als „nach außen geklickt"
 * gelten — sonst schlösse der eigene Mausklick die Liste vor dem Treffer. Ohne die
 * Panel-Hälfte schlösse `focusout` die Liste noch vor dem `click`, der Treffer wäre nicht
 * mehr auswählbar.
 *
 * ALS FOKUS-PRÜFUNG reicht das allein NICHT: sie setzt voraus, dass `relatedTarget`
 * gesetzt ist, was nur in Chromium gilt — s. `haltFokusImFeld`.
 */
export function istInnen(teile: PickerTeile, knoten: unknown): boolean {
  if (!(knoten instanceof Node)) return false;
  return !!teile.root()?.contains(knoten) || !!teile.panel()?.contains(knoten);
}

/**
 * Tipp/Klick NEBEN den Picker schließt ihn (BL-300). Registriert den Zuhörer und gibt
 * seine Abmeldung zurück — der Aufrufer hängt das an einen `$effect`, der nur läuft,
 * solange die Liste offen ist.
 *
 * WARUM ES DAS BRAUCHT: bis BL-300 hing der einzige Weg nach draußen an `focusout` — und
 * der setzt voraus, dass der Finger etwas FOKUSSIERBARES trifft. Auf Touch ist das der
 * Ausnahmefall: ein Tipp auf eine Überschrift, eine Ereigniszeile oder freie Fläche
 * verschiebt keinen Fokus, feuert kein `focusout`, der Picker blieb stehen. Wo der
 * Aufrufer ihn zusätzlich über `{#if}` einblendet (FamilyDetail: Ehemann/Ehefrau wählen),
 * war er damit OHNE AUSWEG — verlassen ließ er sich nur durch eine Auswahl (Nutzer-Fund).
 *
 * `pointerdown` in der CAPTURE-Phase, nicht `click`: `haltFokusImFeld` unterbindet am
 * Panel bewusst die Default-Aktion des `mousedown`, und ein Klick auf eine Trefferzeile
 * soll seine Auswahl noch erreichen. Geschlossen wird deshalb nur, was nicht zum eigenen
 * Teilbaum gehört.
 */
export function schliesseBeiKlickDaneben(teile: PickerTeile, schliessen: () => void): () => void {
  const aussen = (e: Event) => {
    if (istInnen(teile, e.target)) return;
    schliessen();
  };
  document.addEventListener('pointerdown', aussen, true);
  return () => document.removeEventListener('pointerdown', aussen, true);
}

/**
 * Hält den Fokus im Eingabefeld, während ein Listeneintrag angeklickt wird (ADR-v9-182,
 * BL-250). `istInnen` deckt nur den Fall ab, dass `relatedTarget` überhaupt GESETZT ist —
 * Chromium fokussiert einen `<button>` beim `mousedown`, **Safari und Firefox nicht**.
 * Dort ist `relatedTarget` `null`, `istInnen` sagt „außen", und die Liste räumt sich ab,
 * BEVOR das `click` seinen Treffer erreicht: der Nutzer klickt an, und nichts geschieht
 * (Nutzerbefund „Ortspicker wählt nicht aus", Safari).
 *
 * `preventDefault` am `mousedown` unterbindet genau die Fokus-Verschiebung, die diese
 * Kette auslöst — der Fokus bleibt im Feld, `focusout` feuert gar nicht, und die
 * Reihenfolge ist in jedem Browser dieselbe. Kein Browser-Sniffing, kein `setTimeout`,
 * kein zweiter Schließweg.
 *
 * Der Schutz sitzt am PANEL, nicht an den Zeilen (BL-254, ADR-v9-185). Er saß zuerst je
 * Zeile, mit dem Vorsatz „muss an JEDER Zeile hängen" — und übersah damit alles, was keine
 * Zeile ist: den **Scrollbalken** der Ergebnisliste (ab 25 Treffern der Regelfall), die
 * Polsterung des Panels, die Leermeldung, den „… N weitere"-Hinweis. Am laufenden System
 * gemessen (`scrollHeight` 993 / `clientHeight` 256): ein Klick auf die Polsterung ließ
 * `activeElement` auf `BODY` zurück und räumte die Liste ab — in Chromium, nicht nur in
 * Safari; wer scrollen wollte, klappte zu. Am Panel greift die Regel für den ganzen
 * Teilbaum, und eine künftig neu hinzugefügte Zeilenart kann sie nicht mehr vergessen —
 * das ist der Unterschied zwischen einer Erinnerung und einer Stelle.
 */
export function haltFokusImFeld(e: MouseEvent): void {
  e.preventDefault();
}
