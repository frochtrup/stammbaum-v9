// tests/roundtrip/name-subtags.test.ts — BL-304 (ADR-v9-210): `GIVN`/`SURN`/`NSFX` werden
// nur dort geschrieben, wo sie etwas sagen.
//
// WORUM ES GEHT. Der GEDCOM-Name steht doppelt da: als Wert (`1 NAME Anna /Decker/`) und
// optional als Untertags darunter. Die Untertags fehlen in freier Wildbahn meistens, und
// seit ADR-v9-112 ergänzt der Parser sie im MODELL aus dem Namenswert, damit nicht jeder
// Leser den Schrägstrich-Rückfall selbst kennen muss. Dem Writer fehlte damit die Auskunft,
// welcher Wert aus der DATEI kam — er schrieb beide gleich, und jeder neu gebaute Record
// bekam Zeilen, die seine Quelle nie hatte (+100 `GIVN`, +100 `SURN` am Realbestand).
//
// GEMESSEN WIRD DER NEUBAU: ein unveränderter Record gibt den Original-Knoten zurück und
// beweist über den Writer nichts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGedcom, applyDatabaseToRoots, serializeGedcom } from '../../core/interop';
import { assembleLines } from './roundtrip-helpers';
import { composeGedcomName } from '../../core/model/name-parts';
import { REALBESTAND, realbestandText, realbestandVorhanden } from '../core/realdaten';
import type { Database } from '../../core/model/types';

const src = readFileSync(join(__dirname, '../fixtures/name-subtags.small.ged'), 'utf8');

const speichern = (db: Database, roots: Parameters<typeof serializeGedcom>[0]['roots']): string =>
  serializeGedcom({ db, roots: applyDatabaseToRoots(db, roots) });

/** Rein ADDITIV schmutzig machen — die Bilanz soll den Writer zeigen, nicht den Test. */
function alleRecordsAendern(db: Database): void {
  for (const [id, p] of [...db.individuals]) db.individuals.set(id, { ...p, uid: `${p.uid}ZZ` });
}

const gebaut = (): string[] => {
  const p = parseGedcom(src);
  alleRecordsAendern(p.db);
  return assembleLines(speichern(p.db, p.roots));
};

describe('BL-304 — der Record-Neubau erfindet keine Namens-Untertags', () => {
  it('ohne Untertags in der Quelle bleibt es beim `NAME`-Wert', () => {
    const z = gebaut();
    expect(z).toContain('1 NAME Anna Maria /Decker/');
    expect(z.some((x) => x === '2 GIVN Anna Maria')).toBe(false);
    expect(z.some((x) => x === '2 SURN Decker')).toBe(false);
  });

  it('mit Untertags in der Quelle bleiben sie stehen — auch wenn ihr Wert redundant ist', () => {
    const z = gebaut();
    expect(z).toContain('2 GIVN Theodor Hermann');
    expect(z).toContain('2 SURN Zurloh');
  });

  it('ein ENGER gesetztes `GIVN` überlebt, das ableitbare `SURN`/`NSFX` daneben nicht', () => {
    const z = gebaut();
    // @I3@: nur `GIVN Anna` stand da; `Decker`/`Jr.` ergänzt der Parser aus dem Wert.
    expect(z).toContain('2 GIVN Anna');
    expect(z.some((x) => x === '2 NSFX Jr.')).toBe(false);
    // @I4@: `GIVN Johann` ist enger als der Namenswert `Johann Wilhelm` — es trägt
    // Information, die sonst niemand hält.
    expect(z).toContain('2 GIVN Johann');
    expect(z.filter((x) => x === '2 SURN von der Heide')).toEqual([]);
  });

  it('die Bilanz: keine Zeile verloren, keine erfunden', () => {
    const zaehl = (zs: string[]): Map<string, number> => {
      const m = new Map<string, number>();
      for (const z of zs) m.set(z, (m.get(z) ?? 0) + 1);
      return m;
    };
    const ein = zaehl(assembleLines(src)), aus = zaehl(gebaut());
    const nurTest = (z: string): boolean => /^1 _UID /.test(z);
    const fehlend: string[] = [], erfunden: string[] = [];
    for (const [z, n] of ein) if (n - (aus.get(z) ?? 0) > 0 && !nurTest(z)) fehlend.push(z);
    for (const [z, n] of aus) if (n - (ein.get(z) ?? 0) > 0 && !nurTest(z)) erfunden.push(z);
    expect({ fehlend, erfunden }).toEqual({ fehlend: [], erfunden: [] });
  });

  it('zweimal speichern ändert nichts mehr (out1===out2)', () => {
    const p = parseGedcom(src);
    alleRecordsAendern(p.db);
    const out1 = speichern(p.db, p.roots);
    const p2 = parseGedcom(out1);
    expect(speichern(p2.db, p2.roots)).toBe(out1);
  });
});

