// tests/roundtrip/gramps-media.roundtrip.test.ts — BL-126 (Interop-Rest Medien):
//   1. GRAMPS-Medien-Record-Write-Back (`<object>`) modellgetrieben (ADR-v9-125): globale
//      Felder file/form/title round-trippen; unverändert → byte-treu; neu → neuer `<object>`;
//      gelöscht → entfernt.
//   2. Zitat-Ebene-`<objref>` (GRAMPS): `Citation.media` wird geparst UND per Write-Back
//      abgeglichen (Add/Remove), nicht mehr nur Passthrough.
//
// Das Kernversprechen ist Datenerhalt (LP-1): der erste Test jeder Gruppe zeigt, dass das
// Write-Back am UNVERÄNDERTEN Bestand nichts tut (xml1===xml2).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseXMLText, buildXMLText } from '../../core/interop';
import { makeMedia, makeMediaCitation } from '../../core/model';

const MEDIA = readFileSync(join(__dirname, '../fixtures/media.small.gramps'), 'utf8');
const MEDIA_CIT = readFileSync(join(__dirname, '../fixtures/media-citation.small.gramps'), 'utf8');

describe('GRAMPS Medien-Record-Write-Back (RT-1/RT-2, ADR-v9-125, BL-126)', () => {
  it('RT-2: unverändert bleibt byte-identisch (net_delta=0)', () => {
    const parsed = parseXMLText(MEDIA);
    expect(buildXMLText(parsed)).toBe(buildXMLText(parsed.doc));
  });

  it('RT-1: out1 === out2 (Idempotenz)', () => {
    const out1 = buildXMLText(parseXMLText(MEDIA));
    const out2 = buildXMLText(parseXMLText(out1));
    expect(out1).toBe(out2);
  });

  it('parst `<object>` in db.media (globaler Titel aus <file description>)', () => {
    const { db } = parseXMLText(MEDIA);
    const m = db.media.get('O0000');
    expect(m?.file).toBe('fotos/max.jpg');
    expect(m?.form).toBe('image/jpeg');
    expect(m?.title).toBe('Max Muster Portrait');
    expect(m?.wireOrigin).toBe('record');
  });

  it('schreibt einen geänderten globalen Medien-Titel in <file description>', () => {
    const parsed = parseXMLText(MEDIA);
    const m = parsed.db.media.get('O0000')!;
    parsed.db.media.set(m.id, { ...m, title: 'Neuer Titel' });

    const xml = buildXMLText(parsed);
    expect(xml).toContain('description="Neuer Titel"');
    expect(xml).not.toContain('description="Max Muster Portrait"');
    // und wieder einlesbar
    expect(parseXMLText(xml).db.media.get('O0000')?.title).toBe('Neuer Titel');
  });

  it('schreibt geänderte Datei + Format (src/mime) und bleibt roundtrip-stabil', () => {
    const parsed = parseXMLText(MEDIA);
    const m = parsed.db.media.get('O0001')!;
    parsed.db.media.set(m.id, { ...m, file: 'scans/neu.tiff', form: 'image/tiff' });

    const xml1 = buildXMLText(parsed);
    expect(xml1).toContain('src="scans/neu.tiff"');
    expect(xml1).toContain('mime="image/tiff"');
    const back = parseXMLText(xml1).db.media.get('O0001');
    expect(back?.file).toBe('scans/neu.tiff');
    expect(back?.form).toBe('image/tiff');
    // ab dem Edit stabil
    expect(buildXMLText(parseXMLText(xml1))).toBe(xml1);
  });

  it('lässt unveränderte <object>-Knoten IDENTISCH (kein Neuaufbau)', () => {
    const parsed = parseXMLText(MEDIA);
    const objVorher = objectNodes(parsed.doc).find((o) => idOf(o) === 'O0000')!;
    const doc2 = applyWriteBack(parsed);
    const objNachher = objectNodes(doc2).find((o) => idOf(o) === 'O0000')!;
    expect(objNachher).toBe(objVorher);
  });

  it('synthetisiert ein neu angelegtes record-Medium als <object> + wieder einlesbar', () => {
    const parsed = parseXMLText(MEDIA);
    const neu = makeMedia('O0099', {
      file: 'fotos/neu.png', form: 'image/png', title: 'Frisch', wireOrigin: 'record',
    });
    parsed.db.media.set(neu.id, neu);

    const xml = buildXMLText(parsed);
    const back = parseXMLText(xml).db.media.get('O0099');
    expect(back?.file).toBe('fotos/neu.png');
    expect(back?.title).toBe('Frisch');
    expect(xml).toMatch(/<object handle="[^"]+"/);
  });

  it('entfernt ein gelöschtes Medium aus <objects>', () => {
    const parsed = parseXMLText(MEDIA);
    const vorher = objectNodes(parsed.doc).length;
    parsed.db.media.delete('O0001');
    const doc2 = applyWriteBack(parsed);
    expect(objectNodes(doc2).length).toBe(vorher - 1);
  });
});

