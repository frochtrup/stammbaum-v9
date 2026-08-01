// tests/roundtrip/source-created-date.test.ts — BL-243 (ADR-v9-179).
//
// `Source.date` hing an `1 DATE` unter `SOUR` — einem Tag, den weder 5.5.1 noch 7.0 im
// `SOURCE_RECORD` kennen. 5.5.1 erlaubt Kontext-Erweiterung ausschließlich über `_`-Tags
// (Kap. 1), die Zeile war also ungültig, nicht bloß unüblich. v8 wusste das: eine Funktion
// über `writeSOURRecord` schreibt für Medien `2 _DATE`.
//
// Am Bestand verteilt sich das Quellen-Datum auf drei ECHTE Stellen — `PUBL` (Fundstelle),
// `DATA.EVEN.DATE` (Abdeckung, BL-217) und `_DATE` (Erfassung, 10×). Das Modellfeld liest
// jetzt die dritte: `createdDate`, „Erfasst am".

import { describe, it, expect } from 'vitest';
import { parseGedcom, serializeGedcom, applyDatabaseToRoots } from '../../core/interop';
import { transformGed7 } from '../../core/interop/ged7-adapter';
import { REALBESTAND, realbestandText, realbestandVorhanden } from '../core/realdaten';

const GED = (zeilen: string[]): string =>
  ['0 HEAD', '1 GEDC', '2 VERS 5.5.1', '1 CHAR UTF-8',
    '0 @S1@ SOUR', '1 TITL Ahnenpass', ...zeilen, '0 TRLR', ''].join('\n');

const quelle = (ged: string) => [...parseGedcom(ged).db.sources.values()][0]!;

describe('BL-243 — Erfassungsdatum statt eines ungültigen 1 DATE', () => {
  it('liest die 5.5.1-Form `1 _DATE`', () => {
    expect(quelle(GED(['1 _DATE 27 DEC 2005'])).createdDate).toBe('27 DEC 2005');
  });

  it('liest die 7.0-Form `1 CREA / 2 DATE`', () => {
    expect(quelle(GED(['1 CREA', '2 DATE 27 DEC 2005'])).createdDate).toBe('27 DEC 2005');
  });

  it('liest ein `1 DATE` NICHT — der Tag gehört dort nicht hin', () => {
    expect(quelle(GED(['1 DATE 1952'])).createdDate).toBe('');
  });

  it('… und erhält es trotzdem: eine Fremddatei verliert die Zeile nicht (LP-1)', () => {
    // Kein Migrationspfad (Nutzerentscheidung): der Wert wird nicht umgedeutet, aber auch
    // nicht weggeworfen. `DATE` ist nicht erkannt, also trägt der Passthrough ihn — sogar
    // dann, wenn der Record aus anderem Grund neu geschrieben wird.
    const { db, roots } = parseGedcom(GED(['1 DATE 1952']));
    const s = [...db.sources.values()][0]!;
    s.title = 'Geändert';
    expect(serializeGedcom({ db, roots: applyDatabaseToRoots(db, roots) })).toContain('1 DATE 1952');
  });

  it('schreibt im 5.5.1-Basisbaum `1 _DATE`, nie `1 DATE`', () => {
    const { db, roots } = parseGedcom(GED(['1 _DATE 27 DEC 2005']));
    const s = [...db.sources.values()][0]!;
    s.createdDate = '2 JAN 2006';
    const out = serializeGedcom({ db, roots: applyDatabaseToRoots(db, roots) }).replace(/\r/g, '');
    expect(out).toContain('1 _DATE 2 JAN 2006');
    expect(out).not.toMatch(/^1 DATE /m);
  });

  it('der 7.0-Adapter macht daraus `1 CREA / 2 DATE` — der Versions-Schalter', () => {
    // `CREA` kommt im gesamten 5.5.1-Dokument 0× vor; ihn unbedingt zu schreiben hieße,
    // einen 7.0-Tag in eine 5.5.1-Datei zu setzen. Deshalb steht er im Adapter, nicht im
    // Basis-Emit — für Quelle UND Person dieselbe Regel.
    const { roots } = parseGedcom(GED(['1 _DATE 27 DEC 2005']));
    const sour = roots.find((r) => r.tag === 'SOUR')!;
    const ged7 = transformGed7(sour);
    const crea = ged7.children.find((c) => c.tag === 'CREA');
    expect(crea).toBeTruthy();
    expect(crea!.children.map((c) => [c.tag, c.value])).toEqual([['DATE', '27 DEC 2005']]);
    expect(ged7.children.some((c) => c.tag === '_DATE')).toBe(false);
  });

  it('ein `2 _DATE` unter OBJE bleibt unangetastet (Medien-Aufnahmedatum)', () => {
    // Der Adapter darf nicht jeden `_DATE` umdeuten: unter OBJE heißt er etwas anderes.
    const { roots } = parseGedcom(
      GED(['1 OBJE', '2 FILE bild.jpg', '2 _DATE 1 JAN 2000']),
    );
    const ged7 = transformGed7(roots.find((r) => r.tag === 'SOUR')!);
    const obje = ged7.children.find((c) => c.tag === 'OBJE')!;
    expect(obje.children.some((c) => c.tag === '_DATE')).toBe(true);
    expect(obje.children.some((c) => c.tag === 'CREA')).toBe(false);
  });

  it.skipIf(!realbestandVorhanden())(
    `${REALBESTAND.datei}: die 10 Erfassungsdaten sind sichtbar, kein 1 DATE mehr`,
    () => {
      const db = parseGedcom(realbestandText()).db;
      const mit = [...db.sources.values()].filter((s) => s.createdDate);
      expect(mit).toHaveLength(10);
      // Der Bestand ist aufgeräumt (2026-08-01): das ungültige `1 DATE` kommt unter SOUR
      // nicht mehr vor. NICHT per Pauschal-Regex prüfen — `1 DATE` im HEAD ist das
      // Export-Datum der Datei und dort völlig korrekt.
      const unterSour = parseGedcom(realbestandText()).roots
        .filter((r) => r.tag === 'SOUR')
        .flatMap((r) => r.children)
        .filter((c) => c.tag === 'DATE');
      expect(unterSour).toEqual([]);
    },
  );
});