// Die andere Hälfte: der Nutzer-Edit. Er muss in der Zeile landen, die ihn tragen soll —
// und darf keine zweite daneben erzeugen.
describe('BL-304 — ein Namens-Edit landet dort, wo er hingehört', () => {
  const umbenennen = (id: string, given: string): string[] => {
    const p = parseGedcom(src);
    const person = p.db.individuals.get(id)!;
    const name = composeGedcomName({ given, surname: person.surname, suffix: person.suffix });
    p.db.individuals.set(id, { ...person, given, name });
    return assembleLines(speichern(p.db, p.roots));
  };

  it('ohne Untertags in der Quelle: nur der `NAME`-Wert ändert sich', () => {
    const z = umbenennen('@I1@', 'Anna Elisabeth');
    expect(z).toContain('1 NAME Anna Elisabeth /Decker/');
    expect(z.some((x) => /^2 GIVN /.test(x) && x.includes('Anna Elisabeth'))).toBe(false);
  });

  it('mit Untertags in der Quelle: der Untertag zieht MIT, der alte Wert bleibt nicht daneben', () => {
    const z = umbenennen('@I2@', 'Theodor');
    expect(z).toContain('1 NAME Theodor /Zurloh/');
    expect(z).toContain('2 GIVN Theodor');
    expect(z.some((x) => x === '2 GIVN Theodor Hermann')).toBe(false);
  });

  it('ein Wert, den der `NAME`-Wert NICHT hergibt, wird geschrieben — sonst wäre er weg', () => {
    // @I5@ trägt einen Namen ohne Schrägstriche; `splitGedcomName` sagt dazu nichts.
    // Ein `given` daran ist die einzige Fundstelle dieser Information.
    const p = parseGedcom(src);
    const person = p.db.individuals.get('@I5@')!;
    expect(person.givenSeen).toBe(false);
    p.db.individuals.set('@I5@', { ...person, given: 'Namenlos' });
    const z = assembleLines(speichern(p.db, p.roots));
    expect(z).toContain('2 GIVN Namenlos');
  });

  it('was geschrieben wird, liest der Parser identisch zurück (Writer/Parser invers)', () => {
    const p = parseGedcom(src);
    alleRecordsAendern(p.db);
    const p2 = parseGedcom(speichern(p.db, p.roots));
    for (const [id, a] of p.db.individuals) {
      const b = p2.db.individuals.get(id)!;
      expect({ id, given: b.given, surname: b.surname, suffix: b.suffix })
        .toEqual({ id, given: a.given, surname: a.surname, suffix: a.suffix });
    }
  });
});

// Der Wächter an der maßgeblichen Datei (TST-21): die eingecheckte Fixture hält den
// Vertrag in CI, der Realbestand belegt die ZAHL. Vor dem Bau ergänzte der Neubau aller
// Records dort +100 `GIVN` und +100 `SURN` — die größte verbliebene Menge erfundener Zeilen.
describe.skipIf(!realbestandVorhanden())(`BL-304 — Wächter am Realbestand (${REALBESTAND.datei})`, () => {
  it('der Neubau ALLER Records ergänzt keine einzige `GIVN`/`SURN`/`NSFX`-Zeile', () => {
    const quelle = realbestandText();
    const p = parseGedcom(quelle);
    for (const [id, x] of [...p.db.individuals]) p.db.individuals.set(id, { ...x, uid: `${x.uid}ZZ` });
    const zaehl = (t: string): Map<string, number> => {
      const m = new Map<string, number>();
      for (const z of assembleLines(t)) {
        const g = /^(\d+) (GIVN|SURN|NSFX)\b/.exec(z);
        if (g) m.set(z, (m.get(z) ?? 0) + 1);
      }
      return m;
    };
    const ein = zaehl(quelle), aus = zaehl(speichern(p.db, p.roots));
    const erfunden: string[] = [], verloren: string[] = [];
    for (const [z, n] of aus) if (n - (ein.get(z) ?? 0) > 0) erfunden.push(z);
    for (const [z, n] of ein) if (n - (aus.get(z) ?? 0) > 0) verloren.push(z);
    expect({ erfunden: erfunden.length, verloren: verloren.length, beispiel: erfunden[0] ?? verloren[0] })
      .toEqual({ erfunden: 0, verloren: 0, beispiel: undefined });
  });
});
