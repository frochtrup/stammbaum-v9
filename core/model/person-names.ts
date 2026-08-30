// core/model/person-names.ts — Kern-Kommandos für die WEITEREN Namensformen einer Person
// (`Person.extraNames`, Spec 10 §2 „Namen"; jede zweite und folgende `1 NAME`-Zeile bzw.
// jedes zweite `<name>` in GRAMPS).
//
// WARUM ES DAS GIBT: `extraNames` wurde seit BL-292 gelesen und geschrieben, war aber
// über keine Fläche zu SEHEN und über keine zu ÄNDERN — 95 Zeilen in
// `Unsere Familie 2026.ged` reisten unsichtbar durch das Programm. Das ist derselbe
// „modelliert, aber heimatlos"-Zustand, den ADR-v9-183 für `pnames`/`enclosedBy` des Orts
// geschlossen hat; deshalb dieselbe Form: Add/Remove/Update als reine Kern-Kommandos,
// die die UI SOFORT committet (Spec 21 §6m — eine Namensform ist für sich allein eine
// vollständige Aussage), No-Op-Toleranz statt Ausnahmen.
//
// ── Die eigentliche Schwierigkeit: eine Namensform hat ZWEI Hälften ───────────────────
// `nameRaw` ist der `NAME`-Wert (`Anna /Meyer/`), `given`/`surname` sind die OPTIONALEN
// Untertags `GIVN`/`SURN` daneben. Wer nur eine Hälfte ändert, hinterlässt eine Datei, in
// der beide sich widersprechen — die Fehlerklasse aus ADR-v9-81. Wer umgekehrt bei jeder
// Änderung beide schreibt, ergänzt Untertags, die die Quelle nie hatte — ADR-v9-197, und
// Spec 10 §2 sagt für genau diese Liste ausdrücklich „eine Namensform reist so, wie sie
// kam". Beides zugleich zu vermeiden geht nur über eine Regel, und es ist dieselbe, die
// `withUpdatedHofAddr` schon trägt:
//
//   **Der `NAME`-Wert ist die Wahrheit. Ein Untertag wird nur dann mitgezogen, wenn er
//   ihn bloß WIEDERHOLT hat.** Stand `GIVN Anna` neben `NAME Anna Maria /Decker/`, sagt
//   der Untertag etwas ENGERES (ADR-v9-210) — dann bleibt er unangetastet, statt vom
//   Edit überschrieben zu werden. War er die reine Wiederholung, wandert er mit.
//
// Und: wer nur die ART (`TYPE`) ändert, fasst `nameRaw` gar nicht erst an — sonst bekäme
// ein `NAME Anna Maria` ohne Schrägstriche allein durch das Öffnen der Auswahlliste ein
// `//` angehängt („Speichern schreibt um", ADR-v9-197).
import type { Person, PersonName } from './types';
import { splitGedcomName, composeGedcomName } from './name-parts';

/**
 * Vor- und Nachname EINER Namensform, so wie eine Anzeige-/Bearbeitungsfläche sie braucht.
 *
 * Der `NAME`-Wert hat Vorrang vor den Untertags — er ist die Zeile, die jedes Programm
 * liest, und er ist die vollständigere der beiden Hälften (s. Kopfkommentar). Die
 * Untertags springen nur ein, wo der Wert selbst nichts hergibt.
 *
 * Ohne wohlgeformtes Schrägstrichpaar (`splitGedcomName` → `null`) gilt der ganze Wert
 * als Vorname — dieselbe nachsichtige Lesart wie `givenOf`, und aus demselben Grund
 * zulässig: hier wird angezeigt, nicht geschrieben. Geschrieben wird erst, wenn der
 * Nutzer etwas ändert, und dann ist es SEINE Aussage.
 */
export function extraNameParts(n: PersonName): { given: string; surname: string } {
  const split = splitGedcomName(n.nameRaw);
  if (split) {
    return { given: split.given || n.given, surname: split.surname || n.surname };
  }
  return { given: n.given || n.nameRaw.trim(), surname: n.surname };
}

/**
 * Vergleichsform für die Frage „hat der Untertag den `NAME`-Wert bloß WIEDERHOLT?".
 *
 * NICHT byte-genau, und das ist gemessen, nicht bequem: `GIVN` darf seine Bestandteile
 * laut 5.5.1 durch Komma trennen, und der Bestand nutzt das — bei 30 der 80 `GIVN` an
 * weiteren Namensformen (`Testdateien/Unsere Familie 2026.ged`, 3180 Personen) steht
 * `GIVN Paul, Gerhard` neben `NAME Paul Gerhard /Scho/`. Das ist dieselbe Aussage in der
 * Notation, die der Tag dafür vorsieht — ein byte-genauer Vergleich hätte sie für
 * „abweichend" gehalten und diese Untertags beim Edit einfrieren lassen, bis sie dem
 * Namen widersprechen. Groß-/Kleinschreibung aus demselben Grund (`SURN Schulze Iking`
 * neben `NAME /SCHULZE IKING/`, 1×).
 *
 * Was danach ÜBRIG bleibt, ist echte Verengung und bleibt unangetastet: `GIVN Otmar`
 * neben `NAME P. Dr. Otmar /Decker/ O.P.` sagt weniger, nicht dasselbe anders
 * (ADR-v9-210).
 */
