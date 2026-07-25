// core/model/name-parts.ts — Vor-/Nachname einer Person, kanonisch (Spec 10 §2).
//
// WARUM ES DAS GIBT: der GEDCOM-NAME-Wert trägt den Nachnamen zwischen Schrägstrichen
// (`Anna /Decker/`); die Untertags `GIVN`/`SURN` daneben sind OPTIONAL und fehlen in
// freier Wildbahn häufig. Früher hat `core/interop/gedcom-parse.ts` `Person.given`/
// `Person.surname` deshalb bei solchen Dateien LEER gelassen, und jeder Leser musste
// den Rückfall auf die Schrägstriche selbst kennen.
//
// Dieser Vertrag „jeder Leser muss es wissen" ist DREIMAL gerissen: Familien-Sortierung
// (ADR-v9-18), Duplikat-Scoring (BL-108) und zuletzt gleich zehn Stellen auf einmal —
// sichtbar als „Theodor Hermann /Zurloh/" mit Schrägstrichen in der Sanduhr-Insel.
// Seit ADR-v9-112 zerlegt der Parser den Namen deshalb BEIM EINLESEN: `given`/`surname`
// sind ab Import gefüllt, wann immer die Quelle die Zerlegung eindeutig hergibt.
//
// `splitGedcomName` ist die eine Stelle, die diese Zerlegung kennt — nicht der Parser,
// damit die Regel eine Aussage über das GEDCOM-NAMENSFORMAT bleibt (Kern) und nicht
// über einen Dateiformat-Leser. `givenOf`/`surnameOf` bleiben als Sicherheitsnetz für
// Modelle, die NICHT durch den Parser kamen (GRAMPS-Import, Testfixtures, alte
// Arbeitskopien) — sie sind seither in der Regel eine reine Feld-Rückgabe.
import type { Person } from './types';

/** Ergebnis einer eindeutigen Namenszerlegung. `suffix` ist der Nachlauf hinter dem
 *  Schrägstrichpaar (GEDCOM 5.5.1 `personal_name_value`), meist leer. */
export interface GedcomNameParts {
  given: string;
  surname: string;
  suffix: string;
}

/**
 * Zerlegt einen GEDCOM-NAME-Wert — NUR bei genau EINEM wohlgeformten Schrägstrichpaar,
 * sonst `null`.
 *
 * Die Strenge ist der Punkt: `Anna Maria` ohne Schrägstriche in `given: 'Anna Maria'` zu
 * übersetzen wäre die Behauptung „das ist vollständig ein Vorname", die die Quelle nie
 * aufgestellt hat — und die der Writer bei der nächsten Bearbeitung als `GIVN` in die
 * Datei schriebe. Unentscheidbar heißt hier: nichts behaupten (23 solcher Zeilen in
 * `tests/fixtures/MeineDaten_ancestris.ged`, gegenüber 2840 zerlegbaren).
 */
export function splitGedcomName(value: string): GedcomNameParts | null {
  const slashes = (value.match(/\//g) ?? []).length;
  if (slashes !== 2) return null; // 0 = keine Aussage, >2 = mehrdeutig (5.5.1 erlaubt ein Paar)
  const first = value.indexOf('/');
  const last = value.lastIndexOf('/');
  return {
    given: value.slice(0, first).trim(),
    surname: value.slice(first + 1, last).trim(),
    suffix: value.slice(last + 1).trim(),
  };
}

/**
 * Umkehrung von `splitGedcomName`: baut den GEDCOM-NAME-Wert aus den Teilen.
 *
 * WARUM ES DAS BRAUCHT: `Person.name` und `Person.given`/`surname` sind zwei Hälften
 * DERSELBEN Sache — der Writer schreibt `NAME` aus der einen und `GIVN`/`SURN` aus der
 * anderen. Wer nur die Felder ändert, exportiert eine Datei, in der beide Hälften sich
 * widersprechen (ADR-v9-81-Klasse). Jeder Schreibpfad auf `given`/`surname` zieht `name`
 * über DIESE Funktion nach, damit die Schrägstrich-Form nicht pro Aufrufer neu erfunden
 * wird (INV-UI-4).
 *
 * Der Nachname steht IMMER zwischen Schrägstrichen, auch wenn er leer ist (`Anna //`) —
 * das ist die GEDCOM-Form für „hat nachweislich keinen Nachnamen" und hält
 * `splitGedcomName(composeGedcomName(x)) === x` stabil.
 */
export function composeGedcomName(parts: GedcomNameParts): string {
  const { given, surname, suffix } = parts;
  if (!given && !surname && !suffix) return '';
  return [given, `/${surname}/`, suffix].filter(Boolean).join(' ');
}

// ── Lesende Rückfallebene ───────────────────────────────────────────────────────────────
// BEWUSST NACHSICHTIGER als splitGedcomName: hier wird nur VERGLICHEN und ANGEZEIGT, nie
// etwas in Modell oder Datei geschrieben. Deshalb ist `Anna Maria` (ohne Schrägstriche)
// als Vorname-Kandidat brauchbar — für ein Duplikat-Scoring ist das eine nützliche
// Heuristik, als `GIVN`-Zeile in der Exportdatei wäre dieselbe Annahme eine Falschaussage.
// Wer in Richtung Modell/Datei schreibt, nimmt splitGedcomName.

/** Nachname: `SURN` falls vorhanden, sonst der Teil zwischen den Schrägstrichen von `NAME`. */
export function surnameOf(p: Pick<Person, 'surname' | 'name'>): string {
  if (p.surname) return p.surname;
  return splitGedcomName(p.name)?.surname ?? '';
}

/** Vorname: `GIVN` falls vorhanden, sonst der Teil VOR den Schrägstrichen von `NAME`
 *  (ohne Schrägstriche: der ganze Wert — s. Blockkommentar oben). */
export function givenOf(p: Pick<Person, 'given' | 'name'>): string {
  if (p.given) return p.given;
  return splitGedcomName(p.name)?.given ?? p.name.trim();
}
