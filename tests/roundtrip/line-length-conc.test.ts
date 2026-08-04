// tests/roundtrip/line-length-conc.test.ts — BL-305 (ADR-v9-211): keine Ausgabezeile
// über 255 Bytes; lange Werte werden per `CONC` fortgesetzt.
//
// WORUM ES GEHT. GEDCOM 5.5.1 begrenzt eine physische Zeile auf 255 Bytes und setzt den
// Rest mit `CONC` fort (`CONT` ist der ECHTE Zeilenumbruch, ein anderer Tag für eine andere
// Sache). Der Emitter kannte nur `CONT` und gab lange Werte als EINE Zeile aus — inhaltlich
// verlustfrei, aber formal ungültig: ein fremder Leser darf die Zeile zurückweisen. Am
// Realbestand entstanden so 29 zu lange Zeilen, die längste mit 1547 Bytes.
//
// ZWEI DINGE, DIE HIER MITGEPRÜFT WERDEN, weil sie leicht falsch sind:
//   - Die Grenze ist in BYTES formuliert, nicht in Zeichen. Ein Umlaut zählt 2, ein
//     Surrogatpaar 4 — nach Zeichen zu rechnen hielte die Grenze scheinbar ein.
//   - Die Fortsetzung eines `2 CONT` ist ein `2 CONC`, kein `3 CONC`: beide sind
//     Geschwister unter demselben Elternknoten.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGedcom, applyDatabaseToRoots, serializeGedcom } from '../../core/interop';
import { assembleLines } from './roundtrip-helpers';
import { REALBESTAND, realbestandText, realbestandVorhanden } from '../core/realdaten';
import type { Database } from '../../core/model/types';

const src = readFileSync(join(__dirname, '../fixtures/line-length-conc.small.ged'), 'utf8');

const speichern = (
  db: Database,
  roots: Parameters<typeof serializeGedcom>[0]['roots'],
  format?: '7.0',
): string => serializeGedcom({ db, roots: applyDatabaseToRoots(db, roots) }, format ? { format } : {});

const bytes = (s: string): number => new TextEncoder().encode(s).length;
const zeilen = (t: string): string[] => t.split(/\r\n|\r|\n/).filter((z) => z !== '');
const zuLang = (t: string): string[] => zeilen(t).filter((z) => bytes(z) > 255);

/** Rein ADDITIV schmutzig machen — geprüft wird der NEUBAU, nicht der Passthrough. */
function alleRecordsAendern(db: Database): void {
  for (const [id, p] of [...db.individuals]) db.individuals.set(id, { ...p, uid: `${p.uid}ZZ` });
  for (const [id, s] of [...db.sources]) db.sources.set(id, { ...s, abbr: `${s.abbr}ZZ` });
}

const gebaut = (): string => {
  const p = parseGedcom(src);
  alleRecordsAendern(p.db);
  return speichern(p.db, p.roots);
};

describe('BL-305 — 5.5.1: keine Zeile über 255 Bytes', () => {
  it('die Quelle hat eine zu lange Zeile, die Ausgabe keine', () => {
    // Der Ausgangsbefund, an dieser Datei festgehalten: eine Quelle DARF die Grenze
    // verletzen (der Realbestand tut es 1x). Unsere Ausgabe darf es nicht.
    expect(zuLang(src)).toHaveLength(1);
    expect(zuLang(gebaut())).toEqual([]);
  });

  it('auch das unveränderte Speichern gibt keine zu lange Zeile aus', () => {
    const p = parseGedcom(src);
    expect(zuLang(speichern(p.db, p.roots))).toEqual([]);
  });

  it('der Inhalt bleibt derselbe (der Umbruch ist keine Wert-Änderung)', () => {
    // `assembleLines` faltet CONC/CONT wieder zusammen — genau darin besteht die Zusage.
    // Als MENGE verglichen: der Record-Neubau ordnet die erkannten Zeilen kanonisch um
    // (`1 SEX` vor `1 NOTE`), das ist eine andere Frage als der Zeilenumbruch.
    const ohneTest = (zs: string[]): string[] =>
      zs.filter((z) => !/^1 (_UID|ABBR)\b/.test(z)).sort();
    expect(ohneTest(assembleLines(gebaut()))).toEqual(ohneTest(assembleLines(src)));
  });

  it('ein Umlaut wird nicht zerrissen — der Re-Parse liefert denselben Text', () => {
    const p = parseGedcom(src);
    const vorher = p.db.individuals.get('@I2@')!.noteText;
    expect(vorher).toMatch(/ä/);
    const p2 = parseGedcom(gebaut());
    expect(p2.db.individuals.get('@I2@')!.noteText).toBe(vorher);
    expect(p2.db.sources.get('@S1@')!.text).toBe(p.db.sources.get('@S1@')!.text);
  });

  it('die Fortsetzung eines `2 CONT` ist ein `2 CONC`, kein `3 CONC`', () => {
    const zs = zeilen(gebaut());
    const i = zs.findIndex((z) => z.startsWith('2 CONT '));
    expect(i).toBeGreaterThan(-1);
    // Was direkt darauf folgt, ist entweder eine Fortsetzung auf DERSELBEN Ebene oder
    // etwas ganz anderes — ein `3 CONC` wäre in beiden Fällen falsch.
    expect(zs.some((z) => z.startsWith('3 CONC'))).toBe(false);
  });

  it('die Naht liegt nie an einem Leerzeichen — sonst verliert ein trimmender Leser es', () => {
    const zs = zeilen(gebaut());
    const nahtstellen = zs.filter((z) => /^\d+ CONC /.test(z));
    expect(nahtstellen.length).toBeGreaterThan(0); // sonst prüft die Schleife nichts
    for (const z of nahtstellen) expect(z.slice(z.indexOf('CONC ') + 5)).not.toMatch(/^ /);
    for (let i = 1; i < zs.length; i++) {
      if (/^\d+ CONC /.test(zs[i])) expect(zs[i - 1]).not.toMatch(/ $/);
    }
  });

  it('die LESE-Richtung: ein an einem Leerzeichen umbrochener Fremdtext behält es', () => {
    // Fremde Schreiber (v8s eigener `pushCont` eingeschlossen) schneiden hart an der
    // Byte-Grenze, also auch mitten in einem Leerzeichen. Unser Parser darf es nicht
    // verlieren — er schneidet den Wert hinter GENAU EINEM Trennzeichen ab.
    const fremd = '0 HEAD\n0 @I9@ INDI\n1 NAME X /Y/\n1 NOTE Hoefe Gruenaecker\n2 CONC  Strasse\n0 TRLR\n';
    expect(parseGedcom(fremd).db.individuals.get('@I9@')!.noteText)
      .toBe('Hoefe Gruenaecker Strasse');
  });

  it('zweimal speichern ändert nichts mehr (out1===out2)', () => {
    const out1 = gebaut();
    const p2 = parseGedcom(out1);
    expect(speichern(p2.db, p2.roots)).toBe(out1);
  });
});

