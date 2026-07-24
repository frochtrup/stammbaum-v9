// tests/roundtrip/gramps-write-back-events.test.ts — BL-142: GRAMPS-Write-Back für die
// GETEILTEN Top-Level-Records `<events>`/`<citations>` (Spec 13 §6, ADR-v9-114 D5).
//
// DER UNTERSCHIED ZU PERSON/QUELLE/NOTIZ. Jene sind BESESSENE Records — je ein `<person>`
// je Modell-Person, Schlüssel = `id`. Ereignisse und Zitate sind GETEILT: ein `<event>`
// wird per `<eventref role>` von mehreren Personen/Familien referenziert, ein `<citation>`
// per `<citationref>` von Event/Name/Person. Das Modell hält sie NICHT in einem eigenen
// Store, sondern verteilt unter `person.birth`/`events[]`/`family.marriage`/`event.citations`
// … . Deshalb trägt jedes Modell-`Event`/`Citation` seit BL-142 sein `grampsHandle`
// (Fidelity-Feld) — der einzige verlässliche Weg, ein geändertes Modell-Objekt wieder
// seinem `<events>`/`<citations>`-Record zuzuordnen (Positions-/Inhalts-Matching wäre fragil).
//
// DIE ROUNDTRIP-TREUE IST DAS KERNRISIKO (LP-1). Der wichtigste Test steht deshalb zuerst:
// am unangetasteten Bestand tut das Write-Back NICHTS — jeder Event-/Citation-Knoten bleibt
// IDENTISCH (byte-treu). Erst darauf folgen die Änderungs-Tests.
//
// SCOPE dieses Baus: das ROUND-TRIPPENDE BEARBEITEN vorhandener geteilter Records — Typ,
// Datum (via `gedcomToGramps`), Beschreibung am Event; Seite, Konfidenz (QUAY→confidence),
// Quelle am Zitat. Das HINZUFÜGEN/ENTFERNEN ganzer Events/Zitate am Owner (eventref-/
// citationref-Liste) ist bewusst NICHT Teil dieses Cuts (es berührt die Owner-Projektion,
// die laut ADR-v9-114 D5-Plan bei Name/Geschlecht/Links bleibt) — Folge-Backlog. Orts-Edits
// am Event bleiben Passthrough bis BL-143 (volle placeobj-Projektion, D3).
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { parseXMLText, buildXMLText, applyDatabaseToXml } from '../../core/interop';
import type { XmlDocument, XmlNode } from '../../core/interop';

const FIX = readFileSync(join(__dirname, '../fixtures/events-mini.small.gramps'), 'utf8');
const GROSS = join(__dirname, '../fixtures/Unsere Familie.gramps');

function grosseFixture(): string {
  const buf = readFileSync(GROSS);
  return buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf).toString('utf8') : buf.toString('utf8');
}

/** Alle Knoten eines Tags im Baum (rekursiv). */
function knoten(doc: XmlDocument, tag: string): XmlNode[] {
  const out: XmlNode[] = [];
  const lauf = (n: XmlNode): void => {
    if (n.tag === tag) out.push(n);
    for (const c of n.children) lauf(c);
  };
  lauf(doc.root);
  return out;
}

function eventById(doc: XmlDocument, id: string): XmlNode | undefined {
  return knoten(doc, 'event').find((e) => e.attrs.some(([k, v]) => k === 'id' && v === id));
}
function citationById(doc: XmlDocument, id: string): XmlNode | undefined {
  return knoten(doc, 'citation').find((c) => c.attrs.some(([k, v]) => k === 'id' && v === id));
}
function kindTags(n: XmlNode): string[] {
  return n.children.map((c) => c.tag);
}

