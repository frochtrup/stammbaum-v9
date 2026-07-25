// tests/core/gramps-references.test.ts — BL-136.
//
// GRAMPS verweist in der Datei ausschließlich über `handle` (`<father hlink="_x">`),
// die Records liegen im Modell aber unter ihrer GEDCOM-konformen `id` (I0001) —
// Handles sind Roundtrip-Fidelity-Felder, KEINE Primär-IDs (ADR-v9-11). Damit eine
// Referenz im Modell auflösbar ist, muss die Projektion die Datei-Handles beim Lesen
// in die Modell-`id` übersetzen. Vorher liefen Store-Schlüssel (id) und Referenzen
// (handle) auseinander: 0 von 3804 Familien-Referenzen ließen sich auflösen.
//
// Invariante (der Wächter): JEDE modellierte Referenz zeigt auf einen Schlüssel, der
// im zugehörigen Store existiert — Familie→Person, Quelle→Archiv. Und der Roundtrip
// schreibt die Referenz wieder als Handle in die Datei (kein id-Leck in die XML).

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { parseXMLText, buildXMLText } from '../../core/interop';

const FIXTURE = join(__dirname, '../fixtures/Unsere Familie.gramps');
const present = existsSync(FIXTURE);

/** Kleine, in sich geschlossene GRAMPS-Datei: Familie + Quelle→Archiv, alles per Handle. */
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<database xmlns="http://gramps-project.org/xml/1.7.2/">
  <header>
    <created date="2026-04-11" version="6.0.6"/>
  </header>
  <people>
    <person handle="_hVater" change="1" id="I0001">
      <gender>M</gender>
      <name type="Birth Name"><first>Vater</first><surname>Muster</surname></name>
    </person>
    <person handle="_hMutter" change="1" id="I0002">
      <gender>F</gender>
      <name type="Birth Name"><first>Mutter</first><surname>Muster</surname></name>
    </person>
    <person handle="_hKind" change="1" id="I0003">
      <gender>U</gender>
      <name type="Birth Name"><first>Kind</first><surname>Muster</surname></name>
    </person>
  </people>
  <families>
    <family handle="_hFam" change="1" id="F0001">
      <rel type="Married"/>
      <father hlink="_hVater"/>
      <mother hlink="_hMutter"/>
      <childref hlink="_hKind"/>
    </family>
  </families>
  <repositories>
    <repository handle="_hArchiv" change="1" id="R0001">
      <rname>Stadtarchiv</rname>
    </repository>
  </repositories>
  <sources>
    <source handle="_hQuelle" change="1" id="S0001">
      <stitle>Kirchenbuch</stitle>
      <reporef hlink="_hArchiv"/>
    </source>
  </sources>
</database>
`;

describe('BL-136 — GRAMPS-Referenzen lösen im Store auf', () => {
  it('Familien-Referenzen zeigen auf die Modell-id, nicht das Datei-Handle', () => {
    const { db } = parseXMLText(XML);
    const fam = db.families.get('F0001')!;
    expect(fam.husband).toBe('I0001');
    expect(fam.wife).toBe('I0002');
    expect(fam.children).toEqual(['I0003']);
  });

  it('jede Familien-Referenz ist in db.individuals auflösbar', () => {
    const { db } = parseXMLText(XML);
    const fam = db.families.get('F0001')!;
    for (const ref of [fam.husband, fam.wife, ...fam.children]) {
      expect(db.individuals.get(ref!)).toBeDefined();
    }
  });

  it('Quelle→Archiv-Referenz löst in db.repositories auf', () => {
    const { db } = parseXMLText(XML);
    const src = db.sources.get('S0001')!;
    expect(src.repo).toBe('R0001');
    expect(db.repositories.get(src.repo!)).toBeDefined();
  });

  it('Roundtrip schreibt die Referenz wieder als Handle (kein id-Leck in die XML)', () => {
    const out = buildXMLText(parseXMLText(XML));
    expect(out).toContain('<father hlink="_hVater"/>');
    expect(out).toContain('<mother hlink="_hMutter"/>');
    expect(out).toContain('<childref hlink="_hKind"/>');
    expect(out).toContain('<reporef hlink="_hArchiv"/>');
    // die id darf NICHT als Referenz auftauchen
    expect(out).not.toContain('hlink="I0001"');
    expect(out).not.toContain('hlink="R0001"');
  });

  it('RT: xml1 === xml2 (Writer-Idempotenz bleibt gewahrt)', () => {
    const xml1 = buildXMLText(parseXMLText(XML));
    const xml2 = buildXMLText(parseXMLText(xml1));
    expect(xml1).toBe(xml2);
  });

  it('nach einem Familien-Edit bleibt die Referenz als Handle erhalten', () => {
    const parsed = parseXMLText(XML);
    const fam = parsed.db.families.get('F0001')!;
    fam.children = []; // Kind aus der Familie entfernen (echter Edit)
    const out = buildXMLText(parsed);
    expect(out).not.toContain('<childref');
    // Vater/Mutter unverändert → weiterhin als Handle
    expect(out).toContain('<father hlink="_hVater"/>');
    expect(out).toContain('<mother hlink="_hMutter"/>');
  });
});

describe.skipIf(!present)('BL-136 — Orakel: Unsere Familie.gramps', () => {
  function readXml(): string {
    const buf = readFileSync(FIXTURE);
    if (buf[0] === 0x1f && buf[1] === 0x8b) return gunzipSync(buf).toString('utf8');
    return buf.toString('utf8');
  }

  it('ALLE Familien-Referenzen lösen in db.individuals auf (vorher: 0)', () => {
    const { db } = parseXMLText(readXml());
    let total = 0;
    let ungeloest = 0;
    for (const fam of db.families.values()) {
      for (const ref of [fam.husband, fam.wife, ...fam.children]) {
        if (!ref) continue;
        total++;
        if (!db.individuals.has(ref)) ungeloest++;
      }
    }
    expect(total).toBeGreaterThan(3000);
    expect(ungeloest).toBe(0);
  });
});
