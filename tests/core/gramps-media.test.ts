// tests/core/gramps-media.test.ts — GRAMPS-Medien-Projektion (ADR-v9-125).
// <object> → Top-Level-Media (globaler Titel aus <file description>), <objref> → MediaCitation
// je Owner (Person/Ereignis/Quelle). Geteilte Identität über handle→id. Write-Back bleibt
// Passthrough (object/objref byte-treu) → Roundtrip xml1===xml2.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseXMLText, buildXMLText } from '../../core/interop';

const MEDIA = readFileSync(join(__dirname, '../fixtures/media.small.gramps'), 'utf8');

describe('GRAMPS Medien-Projektion (ADR-v9-125)', () => {
  it('<object> → db.media als Top-Level-Entität, Titel global aus <file description>', () => {
    const { db } = parseXMLText(MEDIA);
    expect(db.media.size).toBe(2);
    const m = db.media.get('O0000')!;
    expect(m.id).toBe('O0000');
    expect(m.file).toBe('fotos/max.jpg');
    expect(m.form).toBe('image/jpeg');
    expect(m.title).toBe('Max Muster Portrait'); // <file description> = globaler Titel
    expect(m.wireOrigin).toBe('record');
    expect(db.media.get('O0001')!.file).toBe('scans/taufe.pdf');
  });

  it('<objref> → MediaCitation je Owner, geteilte Identität über handle→id', () => {
    const { db } = parseXMLText(MEDIA);
    // Person und Quelle referenzieren dasselbe Objekt (_o1 → O0000).
    expect(db.individuals.get('I0001')!.media.map((x) => x.mediaId)).toEqual(['O0000']);
    expect(db.sources.get('S0001')!.media.map((x) => x.mediaId)).toEqual(['O0000']);
    // Ereignis-Medium (über eventref projiziert).
    expect(db.individuals.get('I0001')!.birth.media.map((x) => x.mediaId)).toEqual(['O0001']);
    // GRAMPS objref trägt keinen Per-Ref-Titel (global auf Media); extra bleibt leer (Passthrough im XML).
    expect(db.individuals.get('I0001')!.media[0].title).toBe('');
    expect(db.individuals.get('I0001')!.media[0].extra).toEqual([]);
  });

  it('RT-1: xml1 === xml2 (object/objref bleiben Passthrough, byte-treu)', () => {
    const xml1 = buildXMLText(parseXMLText(MEDIA));
    const xml2 = buildXMLText(parseXMLText(xml1));
    expect(xml1).toBe(xml2);
  });

  it('INV-PT: <object>/<objref> überleben verbatim', () => {
    const xml1 = buildXMLText(parseXMLText(MEDIA));
    expect(xml1).toContain('<objref hlink="_o1"/>');
    expect(xml1).toContain('<file src="fotos/max.jpg" mime="image/jpeg" description="Max Muster Portrait"/>');
  });
});
