// tests/core/ordn-event.test.ts — BL-335: die Priesterweihe kommt im Modell an.
//
// Die Fixture ist KEIN erfundener Grenzfall, sondern der Datensatz aus
// `Testdateien/Unsere Familie 2026-4.ged` (Zeile 3585 ff.), Namen ausgetauscht: `1 ORDN`
// mit Wert, `2 TYPE`, `2 DATE`, `2 PLAC` samt `3 MAP`-Koordinaten und ein `2 SOUR` mit
// `3 QUAY`. Genau diese Zeilen waren vor dem Fix unsichtbar — nicht ein nackter Tag,
// sondern ein vollständiges, belegtes Ereignis.
import { describe, it, expect } from 'vitest';
import { parseGedcom, serializeGedcom, applyDatabaseToRoots } from '../../core/interop';
import { savePerson } from '../../core/model';

const ORDN_INDI = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 5.5.1',
  '1 CHAR UTF-8',
  '0 @I1@ INDI',
  '1 NAME Heinrich /Muster/',
  '1 SEX M',
  '1 BIRT',
  '2 DATE 12 MAY 1901',
  '1 ORDN Priester',
  '2 TYPE Weihe',
  '2 DATE 3 AUG 1927',
  '2 PLAC , Köln, , , , Deutschland',
  '3 MAP',
  '4 LATI N50.93752',
  '4 LONG E6.95948',
  '2 SOUR @S1@',
  '3 QUAY 2',
  '0 @S1@ SOUR',
  '1 TITL Weiheregister',
  '0 TRLR',
  '',
].join('\n');

describe('ORDN als Ereignis (BL-335)', () => {
  it('landet mit Wert, Typ, Datum, Ort, Koordinaten und Zitat im Modell', () => {
    const { db } = parseGedcom(ORDN_INDI);
    const p = db.individuals.get('@I1@')!;
    const ordn = p.events.find((e) => e.type === 'ORDN');

    expect(ordn, 'ORDN muss als Ereignis in events[] stehen').toBeDefined();
    expect(ordn!.value).toBe('Priester');
    expect(ordn!.eventType).toBe('Weihe');
    expect(ordn!.date).toBe('3 AUG 1927');
    expect(ordn!.place).toBe(', Köln, , , , Deutschland');
    // Die Koordinaten hingen am Ereignis, nicht an einem kuratierten Ort — der Regelfall
    // direkt nach dem Import (ADR-v9-28/44, TST-16).
    expect(ordn!.lati).toBeCloseTo(50.93752, 5);
    expect(ordn!.long).toBeCloseTo(6.95948, 5);
    expect(ordn!.citations).toHaveLength(1);
    expect(ordn!.citations[0].sourceId).toBe('@S1@');
    expect(ordn!.citations[0].quay).toBe(2);
  });

  it('überlebt einen Write-Back des GEÄNDERTEN Records vollständig', () => {
    // Der riskante Pfad: ein unveränderter Record bliebe ohnehin byte-identisch (der
    // Kurzschluss in write-back.ts). Erst wenn der Record schmutzig ist, wird jeder
    // ERKANNTE Kindknoten aus dem Modell neu gebaut — hier zeigt sich, ob ORDN in beiden
    // Listen steht: fehlte es in RECOGNIZED_PERSON, käme die Zeile doppelt.
    const doc = parseGedcom(ORDN_INDI);
    const p = doc.db.individuals.get('@I1@')!;
    const db = { ...doc.db, individuals: savePerson(doc.db.individuals, { ...p, name: 'Heinrich /Anders/' }) };
    const out = serializeGedcom({ db, roots: applyDatabaseToRoots(db, doc.roots) });
    const zeilen = out.split('\n').map((z) => z.trim());

    expect(zeilen.filter((z) => z === '1 ORDN Priester'), 'genau einmal, nicht doppelt').toHaveLength(1);
    for (const z of ['2 TYPE Weihe', '2 DATE 3 AUG 1927', '4 LATI N50.93752', '3 QUAY 2']) {
      expect(zeilen, `„${z}" darf beim Speichern nicht verlorengehen`).toContain(z);
    }
    expect(out).toContain('2 PLAC , Köln, , , , Deutschland');
  });
});