describe('GRAMPS-Event/Zitat-Write-Back: unverändert bleibt byte-treu', () => {
  it('gibt bei unangetastetem db exakt die Eingabe wieder', () => {
    const parsed = parseXMLText(FIX);
    expect(buildXMLText(parsed)).toBe(buildXMLText(parsed.doc));
  });

  it('lässt Knoten unveränderter Events/Zitate IDENTISCH (kein Neuaufbau)', () => {
    // Referenzgleichheit: schließt aus, dass der Knoten neu gebaut wurde und nur zufällig
    // gleich aussieht. Das ist die eigentliche INV-PT/D5-Garantie für geteilte Records.
    const parsed = parseXMLText(FIX);
    const evVor = eventById(parsed.doc, 'E0000')!;
    const citVor = citationById(parsed.doc, 'C0000')!;
    const nach = applyDatabaseToXml(parsed.db, parsed.doc);
    expect(eventById(nach, 'E0000')).toBe(evVor);
    expect(citationById(nach, 'C0000')).toBe(citVor);
  });

  it.skipIf(!existsSync(GROSS))('lässt 6657 Events + 8369 Zitate der 5,7-MB-Datei byte-treu', () => {
    // Der eigentliche Wächter: kein einziger geteilter Record darf durch das nun aktive
    // Event-/Zitat-Write-Back auch nur ein Byte anders aussehen.
    const parsed = parseXMLText(grosseFixture());
    expect(buildXMLText(parsed)).toBe(buildXMLText(parsed.doc));
  });
});

describe('GRAMPS-Event-Write-Back: Änderungen am Event-Record kommen an', () => {
  it('schreibt ein geändertes Datum als <dateval> an seiner DTD-Stelle (nach <type>)', () => {
    const parsed = parseXMLText(FIX);
    parsed.db.individuals.get('I0001')!.birth.date = '20 DEC 1902';

    const nach = applyDatabaseToXml(parsed.db, parsed.doc);
    const ev = eventById(nach, 'E0000')!;

    expect(kindTags(ev)).toEqual(['type', 'dateval', 'place', 'description', 'citationref']);
    const dv = ev.children.find((c) => c.tag === 'dateval')!;
    expect(dv.attrs).toContainEqual(['val', '1902-12-20']);
  });

  it('wandelt den Datums-TYP, wenn der Modifier es verlangt (dateval → daterange)', () => {
    const parsed = parseXMLText(FIX);
    parsed.db.individuals.get('I0001')!.birth.date = 'BET 1901 AND 1903';

    const ev = eventById(applyDatabaseToXml(parsed.db, parsed.doc), 'E0000')!;
    expect(ev.children.some((c) => c.tag === 'daterange')).toBe(true);
    expect(ev.children.some((c) => c.tag === 'dateval')).toBe(false);
    const dr = ev.children.find((c) => c.tag === 'daterange')!;
    expect(dr.attrs).toContainEqual(['start', '1901']);
    expect(dr.attrs).toContainEqual(['stop', '1903']);
  });

  it('wandelt Freitext (datestr) in ein echtes Datum (dateval), wenn date gesetzt wird', () => {
    const parsed = parseXMLText(FIX);
    const p = parsed.db.individuals.get('I0001')!;
    p.death.date = '3 MAY 1955';
    p.death.datePhrase = '';

    const ev = eventById(applyDatabaseToXml(parsed.db, parsed.doc), 'E0001')!;
    expect(ev.children.some((c) => c.tag === 'datestr')).toBe(false);
    const dv = ev.children.find((c) => c.tag === 'dateval')!;
    expect(dv.attrs).toContainEqual(['val', '1955-05-03']);
  });

  it('schreibt einen geänderten Ereignistyp in <type> (custom EVEN nutzt eventType wörtlich)', () => {
    const parsed = parseXMLText(FIX);
    const custom = parsed.db.individuals.get('I0001')!.events.find((e) => e.grampsHandle === '_e3')!;
    custom.eventType = 'Beruf';

    const ev = eventById(applyDatabaseToXml(parsed.db, parsed.doc), 'E0002')!;
    expect(ev.children.find((c) => c.tag === 'type')!.text).toBe('Beruf');
  });

  it('schreibt eine geänderte Beschreibung in <description>', () => {
    const parsed = parseXMLText(FIX);
    parsed.db.individuals.get('I0001')!.birth.value = 'abends';

    const ev = eventById(applyDatabaseToXml(parsed.db, parsed.doc), 'E0000')!;
    expect(ev.children.find((c) => c.tag === 'description')!.text).toBe('abends');
  });

  it('schreibt ein geändertes Familien-Ereignis (Marriage-Datum)', () => {
    const parsed = parseXMLText(FIX);
    parsed.db.families.get('F0001')!.marriage.date = '2 JUN 1925';

    const ev = eventById(applyDatabaseToXml(parsed.db, parsed.doc), 'E0003')!;
    expect(ev.children.find((c) => c.tag === 'dateval')!.attrs).toContainEqual(['val', '1925-06-02']);
  });

  it('behält unbekannte/passthrough-Kinder eines GEÄNDERTEN Events (INV-PT)', () => {
    const parsed = parseXMLText(FIX);
    // E0002 trägt ein <_fremdtag foo="bar"/> — ein Datums-Edit darf es nicht mitnehmen.
    parsed.db.individuals.get('I0001')!.events.find((e) => e.grampsHandle === '_e3')!.date = '1931';

    const ev = eventById(applyDatabaseToXml(parsed.db, parsed.doc), 'E0002')!;
    expect(ev.children.some((c) => c.tag === '_fremdtag')).toBe(true);
    // E0000: place + citationref bleiben bei einem Beschreibungs-Edit erhalten.
    parsed.db.individuals.get('I0001')!.birth.value = 'x';
    const bev = eventById(applyDatabaseToXml(parsed.db, parsed.doc), 'E0000')!;
    expect(bev.children.some((c) => c.tag === 'place')).toBe(true);
    expect(bev.children.some((c) => c.tag === 'citationref')).toBe(true);
  });
});

