// tests/core/source-note.test.ts — BL-336: die Notiz am Quellen-Record.
//
// DIE LÜCKE. `SOURCE_RECORD → NOTE` ist Kern-Grammatik in GEDCOM 5.5.1; Person und Familie
// führten die Notiz längst, die Quelle nicht. Im Realbestand
// (`Testdateien/Unsere Familie 2026-4.ged`, Zeile 103847) steht genau eine — „Sterbeurkunde:
// Standesamt Cloppenburg 212/1991" — und sie war unsichtbar. Eine ist keine Menge, aber
// der Punkt ist nicht die Häufigkeit: jede Fremddatei kann welche tragen, und `parseSource`
// hatte für den Tag keinen Zweig.
//
// WAS `text` NICHT IST. `SOUR>TEXT` ist der zitierte Wortlaut AUS der Quelle,
// `SOUR>NOTE` die Anmerkung ÜBER sie. Bis BL-336 gab es nur das erste Feld — und weil das
// Formular es „Notiz" nannte, landeten Bemerkungen in der Transkription. Beide Fälle unten
// stehen deshalb nebeneinander im selben Record: sie dürfen sich nicht vermischen.
import { describe, it, expect } from 'vitest';
import { parseGedcom, serializeGedcom, applyDatabaseToRoots } from '../../core/interop';
import { saveSource } from '../../core/model';

const SOUR_NOTE = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 5.5.1',
  '1 CHAR UTF-8',
  '0 @N1@ NOTE Freitext in einem eigenen Record',
  '0 @S1@ SOUR',
  '1 TITL Sterberegister Cloppenburg',
  '1 TEXT anno 1841 den 3ten Maii ist getauft worden',
  '1 NOTE Sterbeurkunde: Standesamt Cloppenburg 212/1991',
  '2 CONT Register unvollständig ab 1920',
  '1 NOTE @N1@',
  '0 TRLR',
  '',
].join('\n');

describe('Quellen-Notiz SOUR>NOTE (BL-336)', () => {
  it('landet als noteText im Modell — getrennt vom zitierten Wortlaut', () => {
    const { db } = parseGedcom(SOUR_NOTE);
    const s = db.sources.get('@S1@')!;

    expect(s.noteText).toBe('Sterbeurkunde: Standesamt Cloppenburg 212/1991\nRegister unvollständig ab 1920');
    expect(s.text, 'TEXT bleibt der zitierte Wortlaut, ungemischt').toBe('anno 1841 den 3ten Maii ist getauft worden');
  });

  it('hält den NOTE-Zeiger vom Inline-Text getrennt', () => {
    // Ohne diese Trennung stünde „@N1@" als Notiz-TEXT in der Quellen-Ansicht — genau der
    // Fehler, den `parseFamily` bis heute macht (dort noch nicht nachgezogen).
    const { db } = parseGedcom(SOUR_NOTE);
    const s = db.sources.get('@S1@')!;
    expect(s.noteRefs).toEqual(['@N1@']);
    expect(s.noteText).not.toContain('@N1@');
  });

  it('überlebt einen Write-Back des geänderten Records — genau einmal', () => {
    const doc = parseGedcom(SOUR_NOTE);
    const s = doc.db.sources.get('@S1@')!;
    const db = { ...doc.db, sources: saveSource(doc.db.sources, { ...s, title: 'Anderer Titel' }) };
    const out = serializeGedcom({ db, roots: applyDatabaseToRoots(db, doc.roots) });
    const zeilen = out.split('\n').map((z) => z.trim());

    expect(zeilen.filter((z) => z === '1 NOTE Sterbeurkunde: Standesamt Cloppenburg 212/1991')).toHaveLength(1);
    expect(zeilen).toContain('2 CONT Register unvollständig ab 1920');
    expect(zeilen.filter((z) => z === '1 NOTE @N1@')).toHaveLength(1);
    expect(zeilen).toContain('1 TEXT anno 1841 den 3ten Maii ist getauft worden');
  });

  it('ein Nutzer-Edit an der Notiz kommt in der Datei an', () => {
    const doc = parseGedcom(SOUR_NOTE);
    const s = doc.db.sources.get('@S1@')!;
    const db = { ...doc.db, sources: saveSource(doc.db.sources, { ...s, noteText: 'Neu erfasste Bemerkung' }) };
    const out = serializeGedcom({ db, roots: applyDatabaseToRoots(db, doc.roots) });

    expect(out).toContain('1 NOTE Neu erfasste Bemerkung');
    expect(out, 'die alte Notiz darf nicht danebenstehen bleiben').not.toContain('212/1991');
  });
});
