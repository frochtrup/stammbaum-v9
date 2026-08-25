// tests/roundtrip/wire-mutation-harness.ts — die EINE Naht, an der Mutations-Zensen hängen
// (BL-378/[ADR-v9-281] baute die erste, BL-379 die zweite).
//
// WOZU EINE GETEILTE NAHT. Ein Zensus, der eine Verlustklasse prüft, besteht aus drei Teilen:
// einem KORPUS (welche Formen gibt es?), einer MUTATION (was tue ich dem Dokument an?) und
// einer EIGENSCHAFT (was muss danach gelten?). Eine handgeschriebene Fixture verschmilzt alle
// drei — deshalb braucht jedes neue Phänomen eine neue Datei, und ob es je eine gibt, hängt
// daran, dass jemand daran denkt. Hier sind sie getrennt: Korpus und Wanderung stehen einmal
// da, jede Mutation ist eine Funktion, jede Eigenschaft ein eigener Test.
//
// Der Ablauf ist immer derselbe:
//     Korpus → parse → MUTATION → Write-Back → serialisieren → parse → EIGENSCHAFT
//
// WARUM DETERMINISTISCH UND NICHT ZUFÄLLIG (`fast-check` liegt im Projekt). Die Wanderung
// trifft JEDES beanspruchte Feld genau einmal — das ist erschöpfend, wo ein Generator nur
// stichprobenhaft wäre, und es kostet keine Seeds, kein Shrinking und kein flackerndes CI.
// Der Fehlschlag nennt direkt den Pfad (`/individuals/@I1@/birth/citations/0/page`). Zufall
// lohnt erst, wo die interessante Größe eine KOMBINATION ist (Folgen von Edits, Merge-
// Reihenfolgen) — nicht bei der Frage, ob ein einzelner Wert heil zurückkommt.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGedcom, applyDatabaseToRoots, serializeGedcom } from '../../core/interop';
import type { Database } from '../../core/model/types';

/**
 * Der Struktur-Korpus. `passthrough-matrix.small.ged` trägt jeden beanspruchten Tag mindestens
 * einmal UND un-modellierte `_ZZ`-Nachbarn auf jeder Ebene — genau das, was eine Mutation
 * braucht: Struktur zum Anfassen und Passthrough, der dabei heil bleiben muss. Den INHALT
 * liefert die jeweilige Mutation, nicht die Datei; deshalb genügt hier eine.
 */
export const KORPUS = join(__dirname, '../fixtures/passthrough-matrix.small.ged');

export function korpusText(): string {
  return readFileSync(KORPUS, 'utf8');
}

/**
 * Schlüssel, die KEIN Freitext sind und deshalb von keiner Text-Mutation angefasst werden.
 * Jede Zeile nennt ihren Grund; die Liste ist bewusst kurz und wächst nur mit Beleg — ein
 * „sicherheitshalber" ausgenommenes Feld ist ein ungeprüftes Feld.
 *
 * Sie steht hier und nicht im einzelnen Zensus, weil sie die Antwort auf eine Frage ist, die
 * jede Mutation gleich stellt: **was beansprucht das Modell überhaupt als Text?** Zwei Kopien
 * dieser Antwort liefen auseinander, sobald eine Mutation ein Feld anders behandelt als die
 * andere — und das wäre kein Testdetail, sondern eine zweite Meinung über das Modell.
 */
