// tests/core/gramps-place-hierarchy.test.ts — BL-143 (ADR-v9-114 D3, Stufe 5): die volle
// GRAMPS-Ortshierarchie ins Modell + zurück. Deckt die vier Bau-Stufen ab:
//   A  RESI/PROP-`<description>` ↔ event.addr (Hof-Apparat/ADDR statt roher Freitext)
//   B  `<placeobj>` → PlaceObject (type/ptitle/pname/coord/placeref→enclosedBy),
//      `<placeobj type="Building">` → HofObject; Event-`<place hlink>` NATIV gebunden
//   C  Höfe bilden sich aus den Adressen (applyPlaceResolution, kein Duplikat-Seed)
//   D  Orts-/Hof-Edits round-trippen ins placeobj (net_delta=0 für Unverändertes)
//
// Inline-Fixtures (headless, build-frei, keine gitignored Realdaten) — TST-2/TST-3.
import { describe, it, expect } from 'vitest';
import { parseXMLText, buildXMLText } from '../../core/interop';
import { applyPlaceResolution } from '../../services/places';

const HEAD =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<!DOCTYPE database PUBLIC "-//Gramps//DTD Gramps XML 1.7.2//EN" "http://gramps-project.org/xml/1.7.2/grampsxml.dtd">\n' +
  '<database xmlns="http://gramps-project.org/xml/1.7.2/">\n' +
  '  <header><created date="2026-01-01" version="6.0"/><researcher><resname>T</resname></researcher></header>\n';

/** Datei mit Verwaltungshierarchie (Borough → County) + Building-Hof, RESI mit Adresse. */
const FULL = HEAD +
  '  <events>\n' +
  '    <event handle="_eb" change="1" id="E0000"><type>Birth</type><place hlink="_bo"/></event>\n' +
  '    <event handle="_er" change="1" id="E0001"><type>Residence</type><place hlink="_bo"/><description>Nienborger Damm 1</description></event>\n' +
  '    <event handle="_eo" change="1" id="E0002"><type>Occupation</type><description>Lehrer</description></event>\n' +
  '    <event handle="_ehof" change="1" id="E0003"><type>Residence</type><place hlink="_bld"/></event>\n' +
  '  </events>\n' +
  '  <people>\n' +
  '    <person handle="_p1" change="1" id="I0001"><gender>M</gender><name type="Birth Name"><first>A</first><surname>B</surname></name>' +
  '<eventref hlink="_eb" role="Primary"/><eventref hlink="_er" role="Primary"/><eventref hlink="_eo" role="Primary"/><eventref hlink="_ehof" role="Primary"/></person>\n' +
  '  </people>\n' +
  '  <places>\n' +
  '    <placeobj handle="_bo" change="1" id="P0000" type="Borough"><ptitle>Burgsteinfurt, Steinfurt</ptitle><pname value="Burgsteinfurt"/><coord lat="N52.15" long="E7.333333"/><placeref hlink="_co"/></placeobj>\n' +
  '    <placeobj handle="_co" change="1" id="P0001" type="County"><ptitle>Steinfurt</ptitle><pname value="Steinfurt"/></placeobj>\n' +
  '    <placeobj handle="_bld" change="1" id="P0002" type="Building"><ptitle>Hof Meyer</ptitle><pname value="Hof Meyer"/><coord lat="N52.2" long="E7.2"/><placeref hlink="_co"/></placeobj>\n' +
  '  </places>\n' +
  '</database>\n';

describe('BL-143 A — RESI/PROP <description> ↔ event.addr', () => {
  it('projiziert die Wohn-Adresse nach event.addr (nicht value), Beruf bleibt value', () => {
    const { db } = parseXMLText(FULL);
    const p = db.individuals.get('I0001')!;
    const resi = [p.birth, p.death, ...p.events].find((e) => e.type === 'RESI' && e.addr)!;
    expect(resi.addr).toBe('Nienborger Damm 1');
    expect(resi.value).toBe('');
    const occu = p.events.find((e) => e.type === 'OCCU')!;
    expect(occu.value).toBe('Lehrer'); // Beruf bleibt value
    // `null` = gar keine Adresse (BL-292: `addr` ist Tristate wie date/place; `''` hieße
    // „ADDR-Zeile vorhanden, ohne Wert"). GRAMPS legt für OCCU keine an.
    expect(occu.addr).toBeNull();
  });
});

