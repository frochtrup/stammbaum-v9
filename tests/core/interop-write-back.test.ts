// tests/core/interop-write-back.test.ts — Writer-Write-Back (Spec 13 §2.1, ADR-v9-14).
// Verriegelt: editierte Modellfelder werden an ihre kanonische Baumposition zurück-
// projiziert, OHNE die Roundtrip-Treue nicht-editierter Records zu verlieren (RT-1/RT-2)
// und OHNE Passthrough-Zeilen zu verlieren (INV-PT).
//
// Vier Fälle: (1) unverändert → byte-identisch; (2) geändertes Feld an bestehendem Record
// → nur das Feld ändert sich, Passthrough überlebt; (3) neue Records; (4) gelöschte Records.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseGedcom,
  serializeGedcom,
  applyDatabaseToRoots,
  transformGed7,
  stripStrict,
} from '../../core/interop';
import {
  savePerson,
  deletePerson,
  saveFamily,
  deleteFamily,
  saveSource,
  deleteSource,
  saveRepository,
  deleteRepository,
  makePerson,
  makeFamily,
  makeSource,
  makeRepository,
  makeEvent,
} from '../../core/model';
import type { ParsedGedcom } from '../../core/interop';

const MINI = readFileSync(join(__dirname, '../fixtures/mini.small.ged'), 'utf8');

/** roots durch Write-Back schicken und serialisieren (Editier-Pfad). */
function serializeAfterWriteBack(doc: ParsedGedcom): string {
  return serializeGedcom({ db: doc.db, roots: applyDatabaseToRoots(doc.db, doc.roots) });
}
function logical(text: string): string[] {
  return text.split(/\r\n|\r|\n/).map((l) => l.replace(/@@/g, '@').trim()).filter(Boolean);
}

// Fixture mit unbekannten _-Tags UND tiefer OBJE/MAP-Kette am zu editierenden Record.
const PASSTHROUGH_INDI = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 5.5.1',
  '0 @I1@ INDI',
  '1 NAME Max /Muster/',
  '2 GIVN Max',
  '2 SURN Muster',
  '1 SEX M',
  '1 _FOO ein unbekannter tag',
  '2 _BAR tiefer',
  '3 _BAZ noch tiefer',
  '1 BIRT',
  '2 DATE 12 MAR 1890',
  '2 PLAC Ochtrup',
  '3 MAP',
  '4 LATI N52.15',
  '4 LONG E7.333333',
  '1 OBJE',
  '2 FILE bild.jpg',
  '2 TITL Portrait',
  '1 _CUSTOM behalte mich',
  '0 TRLR',
].join('\n');

describe('Write-Back: nicht-mutierender Fall bleibt roundtrip-stabil (RT-1/RT-2)', () => {
  it('kein Feld geändert → applyDatabaseToRoots liefert byte-identischen Output (Mini)', () => {
    const doc = parseGedcom(MINI);
    const withoutWriteBack = serializeGedcom(doc);
    const withWriteBack = serializeAfterWriteBack(doc);
    expect(withWriteBack).toBe(withoutWriteBack);
  });

  it('unveränderte Records bleiben die IDENTISCHE GedNode-Referenz (keine Neuerzeugung)', () => {
    const doc = parseGedcom(MINI);
    const out = applyDatabaseToRoots(doc.db, doc.roots);
    // Jeder Level-0-Record kommt referenzgleich aus roots zurück.
    for (let i = 0; i < doc.roots.length; i++) {
      expect(out[i]).toBe(doc.roots[i]);
    }
  });

  it('Passthrough-Fixture ohne Edit → byte-identisch (INV-PT unangetastet)', () => {
    const doc = parseGedcom(PASSTHROUGH_INDI);
    expect(serializeAfterWriteBack(doc)).toBe(serializeGedcom(doc));
  });
});

