// tests/core/interop-media.test.ts — Media/MediaCitation-Kernauflösung (ADR-v9-124).
// Deckt: (1) Identität (gleiche Datei über N Referenzen → EIN Media, N MediaCitation),
// (2) Edit-Sicherheit (FORM/_PRIM/_SCBK überleben einen Edit am Owner-Record — der Alt-Bug
// des flachen MediaRef verlor sie), (3) Persistenz-Rundlauf (TST-8), (4) globale Felder.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseGedcom,
  serializeGedcom,
  applyDatabaseToRoots,
} from '../../core/interop';
import { savePerson, makeMediaCitation } from '../../core/model';
import type { ParsedGedcom } from '../../core/interop';

const MEDIA = readFileSync(join(__dirname, '../fixtures/media.small.ged'), 'utf8');
const MEDIA_PTR = readFileSync(join(__dirname, '../fixtures/media-ptr.small.ged'), 'utf8');

function serializeAfterWriteBack(doc: ParsedGedcom): string {
  return serializeGedcom({ db: doc.db, roots: applyDatabaseToRoots(doc.db, doc.roots) });
}
function logical(text: string): string[] {
  return text.split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean);
}

describe('Media-Identität (ADR-v9-124): gleiche Datei → EIN Media, N MediaCitation', () => {
  it('db.media dedupliziert nach Dateipfad; MediaId === file', () => {
    const { db } = parseGedcom(MEDIA);
    // fotos/anna.jpg (Person + BIRT) und scans/urkunde.pdf (Zitat + Quelle) = 2 Media.
    expect(db.media.size).toBe(2);
    const anna = db.media.get('fotos/anna.jpg');
    expect(anna).toBeDefined();
    expect(anna!.id).toBe('fotos/anna.jpg');
    expect(anna!.file).toBe('fotos/anna.jpg');
    expect(anna!.form).toBe('image/jpeg');
    const urkunde = db.media.get('scans/urkunde.pdf');
    expect(urkunde!.form).toBe('application/pdf');
  });

  it('dieselbe Datei ergibt mehrere referenz-spezifische MediaCitations mit eigenen Feldern', () => {
    const { db } = parseGedcom(MEDIA);
    const p = db.individuals.get('@I1@')!;
    // Person-Ebene: Portrait, primär, mit _SCBK-Passthrough.
    expect(p.media).toHaveLength(1);
    expect(p.media[0].mediaId).toBe('fotos/anna.jpg');
    expect(p.media[0].title).toBe('Portrait Anna');
    expect(p.media[0].primary).toBe(true);
    expect(p.media[0].extra.some((n) => n.tag === '_SCBK')).toBe(true);
    // BIRT-Ebene: dieselbe Datei, ANDERE referenz-spezifische Felder.
    const birthMedia = p.birth.media;
    expect(birthMedia).toHaveLength(1);
    expect(birthMedia[0].mediaId).toBe('fotos/anna.jpg');
    expect(birthMedia[0].title).toBe('Anna als Kind');
    expect(birthMedia[0].note).toBe('Aufnahme im Garten');
    expect(birthMedia[0].primary).toBe(false);
  });

  it('Zitat- und Quellen-Referenz teilen dieselbe Media-Identität', () => {
    const { db } = parseGedcom(MEDIA);
    const p = db.individuals.get('@I1@')!;
    const citMedia = p.topLevelCitations[0].media;
    expect(citMedia[0].mediaId).toBe('scans/urkunde.pdf');
    const srcMedia = db.sources.get('@S1@')!.media;
    expect(srcMedia[0].mediaId).toBe('scans/urkunde.pdf');
  });
});

