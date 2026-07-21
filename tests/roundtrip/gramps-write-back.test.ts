// tests/roundtrip/gramps-write-back.test.ts — BL-80: der GRAMPS-Export schreibt den
// editierten `db`-Stand zurück (Spec 13 §6, Spec 14 §3.2).
//
// DER BEFUND. `buildXMLText` gab bislang ausschließlich den geparsten Baum wieder. Jede
// Änderung am Modell — Name, Geschlecht, Quelle, Notiz, gelöschte oder neue Person — war
// im Export nicht vorhanden. Das fiel nicht auf, weil der Roundtrip-Test genau das prüfte,
// was die Funktion tat: Baum rein, Baum raus, `xml1 === xml2`.
//
// DIE FORM DER LÖSUNG ist die der GEDCOM-Seite (`applyDatabaseToRoots`, ADR-v9-14) — kein
// zweites Konzept: unverändert ⇒ IDENTISCHER Knoten (kein Neuaufbau, also byte-treu),
// geändert ⇒ nur die erkannten Kind-Elemente frisch, alles Unbekannte bleibt an Ort und
// Stelle (INV-PT), neu ⇒ synthetisiert, gelöscht ⇒ entfernt. „Unverändert" wird durch
// ERNEUTE PROJEKTION des Original-Knotens erkannt, nicht durch ein Dirty-Flag.
//
// Der erste Test ist deshalb der wichtigste: er zeigt, dass das Write-Back am
// unveränderten Bestand NICHTS tut. Ein Write-Back, das Records neu aufbaut, „funktioniert"
// in den Änderungs-Tests genauso — und zerstört dabei die Roundtrip-Treue der 99 %
// unberührten Datensätze.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { parseXMLText, buildXMLText } from '../../core/interop';
import { makePerson, makeSource } from '../../core/model';

const MINI = readFileSync(join(__dirname, '../fixtures/mini.small.gramps'), 'utf8');
const GROSS = join(__dirname, '../fixtures/Unsere Familie.gramps');

function grosseFixture(): string {
  const buf = readFileSync(GROSS);
  return buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf).toString('utf8') : buf.toString('utf8');
}

/** Alle Knoten eines Tags im Baum (flach gesucht, für Zusicherungen über den Ausgang). */
function alle(xml: string, tag: string): string[] {
  return xml.split('\n').filter((z) => z.trim().startsWith(`<${tag}`));
}

describe('GRAMPS-Write-Back: unverändert bleibt unverändert', () => {
  it('gibt bei unangetastetem db exakt die Eingabe wieder (mini)', () => {
    const parsed = parseXMLText(MINI);
    expect(buildXMLText(parsed)).toBe(buildXMLText(parsed.doc));
  });

  it.skipIf(!existsSync(GROSS))('gibt bei unangetastetem db exakt die Eingabe wieder (5,7 MB)', () => {
    // Der eigentliche Wächter: 2894 Personen, 910 Familien, 8369 Zitate — kein einziger
    // Record darf durch das Write-Back auch nur ein Byte anders aussehen.
    const parsed = parseXMLText(grosseFixture());
    expect(buildXMLText(parsed)).toBe(buildXMLText(parsed.doc));
  });

  it('lässt Knoten unveränderter Records IDENTISCH (kein Neuaufbau)', () => {
    // Referenzgleichheit statt Textgleichheit: sie schließt aus, dass der Knoten neu
    // gebaut wurde und nur zufällig gleich aussieht.
    const parsed = parseXMLText(MINI);
    const vorher = knoten(parsed.doc, 'person');
    const nachher = knoten(applyWriteBack(parsed), 'person');
    expect(nachher[0]).toBe(vorher[0]);
  });
});

