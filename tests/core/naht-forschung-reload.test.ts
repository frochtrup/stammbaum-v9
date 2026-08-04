// tests/core/naht-forschung-reload.test.ts — die Naht „Datei → Kommando → Datei" für die
// Forschungsdaten (INV-H2/INV-H3, Spec 12 §4; BL-293).
//
// WARUM DIESE DATEI. Beide Invarianten hingen an je EINER Testdatei — gemessen mit
// `npm run test:mutation --nur INV-H2` bzw. `--nur INV-H3` (je 1 Treffer in 1 Datei).
// `inv-h1-h2-hypothesis.test.ts` und `identity-exclusion.test.ts` prüfen die reinen
// Funktionen an HANDGEBAUTEN Hypothesen. Was sie nicht sehen: ob dieselbe Zusicherung noch
// gilt, wenn die Hypothese aus der DATEI kommt — geparst aus `_HYPO`, mit ihren `SOUR`-,
// `_HREF`- und `_RATIO`-Kindern. Ein Umbau der einen Datei nähme die Absicherung mit, ohne
// dass etwas rot würde.
//
// DIE NAHT IST NICHT DEKORATION. Sie stellt eine Frage, die keine der beiden Einzeldateien
// stellen kann: die Wire-Form ist WIEDERHOLBAR (`2 SOUR` mehrfach, `2 _HREF` mehrfach) —
// eine Doppelung im Modell wird deshalb widerspruchsfrei in die Datei geschrieben und
// kommt beim nächsten Laden ungefiltert zurück. Ohne die Dedup-Regel wächst der Block bei
// jedem Durchgang; die Datei selbst wehrt sich nicht.
//
// INV-H3 IST DER ENGERE FALL, und das ist hier ausdrücklich festgehalten: die Regel
// „Bezug UND Begründung" ist am Sammler `collectIdentityExclusions` nicht beobachtbar —
// der iteriert über `h.refs` und tut bei leerem Array ohnehin nichts. Beobachtbar ist sie
// allein am Prädikat. Die Naht trägt hier also nicht die Wirkung, sondern die HERKUNFT:
// geprüft wird die aus der Datei zurückgelesene Hypothese, nicht eine gebaute.
//
// EINGECHECKTE FIXTURE, KEIN REALBESTAND (TST-23): die Zusicherung muss in CI gelten.
import { describe, it, expect } from 'vitest';
import { parseGedcom, serializeGedcom, applyDatabaseToRoots } from '../../core/interop';
import { editDatabase } from '../../core/model/draft';
import { addHypothesisEvidence } from '../../core/research/index';
import {
  isIdentityExclusion,
  collectIdentityExclusions,
  findPersonDuplicates,
} from '../../core/dedup/index';
import type { Database } from '../../core/model/types';

/** Zwei Paare fast identischer Personen — der Finder meldet ohne Befund genau zwei. */
const SRC = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 5.5.1',
  '1 CHAR UTF-8',
  '0 @I1@ INDI',
  '1 NAME Johann /Meyer/',
  '1 SEX M',
  '1 BIRT',
  '2 DATE 1750',
  // Vollständiger Ausschluss: Art, Status, Bezug UND Begründung.
  '1 _HYPO Nicht dieselbe Person wie @I7@',
  '2 _ID h_aus',
  '2 _HSTAT rejected',
  '2 _HWGT high',
  '2 _HKIND IDENT',
  '2 _HREF @I7@',
  '2 _RATIO Verschiedene Eltern, Taufbuch 1750 gegen 1762.',
  // Freie Hypothese mit EINEM Evidenz-Beleg — Ausgangspunkt der INV-H2-Naht.
  '1 _HYPO Vater vermutlich Hinrich',
  '2 _ID h_ev',
  '2 _HSTAT open',
  '2 _HWGT medium',
  '2 SOUR @S1@',
  '3 PAGE 12',
  '0 @I7@ INDI',
  '1 NAME Johann /Meyer/',
  '1 SEX M',
  '1 BIRT',
  '2 DATE 1750',
  '0 @I2@ INDI',
  '1 NAME Anna /Kruse/',
  '1 SEX F',
  '1 BIRT',
  '2 DATE 1762',
  // UNVOLLSTÄNDIGER Ausschluss: Begründung ja, Bezug fehlt (kein `_HREF`).
  '1 _HYPO Wohl nicht dieselbe',
  '2 _ID h_halb',
  '2 _HSTAT rejected',
  '2 _HKIND IDENT',
  '2 _RATIO Bauchgefühl, noch nicht belegt.',
  '0 @I8@ INDI',
  '1 NAME Anna /Kruse/',
  '1 SEX F',
  '1 BIRT',
  '2 DATE 1762',
  '0 @S1@ SOUR',
  '1 TITL Kirchenbuch Arpke',
  '0 TRLR',
  '',
].join('\n');

