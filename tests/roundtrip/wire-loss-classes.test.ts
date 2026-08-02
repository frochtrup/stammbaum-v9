// tests/roundtrip/wire-loss-classes.test.ts — BL-292 / BL-289 (ADR-v9-207):
// die drei am Realbestand gemessenen Verlustklassen, an einer EINGECHECKTEN Datei.
//
// WARUM DIESE DATEI. BL-292 hat die Verluste an `Unsere Familie 2026.ged` gemessen — einer
// gitignorten Datei, die in CI fehlt. Eine Zusicherung, die nur mit ihr gilt, ist dort
// keine (TST-21/TST-20). Die Fixture trägt deshalb jedes der gemessenen Konstrukte in
// seiner belegten Form:
//
//   (a) mehrere `1 NAME`-Zeilen  — 95× im Bestand, mit TYPE/GIVN/SURN/NPFX/NSFX/SOUR
//   (b) strukturierte Adresse    — `ADDR` OHNE Wert, mit ADR1/ADR2/CITY/POST/CTRY darunter
//                                  (83× am Ereignis, 1× am Repository)
//   (c) `RELI` mit Datum/Ort/Zitat — 110 Zeilen, 119 `SOUR` (BL-289)
//
// GEMESSEN WIRD DER NEUBAU, nicht das Nichtstun: ein unveränderter Record gibt den
// Original-Knoten zurück und beweist über den Writer gar nichts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGedcom, applyDatabaseToRoots, serializeGedcom } from '../../core/interop';
import { assembleLines } from './roundtrip-helpers';
import type { Database } from '../../core/model/types';

const src = readFileSync(join(__dirname, '../fixtures/wire-loss-classes.small.ged'), 'utf8');

const speichern = (db: Database, roots: Parameters<typeof serializeGedcom>[0]['roots']): string =>
  serializeGedcom({ db, roots: applyDatabaseToRoots(db, roots) });

/** Rein ADDITIV schmutzig machen: die Bilanz soll echte Verluste zeigen, nicht meine Edits. */
function alleRecordsAendern(db: Database): void {
  for (const [id, p] of [...db.individuals]) db.individuals.set(id, { ...p, uid: `${p.uid}ZZ` });
  for (const [id, s] of [...db.sources]) db.sources.set(id, { ...s, abbr: `${s.abbr}ZZ` });
  for (const [id, r] of [...db.repositories]) db.repositories.set(id, { ...r, name: `${r.name}ZZ` });
}

/** Multimenge aller Zeilen — was hier fehlt, hat der Neubau verloren. */
function fehlend(a: string, b: string): string[] {
  const zaehl = (t: string): Map<string, number> => {
    const m = new Map<string, number>();
    for (const z of assembleLines(t)) m.set(z, (m.get(z) ?? 0) + 1);
    return m;
  };
  const ma = zaehl(a), mb = zaehl(b);
  const out: string[] = [];
  for (const [z, n] of ma) {
    const d = n - (mb.get(z) ?? 0);
    // `_UID`/`ABBR`/`1 NAME` am Repository sind die Zeilen, die der Test selbst geändert hat.
    if (d > 0 && !/^1 (_UID|ABBR) /.test(z) && z !== '1 NAME Bistumsarchiv Münster') out.push(`${d}x ${z}`);
  }
  return out;
}