describe('GRAMPS-Write-Back: Änderungen kommen an', () => {
  it('schreibt einen geänderten Personennamen in <first>/<surname>', () => {
    const parsed = parseXMLText(MINI);
    const p = parsed.db.individuals.get('I0001')!;
    parsed.db.individuals.set(p.id, { ...p, given: 'Moritz', surname: 'Musterfrau' });

    const xml = buildXMLText(parsed);

    expect(xml).toContain('<first>Moritz</first>');
    expect(xml).toContain('<surname>Musterfrau</surname>');
    expect(xml).not.toContain('<first>Max</first>');
  });

  it('schreibt ein geändertes Geschlecht', () => {
    const parsed = parseXMLText(MINI);
    const p = parsed.db.individuals.get('I0001')!;
    parsed.db.individuals.set(p.id, { ...p, sex: 'F' });

    expect(buildXMLText(parsed)).toContain('<gender>F</gender>');
  });

  it('schreibt geänderte Quellen- und Notiz-Felder', () => {
    const parsed = parseXMLText(MINI);
    const s = parsed.db.sources.get('S0001')!;
    parsed.db.sources.set(s.id, { ...s, title: 'Kirchenbuch Ochtrup', author: 'Pfarrer Meyer' });
    const n = parsed.db.notes.get('N0000');
    if (n) parsed.db.notes.set(n.id, { ...n, text: 'Neuer Notiztext' });

    const xml = buildXMLText(parsed);

    expect(xml).toContain('<stitle>Kirchenbuch Ochtrup</stitle>');
    expect(xml).toContain('<sauthor>Pfarrer Meyer</sauthor>');
    if (n) expect(xml).toContain('<text>Neuer Notiztext</text>');
  });

  it('escaped geänderte Werte (ein Name mit & darf die Datei nicht zerlegen)', () => {
    const parsed = parseXMLText(MINI);
    const p = parsed.db.individuals.get('I0001')!;
    parsed.db.individuals.set(p.id, { ...p, surname: 'Meyer & Söhne <sic>' });

    const xml = buildXMLText(parsed);

    expect(xml).toContain('<surname>Meyer &amp; Söhne &lt;sic&gt;</surname>');
    // und bleibt wieder lesbar — der beste Beweis, dass nichts zerbrochen ist.
    expect(parseXMLText(xml).db.individuals.get('I0001')?.surname).toBe('Meyer & Söhne <sic>');
  });
});

describe('GRAMPS-Write-Back: die DTD-Reihenfolge hält', () => {
  it('fügt fehlende Elemente an der vorgeschriebenen Stelle ein, nicht am Blockanfang', () => {
    // Der Unterschied zur GEDCOM-Fassung: dort darf ein erkanntes Feld an die Position des
    // ersten erkannten Kindes wandern. GRAMPS hat eine DTD — `<sabbrev>` vor `<sauthor>`
    // oder `<childref>` vor `<eventref>` macht die Datei formal ungültig. Ohne diesen Test
    // fiele das erst bei GRAMPS selbst auf, nicht hier.
    const parsed = parseXMLText(MINI);
    const s = parsed.db.sources.get('S0001')!;
    parsed.db.sources.set(s.id, { ...s, author: 'Autor', abbr: 'Kurz', publisher: 'Verlag', repo: '_r1' });
    const p = parsed.db.individuals.get('I0001')!;
    parsed.db.individuals.set(p.id, { ...p, prefix: 'Dr.', nick: 'Maxi' });

    const xml = buildXMLText(parsed);
    const reihenfolge = (tags: string[]): number[] => tags.map((t) => xml.indexOf(`<${t}>`));
    const aufsteigend = (n: number[]): boolean => n.every((v, i) => v >= 0 && (i === 0 || v > n[i - 1]));

    expect(aufsteigend(reihenfolge(['stitle', 'sauthor', 'spubinfo', 'sabbrev']))).toBe(true);
    expect(xml.indexOf('<reporef')).toBeGreaterThan(xml.indexOf('<sabbrev>'));
    expect(aufsteigend(reihenfolge(['first', 'surname', 'title', 'nick']))).toBe(true);
  });
});