describe('GRAMPS Owner-Ebene-<objref>-Write-Back (Person/Quelle, BL-126)', () => {
  it('parst Owner-<objref> in .media (Person + Quelle teilen O0000)', () => {
    const { db } = parseXMLText(MEDIA);
    expect(db.individuals.get('I0001')!.media.map((m) => m.mediaId)).toEqual(['O0000']);
    expect(db.sources.get('S0001')!.media.map((m) => m.mediaId)).toEqual(['O0000']);
  });

  it('ein an einer Person verknüpftes Medium wird als <objref> beim Owner geschrieben', () => {
    const parsed = parseXMLText(MEDIA);
    const p = parsed.db.individuals.get('I0001')!;
    parsed.db.individuals.set(p.id, { ...p, media: [...p.media, makeMediaCitation('O0001')] });

    const xml = buildXMLText(parsed);
    const back = parseXMLText(xml).db.individuals.get('I0001')!;
    expect(back.media.map((m) => m.mediaId).sort()).toEqual(['O0000', 'O0001']);
    expect(buildXMLText(parseXMLText(xml))).toBe(xml); // stabil ab Edit
  });

  it('ein an einer Person entferntes Medium löscht dessen <objref> (Quelle bleibt)', () => {
    const parsed = parseXMLText(MEDIA);
    const p = parsed.db.individuals.get('I0001')!;
    parsed.db.individuals.set(p.id, { ...p, media: [] });

    const xml = buildXMLText(parsed);
    const re = parseXMLText(xml);
    expect(re.db.individuals.get('I0001')!.media).toEqual([]);
    // die Quellen-Referenz auf dasselbe Medium bleibt unangetastet
    expect(re.db.sources.get('S0001')!.media.map((m) => m.mediaId)).toEqual(['O0000']);
  });

  it('ein an einer Quelle verknüpftes Medium wird als <objref> geschrieben', () => {
    const parsed = parseXMLText(MEDIA);
    const s = parsed.db.sources.get('S0001')!;
    parsed.db.sources.set(s.id, { ...s, media: [...s.media, makeMediaCitation('O0001')] });

    const xml = buildXMLText(parsed);
    expect(parseXMLText(xml).db.sources.get('S0001')!.media.map((m) => m.mediaId).sort())
      .toEqual(['O0000', 'O0001']);
    expect(buildXMLText(parseXMLText(xml))).toBe(xml);
  });
});

describe('GRAMPS Zitat-Ebene-<objref>-Write-Back (BL-126)', () => {
  it('RT-2: unverändert bleibt byte-identisch (net_delta=0)', () => {
    const parsed = parseXMLText(MEDIA_CIT);
    expect(buildXMLText(parsed)).toBe(buildXMLText(parsed.doc));
  });

  it('RT-1: out1 === out2 (Idempotenz)', () => {
    const out1 = buildXMLText(parseXMLText(MEDIA_CIT));
    const out2 = buildXMLText(parseXMLText(out1));
    expect(out1).toBe(out2);
  });

  it('projiziert <objref> auf Zitat-Ebene in Citation.media (nicht mehr Passthrough)', () => {
    const { db } = parseXMLText(MEDIA_CIT);
    const cit = db.individuals.get('I0001')!.topLevelCitations[0];
    expect(cit.media.map((m) => m.mediaId)).toEqual(['O0000']);
  });

  it('schreibt ein am Zitat hinzugefügtes Medium als <objref>', () => {
    const parsed = parseXMLText(MEDIA_CIT);
    const p = parsed.db.individuals.get('I0001')!;
    const cit = p.topLevelCitations[0];
    const cit2 = { ...cit, media: [...cit.media, makeMediaCitation('O0001')] };
    parsed.db.individuals.set(p.id, { ...p, topLevelCitations: [cit2] });

    const xml = buildXMLText(parsed);
    // beide objref stehen jetzt am Zitat
    const back = parseXMLText(xml).db.individuals.get('I0001')!.topLevelCitations[0];
    expect(back.media.map((m) => m.mediaId).sort()).toEqual(['O0000', 'O0001']);
    // ab dem Edit stabil
    expect(buildXMLText(parseXMLText(xml))).toBe(xml);
  });

  it('entfernt ein am Zitat gelöschtes Medium (objref verschwindet)', () => {
    const parsed = parseXMLText(MEDIA_CIT);
    const p = parsed.db.individuals.get('I0001')!;
    const cit = p.topLevelCitations[0];
    parsed.db.individuals.set(p.id, { ...p, topLevelCitations: [{ ...cit, media: [] }] });

    const xml = buildXMLText(parsed);
    const back = parseXMLText(xml).db.individuals.get('I0001')!.topLevelCitations[0];
    expect(back.media).toEqual([]);
    expect(buildXMLText(parseXMLText(xml))).toBe(xml);
  });
});

// --- Helfer ----------------------------------------------------------------------------

import { applyDatabaseToXml } from '../../core/interop';
import type { GrampsParsed, XmlDocument, XmlNode } from '../../core/interop';

function applyWriteBack(parsed: GrampsParsed): XmlDocument {
  return applyDatabaseToXml(parsed.db, parsed.doc);
}
function objectNodes(doc: XmlDocument): XmlNode[] {
  const out: XmlNode[] = [];
  const walk = (n: XmlNode): void => { if (n.tag === 'object') out.push(n); for (const c of n.children) walk(c); };
  walk(doc.root);
  return out;
}
function idOf(n: XmlNode): string {
  return n.attrs.find(([k]) => k === 'id')?.[1] ?? '';
}
