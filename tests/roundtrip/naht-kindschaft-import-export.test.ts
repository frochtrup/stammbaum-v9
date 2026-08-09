// tests/roundtrip/naht-kindschaft-import-export.test.ts — die Naht „Datei → Kommando →
// Datei" für den Kind-Beziehungstyp (INV-P4, Spec 10; BL-293) UND für die BELEGE der
// Kindschaft (`ChildLink.citations`, BL-328/329, ADR-v9-244) — dieselbe Naht, dieselbe
// Fixture: beide Aussagen hängen am selben `1 FAMC`-Knoten.
//
// WARUM DIESE DATEI. INV-P4 („der Kind-Beziehungstyp wird ausschließlich INDI-seitig
// geführt") war bis hierher von GENAU EINER Testdatei verteidigt — gemessen mit
// `npm run test:mutation --nur INV-P4` (1 Treffer in 1 Datei). `tests/core/
// inv-p3-p4-indi-fam-sync.test.ts` prüft das Kommando am Modell: liegt `pedigree` am
// `ChildLink` und nicht an der Familie. Das ist die halbe Aussage. Die andere Hälfte ist
// die DATEI: ob der Wert INDI-seitig hinausgeschrieben wird — und nur dort — sieht man
// erst am serialisierten Text, und ob er den nächsten Ladepass überlebt, erst danach.
// Ein Umbau der Modell-Datei nähme bis dahin die ganze Absicherung mit.
//
// Die Naht ist bewusst so gelegt, dass die Verknüpfung SCHON EXISTIERT, bevor der
// Beziehungstyp gesetzt wird (`1 FAMC` steht in der Quelle): genau dieser Zweig von
// `addChildToFamily` schreibt den Wert an einen bestehenden Link — der andere legt ihn
// bei der Neuanlage mit an und sagt über den Nachtrag nichts.
//
// EINGECHECKTE FIXTURE, KEIN REALBESTAND (TST-23): die Zusicherung muss in CI gelten.
import { describe, it, expect } from 'vitest';
import { parseGedcom, serializeGedcom, applyDatabaseToRoots } from '../../core/interop';
import { addChildToFamily, saveChildLink } from '../../core/model/index';
import { makeCitation } from '../../core/model/factory';
import { editDatabase } from '../../core/model/draft';
import type { Database } from '../../core/model/types';

const SRC = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 5.5.1',
  '1 CHAR UTF-8',
  '0 @I1@ INDI',
  '1 NAME Hinrich /Ohle/',
  '1 SEX M',
  '1 FAMC @F1@',
  '0 @I2@ INDI',
  '1 NAME Gesche /Ohle/',
  '1 SEX F',
  '0 @F1@ FAM',
  '1 WIFE @I2@',
  '1 CHIL @I1@',
  '0 @S1@ SOUR',
  '1 TITL Kirchenbuch Ochtrup',
  '0 TRLR',
  '',
].join('\n');

/** Dieselbe Fixture MIT einem Kindschafts-Beleg in der Quelle (die Form des Realbestands:
 *  `PEDI` dann `SOUR`, mit `PAGE`/`QUAY` darunter). */
const SRC_MIT_BELEG = SRC.replace(
  '1 FAMC @F1@\n',
  '1 FAMC @F1@\n2 PEDI birth\n2 SOUR @S1@\n3 PAGE 11\n3 QUAY 3\n',
);

const speichern = (db: Database, roots: Parameters<typeof applyDatabaseToRoots>[1]): string =>
  serializeGedcom({ db, roots: applyDatabaseToRoots(db, roots) });

/** Ein Durchgang der Naht: laden → Kommando → speichern → neu laden. */
function durchNaht(kommando: (db: Database) => Database, quelle = SRC) {
  const erst = parseGedcom(quelle);
  const nach = kommando(erst.db);
  const datei = speichern(nach, erst.roots);
  const zweit = parseGedcom(datei);
  return { erst, nach, datei, zweit };
}

/** Die Zeilen EINES Records aus dem serialisierten Text — der Ort entscheidet hier. */
function record(datei: string, kopf: string): string[] {
  // GEDCOM-Zeilenende ist CRLF — hier zerlegt, nicht normalisiert: die Datei bleibt, wie
  // sie geschrieben wurde, und der Test sieht dieselben Zeilen wie ein fremder Leser.
  const zeilen = datei.split(/\r?\n/);
  const start = zeilen.indexOf(kopf);
  expect(start, `Record „${kopf}" nicht in der Datei`).toBeGreaterThanOrEqual(0);
  const rest = zeilen.slice(start + 1);
  const ende = rest.findIndex((l) => /^0 /.test(l));
  return rest.slice(0, ende === -1 ? rest.length : ende);
}

