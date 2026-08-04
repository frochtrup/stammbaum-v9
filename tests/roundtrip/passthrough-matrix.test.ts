// tests/roundtrip/passthrough-matrix.test.ts — LP-1/INV-PT als MATRIX statt als Einzelfall
// (BL-287, ADR-v9-196).
//
// WARUM DIESE DATEI. Die Mutations-Messung (2026-08-02) ergab: eine Sabotage am
// Tiefen-Passthrough — der Regel, die bei JEDEM Speichern eines geänderten Records über
// den Erhalt aller nicht modellierten Zeilen entscheidet — machte **genau einen** von
// 3756 Testfällen rot. LP-1 ist das Kernversprechen des Projekts und hing an einer
// einzigen Zusicherung in einer einzigen Datei.
//
// UND WARUM NICHT NOCH EIN FALL MEHR. Der naheliegende Schluss („dann eben mehr Tests")
// ist der in ADR-v9-196 ausdrücklich verworfene. Der Fehler war nicht die Menge, sondern
// die AUSWAHL: `dirty-passthrough.small.ged` trägt die drei am Realbestand GEMESSENEN
// Verlustklassen — also genau das, was in EINER Datei vorkam. Ein Konstrukt, das dort
// fehlt, prüfte niemand (TST-20: „eine Fixture-Familie, die eine Formvariante nie
// enthält, prüft sie auch nicht").
//
// Die Antwort ist deshalb keine weitere Stichprobe, sondern die VOLLZÄHLIGKEIT gegen die
// Tabelle, die die Regel selbst benutzt: `MODELLIERTE_KINDER` sagt für jeden erkannten
// Knoten, welche Kinder das Modell abbildet. Für JEDEN dieser Knoten muss gelten: ein
// un-modelliertes Kind darunter überlebt den Neubau des Records. Die Fixture
// (`passthrough-matrix.small.ged`) trägt deshalb unter jedem Eintrag der Tabelle ein
// `_ZZ` — und der zweite Test hier bewacht, dass das so bleibt: kommt ein Eintrag in die
// Tabelle, ohne dass die Fixture ihn abdeckt, ist das ein Loch in der Matrix, kein
// stillschweigendes „ist schon abgedeckt".
//
// EINGECHECKTE FIXTURE, KEIN REALBESTAND. Bewusst: die private Datei zeigt, was VORKOMMT,
// nie was vorkommen KANN. Eine Zusicherung, die nur mit ihr gilt, ist in CI keine.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGedcom, applyDatabaseToRoots, serializeGedcom } from '../../core/interop';
import { modellierteKinder } from '../../core/interop/write-back';
import { assembleLines } from './roundtrip-helpers';
import type { Database } from '../../core/model/types';

const FIXTURE = join(__dirname, '../fixtures/passthrough-matrix.small.ged');
const src = readFileSync(FIXTURE, 'utf8');

/** Alle Tabellen-Schlüssel: die Knoten, unter denen das Modell etwas kennt — und unter
 *  denen ein un-modelliertes Geschwister deshalb überhaupt verlorengehen KANN. */
const MODELLIERTE_ELTERN = [
  'NAME', 'FAMC', 'ASSO', 'REFN', 'CHAN', 'PLAC', 'MAP', 'DATE', 'SOUR', '_EVAL',
  'OBJE', 'FILE', 'FORM', 'DATA', 'REPO', 'CALN', '_TASK', '_RLOG', '_HYPO',
  'BIRT', 'CHR', 'DEAT', 'BURI', 'OCCU', 'RESI', 'EDUC', 'EMIG', 'IMMI', 'NATU',
  'EVEN', 'GRAD', 'ADOP', 'MILI', 'FACT', 'CENS', 'PROP', 'BAPM', 'CONF',
  'MARR', 'ENGA', 'DIV',
];

/** Jede `_ZZ`-Zeile der Datei, nach ihrem Wert („unter NAME") — der Wert benennt die
 *  Position, damit ein Fehlschlag sagt, WELCHER Knoten seinen Passthrough verloren hat. */
function zzZeilen(text: string): string[] {
  return assembleLines(text)
    .filter((z) => /^\d+ _ZZ /.test(z))
    .map((z) => z.replace(/^\d+ _ZZ /, ''))
    .sort();
}

