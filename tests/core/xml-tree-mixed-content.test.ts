// tests/core/xml-tree-mixed-content.test.ts — BL-81: gemischter Inhalt geht nicht STILL
// verloren (LP-1, Spec 13 §6).
//
// Der Befund: `parseXml` erfasst Text und Kinder desselben Elements beide (`node.text`
// wird auch dann gefüllt, wenn Kinder folgen) — `serializeNode` gab im Kinder-Zweig aber
// nur die Kinder aus. Ein `<note>Hinweis<style/></note>` verlor beim Schreiben „Hinweis",
// ohne dass irgendetwas anschlug: der Roundtrip meldete `xml1 === xml2`, weil der zweite
// Durchlauf denselben Verlust erneut erzeugte. Genau die Fehlerart, gegen die LP-1 steht.
//
// Warum ABBRUCH und nicht Rettung: die Position des Textes relativ zu den Kindern ist im
// Modell gar nicht erfasst (`text` ist EIN String, Kinder eine Liste) — ein „Text vor die
// Kinder"-Ausweg schriebe ihn bei `<a><b/>Text</a>` an die falsche Stelle und erzeugte
// eine still FALSCHE Datei statt einer still unvollständigen. Das ist nicht besser,
// sondern schlechter. Solange die Struktur nicht ordnungserhaltend ist, ist die
// verweigerte Ausgabe die einzige Antwort, die keine Daten erfindet.
//
// Der Preis ist gemessen, nicht geschätzt: in beiden echten GRAMPS-Fixturen (5,7 MB,
// ~37.000 Elemente) kommt gemischter Inhalt NULL mal vor — der letzte Test hier hält das
// fest. Kippt diese Zahl, ist die Entscheidung neu zu treffen, nicht der Test zu lockern.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { parseXml, serializeXml, type XmlNode } from '../../core/interop/xml-tree';

function knoten(tag: string, text: string, kinder: XmlNode[] = []): XmlNode {
  return { tag, attrs: [], children: kinder, text };
}

describe('xml-tree: gemischter Inhalt (BL-81)', () => {
  it('erfasst beim Parsen Text UND Kinder desselben Elements', () => {
    // Der Parser ist nicht das Problem — er verliert nichts. Ohne diesen Fall wäre nicht
    // belegt, dass der Abbruch unten echte Daten schützt und nicht bloß einen Fall
    // abfängt, den der Parser ohnehin verwirft.
    const doc = parseXml('<a>Hinweis<b/></a>');
    expect(doc.root.text).toBe('Hinweis');
    expect(doc.root.children.map((c) => c.tag)).toEqual(['b']);
  });

  it('bricht beim Schreiben ab, statt den Text still fallen zu lassen', () => {
    const doc = { prolog: '', root: knoten('a', 'Hinweis', [knoten('b', '')]) };
    expect(() => serializeXml(doc)).toThrow(/gemischter Inhalt/i);
  });

  it('nennt in der Meldung Tag und Textauszug — ohne sie ist der Abbruch nicht handhabbar', () => {
    const doc = { prolog: '', root: knoten('note', 'verlorener Hinweistext', [knoten('style', '')]) };
    expect(() => serializeXml(doc)).toThrow(/note/);
    expect(() => serializeXml(doc)).toThrow(/verlorener Hinweistext/);
  });

  it('greift auch tief im Baum, nicht nur an der Wurzel', () => {
    const tief = knoten('database', '', [knoten('notes', '', [knoten('note', 'Text', [knoten('style', '')])])]);
    expect(() => serializeXml({ prolog: '', root: tief })).toThrow(/note/);
  });

  it('lässt reinen Text und reine Kinder unangetastet (kein Fehlalarm)', () => {
    const nurText = serializeXml({ prolog: '', root: knoten('a', 'X') });
    expect(nurText).toBe('<a>X</a>\n');
    const nurKinder = serializeXml({ prolog: '', root: knoten('a', '', [knoten('b', '')]) });
    expect(nurKinder).toBe('<a>\n  <b/>\n</a>\n');
  });

  it('behandelt Whitespace zwischen Kindern nicht als Text (sonst bräche jede echte Datei)', () => {
    // Der Parser verwirft whitespace-only Chunks bereits; dieser Fall hält fest, dass der
    // Abbruch daran NICHT hängen bleibt — sonst wäre er beim ersten eingerückten
    // GRAMPS-Dokument fällig und damit unbrauchbar.
    const doc = parseXml('<a>\n  <b/>\n  <c/>\n</a>');
    expect(doc.root.text).toBe('');
    expect(() => serializeXml(doc)).not.toThrow();
  });

  const FIXTURES = ['../fixtures/Unsere Familie.gramps', '../fixtures/mini.small.gramps'].map((f) =>
    join(__dirname, f),
  );

  it.skipIf(!FIXTURES.every(existsSync))(
    'echte GRAMPS-Dateien enthalten keinen gemischten Inhalt — die Messung, die den Abbruch trägt',
    () => {
      for (const pfad of FIXTURES) {
        const buf = readFileSync(pfad);
        const xml = buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf).toString('utf8') : buf.toString('utf8');
        const doc = parseXml(xml);
        const treffer: string[] = [];
        const lauf = (n: XmlNode): void => {
          if (n.text !== '' && n.children.length > 0) treffer.push(n.tag);
          for (const c of n.children) lauf(c);
        };
        lauf(doc.root);
        expect(treffer, `${pfad}: gemischter Inhalt gefunden — Entscheidung neu treffen`).toEqual([]);
      }
    },
  );
});