describe('GRAMPS-Write-Back: Passthrough bleibt (INV-PT)', () => {
  it.skipIf(!existsSync(GROSS))('behält unbekannte Kind-Elemente eines GEÄNDERTEN Records', () => {
    // `<person>` trägt in echten Dateien eventref/objref/attribute/citationref/childof —
    // nichts davon projiziert das Modell. Ein geänderter Name darf sie nicht mitnehmen.
    const parsed = parseXMLText(grosseFixture());
    const p = parsed.db.individuals.get('I0001')!;
    const vorher = zaehle(parsed.doc, 'I0001');
    parsed.db.individuals.set(p.id, { ...p, given: 'Geändert' });

    const xml = buildXMLText(parsed);
    const nachher = zaehle(parseXMLText(xml).doc, 'I0001');

    expect(nachher.eventref).toBe(vorher.eventref);
    expect(nachher.objref).toBe(vorher.objref);
    expect(nachher.citationref).toBe(vorher.citationref);
    expect(nachher.attribute).toBe(vorher.attribute);
  });
});

describe('GRAMPS-Write-Back: neu und gelöscht', () => {
  it('entfernt eine gelöschte Person aus dem Baum', () => {
    const parsed = parseXMLText(MINI);
    const vorher = alle(buildXMLText(parsed.doc), 'person').length;
    parsed.db.individuals.delete('I0001');

    const xml = buildXMLText(parsed);

    expect(alle(xml, 'person').length).toBe(vorher - 1);
    expect(xml).not.toContain('<first>Max</first>');
  });

  it('synthetisiert eine neue Person — mit Handle, und wieder einlesbar', () => {
    const parsed = parseXMLText(MINI);
    const neu = makePerson('I0042');
    neu.given = 'Neue';
    neu.surname = 'Person';
    neu.sex = 'F';
    parsed.db.individuals.set(neu.id, neu);

    const xml = buildXMLText(parsed);
    const wieder = parseXMLText(xml).db.individuals.get('I0042');

    expect(wieder).toBeDefined();
    expect(wieder?.given).toBe('Neue');
    expect(wieder?.surname).toBe('Person');
    expect(wieder?.sex).toBe('F');
    // Ohne Handle ist ein GRAMPS-Record nicht referenzierbar — GRAMPS selbst verlinkt
    // ausschließlich über Handles.
    expect(xml).toMatch(/<person handle="[^"]+"/);
  });

  it('ist ab der Neuanlage roundtrip-stabil (zweiter Durchlauf ändert nichts mehr)', () => {
    const parsed = parseXMLText(MINI);
    const s = makeSource('S0099');
    s.title = 'Neu angelegte Quelle';
    parsed.db.sources.set(s.id, s);

    const xml1 = buildXMLText(parsed);
    const xml2 = buildXMLText(parseXMLText(xml1));

    expect(xml2).toBe(xml1);
  });
});

// --- Helfer ----------------------------------------------------------------------------

import { applyDatabaseToXml } from '../../core/interop';
import type { GrampsParsed, XmlDocument, XmlNode } from '../../core/interop';

function applyWriteBack(parsed: GrampsParsed): XmlDocument {
  return applyDatabaseToXml(parsed.db, parsed.doc);
}

function knoten(doc: XmlDocument, tag: string): XmlNode[] {
  const out: XmlNode[] = [];
  const lauf = (n: XmlNode): void => {
    if (n.tag === tag) out.push(n);
    for (const c of n.children) lauf(c);
  };
  lauf(doc.root);
  return out;
}

/** Zählt die Kind-Tags des Personen-Knotens mit dieser id. */
function zaehle(doc: XmlDocument, id: string): Record<string, number> {
  const person = knoten(doc, 'person').find((p) => p.attrs.some(([k, v]) => k === 'id' && v === id));
  const out: Record<string, number> = {};
  for (const c of person?.children ?? []) out[c.tag] = (out[c.tag] ?? 0) + 1;
  return out;
}
