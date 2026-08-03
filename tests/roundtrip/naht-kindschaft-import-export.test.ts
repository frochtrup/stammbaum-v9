// tests/roundtrip/naht-kindschaft-import-export.test.ts — die Naht „Datei → Kommando →
// Datei" für den Kind-Beziehungstyp (INV-P4, Spec 10; BL-293).
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
import { addChildToFamily } from '../../core/model/index';
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
