// tests/core/interop-research-log.test.ts — Parse + Write-Back für LogEntry an INDI/FAM
// (Spec 12 §2 Wire-Format `_RLOG`/DATE/REPO/SOUR/`_QUERY`/`_RESULT`/NOTE/`_TASKID`; Spec 13 §2.3).
//
// Verriegelt die `_REPO_MODELLED`-Falle (kein Doppelschreiben nach Modellierung) sowie die
// Reihenfolge-Treue mehrerer `_RLOG`-Blöcke (Array-Reihenfolge = Datei-Reihenfolge, v8-Parität).

import { describe, it, expect } from 'vitest';
import { parseGedcom, serializeGedcom, applyDatabaseToRoots } from '../../core/interop';
import { makeLogEntry } from '../../core/research';
import type { ParsedGedcom } from '../../core/interop';

function serializeAfterWriteBack(doc: ParsedGedcom): string {
  return serializeGedcom({ db: doc.db, roots: applyDatabaseToRoots(doc.db, doc.roots) });
}

// INDI mit ZWEI _RLOG-Blöcken + Passthrough; FAM mit EINEM _RLOG-Block (mit mehrzeiliger NOTE).
const FIXTURE = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 5.5.1',
  '0 @I1@ INDI',
  '1 NAME Max /Muster/',
  '1 _FOO unbekannt bleibt Passthrough',
  '1 _RLOG',
  '2 DATE 2026-07-01',
  '2 REPO @R2@',
  '2 SOUR @S5@',
  '2 _QUERY Taufregister Ochtrup 1820',
  '2 _RESULT found',
  '2 NOTE Eintrag gefunden, Seite 12',
  '2 _TASKID t_aaa',
  '1 _RLOG',
  '2 DATE 2026-07-02',
  '2 _QUERY Heiratsregister',
  '2 _RESULT notfound',
  '0 @F1@ FAM',
  '1 HUSB @I1@',
  '1 _RLOG',
  '2 DATE 2026-07-03',
  '2 REPO @R2@',
  '2 _QUERY Trauung 1845',
  '2 _RESULT pending',
  '2 NOTE Zeile eins',
  '3 CONT Zeile zwei',
  '0 TRLR',
].join('\n');

describe('interop research-log — Parse', () => {
  it('parst _RLOG-Blöcke auf INDI und FAM in LogEntry[] (Reihenfolge erhalten)', () => {
    const { db } = parseGedcom(FIXTURE);
    const p = db.individuals.get('@I1@')!;
    expect(p.researchLog).toEqual([
      { date: '2026-07-01', repoRef: '@R2@', sourceRef: '@S5@', query: 'Taufregister Ochtrup 1820', result: 'found', note: 'Eintrag gefunden, Seite 12', taskId: 't_aaa' },
      { date: '2026-07-02', repoRef: '', sourceRef: '', query: 'Heiratsregister', result: 'notfound', note: '', taskId: '' },
    ]);
    const f = db.families.get('@F1@')!;
    expect(f.researchLog).toEqual([
      { date: '2026-07-03', repoRef: '@R2@', sourceRef: '', query: 'Trauung 1845', result: 'pending', note: 'Zeile eins\nZeile zwei', taskId: '' },
    ]);
  });

  it('unbekanntes _RESULT fällt auf pending zurück', () => {
    const src = [
      '0 HEAD', '1 GEDC', '2 VERS 5.5.1',
      '0 @I1@ INDI',
      '1 _RLOG',
      '2 _RESULT quatsch',
      '0 TRLR',
    ].join('\n');
    const { db } = parseGedcom(src);
    expect(db.individuals.get('@I1@')!.researchLog[0].result).toBe('pending');
  });

  it('_RESULT partial wird als "partial" geparst (BL-135, kein Fallback auf pending)', () => {
    const src = [
      '0 HEAD', '1 GEDC', '2 VERS 5.5.1',
      '0 @I1@ INDI',
      '1 _RLOG',
      '2 _QUERY Kirchenbuch 1830',
      '2 _RESULT partial',
      '0 TRLR',
    ].join('\n');
    const { db } = parseGedcom(src);
    expect(db.individuals.get('@I1@')!.researchLog[0].result).toBe('partial');
  });

  it('ein "partial"-Eintrag überlebt den Write-Back-Roundtrip (LP-1)', () => {
    const doc = parseGedcom(FIXTURE);
    doc.db.individuals.get('@I1@')!.researchLog[1].result = 'partial';
    const out = serializeAfterWriteBack(doc);
    expect(out).toContain('2 _RESULT partial');
    const log = parseGedcom(out).db.individuals.get('@I1@')!.researchLog;
    expect(log[1].result).toBe('partial');
    expect(log[0].result).toBe('found'); // Nachbar unangetastet
  });
});

