// tests/roundtrip/source-data-roundtrip.test.ts — BL-217 (ADR-v9-151, ADR-v9-178/180).
//
// `SOUR.DATA` war eine LÜCKE, keine UI-Frage: `dataEvents` stand als Feld im Modell,
// wurde aber von keinem Parser gefüllt und von keinem Writer geschrieben; `AGNC` hatte
// gar kein Feld. Am aktuellen Bestand kommen beide vor (EVEN 7×, AGNC 5×) — die Werte
// waren also da und in der App unsichtbar.
//
// Die Kopplung, die daraus EIN Stück Arbeit macht: `mergeRecord` arbeitet auf
// Level-1-Granularität. Sobald `DATA` als erkannt geführt wird, wird der GANZE Container
// aus dem Modell neu gebaut — jedes nicht modellierte Kind (NOTE/SNOTE …) verschwände
// still. Deshalb `Source.dataExtra`.

import { describe, it, expect } from 'vitest';
import { parseGedcom, serializeGedcom, applyDatabaseToRoots } from '../../core/interop';

const GED = (dataBlock: string[]): string =>
  ['0 HEAD', '1 GEDC', '2 VERS 5.5.1', '1 CHAR UTF-8',
    '0 @S1@ SOUR',
    '1 TITL Standesamt Ochtrup — Heiratsbuch',
    ...dataBlock,
    '0 TRLR', ''].join('\n');

const VOLL = [
  '1 DATA',
  '2 EVEN MARR',
  '3 DATE FROM 1874 TO 1938',
  '3 PLAC Ochtrup',
  '2 AGNC Standesamt Ochtrup',
];

const quelle = (ged: string) => [...parseGedcom(ged).db.sources.values()][0]!;

describe('BL-217 — SOUR.DATA wird projiziert', () => {
  it('EVEN mit DATE/PLAC und AGNC landen im Modell', () => {
    const s = quelle(GED(VOLL));
    expect(s.dataEvents).toEqual([
      { eventTypes: 'MARR', date: 'FROM 1874 TO 1938', place: 'Ochtrup' },
    ]);
    expect(s.agnc).toBe('Standesamt Ochtrup');
  });

  it('mehrere Ereignisarten bleiben die Enum-LISTE, ungeteilt', () => {
    // `EVENTS_RECORDED` ist kommasepariert (`BIRT, MARR, DEAT`) — der Wert gehört als
    // Ganzes an das EVEN, nicht in drei Einträge zerlegt (die Aufteilung ist Anzeige-Sache).
    const s = quelle(GED(['1 DATA', '2 EVEN BIRT, MARR, DEAT', '3 DATE FROM 1686 TO 1826']));
    expect(s.dataEvents[0].eventTypes).toBe('BIRT, MARR, DEAT');
  });

  it('eine ÄNDERUNG am Modell landet in der Datei — nicht nur der Passthrough', () => {
    // Der Test, der „modelliert" von „verbatim erhalten" unterscheidet. Ohne ihn bestünde
    // die Zeile auch dann, wenn `DATA` gar nicht erkannt wäre: der unveränderte Container
    // käme dann einfach aus dem Passthrough und sähe im Ergebnis identisch aus.
    const { db, roots } = parseGedcom(GED(VOLL));
    const s = [...db.sources.values()][0]!;
    s.agnc = 'Kreisarchiv Steinfurt';
    s.dataEvents = [{ eventTypes: 'BIRT, DEAT', date: 'FROM 1800 TO 1850', place: 'Lehrte' }];
    const out = serializeGedcom({ db, roots: applyDatabaseToRoots(db, roots) }).replace(/\r/g, '');
    expect(out).toContain('2 EVEN BIRT, DEAT');
    expect(out).toContain('3 DATE FROM 1800 TO 1850');
    expect(out).toContain('3 PLAC Lehrte');
    expect(out).toContain('2 AGNC Kreisarchiv Steinfurt');
    // Die alten Werte sind ERSETZT, nicht danebengeschrieben (sonst stünde DATA doppelt).
    expect(out).not.toContain('2 EVEN MARR');
    expect(out).not.toContain('2 AGNC Standesamt Ochtrup');
    expect(out.match(/^1 DATA$/gm)).toHaveLength(1);
  });

  it('ein GEÄNDERTER Record schreibt DATA vollständig zurück', () => {
    const ged = GED(VOLL);
    const { db, roots } = parseGedcom(ged);
    const s = [...db.sources.values()][0]!;
    s.title = 'Geändert'; // erzwingt die Neu-Emission des Records
    const out = serializeGedcom({ db, roots: applyDatabaseToRoots(db, roots) });
    expect(out).toContain('1 DATA');
    expect(out).toContain('2 EVEN MARR');
    expect(out).toContain('3 DATE FROM 1874 TO 1938');
    expect(out).toContain('3 PLAC Ochtrup');
    expect(out).toContain('2 AGNC Standesamt Ochtrup');
  });

  it('ein unbekanntes DATA-Kind überlebt die Neu-Emission (die Kopplungsfalle)', () => {
    // Der Fall, für den `dataExtra` existiert: NOTE ist laut Grammatik ein DATA-Kind, hat
    // aber kein Modellfeld. Ohne den Passthrough-Rest fiele es weg, sobald der Record aus
    // irgendeinem anderen Grund neu geschrieben wird — still und ohne Test-Ausschlag.
    const ged = GED([...VOLL, '2 NOTE Register unvollständig ab 1920']);
    const { db, roots } = parseGedcom(ged);
    const s = [...db.sources.values()][0]!;
    s.title = 'Geändert';
    const out = serializeGedcom({ db, roots: applyDatabaseToRoots(db, roots) });
    expect(out).toContain('2 NOTE Register unvollständig ab 1920');
    expect(out).toContain('2 AGNC Standesamt Ochtrup');
  });

  it('unverändert: out1 === out2, DATA unangetastet (RT-1/RT-2)', () => {
    // Nicht gegen die Eingabe vergleichen — der Serializer schreibt CRLF (GEDCOM-Konvention),
    // die Fixture oben LF. Geprüft wird die eigentliche Zusicherung: ein nicht editierter
    // Record läuft unverändert durch, zweimal serialisiert ergibt dasselbe Byte-Bild.
    const ged = GED([...VOLL, '2 NOTE Register unvollständig ab 1920']);
    const p1 = parseGedcom(ged);
    const out1 = serializeGedcom({ ...p1, roots: applyDatabaseToRoots(p1.db, p1.roots) });
    const p2 = parseGedcom(out1);
    const out2 = serializeGedcom({ ...p2, roots: applyDatabaseToRoots(p2.db, p2.roots) });
    expect(out2).toBe(out1);
    expect(out1.replace(/\r/g, '')).toContain(
      ['1 DATA', '2 EVEN MARR', '3 DATE FROM 1874 TO 1938', '3 PLAC Ochtrup',
        '2 AGNC Standesamt Ochtrup', '2 NOTE Register unvollständig ab 1920'].join('\n'),
    );
  });

  it('ohne DATA entsteht kein leerer Container', () => {
    const ged = GED([]);
    const { db, roots } = parseGedcom(ged);
    const s = [...db.sources.values()][0]!;
    s.title = 'Geändert';
    expect(serializeGedcom({ db, roots: applyDatabaseToRoots(db, roots) })).not.toContain('DATA');
  });
});
