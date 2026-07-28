// tests/roundtrip/merge-passthrough-gramps.test.ts — BL-165 (BL-164 Phase 2, ADR-v9-129).
//
// GRAMPS-Gegenstück zu merge-passthrough.test.ts: der un-modellierte `<person>`-Passthrough
// (`<attribute>`, `<url>`, `<lds_ord>`, …) des Verlierers wird beim Merge in den Gewinner
// übernommen — an DTD-korrekter Position, byte-strukturell dedupliziert. Referenz-Elemente
// (`hlink`: eventref/citationref/childof/…) werden NICHT mitkopiert (modell-gemergt bzw.
// family-seitig behandelt).

import { describe, it, expect } from 'vitest';
import { parseXMLText } from '../../core/interop/gramps';
import { applyDatabaseToXml } from '../../core/interop';
import { serializeXml } from '../../core/interop/xml-tree';
import { mergePersons } from '../../core/dedup';
import type { XmlNode } from '../../core/interop';

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE database PUBLIC "-//Gramps//DTD Gramps XML 1.7.2//EN"
"http://gramps-project.org/xml/1.7.2/grampsxml.dtd">
<database xmlns="http://gramps-project.org/xml/1.7.2/">
  <header><created date="2026-04-11" version="6.0.6"/></header>
  <people>
    <person handle="_p1" change="1" id="I0001">
      <gender>M</gender>
      <name type="Birth Name"><first>Max</first><surname>Muster</surname></name>
      <attribute type="_STAT" value="tot"/>
    </person>
    <person handle="_p2" change="1" id="I0002">
      <gender>M</gender>
      <name type="Birth Name"><first>Max</first><surname>Muster</surname></name>
      <attribute type="_STAT" value="tot"/>
      <attribute type="Telefon" value="12345"/>
    </person>
  </people>
</database>
`;

function findPerson(root: XmlNode, id: string): XmlNode | undefined {
  const people = root.children.find((c) => c.tag === 'people');
  return people?.children.find((p) => p.tag === 'person' && p.attrs.some(([k, v]) => k === 'id' && v === id));
}
const attrTypes = (person: XmlNode): string[] =>
  person.children.filter((c) => c.tag === 'attribute').map((c) => c.attrs.find(([k]) => k === 'type')?.[1] ?? '');

/** parse → merge(I0001←I0002) → write-back → GRAMPS-XML-Text. */
function mergeAndSerialize(): string {
  const { db, doc } = parseXMLText(XML);
  const merged = mergePersons(db, 'I0001', 'I0002');
  return serializeXml(applyDatabaseToXml(merged, doc));
}

describe('BL-165 — GRAMPS-Personen-Merge verlustfrei auf Passthrough-Ebene', () => {
  it('der EINZIGE Verlierer-Passthrough (<attribute Telefon>) landet beim Gewinner', () => {
    const { db, doc } = parseXMLText(mergeAndSerialize());
    expect(db.individuals.size).toBe(1); // Verlierer weg
    const w = findPerson(doc.root, 'I0001')!;
    expect(attrTypes(w)).toContain('Telefon');
    expect(attrTypes(w)).toContain('_STAT');
  });

  it('der GEMEINSAME <attribute _STAT> wird dedupliziert (genau einmal)', () => {
    const { doc } = parseXMLText(mergeAndSerialize());
    const w = findPerson(doc.root, 'I0001')!;
    const types = attrTypes(w);
    expect(types.filter((t) => t === '_STAT').length).toBe(1);
    expect(types.filter((t) => t === 'Telefon').length).toBe(1);
  });

  it('das übernommene <attribute> steht an DTD-korrekter Position (Round-trip xml1===xml2)', () => {
    const out1 = mergeAndSerialize();
    const { db, doc } = parseXMLText(out1);
    const out2 = serializeXml(applyDatabaseToXml(db, doc));
    expect(out2).toBe(out1);
  });

  it('ohne Merge unverändert (Kontrollfall)', () => {
    const { db, doc } = parseXMLText(XML);
    const out = serializeXml(applyDatabaseToXml(db, doc));
    const { doc: d2 } = parseXMLText(out);
    expect(attrTypes(findPerson(d2.root, 'I0001')!)).not.toContain('Telefon');
    expect(attrTypes(findPerson(d2.root, 'I0002')!)).toContain('Telefon');
  });
});