describe('BL-143 B — placeobj-Hierarchie ins Modell', () => {
  it('projiziert type/ptitle/pname/coord/enclosedBy und bindet den Event-Ort nativ', () => {
    const { db } = parseXMLText(FULL);
    const bo = db.placeObjects.get('P0000')!;
    expect(bo.type).toBe('Borough');
    expect(bo.title).toBe('Burgsteinfurt, Steinfurt');
    expect(bo.pnames.map((n) => n.value)).toEqual(['Burgsteinfurt']);
    expect(bo.lat).toBeCloseTo(52.15);
    expect(bo.long).toBeCloseTo(7.333333);
    expect(bo.enclosedBy).toEqual([{ placeId: 'P0001', from: null, to: null, dateRaw: null }]); // handle→id

    // Event-Ort nativ ans placeobj gebunden (kein String-Matching).
    expect(db.individuals.get('I0001')!.birth.placeId).toBe('P0000');
  });

  it('teilt type="Building" deterministisch nach hofObjects und bindet den Event-Hof', () => {
    const { db } = parseXMLText(FULL);
    expect(db.placeObjects.has('P0002')).toBe(false); // Building ist KEIN PlaceObject
    const hof = [...db.hofObjects.values()][0];
    expect(hof.villageId).toBe('P0001');
    expect(hof.addrs[0].value).toBe('Hof Meyer');
    expect(hof.grampsId).toBe('P0002'); // Fidelity, id bleibt deterministisch
    expect(hof.id).not.toBe('P0002');

    const hofEvent = db.individuals.get('I0001')!.events.find((e) => e.hofId != null);
    expect(hofEvent?.hofId).toBe(hof.id);
  });
});

describe('BL-143 C — Höfe aus Adressen, kein Duplikat-Seed', () => {
  it('bootet einen Hof aus der RESI-Adresse; native Orte werden nicht doppelt geseedet', () => {
    const { db } = parseXMLText(FULL);
    const placesVorher = db.placeObjects.size;
    const res = applyPlaceResolution(db);

    // Der RESI-Ort war nativ gebunden → kein neuer Ort; der Hof entsteht aus der Adresse.
    expect(res.placeObjectsGrew).toBe(false);
    expect(db.placeObjects.size).toBe(placesVorher);
    const resi = db.individuals.get('I0001')!.events.find((e) => e.type === 'RESI' && e.addr === 'Nienborger Damm 1')!;
    expect(resi.hofId).not.toBeNull();
    expect(db.hofObjects.get(resi.hofId!)?.villageId).toBe('P0000'); // Dorf = der nativ gebundene Ort
  });
});

describe('BL-143 D — Orts-/Hof-Edits round-trippen ins placeobj', () => {
  it('reiner Roundtrip ist byte-stabil (net_delta=0)', () => {
    const parsed = parseXMLText(FULL);
    const a = buildXMLText(parsed);
    const b = buildXMLText(parseXMLText(a));
    expect(a).toBe(b);
  });

  it('ein Orts-Edit (Titel/Typ/Koordinate/pname) ändert genau diesen placeobj und überlebt Re-Parse', () => {
    const parsed = parseXMLText(FULL);
    const baseline = buildXMLText(parsed);
    const po = parsed.db.placeObjects.get('P0000')!;
    po.title = 'Burgsteinfurt';
    po.type = 'Town';
    po.lat = 52.5;
    po.long = 7.1;
    po.pnames = [...po.pnames, { value: 'Steinfurt-Burg', from: null, to: null, dateRaw: null }];
    const edited = buildXMLText(parsed);

    // genau EIN placeobj-Knoten unterscheidet sich
    const blocks = (x: string): string[] => x.match(/<placeobj[\s\S]*?<\/placeobj>/g) ?? [];
    const bl = blocks(baseline);
    const ed = blocks(edited);
    const changed = bl.filter((b, i) => b !== ed[i]);
    expect(changed.length).toBe(1);

    const re = parseXMLText(edited).db.placeObjects.get('P0000')!;
    expect(re.title).toBe('Burgsteinfurt');
    expect(re.type).toBe('Town');
    expect(re.lat).toBeCloseTo(52.5);
    expect(re.pnames.map((n) => n.value)).toContain('Steinfurt-Burg');
    // Edit-Roundtrip stabil
    expect(buildXMLText(parseXMLText(edited))).toBe(edited);
  });

  it('ein Building-Hof-Edit (Adresse/Koordinate) round-trippt in sein placeobj', () => {
    const parsed = parseXMLText(FULL);
    const hof = [...parsed.db.hofObjects.values()][0];
    hof.addrs[0].value = 'Hof Meyer (neu)';
    hof.lat = 52.9;
    hof.long = 7.9;
    const edited = buildXMLText(parsed);

    const re = [...parseXMLText(edited).db.hofObjects.values()][0];
    expect(re.addrs[0].value).toBe('Hof Meyer (neu)');
    expect(re.lat).toBeCloseTo(52.9);
    expect(edited).toContain('<ptitle>Hof Meyer (neu)</ptitle>');
    expect(edited).toContain('type="Building"');
  });
});