export const KEINE_TEXTE = new Set([
  // Identitäten und Verweise: ein veränderter Schlüssel zeigt ins Leere, das prüft nichts.
  'id', 'xref', 'mediaId', 'personRef', 'sourceId', 'sourceRef', 'repoRef', 'taskId',
  'husband', 'wife', 'children', 'parentIn', 'aliases', 'noteRefs', 'grampsHandle',
  'grampsId', 'famId', 'placeId', 'hofId', 'familyId', 'refs',
  // `Media.file` IST die Identität (`db.media` ist danach geschlüsselt, ADR-v9-124) — ein
  // veränderter Pfad legt einen anderen Datensatz an, der Pfad-Vergleich liefe ins Leere.
  // Der lange FILE-Pfad hat deshalb einen eigenen, gezielten Test (wire-loss-lange-werte).
  'file',
  // Aus dem HEAD abgeleitet, und der HEAD wird VERBATIM geschrieben (TST-3, `writeHead`):
  // das Modell speist diese zwei nicht zurück, eine Mutation könnte gar nicht ankommen.
  'gedVersion', 'placForm',
  // Aufzählungen: das Modell normalisiert sie beim Lesen (`_RESULT`→pending, `SEX U`,
  // `_HSTAT`, `PEDI`, MIME aus `FORM`). Eine Mutation macht daraus einen Default — das wäre
  // Wert-Drift, nicht Textverlust, und dafür ist `wire-value-drift` zuständig.
  'result', 'sex', 'status', 'weight', 'kind', 'pedigree', 'form', 'formWire', 'quay',
  'restriction', 'wireOrigin',
  // `_EVAL`-Achsen (Spec 12 §3): drei feste Vokabeln. `informant` daneben IST Freitext und
  // wird geprüft — die Ausnahme gilt der Aufzählung, nicht dem ganzen Block.
  'source', 'information', 'evidence',
  // `Event.type` ist der TAG-Name (`BIRT`/`OCCU`), `Media.type` die `MEDI`-Vokabel — beides
  // Struktur, kein Text. Der Freitext daneben heißt `eventType` (`2 TYPE …`) und wird geprüft.
  'type',
  // Abgeleitet bzw. beim Lesen eingefroren, nie geschrieben: `deepLinkUrl` ist die `mediaId`
  // des ersten Mediums, `typeWire` der Vergleichswert für „hat jemand den Typ angefasst?"
  // (BL-306). Beide entstehen beim Parsen neu — eine Mutation kann sie nicht erreichen.
  'deepLinkUrl', 'typeWire',
  // Vom Modell erzeugte Stempel/Struktur, keine Nutzereingabe.
  'lastChanged', 'seen', 'sexSeen', 'formSeen', 'typeSeen', 'primary',
  // Roher Passthrough-Baum (GedNode[]): er reist unverändert durch, das prüfen andere Tests.
  //
  // `addressExtra` stand hier zuerst NICHT — und das hat sich sofort gerächt: die Wanderung
  // verlängerte darin das Feld `tag`, der Emitter schrieb einen 40 Zeichen langen Kunst-Tag
  // (`2 EDIT-repositories--R22--addressExtra-0-tag …`), und der Lexer verwarf die Zeile beim
  // Zurücklesen samt der Nachbarschaft — worauf der Zensus ein verlorenes `WWW` meldete, das
  // in der Ausgabe nachweislich dastand. Ein Wächter, der die STRUKTUR seines Prüflings
  // mutiert, meldet seine eigene Verletzung als Befund: die erste Meldung eines neuen Wächters
  // gehört geprüft, nicht geglaubt.
  'extra', 'addrExtra', 'addressExtra', 'dataExtra', 'raw', 'roots', 'header',
]);

/** Was eine Mutation mit einem Textwert tut. `pfad` ist stabil und erscheint im Fehlschlag. */
export type TextMutation = (wert: string, pfad: string) => string;

/**
 * Wandert das Modell und wendet `mutation` auf jeden beanspruchten, nicht-leeren Text an.
 * Liefert den mutierten Stand plus die Pfad→Sollwert-Karte — copy-on-write, das Original
 * bleibt unberührt (ein Zensus, der seinen eigenen Ausgangsstand überschreibt, kann hinterher
 * nicht mehr sagen, was vorher dastand).
 */
export function mutiereTexte(db: Database, mutation: TextMutation): { db: Database; soll: Map<string, string> } {
  const soll = new Map<string, string>();
  const gehe = (wert: unknown, pfad: string): unknown => {
    if (typeof wert === 'string') {
      if (wert === '') return wert;
      const neu = mutation(wert, pfad);
      soll.set(pfad, neu);
      return neu;
    }
    if (Array.isArray(wert)) return wert.map((x, i) => gehe(x, `${pfad}/${i}`));
    if (wert instanceof Map) return new Map([...wert].map(([k, v]) => [k, gehe(v, `${pfad}/${String(k)}`)]));
    if (wert && typeof wert === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(wert)) out[k] = KEINE_TEXTE.has(k) ? v : gehe(v, `${pfad}/${k}`);
      return out;
    }
    return wert;
  };
  return { db: gehe(db, '') as Database, soll };
}

