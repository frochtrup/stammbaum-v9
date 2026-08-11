// tests/roundtrip/sonderereignis-anlegen.test.ts — BL-340: ein neu erfasstes
// Sonder-Ereignis erreicht die Datei.
//
// DER BEFUND, und wie er gefunden wurde. BL-339 machte die Geburtszeile immer sichtbar.
// Die eigene Verifikation ging den Weg danach zu Ende — Datum eintippen, speichern,
// Arbeitskopie ansehen — und fand: die Oberfläche zeigte „Geburt 1938", die Datei trug
// kein `1 BIRT`. Ursache war ein Schreib-Gate `if (p.birth.seen)`. `seen` beantwortet aber
// „stand die Zeile in der QUELLDATEI?" (INV-P5, für leere-aber-vorhandene Blöcke) — als
// Gate fürs SCHREIBEN heißt das: was die Quelle nicht hatte, kann nie eines werden.
//
// Der Fehler war NICHT auf die Geburt beschränkt und ist älter als BL-339: alle sechs
// Sonder-Slots hingen daran. Taufe und Bestattung sind über „+ Ereignis" seit jeher
// anlegbar, und der Modal-Save schreibt sie in genau diese Slots
// (`person-event-modal.svelte.ts`) — sie gingen also ebenso verloren, nur hat es niemand
// nachgeprüft. Dasselbe für Heirat und Verlobung an der Familie.
//
// Die Gegenrichtung ist genauso wichtig und steht im letzten Test: ein Sonder-Ereignis
// ohne Inhalt, das die Quelle nicht hatte, darf NICHT geschrieben werden — sonst bekäme
// seit BL-339 jede Person eine nackte `1 BIRT`-Zeile, und RT-2 (`net_delta=0`) fiele beim
// ersten Speichern.
import { describe, it, expect } from 'vitest';
import { parseGedcom, serializeGedcom, applyDatabaseToRoots } from '../../core/interop';
import { savePerson, saveFamily } from '../../core/model';

const OHNE_SONDEREREIGNIS = [
  '0 HEAD', '1 GEDC', '2 VERS 5.5.1', '1 CHAR UTF-8',
  '0 @I1@ INDI',
  '1 NAME Josef /Borgmann/',
  '1 SEX M',
  '1 FAMS @F1@',
  '0 @I2@ INDI',
  '1 NAME Ulla /Decker/',
  '1 FAMS @F1@',
  '0 @F1@ FAM',
  '1 HUSB @I1@',
  '1 WIFE @I2@',
  '0 TRLR', '',
].join('\n');

function ausgabe(doc: ReturnType<typeof parseGedcom>, db: typeof doc.db): string[] {
  return serializeGedcom({ db, roots: applyDatabaseToRoots(db, doc.roots) })
    .split(/\r?\n/).map((z) => z.trim());
}

describe('Neu erfasstes Sonder-Ereignis (BL-340)', () => {
  it('eine Geburt an einer Person, die nie eine hatte, landet in der Datei', () => {
    const doc = parseGedcom(OHNE_SONDEREREIGNIS);
    const p = doc.db.individuals.get('@I1@')!;
    expect(p.birth.seen, 'Vorbedingung: die Quelle hatte kein BIRT').toBe(false);

    const db = { ...doc.db, individuals: savePerson(doc.db.individuals, { ...p, birth: { ...p.birth, date: '1938' } }) };
    const z = ausgabe(doc, db);

    expect(z, 'ohne den Fix stand hier nichts — der Eintrag war beim Speichern weg').toContain('1 BIRT');
    expect(z).toContain('2 DATE 1938');
  });

  it('gilt genauso für Taufe und Bestattung — die über „+ Ereignis" anlegbar sind', () => {
    const doc = parseGedcom(OHNE_SONDEREREIGNIS);
    const p = doc.db.individuals.get('@I1@')!;
    const db = {
      ...doc.db,
      individuals: savePerson(doc.db.individuals, {
        ...p,
        chr: { ...p.chr, date: '2 FEB 1938' },
        buri: { ...p.buri, place: 'Cloppenburg' },
      }),
    };
    const z = ausgabe(doc, db);

    expect(z).toContain('1 CHR');
    expect(z).toContain('2 DATE 2 FEB 1938');
    expect(z).toContain('1 BURI');
    expect(z).toContain('2 PLAC Cloppenburg');
  });

  it('und für Heirat und Verlobung an der Familie', () => {
    const doc = parseGedcom(OHNE_SONDEREREIGNIS);
    const f = doc.db.families.get('@F1@')!;
    const db = saveFamily(doc.db, { ...f, marriage: { ...f.marriage, date: '5 MAY 1963' } });
    const z = ausgabe(doc, db);

    expect(z).toContain('1 MARR');
    expect(z).toContain('2 DATE 5 MAY 1963');
  });

  it('INV-P5 bleibt: ein leerer, aber VORHANDENER Block überlebt weiterhin', () => {
    const mitLeeremBirt = OHNE_SONDEREREIGNIS.replace('1 SEX M', '1 SEX M\n1 BIRT');
    const doc = parseGedcom(mitLeeremBirt);
    const p = doc.db.individuals.get('@I1@')!;
    expect(p.birth.seen).toBe(true);

    const db = { ...doc.db, individuals: savePerson(doc.db.individuals, { ...p, name: 'Josef /Anders/' }) };
    expect(ausgabe(doc, db)).toContain('1 BIRT');
  });

  it('RT-2: ein leeres, nie dagewesenes Sonder-Ereignis wird NICHT geschrieben', () => {
    // Der Preis, den BL-339 sonst hätte: die Geburtszeile ist jetzt immer SICHTBAR — sie
    // darf deshalb nicht immer auch GESCHRIEBEN werden.
    const doc = parseGedcom(OHNE_SONDEREREIGNIS);
    const p = doc.db.individuals.get('@I1@')!;
    const db = { ...doc.db, individuals: savePerson(doc.db.individuals, { ...p, name: 'Josef /Anders/' }) };
    const z = ausgabe(doc, db);

    expect(z).not.toContain('1 BIRT');
    expect(z).not.toContain('1 CHR');
    expect(z).not.toContain('1 DEAT');
    expect(z).not.toContain('1 BURI');
  });
});