describe('BL-292/BL-289 — der Record-Neubau verliert keine Zeile', () => {
  const gebaut = (): string => {
    const p = parseGedcom(src);
    alleRecordsAendern(p.db);
    return speichern(p.db, p.roots);
  };

  it('keine einzige Zeile geht verloren', () => {
    expect(fehlend(src, gebaut())).toEqual([]);
  });

  it('(a) alle drei Namensformen stehen wieder da, mit Untertags und Zitat', () => {
    const zeilen = assembleLines(gebaut());
    // `1 NAME` gibt es auch am Repository — hier zählen die drei Personen-Namensformen.
    for (const n of ['Elisabeth Auguste /Scho/', 'Elisabeth, Auguste /Schoo/', 'Tante Pully /Scho/']) {
      expect(zeilen).toContain(`1 NAME ${n}`);
    }
    expect(zeilen).toContain('2 TYPE birth');
    expect(zeilen).toContain('2 NPFX Frfr.');
    expect(zeilen).toContain('2 NSFX d. Ä.');
    expect(zeilen).toContain('3 PAGE KB016 T_270');
    expect(zeilen).toContain('4 _STYP original');
  });

  it('(a) eine Namensform bekommt KEINE Untertags dazu, die die Quelle nicht hatte', () => {
    // Der Hauptname ergänzt GIVN/SURN aus dem NAME-Wert (ADR-v9-112) — eine Namensform
    // NICHT: das wäre eine byte-verändernde Ergänzung ohne Anlass (ADR-v9-197).
    const p = parseGedcom(src);
    const dritte = p.db.individuals.get('@I1@')!.extraNames[1];
    expect(dritte.given).toBe('Tante, Pully');
    expect(dritte.surname).toBe(''); // `/Scho/` steht im Wert, aber es gab kein SURN
  });

  it('(b) die strukturierte Adresse überlebt — auch unter einem WERTLOSEN ADDR', () => {
    const zeilen = assembleLines(gebaut());
    expect(zeilen).toContain('2 ADDR');
    for (const z of ['3 ADR1 Schwüblingshöfe', '3 ADR2 Hinterhaus', '3 CITY Ochtrup',
      '3 POST 48607', '3 CTRY Deutschland']) expect(zeilen).toContain(z);
    // Auch am Repository (eigener Emit-Pfad, dieselbe Tristate-Frage).
    expect(zeilen).toContain('1 ADDR');
    expect(zeilen).toContain('2 CITY München');
  });

  it('(c) RELI ist ein Ereignis mit Datum, Ort und Zitat — beide Zeilen', () => {
    const p = parseGedcom(src);
    const reli = p.db.individuals.get('@I1@')!.events.filter((e) => e.type === 'RELI');
    expect(reli.map((e) => e.value)).toEqual(['röm.-kath.', 'evang.']);
    // Die leeren `2 DATE`/`2 PLAC` sind vorhanden-aber-leer, nicht abwesend (Tristate).
    expect(reli[0].date).toBe('');
    expect(reli[0].place).toBe('');
    expect(reli[0].citations[0].page).toBe('12');
    expect(reli[1].citations).toHaveLength(1);
  });

  it('zweimal speichern ändert nichts mehr (out1===out2)', () => {
    const out1 = gebaut();
    const p2 = parseGedcom(out1);
    expect(speichern(p2.db, p2.roots)).toBe(out1);
  });
});

// Was BEWUSST offen bleibt (BL-292 Fertig-Zustand: „Modell-Erweiterung ODER ausdrücklich
// dokumentierte Grenze"). Am Realbestand nach dem Bau von BL-289/290/291/292 gemessen:
// 68 verlorene Zeilen in ~110.000, in vier benennbaren Gruppen. Der Test hält sie fest,
// damit die Grenze nicht still WÄCHST — er beschreibt kein Wunschverhalten, sondern das
// bekannte Ist. Fällt eine dieser Zusicherungen, hat sich etwas geändert und will
// entschieden werden.
describe('BL-292 — die dokumentierte Grenze', () => {
  it('`QUAY 0` wird nicht geschrieben: das Modell kennt keinen Unterschied zu „kein QUAY"', () => {
    // 30× im Bestand. `Citation.quay` ist `0|1|2|3`; 0 ist zugleich der Default. Ein
    // Tristate dafür ist keine reine Fidelity-Frage — der Zitat-Editor müsste „keine
    // Bewertung" als vierten Zustand anbieten; das ist eine eigene Entscheidung.
    const p = parseGedcom('0 HEAD\n0 @I1@ INDI\n1 BIRT\n2 SOUR @S1@\n3 QUAY 0\n0 TRLR\n');
    const roh = p.db.individuals.get('@I1@')!;
    p.db.individuals.set(roh.id, { ...roh, uid: 'ZZ' });
    expect(assembleLines(speichern(p.db, p.roots)).some((z) => z === '3 QUAY 0')).toBe(false);
  });

  it('`SEX U` wird nicht geschrieben: INV-P1 macht U zum Default, nicht zum Wert', () => {
    // 1× im Bestand.
    const p = parseGedcom('0 HEAD\n0 @I1@ INDI\n1 SEX U\n0 TRLR\n');
    const roh = p.db.individuals.get('@I1@')!;
    p.db.individuals.set(roh.id, { ...roh, uid: 'ZZ' });
    expect(assembleLines(speichern(p.db, p.roots)).some((z) => z === '1 SEX U')).toBe(false);
  });

  it('ein ZWEITES `NOTE`/`TEXT` am selben Träger hat keinen Platz (ein Slot, ein String)', () => {
    // 8× NOTE, 4× TEXT im Bestand. Anders als bei NAME/RELI ist hier nicht klar, ob eine
    // Liste die richtige Form ist oder ob die Quelle schlicht doppelt trägt.
    const p = parseGedcom('0 HEAD\n0 @I1@ INDI\n1 BIRT\n2 NOTE eins\n2 NOTE zwei\n0 TRLR\n');
    const roh = p.db.individuals.get('@I1@')!;
    p.db.individuals.set(roh.id, { ...roh, uid: 'ZZ' });
    const zeilen = assembleLines(speichern(p.db, p.roots));
    expect(zeilen.filter((z) => z.startsWith('2 NOTE '))).toHaveLength(1);
  });
});
