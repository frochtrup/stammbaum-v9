// tests/core/gramps-enrich.test.ts — BL-140 Stufe 1d (ADR-v9-114).
//
// End-to-end: parseXMLText zieht Ereignisse/Daten/Orte/Zitate aus den Top-Level-Sektionen
// je Person/Familie ins Modell. Und der Roundtrip bleibt idempotent (die Anreicherung
// berührt den Baum nicht — Ereignisse bleiben Passthrough, INV-PT).

import { describe, it, expect } from 'vitest';
import { parseXMLText, buildXMLText } from '../../core/interop';

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<database xmlns="http://gramps-project.org/xml/1.7.2/">
  <header><created date="2026-04-11" version="6.0.6"/></header>
  <events>
    <event handle="_eBirth" change="1" id="E0001"><type>Birth</type><dateval val="1900-05-01"/><place hlink="_plDorf"/><citationref hlink="_cit1"/></event>
    <event handle="_eDeath" change="1" id="E0002"><type>Death</type><dateval val="1970" type="about"/></event>
    <event handle="_eOccu" change="1" id="E0003"><type>Occupation</type><description>Landwirt</description></event>
    <event handle="_eMarr" change="1" id="E0004"><type>Marriage</type><dateval val="1925-06-15"/><place hlink="_plDorf"/></event>
  </events>
  <people>
    <person handle="_hVater" change="1" id="I0001">
      <gender>M</gender>
      <name type="Birth Name"><first>Max</first><surname>Muster</surname><citationref hlink="_cit1"/></name>
      <eventref hlink="_eBirth" role="Primary"/>
      <eventref hlink="_eDeath" role="Primary"/>
      <eventref hlink="_eOccu" role="Primary"/>
    </person>
    <person handle="_hMutter" change="1" id="I0002">
      <gender>F</gender>
      <name type="Birth Name"><first>Eva</first><surname>Muster</surname></name>
    </person>
  </people>
  <families>
    <family handle="_hFam" change="1" id="F0001">
      <rel type="Married"/>
      <father hlink="_hVater"/>
      <mother hlink="_hMutter"/>
      <eventref hlink="_eMarr" role="Family"/>
    </family>
  </families>
  <citations>
    <citation handle="_cit1" change="1" id="C0001"><confidence>4</confidence><page>S. 5</page><sourceref hlink="_srcKB"/></citation>
  </citations>
  <sources>
    <source handle="_srcKB" change="1" id="S0001"><stitle>Kirchenbuch</stitle></source>
  </sources>
  <places>
    <placeobj handle="_plDorf" change="1" id="P0001" type="Village"><ptitle>Burgsteinfurt, Steinfurt</ptitle><pname value="Burgsteinfurt"/></placeobj>
  </places>
</database>
`;

describe('BL-140 1d — parseXMLText reichert Person/Familie an', () => {
  const { db } = parseXMLText(XML);
  const vater = db.individuals.get('I0001')!;

  it('Geburt: Datum, Ort (String), Zitat', () => {
    expect(vater.birth.type).toBe('BIRT');
    expect(vater.birth.date).toBe('1 MAY 1900');
    expect(vater.birth.place).toBe('Burgsteinfurt, Steinfurt');
    expect(vater.birth.citations).toHaveLength(1);
    expect(vater.birth.citations[0]).toMatchObject({ sourceId: 'S0001', page: 'S. 5', quay: 3 });
  });

  it('Tod: ungefähres Datum → ABT', () => {
    expect(vater.death.date).toBe('ABT 1970');
  });

  it('Nicht-Main-Event landet in events[]', () => {
    expect(vater.events).toHaveLength(1);
    expect(vater.events[0]).toMatchObject({ type: 'OCCU', value: 'Landwirt' });
  });

  it('Namens-Zitat wird aufgelöst', () => {
    expect(vater.nameCitations).toHaveLength(1);
    expect(vater.nameCitations[0].sourceId).toBe('S0001');
  });

  it('Person ohne Events bleibt leer, aber gültig', () => {
    const mutter = db.individuals.get('I0002')!;
    expect(mutter.birth.date).toBeNull();
    expect(mutter.events).toEqual([]);
  });

  it('Familien-Ereignis (role Family) → marriage', () => {
    const fam = db.families.get('F0001')!;
    expect(fam.marriage.type).toBe('MARR');
    expect(fam.marriage.date).toBe('15 JUN 1925');
    expect(fam.marriage.place).toBe('Burgsteinfurt, Steinfurt');
  });

  it('Roundtrip bleibt idempotent (Anreicherung berührt den Baum nicht)', () => {
    const xml1 = buildXMLText(parseXMLText(XML));
    const xml2 = buildXMLText(parseXMLText(xml1));
    expect(xml1).toBe(xml2);
  });
});
