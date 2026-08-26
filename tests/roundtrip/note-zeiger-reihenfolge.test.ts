// tests/roundtrip/note-zeiger-reihenfolge.test.ts — BL-388: ein Notiz-ZEIGER vor einer
// Inline-Notiz zerstoerte die Notiz beim Neubau.
//
// GEFUNDEN von der Spiegel-Richtung des Verlust-Zensus (ADR-v9-289): sie meldete am
// aktuellen Bestand `1 NOTE @N_PROT_01@` dreimal in der Quelle und fuenfmal in der Ausgabe.
// Per Delta-Debugging auf DREI Zeilen reduziert.
//
// DIE PRAEMISSE, DIE BRICHT, steht im Kopfkommentar von `paare` (write-back.ts): „Bei
// GLEICHER Anzahl der Reihe nach — der Emitter erhaelt die Modell-Reihenfolge, die
// ihrerseits aus der Datei stammt." Fuer `NOTE` stimmt das nicht: das Modell teilt sie in
// `noteText`, `extraNotes` und `noteRefs`, und der Emitter schreibt sie in DIESER festen
// Ordnung — Zeiger zuletzt. Steht in der Datei ein Zeiger VOR einer Inline-Notiz, paart die
// Position Zeiger↔Notiz, und `haltWert` ueberschreibt den Notiztext mit dem Zeiger.
//
// Die `CONC`-Fortsetzung ist nur der Ausloeser, der den Satz ueberhaupt auf den Merge-Pfad
// bringt — nicht die Ursache. Deshalb steht sie hier, aber die Zusicherung gilt dem Text.
import { describe, expect, it } from 'vitest';
import { parseGedcom, applyDatabaseToRoots, serializeGedcom } from '../../core/interop';
import type { Database } from '../../core/model/types';

const NOTIZ = 'Kurzer Text.';
const FORTS = ' Fortsetzung.';

function rundlauf(kinder: string[]): { modell: string; zeilen: string[] } {
  const doc = [
    '0 HEAD', '1 GEDC', '2 VERS 5.5.1', '1 CHAR UTF-8',
    '0 @I1@ INDI', '1 NAME A /B/', ...kinder,
    '0 @N1@ NOTE Geteilter Eintrag.',
    '0 TRLR', '',
  ].join('\n');
  const p = parseGedcom(doc);
  const i = [...p.db.individuals.values()][0];
  const modell = i.noteText;
  p.db.individuals.set(i.id, { ...i, uid: 'ZZ' }); // Nutzer-Edit an anderer Stelle
  const out = serializeGedcom({
    db: p.db as Database,
    roots: applyDatabaseToRoots(p.db as Database, p.roots),
  });
  return { modell, zeilen: out.split('\n').map((z) => z.replace(/@@/g, '@').trim()) };
}

const zaehle = (zeilen: string[], z: string): number => zeilen.filter((x) => x === z).length;

describe('BL-388 — Notiz-Zeiger vor Inline-Notiz', () => {
  it('der Notiztext ueberlebt, und der Zeiger steht genau einmal', () => {
    const { modell, zeilen } = rundlauf([
      '1 NOTE @N1@',
      '1 NOTE ' + NOTIZ,
      '2 CONC ' + FORTS,
    ]);
    // Das Modell war nie das Problem — es liest korrekt.
    expect(modell).toBe(NOTIZ + FORTS);
    expect(zaehle(zeilen, '1 NOTE @N1@')).toBe(1);
    expect(zeilen.some((z) => z.startsWith('1 NOTE ' + NOTIZ))).toBe(true);
  });

  it('Kontrollprobe: dieselbe Notiz VOR dem Zeiger war nie betroffen', () => {
    const { zeilen } = rundlauf([
      '1 NOTE ' + NOTIZ,
      '2 CONC ' + FORTS,
      '1 NOTE @N1@',
    ]);
    expect(zaehle(zeilen, '1 NOTE @N1@')).toBe(1);
    expect(zeilen.some((z) => z.startsWith('1 NOTE ' + NOTIZ))).toBe(true);
  });

  it('Kontrollprobe: zwei echte Zeiger bleiben zwei', () => {
    const { zeilen } = rundlauf(['1 NOTE @N1@', '1 NOTE @N1@']);
    expect(zaehle(zeilen, '1 NOTE @N1@')).toBe(2);
  });
});