function vergleichsform(text: string): string {
  return text.replace(/,/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Der Nachlauf hinter dem Schrägstrichpaar (GEDCOM `personal_name_value`), meist leer.
 *  NICHT dasselbe wie `PersonName.suffix` (= `NSFX`), deshalb eigens gelesen: beim
 *  Neubau des Werts muss der Nachlauf erhalten bleiben, der Untertag bleibt Untertag. */
function rawSuffixOf(n: PersonName): string {
  return splitGedcomName(n.nameRaw)?.suffix ?? '';
}

/** Anzeigeform einer Namensform („Anna Meyer") — ohne Schrägstriche, ohne leere Fugen.
 *  Fällt auf den rohen Wert zurück, damit eine unzerlegbare Zeile nicht als Leerzeile
 *  erscheint (dieselbe Polarität wie `displayNameOr`). */
export function extraNameDisplay(n: PersonName): string {
  const { given, surname } = extraNameParts(n);
  const joined = [n.prefix, given, surname, n.suffix].filter(Boolean).join(' ').trim();
  const roh = n.nameRaw.replace(/\//g, ' ').replace(/\s+/g, ' ').trim();
  // `(ohne Namen)` wörtlich wie `displayNameOr` — eine NAMENLOSE Namensform gibt es
  // wirklich (1× im Bestand: `1 NAME` ohne Wert, nur mit `2 TYPE AKA`), und ohne diesen
  // Rückfall stünde dort eine Pille, die nur ihre Art nennt und sonst nichts.
  return joined || roh || '(ohne Namen)';
}

/**
 * Neue Namensform anhängen. Ohne Vor- UND Nachname passiert nichts (No-Op statt Fehler,
 * gleiche Toleranz wie `withAddedPname`).
 *
 * Die Untertags bleiben LEER: der Writer schreibt `GIVN`/`SURN` nur bei gefülltem Feld
 * (`write-back-emit.ts::extraNameNode`), eine frisch angelegte Form bekommt also genau
 * die eine `NAME`-Zeile, die sie braucht — kein Vorgriff auf Untertags, die niemand
 * verlangt hat (ADR-v9-197).
 */
export function withAddedExtraName(p: Person, given: string, surname: string, type: string): Person {
  const g = given.trim();
  const s = surname.trim();
  if (!g && !s) return p;
  const entry: PersonName = {
    nameRaw: composeGedcomName({ given: g, surname: s, suffix: '' }),
    given: '',
    surname: '',
    prefix: '',
    suffix: '',
    type: type.trim(),
    citations: [],
  };
  return { ...p, extraNames: [...p.extraNames, entry] };
}

/** Namensform entfernen. Index außerhalb `0..extraNames.length-1` ist ein No-Op — kein
 *  Crash und kein stillschweigendes Löschen eines anderen Eintrags. */
export function withRemovedExtraName(p: Person, index: number): Person {
  if (index < 0 || index >= p.extraNames.length) return p;
  return { ...p, extraNames: p.extraNames.filter((_, i) => i !== index) };
}

/**
 * Bestehende Namensform ändern (ADR-v9-183-Form: Position bleibt, Zitate bleiben).
 *
 * Drei Zusicherungen, alle drei im Kopfkommentar begründet:
 *  1. Ändern sich Vor-/Nachname nicht, bleibt `nameRaw` **byte-identisch** — eine reine
 *     Typ-Änderung schreibt den Namenswert nicht um.
 *  2. Ändern sie sich, wird `nameRaw` neu gebaut; der Nachlauf hinter dem
 *     Schrägstrichpaar bleibt erhalten.
 *  3. `GIVN`/`SURN` wandern nur mit, wo sie vorhanden waren UND den alten Wert nur
 *     wiederholt haben. Ein enger gesetzter Untertag bleibt stehen.
 *
 * No-Op bei unbekanntem Index oder wenn Vor- UND Nachname leer wären (das wäre kein
 * Ändern, sondern ein verstecktes Löschen — dafür gibt es `withRemovedExtraName`).
 */
export function withUpdatedExtraName(
  p: Person,
  index: number,
  given: string,
  surname: string,
  type: string,
): Person {
  const cur = p.extraNames[index];
  if (!cur) return p;
  const g = given.trim();
  const s = surname.trim();

  const alt = extraNameParts(cur);
  // Ein vorhandener Name darf nicht über die Feldeingabe VERSCHWINDEN — dafür gibt es
  // `withRemovedExtraName`, und nur dort ist es eine bewusste Handlung. Eine bereits
  // NAMENLOSE Form (1× im Bestand) bleibt dagegen änderbar: die schärfere Fassung
  // („beide leer heißt immer No-Op") hätte an ihr die Art-Auswahl tot gestellt — eine
  // Regel, die einen Datensatz unbearbeitbar macht, statt ihn zu schützen.
  if (!g && !s && (alt.given || alt.surname)) return p;
  const nameChanged = g !== alt.given || s !== alt.surname;
  const t = type.trim();
  if (!nameChanged && t === cur.type) return p;

  const next: PersonName = { ...cur, type: t };
  if (nameChanged) {
    next.nameRaw = composeGedcomName({ given: g, surname: s, suffix: rawSuffixOf(cur) });
    // Mitgezogen wird der schlichte neue Wert, nicht eine nachgebaute Komma-Fassung:
    // wo die Bestandteile des NEUEN Namens liegen, sagt die Eingabe nicht.
    if (cur.given) next.given = vergleichsform(cur.given) === vergleichsform(alt.given) ? g : cur.given;
    if (cur.surname) next.surname = vergleichsform(cur.surname) === vergleichsform(alt.surname) ? s : cur.surname;
  }
  return { ...p, extraNames: p.extraNames.map((n, i) => (i === index ? next : n)) };
}