// Die andere Hälfte derselben Frage: GEDCOM 7 hat die Zeilengrenze abgeschafft UND `CONC`
// mit ihr. Ein durchgereichtes `CONC` erzeugt dort ungültiges 7.0 — der Kopfkommentar des
// GED7-Adapters kündigte die Faltung seit ADR-v9-14 an, gebaut war sie nie.
describe('BL-305 — 7.0: kein CONC, keine Grenze', () => {
  it('die Ausgabe enthält kein einziges `CONC`', () => {
    const p = parseGedcom(src);
    expect(zeilen(src).some((z) => /^\d+ CONC\b/.test(z))).toBe(true); // die Quelle schon
    expect(zeilen(speichern(p.db, p.roots, '7.0')).some((z) => /^\d+ CONC\b/.test(z))).toBe(false);
  });

  it('der gefaltete Text ist vollständig — CONC hängt ohne Trennzeichen an', () => {
    const p = parseGedcom(src);
    const erwartet = p.db.sources.get('@S1@')!.text;
    const g7 = zeilen(speichern(p.db, p.roots, '7.0'));
    const textZeile = g7.find((z) => z.startsWith('1 TEXT '));
    expect(textZeile?.slice('1 TEXT '.length)).toBe(erwartet);
  });

  it('ein `CONC`, das ein `CONT` fortsetzt, landet am CONT — nicht am Elternwert', () => {
    const p = parseGedcom(src);
    const g7 = zeilen(speichern(p.db, p.roots, '7.0'));
    const i = g7.findIndex((z) => z === '1 NOTE Erste Zeile der Notiz.');
    expect(i).toBeGreaterThan(-1);
    // Die erste Zeile bleibt kurz; der lange Mehrbyte-Text steht vollständig im CONT.
    const cont = g7[i + 1];
    expect(cont.startsWith('2 CONT ')).toBe(true);
    expect(cont.slice('2 CONT '.length)).toBe(p.db.individuals.get('@I2@')!.noteText.split('\n')[1]);
  });
});

// Der Wächter an der maßgeblichen Datei (TST-21): die eingecheckte Fixture hält den
// Vertrag in CI, der Realbestand belegt die ZAHL. Vor dem Bau: 30 zu lange Zeilen beim
// Neubau aller Records, die längste mit 1547 Bytes — die Quelle selbst hat genau eine.
describe.skipIf(!realbestandVorhanden())(`BL-305 — Wächter am Realbestand (${REALBESTAND.datei})`, () => {
  it('der Neubau ALLER Records gibt keine Zeile über 255 Bytes aus', () => {
    const p = parseGedcom(realbestandText());
    for (const [id, x] of [...p.db.individuals]) p.db.individuals.set(id, { ...x, uid: `${x.uid}ZZ` });
    for (const [id, x] of [...p.db.families]) p.db.families.set(id, { ...x, lastChanged: '1 JAN 2099' });
    for (const [id, x] of [...p.db.sources]) p.db.sources.set(id, { ...x, abbr: `${x.abbr}ZZ` });
    for (const [id, x] of [...p.db.repositories]) p.db.repositories.set(id, { ...x, phone: `${x.phone}ZZ` });
    const lang = zuLang(speichern(p.db, p.roots));
    expect(lang.map((z) => `${bytes(z)} Bytes: ${z.slice(0, 60)}…`)).toEqual([]);
  });
});
