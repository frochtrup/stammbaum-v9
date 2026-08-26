// tests/roundtrip/note-zitat-passthrough.test.ts — BL-389: eine zweite Notiz anzulegen
// loeschte die Quellenzitation der ersten.
//
// GEMESSEN AM BESTAND (`Testdateien/Unsere Familie 2026-4-2-2-2.ged`, `@F88@`): die Familie
// traegt eine Notiz mit `2 SOUR @S123@` daran — samt `PAGE`, `QUAY`, der ganzen
// `_EVAL`-Bewertung und einem Matricula-Link. Eine zweite Notiz hinzuzufuegen (die Funktion
// aus [ADR-v9-285]) liess die Zitation verschwinden: `2 SOUR @S123@` 2x -> 1x. Andere Edits
// am selben Satz (Notiztext, Heiratsdatum) waren harmlos.
//
// WARUM AUSGERECHNET DAS HINZUFUEGEN. `paare` (write-back.ts) paart gleichnamige Geschwister
// bei GLEICHER Anzahl nach Reihenfolge; bei UNGLEICHER — genau der Fall „eine Notiz mehr" —
// faellt es auf Wert-Paarung zurueck und vergleicht die ROHEN Knotenwerte. Traegt die alte
// Notiz eine `CONC`-Fortsetzung, ist ihr `.value` nur das ERSTE Fragment, waehrend der frische
// Knoten den vollen Text traegt. Die Werte stimmen nicht ueberein, es kommt keine Paarung
// zustande — und der Kommentar sagt die Folge selbst: „was uebrig bleibt, bleibt ungepaart",
// also kein Passthrough, also weg.
//
// Dieselbe Klasse wie [ADR-v9-281]: ein Wert ohne seine Fortsetzung ist ein FRAGMENT.
import { describe, expect, it } from 'vitest';
import { parseGedcom, applyDatabaseToRoots, serializeGedcom } from '../../core/interop';
import type { Database } from '../../core/model/types';

function doc(notizZeilen: string[]): string {
  return [
    '0 HEAD', '1 GEDC', '2 VERS 5.5.1', '1 CHAR UTF-8',
    '0 @F1@ FAM',
    '1 HUSB @I1@',
    ...notizZeilen,
    '1 MARR',
    '2 DATE 30 JAN 1770',
    '0 @I1@ INDI',
    '1 NAME A /B/',
    '0 @S1@ SOUR',
    '1 TITL Kirchenbuch',
    '0 TRLR', '',
  ].join('\n');
}

/** Legt eine ZWEITE Notiz an — die Funktion aus ADR-v9-285 — und schreibt zurueck. */
function nachZweiterNotiz(text: string): string[] {
  const p = parseGedcom(text);
  const f = [...p.db.families.values()][0];
  p.db.families.set(f.id, { ...f, extraNotes: [...f.extraNotes, 'Zweite Notiz.'] });
  const out = serializeGedcom({
    db: p.db as Database,
    roots: applyDatabaseToRoots(p.db as Database, p.roots),
  });
  return out.split('\n').map((z) => z.replace(/@@/g, '@').trim());
}

const zaehle = (zeilen: string[], z: string): number => zeilen.filter((x) => x === z).length;

describe('BL-389 — Zitation an einer Notiz mit Fortsetzung', () => {
  it('eine zweite Notiz anzulegen laesst die Zitation der ersten stehen', () => {
    const zeilen = nachZweiterNotiz(
      doc(['1 NOTE Ein Text', '2 CONC  mit Fortsetzung.', '2 SOUR @S1@', '3 PAGE 12']),
    );
    expect(zaehle(zeilen, '2 SOUR @S1@')).toBe(1);
    expect(zaehle(zeilen, '3 PAGE 12')).toBe(1);
    expect(zeilen.some((z) => z === '1 NOTE Zweite Notiz.')).toBe(true);
  });

  it('Kontrollprobe: ohne Fortsetzung war der Fall nie betroffen', () => {
    const zeilen = nachZweiterNotiz(
      doc(['1 NOTE Ein Text ohne Fortsetzung.', '2 SOUR @S1@', '3 PAGE 12']),
    );
    expect(zaehle(zeilen, '2 SOUR @S1@')).toBe(1);
  });

  it('Kontrollprobe: ohne zweite Notiz bleibt alles unberuehrt', () => {
    const text = doc(['1 NOTE Ein Text', '2 CONC  mit Fortsetzung.', '2 SOUR @S1@', '3 PAGE 12']);
    const p = parseGedcom(text);
    const out = serializeGedcom({
      db: p.db as Database,
      roots: applyDatabaseToRoots(p.db as Database, p.roots),
    });
    expect(zaehle(out.split('\n').map((z) => z.trim()), '2 SOUR @S1@')).toBe(1);
  });
});