describe('Naht Datei → Kommando → Datei: der Kind-Beziehungstyp (INV-P4)', () => {
  it('addChildToFamily an einem BESTEHENDEN Link schreibt PEDI INDI-seitig und nur dort', () => {
    const { datei, zweit } = durchNaht((db) =>
      editDatabase(db, (d) => addChildToFamily(d, '@F1@', '@I1@', 'adopted')),
    );

    // (1) Die Aussage steht in der Datei — unter dem FAMC der PERSON.
    const indi = record(datei, '0 @I1@ INDI');
    const famc = indi.indexOf('1 FAMC @F1@');
    expect(famc).toBeGreaterThanOrEqual(0);
    expect(indi[famc + 1]).toBe('2 PEDI adopted');

    // (2) Und NUR dort: die Familie trägt keinen Beziehungstyp an ihrem CHIL.
    const fam = record(datei, '0 @F1@ FAM');
    expect(fam).toContain('1 CHIL @I1@');
    expect(fam.some((l) => /PEDI/.test(l))).toBe(false);

    // (3) Sie überlebt den nächsten Ladepass — dieselbe Seite, derselbe Wert.
    const link = zweit.db.individuals.get('@I1@')!.childOf.find((l) => l.familyId === '@F1@');
    expect(link?.pedigree).toBe('adopted');
  });

  it('ohne Beziehungstyp entsteht keine PEDI-Zeile (kein erfundener Default in der Datei)', () => {
    const { datei } = durchNaht((db) =>
      editDatabase(db, (d) => addChildToFamily(d, '@F1@', '@I1@')),
    );

    expect(record(datei, '0 @I1@ INDI').some((l) => /PEDI/.test(l))).toBe(false);
  });
});

describe('Naht Datei → Kommando → Datei: die Belege der Kindschaft (BL-328/329)', () => {
  it('ein Beleg aus der Quelle steht im Modell und kommt unverändert zurück', () => {
    const { erst, datei } = durchNaht((db) => db, SRC_MIT_BELEG);

    // (1) Er ist gelesen — vor BL-328 stand hier hart `citations: []`, und der Wert reiste
    //     nur als un-modellierter Passthrough durch die Datei.
    const link = erst.db.individuals.get('@I1@')!.childOf.find((l) => l.familyId === '@F1@')!;
    expect(link.citations).toHaveLength(1);
    expect(link.citations[0].sourceId).toBe('@S1@');
    expect(link.citations[0].page).toBe('11');
    expect(link.citations[0].quay).toBe(3);

    // (2) Und er kommt Zeile für Zeile so zurück, wie er kam (LP-1).
    const indi = record(datei, '0 @I1@ INDI');
    const famc = indi.indexOf('1 FAMC @F1@');
    expect(indi.slice(famc + 1, famc + 5)).toEqual(['2 PEDI birth', '2 SOUR @S1@', '3 PAGE 11', '3 QUAY 3']);
  });

  it('saveChildLink schreibt einen NEUEN Beleg INDI-seitig — und nur dort', () => {
    const { datei, zweit } = durchNaht((db) => {
      const link = db.individuals.get('@I1@')!.childOf[0];
      const cit = makeCitation('@S1@');
      cit.page = 'Bl. 7';
      cit.quay = 2;
      return saveChildLink(db, '@I1@', { ...link, citations: [cit] });
    });

    const indi = record(datei, '0 @I1@ INDI');
    const famc = indi.indexOf('1 FAMC @F1@');
    expect(indi.slice(famc + 1, famc + 4)).toEqual(['2 SOUR @S1@', '3 PAGE Bl. 7', '3 QUAY 2']);
    // Die Familie bleibt unberührt: der Beleg gehört der Kindschaft, nicht der Ehe (INV-P4).
    expect(record(datei, '0 @F1@ FAM').some((l) => /SOUR/.test(l))).toBe(false);

    const link = zweit.db.individuals.get('@I1@')!.childOf[0];
    expect(link.citations.map((c) => [c.sourceId, c.page, c.quay])).toEqual([['@S1@', 'Bl. 7', 2]]);
  });

  it('ein ENTFERNTER Beleg kommt nicht als Passthrough zurück', () => {
    // Der eigentliche Grund für den Eintrag `FAMC: [… 'SOUR']` in `MODELLIERTE_KINDER`
    // (write-back.ts): ohne ihn gälte die gelöschte `2 SOUR`-Zeile als un-modelliert und
    // würde beim Neubau des Records gerettet — die Löschung wäre wirkungslos.
    const { datei } = durchNaht((db) => {
      const link = db.individuals.get('@I1@')!.childOf[0];
      return saveChildLink(db, '@I1@', { ...link, citations: [] });
    }, SRC_MIT_BELEG);

    const indi = record(datei, '0 @I1@ INDI');
    expect(indi).toContain('1 FAMC @F1@');
    expect(indi).toContain('2 PEDI birth'); // das Verhältnis bleibt, nur der Beleg ging
    expect(indi.some((l) => /SOUR|PAGE|QUAY/.test(l))).toBe(false);
  });
});
