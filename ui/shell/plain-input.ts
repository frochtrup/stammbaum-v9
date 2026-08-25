// ui/shell/plain-input.ts — die EINE Quelle für „dieses Feld ist keine Prosa".
//
// Nutzer-Befund 2026-08-08: „bei den Eingaben wirkt die Autokorrektur, das ist bei Namen und
// Orten natürlich nicht hilfreich". Zutreffend und folgenreich: iOS ersetzt getippte Wörter
// selbsttätig, und genealogische Eingaben bestehen fast ausschließlich aus Wörtern, die kein
// Wörterbuch kennt — Nachnamen („Focke", „Averbeck"), Höfe („Wall 33"), Ortsnamen („Ochtrup"),
// Archivsignaturen („KB 12"). Eine stille Ersetzung an dieser Stelle ist ein Datenfehler, der
// nicht auffällt, weil er plausibel aussieht.
//
// WARUM NICHT EIN ORT IM `<body>`: `autocorrect` ist NICHT vererbbar wie `spellcheck` — es
// erbt ausschließlich innerhalb eines `<form>` an dessen Felder (an der öffentlichen
// Referenz geprüft, nicht aus dem Gedächtnis: MDN „When nested in a `<form>`, the following
// elements inherit their default value of `autocorrect` from the form"; ein `<body>`- oder
// `<div>`-Attribut wirkt ausdrücklich nicht). Ein einzelnes Attribut an der App-Wurzel wäre
// also ein Scheinfix gewesen, der sich nur in Chromium beweisen lässt (dort gibt es das
// Verhalten gar nicht) und auf dem Zielgerät nichts täte.
//
// Die Folge trägt dieses Modul: die WERTE stehen einmal hier, die Felder tragen sie als
// Spread (`{...PLAIN_FIELD}`) — ein Mechanismus, 83 Anwendungen, kein Wildwuchs aus
// handgeschriebenen Attributen. Dass keins vergessen wird, hält ein Wächter fest
// (`tests/ui/plain-input.test.ts`), nicht die Erinnerung der nächsten Bau-Sitzung.
//
// `autocapitalize` bleibt bewusst UNBERÜHRT: die Großschreibung des ersten Buchstabens ist
// bei Namen und Orten hilfreich (und war nicht der gemeldete Ärger). `type="number"`-Felder
// (Jahre, Koordinaten) brauchen nichts davon — sie kennen keine Textkorrektur.

/**
 * Strukturierte Einzeiler: Namen, Orte, Adressen, Signaturen, Suchfelder.
 *
 * `spellcheck: false` gehört dazu, nicht nur aus Kosmetik: eine Liste aus rot unterschlängelten
 * Nachnamen macht das echte Signal (ein wirklich falsch geschriebener Ort) unsichtbar.
 */
export const PLAIN_FIELD = {
  autocorrect: 'off',
  spellcheck: 'false',
} as const;

/**
 * Mehrzeilige Prosa: Notizen, Begründungen, Auflösungsnotizen.
 *
 * Auch hier KEINE Autokorrektur — die Notiz zu einer Person enthält dieselben Eigennamen wie
 * das Feld daneben. Die Rechtschreibprüfung bleibt aber an: hier schreibt der Nutzer eigene
 * Sätze, und ein unterschlängelter Tippfehler ist genau das Signal, das er will.
 */
export const PROSE_FIELD = {
  autocorrect: 'off',
  spellcheck: 'true',
} as const;

/**
 * Ein Prosa-Feld wächst mit seinem Inhalt (BL-381).
 *
 * WOZU. Die längste Personen-Notiz im Bestand (`Testdateien/Unsere Familie 2026-4.ged`) hat
 * **1.540 Zeichen**; ein `<textarea>` im Browser-Default zeigt davon zwei Zeilen. Wer eine
 * gewachsene Hofgeschichte bearbeiten will, scrollt in einem Guckloch — und genau diese
 * Notizen sind die, die überhaupt bearbeitet werden.
 *
 * WARUM EINE ACTION UND NICHT CSS. `field-sizing: content` täte es in einer Zeile, ist aber
 * auf dem primären Zielgerät (iOS-Safari, [21 §2](../../specs/v9/21-UI-UX.md)) nicht
 * verfügbar; ein größeres festes `rows` ist kein Mitwachsen, sondern ein größeres Guckloch.
 * Zehn Zeilen DOM sind hier die kleinere Antwort als ein Feld, das seine Aufgabe nicht tut.
 *
 * `min-height` bleibt dem CSS überlassen — die Action setzt nur die Höhe, die der Inhalt
 * braucht, und niemals eine kleinere als die vom Stylesheet vorgegebene (`height: auto`
 * misst zuerst neu, sonst wüchse das Feld monoton).
 */
export function autoGrow(el: HTMLTextAreaElement): { destroy: () => void } {
  const anpassen = (): void => {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };
  anpassen();
  el.addEventListener('input', anpassen);
  // Auch bei Größenänderung: die nötige Höhe hängt an der BREITE, und die ändert sich beim
  // Drehen des Telefons. Ohne dies bliebe nach der Drehung die Höhe der alten Breite stehen —
  // bei 375 px braucht dieselbe 282-Zeichen-Notiz 113 px, im Querformat 40 (gemessen).
  window.addEventListener('resize', anpassen);
  return {
    destroy: () => {
      el.removeEventListener('input', anpassen);
      window.removeEventListener('resize', anpassen);
    },
  };
}
