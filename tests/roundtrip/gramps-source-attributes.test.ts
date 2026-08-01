// tests/roundtrip/gramps-source-attributes.test.ts — BL-244 (ADR-v9-180).
//
// `<source>` kennt in der GRAMPS-DTD kein Element für externe Referenznummern; GRAMPS
// legt ein GEDCOM-`REFN` deshalb als `<srcattribute type="REFN" value="…"/>` ab
// (`libgedcom.py::__source_attr` setzt `type` auf den Tag-Namen). Unser Export schrieb bis
// BL-244 GAR KEIN `srcattribute` an der Quelle — v9 verlor den Wert also auf dem
// GRAMPS-Weg, obwohl das Zielprogramm ihn erhält.
//
// Der Realbestand belegt beide Seiten: `1 REFN https://www.auswanderer-oldenburg.de/…`
// im GEDCOM, `<srcattribute type="REFN" value="https://…"/>` im GRAMPS-Export desselben
// Bestands.

import { describe, it, expect } from 'vitest';
import { parseGedcom, parseXMLText } from '../../core/interop';
import { buildGrampsTreeFromModel } from '../../core/interop/build-gramps-from-model';
import { attr, childrenByTag, firstChild, serializeXml } from '../../core/interop/xml-tree';
import type { XmlNode } from '../../core/interop/xml-tree';

const GED = [
  '0 HEAD', '1 GEDC', '2 VERS 5.5.1',
  '0 @S1@ SOUR',
  '1 TITL Auswandererportal',
  '1 REFN https://www.auswanderer-oldenburg.de/getperson.php',
  '0 @I1@ INDI', '1 NAME Anna /Test/',
  '0 TRLR',
].join('\n');

function quelle(xml: string): XmlNode {
  const { doc } = parseXMLText(xml);
  const sources = firstChild(doc.root, 'sources')!;
  return childrenByTag(sources, 'source')[0]!;
}

describe('BL-244 — externe Referenzen reisen als <srcattribute type="REFN">', () => {
  const { db } = parseGedcom(GED);
  const xml = serializeXml(buildGrampsTreeFromModel(db));

  it('der Export schreibt den REFN-Wert, statt ihn fallen zu lassen', () => {
    const attrs = childrenByTag(quelle(xml), 'srcattribute');
    expect(attrs.map((a) => [attr(a, 'type'), attr(a, 'value')])).toEqual([
      ['REFN', 'https://www.auswanderer-oldenburg.de/getperson.php'],
    ]);
  });

  it('steht an der DTD-Position: nach objref, VOR reporef', () => {
    // `source (stitle?, sauthor?, spubinfo?, sabbrev?, noteref*, objref*, srcattribute*,
    // reporef*, tagref*)` — eine falsche Reihenfolge ist kein Schönheitsfehler, sondern
    // macht die Datei DTD-widrig (der Fehler, den ADR-v9-175 am <citation> behoben hat).
    const tags = quelle(xml).children.map((c) => c.tag);
    const erlaubt = ['stitle', 'sauthor', 'spubinfo', 'sabbrev', 'noteref', 'objref', 'srcattribute', 'reporef', 'tagref'];
    const rang = tags.map((t) => erlaubt.indexOf(t));
    expect(rang).toEqual([...rang].sort((a, b) => a - b));
    expect(rang).not.toContain(-1);
  });

  it('re-parst zurück ins Modell — der Wert überlebt GEDCOM → GRAMPS → Modell', () => {
    const zurueck = parseXMLText(xml).db;
    const s = [...zurueck.sources.values()][0]!;
    expect(s.externalRefs.map((r) => r.value)).toEqual([
      'https://www.auswanderer-oldenburg.de/getperson.php',
    ]);
  });

  it('ohne externe Referenz entsteht kein leeres <srcattribute>', () => {
    const ohne = parseGedcom(GED.replace(/^1 REFN .*$/m, '1 AUTH Amt')).db;
    const xml2 = serializeXml(buildGrampsTreeFromModel(ohne));
    expect(childrenByTag(quelle(xml2), 'srcattribute')).toHaveLength(0);
  });
});