describe('Write-Back: geändertes Feld an bestehendem Record (INV-PT bleibt gewahrt)', () => {
  it('given/surname geändert → nur NAME-Block ändert sich, Passthrough überlebt', () => {
    const doc = parseGedcom(PASSTHROUGH_INDI);
    const p = structuredClone(doc.db.individuals.get('@I1@')!);
    p.given = 'Moritz';
    p.name = 'Moritz /Muster/';
    doc.db.individuals = savePerson(doc.db.individuals, p);

    const out = serializeAfterWriteBack(doc);
    const reparsed = parseGedcom(out);
    const rp = reparsed.db.individuals.get('@I1@')!;

    // Das geänderte Feld ist da.
    expect(rp.given).toBe('Moritz');
    expect(rp.name).toBe('Moritz /Muster/');
    // Alle unbekannten Passthrough-Zeilen überleben unverändert.
    const lg = logical(out);
    expect(lg).toContain('1 _FOO ein unbekannter tag');
    expect(lg).toContain('2 _BAR tiefer');
    expect(lg).toContain('3 _BAZ noch tiefer');
    expect(lg).toContain('1 _CUSTOM behalte mich');
    // Tiefe erkannte Ketten (OBJE, MAP) bleiben ebenfalls erhalten.
    expect(lg).toContain('2 FILE bild.jpg');
    expect(lg).toContain('4 LATI N52.15');
    expect(rp.birth.date).toBe('12 MAR 1890');
    expect(rp.media[0].mediaId).toBe('bild.jpg');
  });

  it('nur das geänderte Feld unterscheidet sich; alle anderen Modellfelder gleich', () => {
    const doc = parseGedcom(PASSTHROUGH_INDI);
    const before = structuredClone(doc.db.individuals.get('@I1@')!);
    const p = structuredClone(before);
    p.sex = 'F';
    doc.db.individuals = savePerson(doc.db.individuals, p);

    const rp = parseGedcom(serializeAfterWriteBack(doc)).db.individuals.get('@I1@')!;
    expect(rp.sex).toBe('F');
    // Name/Geburt/Medien unberührt.
    expect(rp.given).toBe(before.given);
    expect(rp.birth.date).toBe(before.birth.date);
    expect(rp.media[0].mediaId).toBe(before.media[0].mediaId);
  });

  it('idempotent ab Edit: zweiter Write-Back-Durchlauf ist stabil (out1===out2)', () => {
    const doc = parseGedcom(PASSTHROUGH_INDI);
    const p = structuredClone(doc.db.individuals.get('@I1@')!);
    p.title = 'Dr.';
    doc.db.individuals = savePerson(doc.db.individuals, p);
    const out1 = serializeAfterWriteBack(doc);
    const doc2 = parseGedcom(out1);
    const out2 = serializeAfterWriteBack(doc2);
    expect(out2).toBe(out1);
  });
});

describe('Write-Back: neue Records anlegen', () => {
  it('neue Person → Record vorhanden mit allen gesetzten Feldern', () => {
    const doc = parseGedcom(MINI);
    const np = makePerson('@I2@', {
      name: 'Anna /Neu/',
      given: 'Anna',
      surname: 'Neu',
      sex: 'F',
      birth: makeEvent('BIRT', { seen: true, date: '1900', place: 'Rheine' }),
    });
    doc.db.individuals = savePerson(doc.db.individuals, np);

    const reparsed = parseGedcom(serializeAfterWriteBack(doc));
    const rp = reparsed.db.individuals.get('@I2@')!;
    expect(rp).toBeDefined();
    expect(rp.given).toBe('Anna');
    expect(rp.surname).toBe('Neu');
    expect(rp.sex).toBe('F');
    expect(rp.birth.date).toBe('1900');
    expect(rp.birth.place).toBe('Rheine');
    // Bestehende Person unverändert.
    expect(reparsed.db.individuals.get('@I1@')?.name).toBe('Max /Muster/');
  });

  it('neuer Record wird VOR TRLR eingefügt', () => {
    const doc = parseGedcom(MINI);
    doc.db.individuals = savePerson(doc.db.individuals, makePerson('@I9@', { name: 'Z /Z/' }));
    const lines = serializeAfterWriteBack(doc).split(/\r\n/);
    const iNew = lines.indexOf('0 @I9@ INDI');
    const iTrlr = lines.indexOf('0 TRLR');
    expect(iNew).toBeGreaterThan(0);
    expect(iNew).toBeLessThan(iTrlr);
  });

  it('neue Familie mit Kindern/Eltern', () => {
    const doc = parseGedcom(MINI);
    const f = makeFamily('@F1@', {
      husband: '@I1@',
      children: ['@I1@'],
      marriage: makeEvent('MARR', { seen: true, date: '1920' }),
    });
    doc.db = saveFamily(doc.db, f);
    const rf = parseGedcom(serializeAfterWriteBack(doc)).db.families.get('@F1@')!;
    expect(rf.husband).toBe('@I1@');
    expect(rf.children).toEqual(['@I1@']);
    expect(rf.marriage.date).toBe('1920');
  });

  it('neue Quelle', () => {
    const doc = parseGedcom(MINI);
    doc.db.sources = saveSource(doc.db.sources, makeSource('@S2@', {
      title: 'Neue Quelle', author: 'Autor X', abbr: 'NQ',
    }));
    const rs = parseGedcom(serializeAfterWriteBack(doc)).db.sources.get('@S2@')!;
    expect(rs.title).toBe('Neue Quelle');
    expect(rs.author).toBe('Autor X');
    expect(rs.abbr).toBe('NQ');
  });

  it('neues Archiv (Repository) mit modelliertem _RTYPE/_FAURL', () => {
    const doc = parseGedcom(MINI);
    doc.db.repositories = saveRepository(doc.db.repositories, makeRepository('@R1@', {
      name: 'Stadtarchiv', type: 'Archiv', findingAid: 'https://aid.example',
      address: 'Musterstr. 1\n48431 Rheine',
    }));
    const rr = parseGedcom(serializeAfterWriteBack(doc)).db.repositories.get('@R1@')!;
    expect(rr.name).toBe('Stadtarchiv');
    expect(rr.type).toBe('Archiv');
    expect(rr.findingAid).toBe('https://aid.example');
    expect(rr.address).toBe('Musterstr. 1\n48431 Rheine');
  });
});