describe('interop research-log — Write-Back Roundtrip', () => {
  it('nicht-mutierender Roundtrip ist byte-identisch (_RLOG NICHT doppelt)', () => {
    const doc = parseGedcom(FIXTURE);
    const out = serializeAfterWriteBack(doc);
    expect(out).toBe(FIXTURE.split('\n').join('\r\n'));
    expect(out.match(/_QUERY Taufregister Ochtrup 1820/g)!.length).toBe(1);
  });

  it('out1 === out2 (Idempotenz, RT-1)', () => {
    const doc1 = parseGedcom(FIXTURE);
    const out1 = serializeAfterWriteBack(doc1);
    const out2 = serializeAfterWriteBack(parseGedcom(out1));
    expect(out2).toBe(out1);
  });

  it('unveränderter Record bleibt die IDENTISCHE GedNode-Referenz', () => {
    const doc = parseGedcom(FIXTURE);
    const before = doc.roots.find((r) => r.xref === '@I1@')!;
    const after = applyDatabaseToRoots(doc.db, doc.roots).find((r) => r.xref === '@I1@')!;
    expect(after).toBe(before);
  });
});

describe('interop research-log — Mutationen überleben Roundtrip', () => {
  it('Log-Eintrag hinzufügen: neuer _RLOG-Block mit allen Feldern nach Re-Parse vorhanden', () => {
    const doc = parseGedcom(FIXTURE);
    doc.db.individuals.get('@I1@')!.researchLog.push(
      makeLogEntry({ date: '2026-07-05', repoRef: '@R9@', sourceRef: '@S9@', query: 'Sterberegister', result: 'found', note: 'Notiz', taskId: 't_bbb' }),
    );
    const round = parseGedcom(serializeAfterWriteBack(doc));
    const log = round.db.individuals.get('@I1@')!.researchLog;
    expect(log.length).toBe(3);
    expect(log[2]).toEqual({ date: '2026-07-05', repoRef: '@R9@', sourceRef: '@S9@', query: 'Sterberegister', result: 'found', note: 'Notiz', taskId: 't_bbb' });
    expect(serializeAfterWriteBack(doc)).toContain('_FOO unbekannt bleibt Passthrough');
  });

  it('Log-Eintrag ändern (result): überlebt Roundtrip, Rest unangetastet', () => {
    const doc = parseGedcom(FIXTURE);
    doc.db.individuals.get('@I1@')!.researchLog[1].result = 'found';
    const round = parseGedcom(serializeAfterWriteBack(doc));
    const log = round.db.individuals.get('@I1@')!.researchLog;
    expect(log[1].result).toBe('found');
    expect(log[1].query).toBe('Heiratsregister');
    expect(log[0].result).toBe('found'); // erster Eintrag unverändert
  });

  it('Log-Eintrag an FAM ändern (query/note) überlebt', () => {
    const doc = parseGedcom(FIXTURE);
    const l = doc.db.families.get('@F1@')!.researchLog[0];
    l.query = 'Trauung 1846';
    l.note = 'neue Notiz';
    const round = parseGedcom(serializeAfterWriteBack(doc));
    const rl = round.db.families.get('@F1@')!.researchLog[0];
    expect(rl.query).toBe('Trauung 1846');
    expect(rl.note).toBe('neue Notiz');
    expect(rl.result).toBe('pending');
  });

  /**
   * BL-378 (ADR-v9-281) — der gemeldete Fall, an einem echten Zyklus nachgestellt.
   *
   * Die Import-Vergleichs-Fläche erzeugt Suchbegriffe wie „<Feld> aus <Datei>: „<Wert>"" —
   * die reißen mühelos die 255-Byte-Grenze. Der Serialisierer bricht dann per `CONC` um; bis
   * BL-378 las `parseLogEntry` nur die erste Zeile, und der Rest war beim nächsten Neubau des
   * Records weg (der Passthrough rettet Fortsetzungen bewusst NICHT, s. `FORTSETZUNG`).
   * Es brauchte dafür nicht einmal eine Datei: die Arbeitskopie in IndexedDB IST
   * serialisierter GEDCOM-Text.
   *
   * Geprüft wird deshalb der ganze Zyklus, nicht nur das Lesen: speichern → lesen →
   * NEBENAN etwas ändern → wieder speichern. Der zweite Schritt ist der eigentliche
   * Verlustmoment — nach dem reinen Lesen stand der Text noch in der Datei.
   */
  it('ein _QUERY über der Byte-Grenze überlebt Speichern, Lesen und eine Änderung daneben', () => {
    const lang = 'Sterbeeintrag Kirchenbuch St. Lamberti Ochtrup 1847–1852 prüfen, Abweichung '
      + 'Basis="12 SEP 1849" gegen Import="11 NOV 1950" aus 75pa86_1631203sa7895qm065fh46_A.ged, '
      + 'zusätzlich Heiratsregister Metelen und die Zivilstandsregister Gronau gegenprüfen.';
    // In BYTES gemessen, denn in Bytes ist die Grenze formuliert: `2 _QUERY ` kostet 9 davon,
    // ein Umlaut zwei. Ohne diese Vorbedingung könnte der Test grün sein, ohne je umzubrechen.
    expect(Buffer.byteLength(lang, 'utf8')).toBeGreaterThan(246);
    const src = [
      '0 HEAD', '1 GEDC', '2 VERS 5.5.1',
      '0 @I1@ INDI', '1 NAME Max /Muster/',
      '1 _RLOG', '2 DATE 2026-08-25', `2 _QUERY ${lang}`, '2 _RESULT pending',
      '0 TRLR',
    ].join('\n');

    const erstesSpeichern = serializeAfterWriteBack(parseGedcom(src));
    expect(erstesSpeichern).toContain('CONC'); // der Umbruch hat stattgefunden

    const gelesen = parseGedcom(erstesSpeichern);
    const eintrag = gelesen.db.individuals.get('@I1@')!.researchLog[0];
    expect(eintrag.query).toBe(lang);

    // Die Notiz daneben ändern — das baut den `_RLOG`-Block neu.
    gelesen.db.individuals.get('@I1@')!.researchLog[0] = { ...eintrag, note: 'im Archiv gewesen' };
    const wieder = parseGedcom(serializeAfterWriteBack(gelesen));
    const danach = wieder.db.individuals.get('@I1@')!.researchLog[0];
    expect(danach.query).toBe(lang);
    expect(danach.note).toBe('im Archiv gewesen');
  });

  it('Log-Eintrag löschen: der _RLOG-Block ist weg, der andere bleibt', () => {
    const doc = parseGedcom(FIXTURE);
    const p = doc.db.individuals.get('@I1@')!;
    p.researchLog = p.researchLog.filter((x) => x.query !== 'Taufregister Ochtrup 1820');
    const out = serializeAfterWriteBack(doc);
    expect(out).not.toContain('Taufregister Ochtrup 1820');
    expect(out).toContain('Heiratsregister');
    const round = parseGedcom(out);
    const log = round.db.individuals.get('@I1@')!.researchLog;
    expect(log.length).toBe(1);
    expect(log[0].query).toBe('Heiratsregister');
    expect(out).toContain('_FOO unbekannt bleibt Passthrough');
  });
});