describe('GRAMPS-Zitat-Write-Back: Änderungen am Zitat-Record kommen an', () => {
  it('schreibt eine geänderte Seite in <page>', () => {
    const parsed = parseXMLText(FIX);
    parsed.db.individuals.get('I0001')!.birth.citations[0].page = 'Bl. 7';

    const cit = citationById(applyDatabaseToXml(parsed.db, parsed.doc), 'C0000')!;
    expect(cit.children.find((c) => c.tag === 'page')!.text).toBe('Bl. 7');
  });

  it('schreibt eine geänderte QUAY als <confidence> (min-Abbildung D4)', () => {
    const parsed = parseXMLText(FIX);
    // C0001 (quay 2) → 1
    parsed.db.families.get('F0001')!.marriage.citations[0].quay = 1;

    const cit = citationById(applyDatabaseToXml(parsed.db, parsed.doc), 'C0001')!;
    expect(cit.children.find((c) => c.tag === 'confidence')!.text).toBe('1');
  });

  it('behält Datum/Passthrough eines GEÄNDERTEN Zitats (INV-PT)', () => {
    const parsed = parseXMLText(FIX);
    // C0000 trägt ein <dateval> (nicht ins Modell projiziert) — ein Seiten-Edit erhält es.
    parsed.db.individuals.get('I0001')!.birth.citations[0].page = 'neu';

    const cit = citationById(applyDatabaseToXml(parsed.db, parsed.doc), 'C0000')!;
    expect(cit.children.some((c) => c.tag === 'dateval')).toBe(true);
    expect(cit.children.some((c) => c.tag === 'sourceref')).toBe(true);
  });

  it('ein Event-Edit lässt den Zitat-Record unangetastet und umgekehrt', () => {
    const parsed = parseXMLText(FIX);
    const citVor = citationById(parsed.doc, 'C0000')!;
    parsed.db.individuals.get('I0001')!.birth.date = '1 JAN 1900';

    const nach = applyDatabaseToXml(parsed.db, parsed.doc);
    expect(citationById(nach, 'C0000')).toBe(citVor); // identisch — nicht angefasst
  });
});

describe('GRAMPS-Event/Zitat-Write-Back: idempotent nach Edit', () => {
  it('zweiter Durchlauf nach einem Datums-Edit ändert nichts mehr (xml2 === xml1)', () => {
    const parsed = parseXMLText(FIX);
    parsed.db.individuals.get('I0001')!.birth.date = '20 DEC 1902';

    const xml1 = buildXMLText(parsed);
    const xml2 = buildXMLText(parseXMLText(xml1));
    expect(xml2).toBe(xml1);
  });

  it('ein Datums-Edit ist nach Re-Parse tatsächlich angekommen (Roundtrip der Bearbeitung)', () => {
    const parsed = parseXMLText(FIX);
    parsed.db.individuals.get('I0001')!.birth.date = '20 DEC 1902';

    const wieder = parseXMLText(buildXMLText(parsed));
    expect(wieder.db.individuals.get('I0001')!.birth.date).toBe('20 DEC 1902');
  });
});
