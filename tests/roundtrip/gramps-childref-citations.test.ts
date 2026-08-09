// tests/roundtrip/gramps-childref-citations.test.ts — die GRAMPS-Hälfte der Kindschaft
// (BL-329, ADR-v9-244): `<childref>` trägt dort das Kind-Verhältnis (`frel`/`mrel`) und
// die Belege der Abstammung (`<citationref>`), das Modell führt beides INDI-seitig am
// `ChildLink` ([10 §3]).
//
// WARUM DIESE DATEI. Vor BL-329 füllte der GRAMPS-Ladepfad `Person.childOf` GAR NICHT
// (gemessen an `Unsere Familie.gramps`: 2013 `<childref>`, 0 `childOf`) — die Kindschaft
// existierte nur family-seitig, der Editor hätte nichts gehabt, woran er hängt, und ein
// dort erfasster Beleg wäre beim Speichern still verschwunden. Geprüft wird deshalb
// beides: dass die Aussage ANKOMMT (Lesen) und dass sie ZURÜCKGEHT (Schreiben).
//
// EINGECHECKTE FIXTURE, KEIN REALBESTAND (TST-23): die Zusicherung muss in CI gelten —
// der reale GRAMPS-Export trägt ohnehin 0 `<citationref>` unter `<childref>`.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseXMLText, buildXMLText } from '../../core/interop';
import { makeCitation } from '../../core/model/factory';

const XML = readFileSync(join(__dirname, '../fixtures/childref-citation.small.gramps'), 'utf8');

describe('GRAMPS `<childref>`: Kind-Verhältnis und Kindschafts-Belege', () => {
  it('liest die INDI-Seite aus dem family-seitigen `<childref>`', () => {
    const { db } = parseXMLText(XML);
    const link = db.individuals.get('I0001')!.childOf.find((l) => l.familyId === 'F0001')!;

    expect(link.pedigree).toBe('birth'); // frel === mrel → das ist die PEDI-Aussage
    expect(link.fatherRel).toBe('Birth');
    expect(link.motherRel).toBe('Birth');
    expect(link.citations).toHaveLength(1);
    expect(link.citations[0].sourceId).toBe('S0001');
    expect(link.citations[0].page).toBe('Bl. 11');
  });

  it('RT-1: ein unveränderter Durchlauf lässt den Baum byte-gleich', () => {
    const xml1 = buildXMLText(parseXMLText(XML));
    expect(xml1).toBe(buildXMLText(parseXMLText(xml1)));
    // Der `<childref>` ist NICHT angefasst worden — weder Attribute noch Kinder.
    expect(xml1).toContain('<childref hlink="_p1" frel="Birth" mrel="Birth">');
    expect(xml1).toContain('<citationref hlink="_c1"');
  });

  it('ein NEUER Beleg wird als eigener `<citation>`-Record plus `<citationref>` geschrieben', () => {
    const parsed = parseXMLText(XML);
    const link = parsed.db.individuals.get('I0001')!.childOf[0];
    const cit = makeCitation('S0001');
    cit.page = 'Bl. 12';
    link.citations.push(cit);

    const xml = buildXMLText(parsed);
    const wieder = parseXMLText(xml);
    const link2 = wieder.db.individuals.get('I0001')!.childOf[0];

    expect(link2.citations.map((c) => c.page).sort()).toEqual(['Bl. 11', 'Bl. 12']);
    expect(buildXMLText(parseXMLText(xml))).toBe(xml); // idempotent auch nach der Änderung
  });

  it('ein geändertes Kind-Verhältnis landet in `frel`/`mrel`', () => {
    const parsed = parseXMLText(XML);
    parsed.db.individuals.get('I0001')!.childOf[0].pedigree = 'adopted';

    const xml = buildXMLText(parsed);
    expect(xml).toContain('frel="Adopted"');
    expect(xml).toContain('mrel="Adopted"');
    expect(parseXMLText(xml).db.individuals.get('I0001')!.childOf[0].pedigree).toBe('adopted');
  });

  it('ein entfernter Beleg nimmt den `<citationref>` mit — und den verwaisten Record', () => {
    const parsed = parseXMLText(XML);
    parsed.db.individuals.get('I0001')!.childOf[0].citations = [];

    const xml = buildXMLText(parsed);
    expect(xml).not.toContain('<citationref hlink="_c1"');
    // Der `<citation>`-Record hat keinen Owner mehr und fällt beim Verwaisten-Pass weg.
    expect(xml).not.toContain('id="C0001"');
  });
});
