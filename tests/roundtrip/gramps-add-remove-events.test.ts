// tests/roundtrip/gramps-add-remove-events.test.ts — BL-144: das HINZUFÜGEN/ENTFERNEN
// ganzer geteilter Records (Events/Zitate) round-trippt (Spec 13 §6, ADR-v9-114 D5).
//
// BL-142 schrieb geänderte FELDER vorhandener Events/Zitate zurück, ließ die Owner-Projektion
// aber bewusst bei Name/Geschlecht/Links. BL-144 zieht die Owner-`<eventref>`/`<citationref>`-
// Liste mit: ein im Modell HINZUGEFÜGTES Event/Zitat (ohne `grampsId`) wird als neuer
// Top-Level-Record synthetisiert und beim Owner referenziert; ein ENTFERNTES verliert seinen
// Ref, und sein Record fällt weg — ABER nur, wenn ihn KEIN anderer Owner mehr hält (geteilte
// Records: eine Quelle an Name UND Event überlebt das Entfernen an EINER Stelle).
//
// DIE BYTE-TREUE (LP-1) IST DAS KERNRISIKO. Die Owner-Reconciliation darf vorhandene Refs
// NICHT umordnen und einen unveränderten Owner NICHT anfassen. Der erste Test ist deshalb
// wieder der Wächter am unangetasteten Bestand.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { parseXMLText, buildXMLText, applyDatabaseToXml } from '../../core/interop';
import { makeEvent, makeCitation } from '../../core/model';
import type { XmlDocument, XmlNode } from '../../core/interop';

const FIX = readFileSync(join(__dirname, '../fixtures/events-mini.small.gramps'), 'utf8');
const GROSS = join(__dirname, '../fixtures/Unsere Familie.gramps');
function grosseFixture(): string {
  const buf = readFileSync(GROSS);
  return buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf).toString('utf8') : buf.toString('utf8');
}
function knoten(doc: XmlDocument, tag: string): XmlNode[] {
  const out: XmlNode[] = [];
  const lauf = (n: XmlNode): void => { if (n.tag === tag) out.push(n); for (const c of n.children) lauf(c); };
  lauf(doc.root);
  return out;
}
function byId(doc: XmlDocument, tag: string, id: string): XmlNode | undefined {
  return knoten(doc, tag).find((n) => n.attrs.some(([k, v]) => k === 'id' && v === id));
}
function personNode(doc: XmlDocument, id: string): XmlNode | undefined {
  return knoten(doc, 'person').find((n) => n.attrs.some(([k, v]) => k === 'id' && v === id));
}
function eventrefHandles(owner: XmlNode): string[] {
  return owner.children.filter((c) => c.tag === 'eventref').map((c) => c.attrs.find(([k]) => k === 'hlink')![1]);
}
function citationrefHandles(owner: XmlNode): string[] {
  return owner.children.filter((c) => c.tag === 'citationref').map((c) => c.attrs.find(([k]) => k === 'hlink')![1]);
}

describe('BL-144: unverändert bleibt byte-treu', () => {
  it('gibt bei unangetastetem db exakt die Eingabe wieder', () => {
    const parsed = parseXMLText(FIX);
    expect(buildXMLText(parsed)).toBe(buildXMLText(parsed.doc));
  });

  it.skipIf(!existsSync(GROSS))('lässt die 5,7-MB-Datei mit ihren Owner-Refs byte-treu', () => {
    const parsed = parseXMLText(grosseFixture());
    expect(buildXMLText(parsed)).toBe(buildXMLText(parsed.doc));
  });
});

describe('BL-144: Event hinzufügen', () => {
  it('synthetisiert einen <event>-Record und referenziert ihn beim Owner', () => {
    const parsed = parseXMLText(FIX);
    const evVorher = knoten(parsed.doc, 'event').length;
    parsed.db.individuals.get('I0001')!.events.push(
      makeEvent('OCCU', { seen: true, date: '1920', value: 'Landwirt' }),
    );

    const nach = applyDatabaseToXml(parsed.db, parsed.doc);
    expect(knoten(nach, 'event').length).toBe(evVorher + 1);
    const person = personNode(nach, 'I0001')!;
    expect(eventrefHandles(person).length).toBe(4); // war 3
    // der neue eventref zeigt auf einen existierenden <event>-Record
    const alle = new Set(knoten(nach, 'event').map((e) => e.attrs.find(([k]) => k === 'handle')![1]));
    for (const h of eventrefHandles(person)) expect(alle.has(h)).toBe(true);
  });

  it('das hinzugefügte Event ist nach Re-Parse da (Occupation, 1920)', () => {
    const parsed = parseXMLText(FIX);
    parsed.db.individuals.get('I0001')!.events.push(
      makeEvent('OCCU', { seen: true, date: '1920', value: 'Landwirt' }),
    );
    const wieder = parseXMLText(buildXMLText(parsed)).db.individuals.get('I0001')!;
    const occu = wieder.events.find((e) => e.type === 'OCCU');
    expect(occu).toBeDefined();
    expect(occu?.date).toBe('1920');
    expect(occu?.value).toBe('Landwirt');
  });

  it('ist nach einer Neuanlage roundtrip-stabil (xml2 === xml1)', () => {
    const parsed = parseXMLText(FIX);
    parsed.db.individuals.get('I0001')!.events.push(makeEvent('OCCU', { seen: true, date: '1920' }));
    const xml1 = buildXMLText(parsed);
    const xml2 = buildXMLText(parseXMLText(xml1));
    expect(xml2).toBe(xml1);
  });
});

