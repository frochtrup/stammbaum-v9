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
    expect(anna!.form).toBe('jpg');
    const urkunde = db.media.get('scans/urkunde.pdf');
    expect(urkunde!.form).toBe('pdf');
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