const speichern = (db: Database, roots: Parameters<typeof applyDatabaseToRoots>[1]): string =>
  serializeGedcom({ db, roots: applyDatabaseToRoots(db, roots) });

/** Ein Durchgang der Naht: laden → Kommando → speichern → neu laden. */
function durchNaht(kommando: (db: Database) => Database) {
  const erst = parseGedcom(SRC);
  const nach = kommando(erst.db);
  const datei = speichern(nach, erst.roots);
  const zweit = parseGedcom(datei);
  return { erst, nach, datei, zweit };
}

const hypothese = (db: Database, person: string, id: string) =>
  db.individuals.get(person)!.hypotheses.find((h) => h.id === id)!;

describe('Naht Datei → Kommando → Datei: Evidenz bleibt SID-Referenz ohne Doppelung (INV-H2)', () => {
  it('derselbe Beleg zweimal angehängt steht nach dem Reload genau einmal in Modell und Datei', () => {
    const { datei, zweit } = durchNaht((db) =>
      editDatabase(db, (d) => {
        const p = d.person('@I1@')!;
        p.hypotheses = p.hypotheses.map((h) =>
          h.id === 'h_ev' ? addHypothesisEvidence(h, '@S1@', '12') : h,
        );
      }),
    );

    const h = hypothese(zweit.db, '@I1@', 'h_ev');
    expect(h.evidence).toEqual([{ sourceId: '@S1@', page: '12' }]);

    // Und die Datei selbst trägt den Beleg genau einmal — die Wire-Form ist wiederholbar,
    // eine Doppelung wäre dort völlig widerspruchsfrei und käme jedes Mal wieder mit.
    expect(datei.split(/\r?\n/).filter((l) => l === '2 SOUR @S1@')).toHaveLength(1);
  });

  it('ein ANDERER Beleg derselben Quelle ist keine Doppelung — die Seite gehört zum Schlüssel', () => {
    const { zweit } = durchNaht((db) =>
      editDatabase(db, (d) => {
        const p = d.person('@I1@')!;
        p.hypotheses = p.hypotheses.map((h) =>
          h.id === 'h_ev' ? addHypothesisEvidence(h, '@S1@', '13') : h,
        );
      }),
    );

    expect(hypothese(zweit.db, '@I1@', 'h_ev').evidence).toEqual([
      { sourceId: '@S1@', page: '12' },
      { sourceId: '@S1@', page: '13' },
    ]);
  });
});

describe('Naht Datei → Kommando → Datei: ein Ausschluss braucht Bezug UND Begründung (INV-H3)', () => {
  it('die aus der Datei gelesene Hypothese wird nach denselben drei Bedingungen beurteilt', () => {
    const { zweit } = durchNaht((db) => db);

    // Vollständig — überlebt den Roundtrip als gültiger Ausschluss.
    expect(isIdentityExclusion(hypothese(zweit.db, '@I1@', 'h_aus'))).toBe(true);
    // Ohne `_HREF` fehlt der Bezug; die Begründung allein macht keinen Befund. Genau das
    // sieht die reine Funktion nur an einer gebauten Hypothese — hier kommt sie aus der Datei.
    const halb = hypothese(zweit.db, '@I2@', 'h_halb');
    expect(halb.refs).toEqual([]);
    expect(halb.rationale).not.toBe('');
    expect(isIdentityExclusion(halb)).toBe(false);
  });

  it('nur der vollständige Befund blendet sein Paar aus — der halbe lässt seines stehen', () => {
    const { zweit } = durchNaht((db) => db);
    const graph = zweit.db;

    const ohne = findPersonDuplicates(graph, 65);
    expect(ohne.length).toBeGreaterThan(0); // Selbstschutz: die Fixture trägt überhaupt Paare.

    const mit = findPersonDuplicates(graph, 65, collectIdentityExclusions(graph));
    const paare = mit.map((k) => [k.a, k.b].sort().join('|'));
    expect(paare).not.toContain('@I1@|@I7@');
    expect(paare).toContain('@I2@|@I8@');
  });
});