/** Der Speicher-Pfad der App: Modell zurück in den Baum, dann serialisieren. */
const speichern = (db: Database, roots: Parameters<typeof serializeGedcom>[0]['roots']): string =>
  serializeGedcom({ db, roots: applyDatabaseToRoots(db, roots) });

/** Macht JEDEN Record-Typ schmutzig — über modellierte Felder, wie ein Formular es täte.
 *  Nur an einem schmutzigen Record baut der Writer neu; ein unveränderter Record gibt den
 *  Original-Knoten zurück und beweist über den Passthrough gar nichts. */
function alleRecordsAendern(db: Database): void {
  for (const [id, p] of [...db.individuals]) db.individuals.set(id, { ...p, given: `${p.given}-neu` });
  for (const [id, f] of [...db.families]) db.families.set(id, { ...f, noteText: 'geändert' });
  for (const [id, s] of [...db.sources]) db.sources.set(id, { ...s, title: `${s.title} (neu)` });
  for (const [id, r] of [...db.repositories]) db.repositories.set(id, { ...r, name: `${r.name} (neu)` });
}

describe('LP-1/INV-PT — un-modellierte Kinder überleben unter JEDEM modellierten Knoten', () => {
  it('geänderte Records: keine einzige _ZZ-Zeile geht verloren', () => {
    const vorher = zzZeilen(src);
    const p = parseGedcom(src);
    alleRecordsAendern(p.db);
    const nachher = zzZeilen(speichern(p.db, p.roots));

    // Als Mengen-Vergleich, nicht als Zähl-Vergleich: ein Fehlschlag nennt dann die
    // Position („unter FILE"), statt nur eine Zahl zu melden.
    expect(nachher).toEqual(vorher);
    expect(vorher.length).toBeGreaterThan(0); // Selbstschutz: eine leere Fixture prüft nichts
  });

  it('unveränderte Records ebenfalls (Kontrollfall — hier greift der Passthrough gar nicht)', () => {
    const p = parseGedcom(src);
    expect(zzZeilen(speichern(p.db, p.roots))).toEqual(zzZeilen(src));
  });

  // Der Wächter über die Matrix selbst. Ohne ihn wäre der Test oben genau so viel wert wie
  // die Fixture zufällig breit ist — und ein neuer Tabellen-Eintrag (ein neu modelliertes
  // Feld) fiele lautlos aus der Prüfung heraus. Dieselbe Bauform wie der Drift-Guard in
  // `dirty-record-passthrough.test.ts`, nur in die andere Richtung.
  it('Matrix-Wächter: jeder modellierte Elternknoten trägt in der Fixture ein un-modelliertes Kind', () => {
    const zeilen = assembleLines(src);
    const abgedeckt = new Set<string>();
    // Ebene aus der logischen Zeile lesen und zum jeweils zuletzt gesehenen Elternknoten
    // zurückverfolgen — ein `_ZZ` auf Ebene N gehört zum Knoten auf Ebene N−1.
    const stapel: string[] = [];
    for (const z of zeilen) {
      const m = /^(\d+) (?:@[^@]+@ )?([A-Z_0-9]+)/.exec(z);
      if (!m) continue;
      const [, lvlText, tag] = m;
      const lvl = Number(lvlText);
      stapel.length = lvl;
      stapel[lvl] = tag;
      if (tag === '_ZZ' && lvl > 0) abgedeckt.add(stapel[lvl - 1]);
    }

    const fehlend = MODELLIERTE_ELTERN.filter((t) => !abgedeckt.has(t)).sort();
    expect(fehlend, 'ohne _ZZ-Kind in der Fixture — die Matrix hat ein Loch').toEqual([]);
  });

  // Gegenprobe zur Liste oben: sie muss die ECHTE Tabelle abbilden, nicht eine Kopie, die
  // stehen bleibt. `modellierteKinder` ist die Quelle; hat ein hier gelisteter Tag dort
  // keine Kinder (mehr), ist die Liste veraltet — und die Matrix prüft eine Position, die
  // es nicht mehr gibt.
  it('die geprüften Eltern sind genau die, die das Modell auch kennt', () => {
    const ohneKinder = MODELLIERTE_ELTERN.filter((t) => modellierteKinder(t).length === 0);
    expect(ohneKinder, 'steht in der Matrix, hat aber keine modellierten Kinder').toEqual([]);
  });
});