/** Dieselbe Wanderung ohne Mutation — die Pfade des neu gelesenen Modells zum Vergleich. */
export function sammleTexte(db: Database): Map<string, string> {
  const { soll } = mutiereTexte(db, (w) => w);
  return soll;
}

/**
 * Das Gegenstück zu `mutiereTexte`: alle Strings, die unter einem AUSGESCHLOSSENEN Schlüssel
 * liegen und deshalb von keiner Mutation angefasst werden.
 *
 * WOZU. Eine Mutation, die fragt „steht der alte Wert danach noch im Draht?", braucht diese
 * Liste, um ihre eigenen Fehlalarme zu erkennen: steht derselbe Text auch in einem nicht
 * mutierten Feld, ist sein Vorkommen in der Ausgabe erklärt und beweist keine eingefrorene
 * Kopie. Gemessen an der Probe war das kein theoretischer Fall — `1 JAN 2026` steht dort
 * sowohl unter `_TASK>_DATE` (mutiert) als auch unter `CHAN>DATE` (Stempel, nicht mutiert).
 *
 * Der Preis ist benannt: eine echte Spiegelung, die zufällig denselben Text trägt wie ein
 * unangetastetes Feld, bliebe unentdeckt. Die Alternative wäre ein Wächter, der bei jedem Lauf
 * erklärbare Treffer meldet — und der wird abgeschaltet, statt gelesen zu werden.
 */
export function unberuehrteWerte(db: Database): string[] {
  const out: string[] = [];
  const gehe = (wert: unknown, ausgeschlossen: boolean): void => {
    if (typeof wert === 'string') {
      if (ausgeschlossen && wert !== '') out.push(wert);
      return;
    }
    if (Array.isArray(wert)) { for (const x of wert) gehe(x, ausgeschlossen); return; }
    if (wert instanceof Map) { for (const [, v] of wert) gehe(v, ausgeschlossen); return; }
    if (wert && typeof wert === 'object') {
      for (const [k, v] of Object.entries(wert)) gehe(v, ausgeschlossen || KEINE_TEXTE.has(k));
    }
  };
  gehe(db, false);
  return out;
}

/** Write-Back + Serialisieren: der Stand, wie er nach dem Speichern auf der Platte läge. */
export function schreibe(db: Database, roots: ReturnType<typeof parseGedcom>['roots']): string {
  return serializeGedcom({ db, roots: applyDatabaseToRoots(db, roots) });
}

/**
 * Der ganze Rundlauf für eine Mutation: Korpus lesen → mutieren → schreiben → neu lesen.
 * Gibt beide Karten zurück (`soll` aus der Mutation, `ist` aus dem neu gelesenen Modell)
 * sowie den geschriebenen Text — manche Eigenschaften fragen den Draht, nicht das Modell.
 */
export function rundlauf(mutation: TextMutation): {
  vorher: Map<string, string>;
  soll: Map<string, string>;
  ist: Map<string, string>;
  ausgabe: string;
} {
  const p = parseGedcom(korpusText());
  const vorher = sammleTexte(p.db);
  const { db, soll } = mutiereTexte(p.db, mutation);
  const ausgabe = schreibe(db, p.roots);
  const ist = sammleTexte(parseGedcom(ausgabe).db);
  return { vorher, soll, ist, ausgabe };
}

/** Die Pfade, an denen `ist` nicht `soll` entspricht — als lesbare Zeilen für den Fehlschlag. */
export function abweichungen(soll: Map<string, string>, ist: Map<string, string>): string[] {
  const out: string[] = [];
  for (const [pfad, s] of soll) {
    const i = ist.get(pfad);
    if (i === s) continue;
    out.push(`${pfad}: ${i === undefined ? '(Pfad fehlt)' : `„${kurz(i)}" statt „${kurz(s)}"`}`);
  }
  return out;
}

function kurz(s: string): string {
  return s.length <= 60 ? s : `${s.slice(0, 40)}…(${s.length} Zeichen)`;
}
