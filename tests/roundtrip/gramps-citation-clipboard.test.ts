// tests/roundtrip/gramps-citation-clipboard.test.ts — BL-234: die Quellreferenz-
// Zwischenablage muss GRAMPS-konform bleiben (Spec 13 §6, ADR-v9-114).
//
// Das Kernrisiko liegt nicht in der UI, sondern in `grampsId`. Ein `<citation>` ist in
// GRAMPS ein GETEILTER Record: dieselbe Fundstelle an einem zweiten Ereignis ist dort EIN
// Record mit zwei `<citationref>`-Besitzern. Eine eingefügte Zitation, die ihre `grampsId`
// abgäbe, erzeugte einen zweiten Record mit identischem Inhalt — eine Dublette, die GRAMPS
// selbst nie schriebe (Nutzer-Vorgabe 2026-08-12).
//
// Die Kehrseite ist genauso wichtig: wird die eingefügte Zeile GEÄNDERT, ist sie nicht mehr
// dieselbe Fundstelle. Behielte sie die id, schriebe ihr Edit den geteilten Record um —
// und damit auch die Zeile, aus der kopiert wurde. `abgeloest()` löst sie deshalb, die
// Sektion ruft es beim ersten Edit (s. `EventCitationsSection.svelte`).
//
// Beide Hälften werden hier am echten Write-Back gemessen, nicht an der Absicht.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseXMLText, buildXMLText, applyDatabaseToXml } from '../../core/interop';
import { addCitationFrom, abgeloest, setCitationPageAt } from '../../ui/shell/event-edit-citations';
import type { XmlDocument, XmlNode } from '../../core/interop';

const FIX = readFileSync(join(__dirname, '../fixtures/events-mini.small.gramps'), 'utf8');

function knoten(doc: XmlDocument, tag: string): XmlNode[] {
  const out: XmlNode[] = [];
  const lauf = (n: XmlNode): void => {
    if (n.tag === tag) out.push(n);
    for (const c of n.children) lauf(c);
  };
  lauf(doc.root);
  return out;
}
function byId(doc: XmlDocument, tag: string, id: string): XmlNode | undefined {
  return knoten(doc, tag).find((n) => n.attrs.some(([k, v]) => k === 'id' && v === id));
}
function text(n: XmlNode | undefined, tag: string): string {
  return n?.children.find((c) => c.tag === tag)?.text ?? '';
}
/** Alle `<citationref hlink>` der Datei — je Besitzer einer, geteilte Records tauchen
 *  mehrfach auf. */
function alleCitationRefs(doc: XmlDocument): string[] {
  return knoten(doc, 'citationref').map((c) => c.attrs.find(([k]) => k === 'hlink')![1]);
}
/** Handle des `<citation>`-Records mit dieser id. */
function handleVon(doc: XmlDocument, id: string): string {
  return byId(doc, 'citation', id)!.attrs.find(([k]) => k === 'handle')![1];
}

// Das Geburts-Ereignis E0000 trägt C0000 („S. 42", confidence 4), das Heirats-Ereignis
// E0003 trägt C0001. Kopiert wird C0000 von der Geburt auf die Heirat.
function fixtureMitEingefuegtemZitat() {
  const parsed = parseXMLText(FIX);
  const person = parsed.db.individuals.get('I0001')!;
  const geburt = person.birth;
  expect(geburt.citations).toHaveLength(1);
  expect(geburt.citations[0].grampsId).toBe('C0000');

  // Genau das, was die Ablage tut: tiefe Kopie ablegen, an anderer Stelle einfügen.
  const abgelegt = { ...geburt.citations[0], media: geburt.citations[0].media.map((m) => ({ ...m })) };
  const familie = parsed.db.families.get('F0001')!;
  const heirat = familie.events.find((e) => e.type === 'MARR') ?? familie.marriage;
  heirat.citations = addCitationFrom(heirat.citations, abgelegt);
  return { parsed, heirat };
}

describe('BL-234: die unveränderte Einfügung ist EIN geteilter Record, keine Dublette', () => {
  it('legt keinen zweiten <citation>-Record an und referenziert denselben Record zweimal', () => {
    const parsed = parseXMLText(FIX);
    const vorherRecords = knoten(parsed.doc, 'citation').length;
    const vorherRefs = alleCitationRefs(parsed.doc).length;

    const { parsed: mit } = fixtureMitEingefuegtemZitat();
    const nach = applyDatabaseToXml(mit.db, mit.doc);

    // Ein Besitzer mehr, aber KEIN Record mehr — genau das macht GRAMPS beim Teilen.
    expect(knoten(nach, 'citation').length).toBe(vorherRecords);
    expect(alleCitationRefs(nach).length).toBe(vorherRefs + 1);

    const h = handleVon(nach, 'C0000');
    expect(alleCitationRefs(nach).filter((x) => x === h)).toHaveLength(3); // Name, Geburt, Heirat
  });

  it('lässt den geteilten Record inhaltlich unangetastet', () => {
    const { parsed } = fixtureMitEingefuegtemZitat();
    const nach = applyDatabaseToXml(parsed.db, parsed.doc);

    const rec = byId(nach, 'citation', 'C0000')!;
    expect(text(rec, 'page')).toBe('S. 42');
    // `confidence` 4 ist in GEDCOM nicht abbildbar (D4, 4→3) und darf durch ein reines
    // Einfügen anderswo nicht herabgestuft werden.
    expect(text(rec, 'confidence')).toBe('4');
  });

  it('bleibt beim zweiten Schreiben stabil (out1 === out2)', () => {
    const { parsed } = fixtureMitEingefuegtemZitat();
    const eins = buildXMLText(applyDatabaseToXml(parsed.db, parsed.doc));

    const wieder = parseXMLText(eins);
    const zwei = buildXMLText(applyDatabaseToXml(wieder.db, wieder.doc));
    expect(zwei).toBe(eins);
  });
});

describe('BL-234: die GEÄNDERTE Einfügung löst sich vom geteilten Record', () => {
  it('bekommt einen eigenen Record und lässt den ursprünglichen unverändert', () => {
    const { parsed, heirat } = fixtureMitEingefuegtemZitat();
    const vorherRecords = knoten(parsed.doc, 'citation').length;

    // Was `EventCitationsSection` beim ersten Edit der eingefügten Zeile tut.
    const idx = heirat.citations.length - 1;
    heirat.citations = setCitationPageAt(heirat.citations, idx, 'S. 43').map((c, i) =>
      i === idx ? abgeloest(c) : c,
    );

    const nach = applyDatabaseToXml(parsed.db, parsed.doc);

    expect(knoten(nach, 'citation').length).toBe(vorherRecords + 1);
    // Der ursprüngliche Record trägt weiter seine eigene Seite …
    expect(text(byId(nach, 'citation', 'C0000'), 'page')).toBe('S. 42');
    // … und irgendein Record trägt die neue.
    const seiten = knoten(nach, 'citation').map((c) => text(c, 'page'));
    expect(seiten).toContain('S. 43');
  });
});
