// ui/shell/entry-template-dedup.ts — Live-Dubletten-Erkennung für die Erfassungs-
// Vorlagen-Fläche (BL-352, ADR-v9-264 Entscheidung 10).
//
// KEIN zweiter Vergleicher: der Score kommt unverändert aus `core/dedup/person-
// duplicates.ts::scorePersonPair` (v8-Gewichtung, ADR-v9-104/106) — dasselbe Prädikat, das
// auch die reguläre Dublettensuche (BL-62) nutzt. Was hier neu ist, ist NUR die
// Aufrufform: ein GETIPPTER Kandidat (noch keine gespeicherte Person) gegen den gesamten
// Bestand, statt zweier bereits gespeicherter Personen gegeneinander.
//
// DIESE FUNKTION SCHLÄGT VOR, SIE ENTSCHEIDET NICHT. Sie liefert eine LISTE; verknüpft
// wird ausschließlich durch einen Klick des Nutzers im `PersonPicker` (INV-UI-4, derselbe
// Picker wie jede andere Personen-Referenz). Die erste Fassung dieser Datei band den
// besten Treffer automatisch — das ist am Score gemessen falsch: ein Entwurf „Maria
// Decker" gegen eine vorhandene „Anna Decker" (gleicher Nachname, gleiches Geschlecht,
// ANDERER Vorname) erreicht **47 Punkte**, weil `nameSimilarity` auch unähnliche Vornamen
// mit einem Rest bewertet und der fehlende Geburtsjahr-Vergleich +4 neutral zuschlägt.
// Automatisch gebunden hätte das die erfasste Taufe still an eine fremde Person
// geschrieben — und schon beim bloßen Tippen des Nachnamens, vor dem Vornamen. Es ist
// dieselbe Leitlinie, die ADR-v9-29 für die Ortsauflösung und ADR-v9-264 E6 für die
// Familienwahl festhält: bei Mehrdeutigkeit wird gefragt, nicht geraten.
//
// Die Schwelle trennt dabei durchaus etwas — sie trennt nur nicht Anna von Maria: ein
// Nachname OHNE Vornamen bleibt bei 28 Punkten (die 20er-Vornamen- und die 11er-
// Geschlechts-Achse fallen ganz weg, nicht auf 0), es feuert also nichts, während der
// Nutzer noch tippt. Beide Fälle stehen als Test in `tests/ui/entry-template-dedup.test.ts`.
//
// ENTPRELLUNG IST SACHE DES AUFRUFERS (EntryTemplateCapture.svelte) — v8 scannte bei JEDEM
// Tastendruck den ganzen Bestand (`legacy-v8/ui-quicktpl.js` Z. 715–745, die teuerste
// Stelle des Orakels); diese Funktion selbst ist rein und synchron (TST-3-Geist, kein
// Zeit-/Zufallsbezug), der Debounce-Timer lebt eine Ebene höher (Komponenten-Zustand).
import { scorePersonPair, type PersonGraph } from '../../core/dedup';
import { makePerson } from '../../core/model/factory';
import type { PersonId, Sex } from '../../core/model/types';

export interface EntryTemplateDuplicateMatch {
  id: PersonId;
  score: number;
}

/**
 * Eigene, NIEDRIGERE Schwelle als `DEFAULT_DUPLICATE_THRESHOLD` (65) — hergeleitet und am
 * Score nachgemessen, nicht geraten (CLAUDE.md „Zahlen vor Zeilen").
 *
 * `scorePersonPair` verteilt 100 Punkte über acht Achsen (Kopfkommentar
 * `person-duplicates.ts`); ein Entwurf VOR dem Speichern kennt nur Vorname/Nachname/
 * Geschlecht — Geburtsjahr/-ort, Eltern und Partner sind strukturell leer. Gemessen
 * (`scorePersonPair` gegen einen identitäts-only Kandidaten):
 *
 *   exakter Name + gleiches Geschlecht  59      ← die Obergrenze überhaupt
 *   exakter Name, Geschlecht unbekannt  48
 *   gleicher Nachname, and. Vorname     47      ← der Grund für die Vorschlagsliste
 *   gleicher Nachname, Geschlecht ≠     17
 *
 * Der reguläre Schwellenwert 65 ist für diese Vergleichsform also UNERREICHBAR. 45 ist
 * bewusst durchlässig: die Liste ist ein VORSCHLAG, den ein Mensch prüft — die dritte
 * Zeile oben zeigt, dass ein knapper Schwellenwert hier keine Sicherheit gäbe, sondern
 * nur die Illusion davon.
 */
export const ENTRY_TEMPLATE_DUPLICATE_THRESHOLD = 45;

/** Wie viele Vorschläge höchstens angeboten werden — dieselbe Zahl wie im v8-Orakel
 *  (`ui-quicktpl.js` Z. 744): mehr als eine Handvoll prüft niemand beim Tippen. */
export const ENTRY_TEMPLATE_MAX_SUGGESTIONS = 6;

/** Was ein Slot-Entwurf für den Score braucht — Identitätsfelder reichen, weil das
 *  Formular vor dem Speichern keine gespeicherte `Person` besitzt (ADR-v9-264 E5). */
export interface EntryTemplateCandidate {
  given: string;
  surname: string;
  sex: Sex;
}

/**
 * Die Bestandstreffer für einen getippten Kandidaten, absteigend nach Score, höchstens
 * `ENTRY_TEMPLATE_MAX_SUGGESTIONS` — leer, wenn kein Name steht oder nichts die Schwelle
 * erreicht.
 *
 * Baut ein leichtes `Person`-Gerüst NUR aus den Identitätsfeldern (kein Geburtsdatum/
 * -ort, keine Familienbindung) — der Entwurf kennt zum Zeitpunkt der Eingabe i. d. R.
 * noch keine dieser Achsen; `scorePersonPair` wertet fehlende Achsen neutral (core/dedup).
 * Die id des Kandidaten ist eine Fiktion (`__entry-template-draft__`) — sie verlässt diese
 * Funktion nie, `scorePersonPair` braucht nur die Werte, nicht die Identität.
 */
export function duplicateSuggestions(
  graph: PersonGraph,
  candidate: EntryTemplateCandidate,
  threshold: number = ENTRY_TEMPLATE_DUPLICATE_THRESHOLD,
  limit: number = ENTRY_TEMPLATE_MAX_SUGGESTIONS,
): EntryTemplateDuplicateMatch[] {
  if (candidate.given.trim() === '' && candidate.surname.trim() === '') return [];
  const probe = makePerson('__entry-template-draft__', candidate);

  const treffer: EntryTemplateDuplicateMatch[] = [];
  for (const existing of graph.individuals.values()) {
    const { score } = scorePersonPair(graph, probe, existing);
    if (score >= threshold) treffer.push({ id: existing.id, score });
  }
  // Stabil: bei gleichem Score entscheidet die id, damit die Liste nicht von der
  // Map-Reihenfolge abhängt (TST-3 — dieselbe Eingabe, dieselbe Ausgabe).
  treffer.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return treffer.slice(0, limit);
}