describe('Write-Back: Records löschen', () => {
  it('gelöschte Person verschwindet, Rest bleibt', () => {
    const doc = parseGedcom(MINI);
    doc.db.individuals = deletePerson(doc.db.individuals, '@I1@');
    const out = serializeAfterWriteBack(doc);
    expect(out).not.toContain('0 @I1@ INDI');
    // Quelle + Notiz bleiben.
    expect(out).toContain('0 @S1@ SOUR');
    expect(out).toContain('0 @N1@ NOTE');
  });

  it('gelöschte Quelle verschwindet', () => {
    const doc = parseGedcom(MINI);
    doc.db.sources = deleteSource(doc.db.sources, '@S1@');
    const out = serializeAfterWriteBack(doc);
    expect(out).not.toContain('0 @S1@ SOUR');
    expect(out).toContain('0 @I1@ INDI');
  });

  it('gelöschte Familie/Archiv verschwinden (auf konstruierter Basis)', () => {
    const src = [
      '0 HEAD', '1 GEDC', '2 VERS 5.5.1',
      '0 @I1@ INDI', '1 NAME A /B/',
      '0 @F1@ FAM', '1 HUSB @I1@',
      '0 @R1@ REPO', '1 NAME Archiv',
      '0 TRLR',
    ].join('\n');
    const doc = parseGedcom(src);
    doc.db = deleteFamily(doc.db, '@F1@');
    doc.db.repositories = deleteRepository(doc.db.repositories, '@R1@');
    const out = serializeAfterWriteBack(doc);
    expect(out).not.toContain('0 @F1@ FAM');
    expect(out).not.toContain('0 @R1@ REPO');
    expect(out).toContain('0 @I1@ INDI');
  });
});

describe('Write-Back: GED7/Strict-Adapter crashen nicht auf synthetisierten Knoten', () => {
  it('neuer Record → GED7-Export ohne Crash', () => {
    const doc = parseGedcom(MINI);
    doc.db.individuals = savePerson(doc.db.individuals, makePerson('@I2@', {
      name: 'Neu /Person/', given: 'Neu', exids: [{ value: 'X123', type: 'UID' }],
    }));
    const roots = applyDatabaseToRoots(doc.db, doc.roots);
    expect(() => roots.map(transformGed7)).not.toThrow();
    const ged7 = serializeGedcom({ db: doc.db, roots }, { format: '7.0' });
    // REFN → EXID im synthetisierten Record.
    expect(ged7).toContain('1 EXID X123');
  });

  it('neuer Record → Strict-Export ohne Crash, _-Tags gestrippt', () => {
    const doc = parseGedcom(MINI);
    doc.db.repositories = saveRepository(doc.db.repositories, makeRepository('@R1@', {
      name: 'Archiv', type: 'Kirche',
    }));
    const roots = applyDatabaseToRoots(doc.db, doc.roots);
    expect(() => roots.map(stripStrict)).not.toThrow();
    const strict = serializeGedcom({ db: doc.db, roots }, { format: 'strict' });
    expect(strict).toContain('0 @R1@ REPO');
    expect(strict).toContain('1 NAME Archiv');
    // _RTYPE ist proprietär → im Strict-Export weg.
    expect(strict).not.toContain('_RTYPE');
  });
});
