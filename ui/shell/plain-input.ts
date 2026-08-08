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