describe('BL-144: Event entfernen', () => {
  it('entfernt den <eventref> beim Owner und den verwaisten <event>-Record', () => {
    const parsed = parseXMLText(FIX);
    // I0001.death kommt aus E0001 (_e2, datestr). Leeren = entfernen.
    parsed.db.individuals.get('I0001')!.death = makeEvent('DEAT');

    const nach = applyDatabaseToXml(parsed.db, parsed.doc);
    expect(byId(nach, 'event', 'E0001')).toBeUndefined(); // verwaist → entfernt
    const person = personNode(nach, 'I0001')!;
    expect(eventrefHandles(person)).not.toContain('_e2');
    expect(eventrefHandles(person).length).toBe(2); // war 3
  });

  it('ist nach dem Entfernen roundtrip-stabil und wirklich weg', () => {
    const parsed = parseXMLText(FIX);
    parsed.db.individuals.get('I0001')!.death = makeEvent('DEAT');
    const xml1 = buildXMLText(parsed);
    expect(buildXMLText(parseXMLText(xml1))).toBe(xml1);
    const wieder = parseXMLText(xml1).db.individuals.get('I0001')!;
    expect(wieder.death.date).toBeNull();
    expect(wieder.death.datePhrase).toBe('');
  });
});

describe('BL-144: Zitat hinzufügen/entfernen an einem Event', () => {
  it('synthetisiert ein <citation>-Record und referenziert es am Event', () => {
    const parsed = parseXMLText(FIX);
    const citVorher = knoten(parsed.doc, 'citation').length;
    parsed.db.individuals.get('I0001')!.birth.citations.push(makeCitation('S0001', { page: 'Bl. 9', quay: 2 }));

    const nach = applyDatabaseToXml(parsed.db, parsed.doc);
    expect(knoten(nach, 'citation').length).toBe(citVorher + 1);
    const ev = byId(nach, 'event', 'E0000')!;
    expect(citationrefHandles(ev).length).toBe(2); // war 1 (_c1)
    // wieder einlesbar
    const wieder = parseXMLText(buildXMLText(parsed)).db.individuals.get('I0001')!;
    expect(wieder.birth.citations.some((c) => c.page === 'Bl. 9')).toBe(true);
  });

  it('entfernen an EINEM Owner lässt einen geteilten Zitat-Record stehen', () => {
    const parsed = parseXMLText(FIX);
    // _c1 hängt an birth-Event UND am Namen. Nur am Event entfernen.
    parsed.db.individuals.get('I0001')!.birth.citations = [];

    const nach = applyDatabaseToXml(parsed.db, parsed.doc);
    expect(byId(nach, 'citation', 'C0000')).toBeDefined(); // vom Namen noch referenziert
    const ev = byId(nach, 'event', 'E0000')!;
    expect(citationrefHandles(ev)).not.toContain('_c1');
    const person = personNode(nach, 'I0001')!;
    const name = person.children.find((c) => c.tag === 'name')!;
    expect(citationrefHandles(name)).toContain('_c1'); // am Namen unberührt
  });

  it('entfernen am LETZTEN Owner verwaist den Zitat-Record → weg', () => {
    const parsed = parseXMLText(FIX);
    const p = parsed.db.individuals.get('I0001')!;
    p.birth.citations = [];
    p.nameCitations = [];

    const nach = applyDatabaseToXml(parsed.db, parsed.doc);
    expect(byId(nach, 'citation', 'C0000')).toBeUndefined(); // kein Owner mehr → entfernt
    // C0001 (an der Heirat) bleibt unberührt
    expect(byId(nach, 'citation', 'C0001')).toBeDefined();
  });

  it('Zitat-Neuanlage am Event ist roundtrip-stabil', () => {
    const parsed = parseXMLText(FIX);
    parsed.db.individuals.get('I0001')!.birth.citations.push(makeCitation('S0001', { page: 'Bl. 9' }));
    const xml1 = buildXMLText(parsed);
    expect(buildXMLText(parseXMLText(xml1))).toBe(xml1);
  });
});