describe('Media Edit-Sicherheit (ADR-v9-124): globale + Passthrough-Felder überleben einen Edit', () => {
  it('Edit am Owner-Record erhält FORM/_PRIM/_SCBK der OBJE (Alt-Bug des flachen MediaRef)', () => {
    const doc = parseGedcom(MEDIA);
    const p = structuredClone(doc.db.individuals.get('@I1@')!);
    p.given = 'Annette';
    p.name = 'Annette /Bild/';
    doc.db.individuals = savePerson(doc.db.individuals, p);

    const out = logical(serializeAfterWriteBack(doc));
    // Der Edit ist da …
    expect(out).toContain('2 GIVN Annette');
    // … UND die globalen/Passthrough-Medienfelder sind NICHT verloren gegangen.
    expect(out).toContain('3 FORM jpg');   // globales Media.form, aus db.media rekonstruiert
    expect(out).toContain('2 _PRIM Y');    // referenz-spezifisch
    expect(out).toContain('2 _SCBK Y');    // unbekannt → extra-Passthrough
    expect(out).toContain('2 FILE fotos/anna.jpg');
  });

  it('idempotent ab Edit: zweiter Write-Back-Durchlauf ist stabil (out1 === out2)', () => {
    const doc = parseGedcom(MEDIA);
    const p = structuredClone(doc.db.individuals.get('@I1@')!);
    p.title = 'Dr.';
    doc.db.individuals = savePerson(doc.db.individuals, p);
    const out1 = serializeAfterWriteBack(doc);
    const out2 = serializeAfterWriteBack(parseGedcom(out1));
    expect(out2).toBe(out1);
  });
});

describe('Media Pointer-Form (@M@-Record, 5.5.1 optional / 7.0 Pflicht, ADR-v9-124)', () => {
  it('Identität = Xref: @M1@ über 3 Referenzen → EIN Media, 3 MediaCitation', () => {
    const { db } = parseGedcom(MEDIA_PTR);
    // Nur der Top-Level-Record trägt Mediendaten; die Pointer selbst nicht.
    expect(db.media.size).toBe(1);
    const m = db.media.get('@M1@')!;
    expect(m.id).toBe('@M1@');
    expect(m.file).toBe('fotos/gemeinsam.jpg');
    expect(m.form).toBe('image/jpeg');
    expect(m.type).toBe('PHOTO'); // MEDI unter FORM (Standard), nicht _TYPE
    // Drei Referenzen (I1 zweimal, I2 einmal), alle mit derselben Identität.
    const i1 = db.individuals.get('@I1@')!;
    const i2 = db.individuals.get('@I2@')!;
    expect(i1.media.map((x) => x.mediaId)).toEqual(['@M1@', '@M1@']);
    expect(i2.media[0].mediaId).toBe('@M1@');
    expect(i1.media[0].title).toBe('Porträt (Ref A)');
    expect(i1.media[1].primary).toBe(true);
    expect(i1.media[1].extra.some((n) => n.tag === '_SCBK')).toBe(true);
  });

  it('KRITISCH: Edit am Owner erhält den @M1@-Zeiger (kein leeres inline-FILE fabriziert)', () => {
    const doc = parseGedcom(MEDIA_PTR);
    const p = structuredClone(doc.db.individuals.get('@I1@')!);
    p.given = 'Bodo';
    p.name = 'Bodo /Zeiger/';
    doc.db.individuals = savePerson(doc.db.individuals, p);

    const out = logical(serializeAfterWriteBack(doc));
    // Alle drei Zeiger (I1 zweimal, I2 einmal) bleiben Zeiger — keiner wird inline.
    expect(out.filter((l) => l === '1 OBJE @M1@')).toHaveLength(3);
    // … und es wird KEIN inline-FILE unter I1 erfunden (das wäre der Alt-Bug / Korruption).
    const objeIdx = out.indexOf('1 OBJE @M1@');
    // Der @M1@-Record (mit dem echten FILE) bleibt separat erhalten.
    expect(out).toContain('0 @M1@ OBJE');
    expect(out).toContain('1 FILE fotos/gemeinsam.jpg');
    // Innerhalb der I1-OBJE-Zeilen darf kein FILE stehen (Zeiger trägt keine Datei).
    expect(out.slice(objeIdx, objeIdx + 2)).not.toContain('2 FILE fotos/gemeinsam.jpg');
  });

  it('idempotent ab Edit (Pointer-Form): out1 === out2', () => {
    const doc = parseGedcom(MEDIA_PTR);
    const p = structuredClone(doc.db.individuals.get('@I1@')!);
    p.title = 'Dr.';
    doc.db.individuals = savePerson(doc.db.individuals, p);
    const out1 = serializeAfterWriteBack(doc);
    const out2 = serializeAfterWriteBack(parseGedcom(out1));
    expect(out2).toBe(out1);
  });

  it('KERN (ADR-v9-125): globaler Feld-Edit wird AM RECORD erkannt und persistiert', () => {
    const doc = parseGedcom(MEDIA_PTR);
    // Änderung an einem GLOBALEN Feld — direkt am Top-Level-Media-Record, nicht am Owner.
    const m = { ...doc.db.media.get('@M1@')!, title: 'Umbenanntes Foto', type: 'DOCUMENT' };
    doc.db.media = new Map(doc.db.media).set('@M1@', m);

    const reparsed = parseGedcom(serializeAfterWriteBack(doc));
    // Persistiert im Record …
    const rm = reparsed.db.media.get('@M1@')!;
    expect(rm.title).toBe('Umbenanntes Foto');
    expect(rm.type).toBe('DOCUMENT');
    // … die drei Referenzen bleiben unangetastete Zeiger.
    expect(reparsed.db.individuals.get('@I1@')!.media.every((x) => x.mediaId === '@M1@')).toBe(true);
  });
});

describe('Media Zitat-Ebene-OBJE (GEDCOM, BL-126): modellgetrieben, nicht nur Passthrough', () => {
  it('OBJE unter einem SOUR-Zitat wird in Citation.media projiziert', () => {
    const { db } = parseGedcom(MEDIA);
    const cit = db.individuals.get('@I1@')!.topLevelCitations[0];
    expect(cit.media.map((m) => m.mediaId)).toEqual(['scans/urkunde.pdf']);
    expect(cit.media[0].title).toBe('Scan Urkunde');
  });

  it('ein am Zitat hinzugefügtes Medium wird als 2 OBJE geschrieben und round-trippt', () => {
    const doc = parseGedcom(MEDIA);
    const p = structuredClone(doc.db.individuals.get('@I1@')!);
    p.topLevelCitations[0].media.push(makeMediaCitation('fotos/anna.jpg', { title: 'Zweitscan' }));
    doc.db.individuals = savePerson(doc.db.individuals, p);

    const out1 = serializeAfterWriteBack(doc);
    const reparsed = parseGedcom(out1);
    const cit = reparsed.db.individuals.get('@I1@')!.topLevelCitations[0];
    expect(cit.media.map((m) => m.mediaId).sort()).toEqual(['fotos/anna.jpg', 'scans/urkunde.pdf']);
    // idempotent ab Edit
    expect(serializeAfterWriteBack(reparsed)).toBe(out1);
  });

  it('ein am Zitat entferntes Medium verschwindet aus der Ausgabe', () => {
    const doc = parseGedcom(MEDIA);
    const p = structuredClone(doc.db.individuals.get('@I1@')!);
    p.topLevelCitations[0].media = [];
    doc.db.individuals = savePerson(doc.db.individuals, p);

    const out = logical(serializeAfterWriteBack(doc));
    expect(out).not.toContain('3 TITL Scan Urkunde');
    expect(out).not.toContain('3 FILE scans/urkunde.pdf');
    // das SOUR-Zitat selbst bleibt (PAGE erhalten)
    expect(out).toContain('2 PAGE 5');
  });
});

describe('Media Persistenz-Rundlauf (TST-8)', () => {
  it('neue MediaCitation an einer Person → speichern → neu laden → noch da', () => {
    const doc = parseGedcom(MEDIA);
    const p = structuredClone(doc.db.individuals.get('@I1@')!);
    p.media.push(makeMediaCitation('fotos/neu.png', { title: 'Neues Bild', primary: false }));
    doc.db.individuals = savePerson(doc.db.individuals, p);

    const reparsed = parseGedcom(serializeAfterWriteBack(doc));
    const rp = reparsed.db.individuals.get('@I1@')!;
    const added = rp.media.find((m) => m.mediaId === 'fotos/neu.png');
    expect(added).toBeDefined();
    expect(added!.title).toBe('Neues Bild');
    // Und das neue Medium ist in der globalen Identität aufgetaucht.
    expect(reparsed.db.media.has('fotos/neu.png')).toBe(true);
  });
});
