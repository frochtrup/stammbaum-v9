// tests/roundtrip/eval-roundtrip.test.ts — `_EVAL`-Wire-Format, GEDCOM + GRAMPS (BL-83).
//
// Spec 12 §3 (Evidenzmodell, 3 Achsen + Informant), Spec 13 §2.3 (modellierte vs. verbatim
// `_`-Tags), Spec 13 §5 (Strict strippt). Die Bewertung war bis hierher ein TOTES Modellfeld:
// `Citation.eval` existierte, aber kein Parser füllte und kein Writer schrieb sie — nur der
// Strict-Adapter kannte den Tag (zum Weglassen).
//
// Die tragende Regel (Spec 13 §2.3, `_REPO_MODELLED`-Lehre): wer einen bisher verbatim
// durchgereichten `_`-Tag MODELLIERT, muss ihn aus dem Passthrough HERAUSLÖSEN — sonst wächst
// pro Roundtrip ein zweiter Subtree nach (`net_delta≠0`). Deshalb prüft dieser Test nicht nur
// „kommt an", sondern zählt die Vorkommen NACH ZWEI Durchläufen.
//
// Wire-Struktur (aus dem echten v8-Orakel gelesen, nicht erfunden — CLAUDE.md TST-6-Wertebene):
//   GEDCOM (`gedcom-writer.js` `_writeSourCits`, nach QUAY, vor NOTE):
//     3 _EVAL                      (Zeile OHNE Wert)
//     4 _STYP original | 4 _INFO primary | 4 _EVID direct | 4 _INFM <Freitext>
//   GRAMPS (`gramps-writer.js`): die vier Achsen als Zitat-Attribut — v8 schrieb
//     `<attribute type="_STYP" …/>`, v9 schreibt das DTD-konforme `<srcattribute …/>`
//     und LIEST beide Formen (Register DEV-07).

import { describe, it, expect } from 'vitest';
import {
  parseGedcom,
  serializeGedcom,
  parseXMLText,
  buildXMLText,
  applyDatabaseToRoots,
} from '../../core/interop';
import { buildGrampsTreeFromModel } from '../../core/interop/build-gramps-from-model';
import { buildGedcomTreeFromModel } from '../../core/interop/build-gedcom-from-model';
import { serializeXml } from '../../core/interop/xml-tree';
import { makeEvidenceEval } from '../../core/research';
import type { Citation, Database } from '../../core/model/types';
import { assembleLines, calcNetDelta, firstDiff } from './roundtrip-helpers';

// ── Fixtures (inline, damit CI ohne die gitignorierten Privat-Fixturen läuft) ─────────────

const GED = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 5.5.1',
  '2 FORM LINEAGE-LINKED',
  '1 CHAR UTF-8',
  '0 @I1@ INDI',
  '1 NAME Max /Muster/',
  '1 BIRT',
  '2 DATE 12 MAR 1890',
  '2 SOUR @S1@',
  '3 PAGE 42',
  '3 QUAY 3',
  '3 _EVAL',
  '4 _STYP original',
  '4 _INFO primary',
  '4 _EVID direct',
  '4 _INFM Pfarrer Schmidt',
  '4 _FOO unbekanntes Kind der Bewertung',
  '3 NOTE Randbemerkung',
  '0 @S1@ SOUR',
  '1 TITL Kirchenbuch Ochtrup',
  '0 TRLR',
].join('\n');

/** GEDCOM ohne jede Bewertung — Ausgangspunkt für die Edit-Fälle. */
const GED_OHNE_EVAL = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 5.5.1',
  '0 @I1@ INDI',
  '1 NAME Max /Muster/',
  '1 BIRT',
  '2 SOUR @S1@',
  '3 PAGE 42',
  '0 @S1@ SOUR',
  '1 TITL Kirchenbuch Ochtrup',
  '0 TRLR',
].join('\n');

/** GRAMPS mit DTD-konformem `<srcattribute>` (so schreibt GRAMPS 6.x seine Zitat-Attribute). */
const GRAMPS = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<database xmlns="http://gramps-project.org/xml/1.7.2/">',
  '  <header>',
  '    <created date="2026-04-11" version="6.0.6"/>',
  '  </header>',
  '  <events>',
  '    <event handle="_e1" change="1" id="E0000">',
  '      <type>Birth</type>',
  '      <dateval val="1890-03-12"/>',
  '      <citationref hlink="_c1"/>',
  '    </event>',
  '  </events>',
  '  <people>',
  '    <person handle="_p1" change="1" id="I0001">',
  '      <gender>M</gender>',
  '      <name type="Birth Name">',
  '        <first>Max</first>',
  '        <surname>Muster</surname>',
  '      </name>',
  '      <eventref hlink="_e1" role="Primary"/>',
  '    </person>',
  '  </people>',
  '  <sources>',
  '    <source handle="_s1" change="1" id="S0001">',
  '      <stitle>Kirchenbuch Ochtrup</stitle>',
  '    </source>',
  '  </sources>',
  '  <citations>',
  '    <citation handle="_c1" change="1" id="C0000">',
  '      <page>S. 42</page>',
  '      <confidence>3</confidence>',
  '      <srcattribute type="EVEN" value="CHR"/>',
  '      <srcattribute type="_STYP" value="original"/>',
  '      <srcattribute type="_INFO" value="primary"/>',
  '      <srcattribute type="_EVID" value="direct"/>',
  '      <srcattribute type="_INFM" value="Pfarrer Schmidt"/>',
  '      <sourceref hlink="_s1"/>',
  '    </citation>',
  '  </citations>',
  '</database>',
].join('\n');

/** Dieselbe Datei in der v8-ALTFORM (`<attribute>` statt `<srcattribute>`, DTD-widrig). */
const GRAMPS_V8_ALTFORM = GRAMPS.replace(
  /<srcattribute type="(_STYP|_INFO|_EVID|_INFM)"/g,
  '<attribute type="$1"',
);

// ── Helfer ───────────────────────────────────────────────────────────────────────────────

function zaehle(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

/** Das eine Zitat am Geburts-Ereignis der Person (GEDCOM- wie GRAMPS-Modell). */
function birthCitation(db: Database, id: string): Citation {
  const p = db.individuals.get(id);
  if (!p) throw new Error(`Person ${id} fehlt`);
  return p.birth.citations[0];
}

/** Nicht-mutierender GEDCOM-Roundtrip über den WRITE-BACK-Pfad (db → roots → Text). */
function writeBack(doc: ReturnType<typeof parseGedcom>, format?: 'strict' | '7.0'): string {
  const roots = applyDatabaseToRoots(doc.db, doc.roots);
  return serializeGedcom({ db: doc.db, roots }, format ? { format } : {});
}

// ── 1. GEDCOM: Parse-Projektion ──────────────────────────────────────────────────────────

describe('BL-83 GEDCOM: `_EVAL`-Subtree → Citation.eval (Spec 12 §3)', () => {
  it('die drei Achsen + Informant landen im Modell', () => {
    const { db } = parseGedcom(GED);
    const ev = birthCitation(db, '@I1@').eval;
    expect(ev).not.toBeNull();
    expect(ev?.source).toBe('original');
    expect(ev?.information).toBe('primary');
    expect(ev?.evidence).toBe('direct');
    expect(ev?.informant).toBe('Pfarrer Schmidt');
  });

  it('ohne `_EVAL` bleibt eval null (kein leeres Gerüst, das der Writer ausgäbe)', () => {
    const { db } = parseGedcom(GED_OHNE_EVAL);
    expect(birthCitation(db, '@I1@').eval).toBeNull();
  });

  it('unbekannter Achsen-Wert fällt auf leer zurück statt ein fremdes Enum zu erfinden', () => {
    const { db } = parseGedcom(GED.replace('4 _STYP original', '4 _STYP phantasiewert'));
    expect(birthCitation(db, '@I1@').eval?.source).toBe('');
    // die übrigen Achsen bleiben unberührt
    expect(birthCitation(db, '@I1@').eval?.evidence).toBe('direct');
  });
});

// ── 2. GEDCOM: RT-1 / RT-2 / INV-PT ──────────────────────────────────────────────────────

describe('BL-83 GEDCOM: RT-1/RT-2/INV-PT auf der `_EVAL`-Fixture', () => {
  it('RT-1: out1 === out2 (Byte-Idempotenz)', () => {
    const out1 = serializeGedcom(parseGedcom(GED));
    const out2 = serializeGedcom(parseGedcom(out1));
    expect(firstDiff(out1, out2)).toBeNull();
    expect(out1).toBe(out2);
  });

  it('RT-2: net_delta === 0 gegen die Ur-Quelle', () => {
    expect(calcNetDelta(GED, serializeGedcom(parseGedcom(GED))).normDelta).toBe(0);
  });

  it('RT-1 über den Write-Back-Pfad (db → roots): out1 === out2, net_delta = 0', () => {
    const out1 = writeBack(parseGedcom(GED));
    const out2 = writeBack(parseGedcom(out1));
    expect(out1).toBe(out2);
    expect(calcNetDelta(GED, out1).normDelta).toBe(0);
  });

  it('INV-PT: das unbekannte `_EVAL`-Kind überlebt verbatim', () => {
    const out1 = writeBack(parseGedcom(GED));
    expect(assembleLines(out1)).toContain('4 _FOO unbekanntes Kind der Bewertung');
  });

  // DER Wächter (Spec 13 §2.3): würde `_EVAL` nur GELESEN, aber nicht aus dem Passthrough
  // herausgelöst, stünde nach dem zweiten Durchlauf ein zweiter Subtree in der Datei.
  it('kein Doppelschreiben: `_STYP` kommt nach ZWEI Roundtrips genau 1× vor', () => {
    const out1 = writeBack(parseGedcom(GED));
    const out2 = writeBack(parseGedcom(out1));
    expect(zaehle(out2, '_EVAL')).toBe(1);
    expect(zaehle(out2, '_STYP')).toBe(1);
    expect(zaehle(out2, '_INFO')).toBe(1);
    expect(zaehle(out2, '_EVID')).toBe(1);
    expect(zaehle(out2, '_INFM')).toBe(1);
  });
});

// ── 3. GEDCOM: Modell-Edit → Wire ────────────────────────────────────────────────────────

describe('BL-83 GEDCOM: Modell-Edit schreibt `_EVAL` (Write-Back)', () => {
  it('neu gesetzte Bewertung erscheint in kanonischer Reihenfolge nach QUAY, vor NOTE', () => {
    const doc = parseGedcom(GED_OHNE_EVAL);
    birthCitation(doc.db, '@I1@').eval = makeEvidenceEval({
      source: 'derivative',
      information: 'secondary',
      evidence: 'indirect',
      informant: 'Tante Erna',
    });
    const lines = assembleLines(writeBack(doc));
    const i = lines.indexOf('3 _EVAL');
    expect(i).toBeGreaterThan(-1);
    expect(lines.slice(i + 1, i + 5)).toEqual([
      '4 _STYP derivative',
      '4 _INFO secondary',
      '4 _EVID indirect',
      '4 _INFM Tante Erna',
    ]);
  });

  it('geänderte Achse wird geschrieben, nicht neben die alte gestellt', () => {
    const doc = parseGedcom(GED);
    birthCitation(doc.db, '@I1@').eval = makeEvidenceEval({ source: 'authored' });
    const out = writeBack(doc);
    expect(assembleLines(out)).toContain('4 _STYP authored');
    expect(zaehle(out, '_STYP')).toBe(1);
    // die weggefallenen Achsen sind weg — nicht als Leiche stehen geblieben
    expect(zaehle(out, '_EVID')).toBe(0);
    expect(zaehle(out, '_INFM')).toBe(0);
  });

  it('eval = null schreibt keine `_EVAL`-Zeile', () => {
    const doc = parseGedcom(GED);
    birthCitation(doc.db, '@I1@').eval = null;
    expect(zaehle(writeBack(doc), '_EVAL')).toBe(0);
  });

  it('LEERE Bewertung schreibt keine `_EVAL`-Zeile (sonst wüchse sie bei jedem Speichern)', () => {
    const doc = parseGedcom(GED_OHNE_EVAL);
    birthCitation(doc.db, '@I1@').eval = makeEvidenceEval();
    const out = writeBack(doc);
    expect(zaehle(out, '_EVAL')).toBe(0);
    expect(calcNetDelta(GED_OHNE_EVAL, out).normDelta).toBe(0);
  });

  it('nur der Informant gesetzt → `_EVAL` mit ausschließlich `_INFM`', () => {
    const doc = parseGedcom(GED_OHNE_EVAL);
    birthCitation(doc.db, '@I1@').eval = makeEvidenceEval({ informant: '@I9@' });
    const lines = assembleLines(writeBack(doc));
    expect(lines).toContain('3 _EVAL');
    expect(lines).toContain('4 _INFM @I9@');
    expect(lines.some((l) => l.startsWith('4 _STYP'))).toBe(false);
  });
});

// ── 4. Strict + GED7 ─────────────────────────────────────────────────────────────────────

describe('BL-83 GEDCOM: Strict strippt, GED7 behält (Spec 13 §4/§5)', () => {
  it('Strict-Export enthält weder `_EVAL` noch eine der vier Achsen', () => {
    const out = writeBack(parseGedcom(GED), 'strict');
    for (const t of ['_EVAL', '_STYP', '_INFO', '_EVID', '_INFM']) {
      expect(zaehle(out, t)).toBe(0);
    }
  });

  it('GED7 behält den Extension-Tag unverändert (kein Standard-Äquivalent)', () => {
    const lines = assembleLines(writeBack(parseGedcom(GED), '7.0'));
    expect(lines).toContain('3 _EVAL');
    expect(lines).toContain('4 _STYP original');
  });
});

// ── 5. GRAMPS ────────────────────────────────────────────────────────────────────────────

describe('BL-83 GRAMPS: `<srcattribute>`-Achsen ↔ Citation.eval (Spec 13 §6)', () => {
  it('die vier Achsen landen im Modell, fremde `<srcattribute>` bleiben unberührt', () => {
    const { db } = parseXMLText(GRAMPS);
    const ev = birthCitation(db, 'I0001').eval;
    expect(ev?.source).toBe('original');
    expect(ev?.information).toBe('primary');
    expect(ev?.evidence).toBe('direct');
    expect(ev?.informant).toBe('Pfarrer Schmidt');
    // `EVEN` ist keine Evidenz-Achse → bleibt Passthrough im Baum
    expect(buildXMLText(parseXMLText(GRAMPS))).toContain('<srcattribute type="EVEN" value="CHR"/>');
  });

  it('v8-Altform `<attribute type="_STYP">` wird ebenfalls gelesen (Register DEV-07)', () => {
    const { db } = parseXMLText(GRAMPS_V8_ALTFORM);
    expect(birthCitation(db, 'I0001').eval?.source).toBe('original');
    expect(birthCitation(db, 'I0001').eval?.informant).toBe('Pfarrer Schmidt');
  });

  it('RT-1: xml1 === xml2, und kein Doppeln nach zwei Durchläufen', () => {
    const xml1 = buildXMLText(parseXMLText(GRAMPS));
    const xml2 = buildXMLText(parseXMLText(xml1));
    expect(xml1).toBe(xml2);
    expect(zaehle(xml2, '"_STYP"')).toBe(1);
    expect(zaehle(xml2, '"_INFM"')).toBe(1);
  });

  it('Modell-Edit schreibt die Achsen als `<srcattribute>` vor `<sourceref>`', () => {
    const parsed = parseXMLText(GRAMPS_V8_ALTFORM);
    birthCitation(parsed.db, 'I0001').eval = makeEvidenceEval({
      source: 'authored',
      evidence: 'negative',
    });
    const xml = buildXMLText(parsed);
    expect(xml).toContain('<srcattribute type="_STYP" value="authored"/>');
    expect(xml).toContain('<srcattribute type="_EVID" value="negative"/>');
    // die weggefallenen Achsen verschwinden …
    expect(zaehle(xml, '"_INFO"')).toBe(0);
    expect(zaehle(xml, '"_INFM"')).toBe(0);
    // … und die DTD-widrige v8-Altform bleibt NICHT neben der neuen Zeile stehen
    expect(zaehle(xml, '<attribute type="_STYP"')).toBe(0);
    expect(zaehle(xml, '"_STYP"')).toBe(1);
    expect(xml.indexOf('type="_STYP"')).toBeLessThan(xml.indexOf('<sourceref'));
  });

  it('eval = null entfernt die Achsen aus dem Zitat', () => {
    const parsed = parseXMLText(GRAMPS);
    birthCitation(parsed.db, 'I0001').eval = null;
    const xml = buildXMLText(parsed);
    for (const t of ['_STYP', '_INFO', '_EVID', '_INFM']) expect(zaehle(xml, `"${t}"`)).toBe(0);
    expect(xml).toContain('<srcattribute type="EVEN" value="CHR"/>'); // Fremdes bleibt
  });

  it('leere Bewertung erzeugt kein `<srcattribute>` (xml1 === xml2 bleibt)', () => {
    const parsed = parseXMLText(GRAMPS);
    birthCitation(parsed.db, 'I0001').eval = makeEvidenceEval();
    const xml = buildXMLText(parsed);
    for (const t of ['_STYP', '_INFO', '_EVID', '_INFM']) expect(zaehle(xml, `"${t}"`)).toBe(0);
  });
});

// ── 6. Cross-Format (RT-4, Spec 13 §1.1) ─────────────────────────────────────────────────

describe('BL-83 Cross-Format: die Bewertung übersteht den Familienwechsel', () => {
  it('GEDCOM → GRAMPS → Modell: alle vier Achsen erhalten', () => {
    const { db } = parseGedcom(GED);
    const xml = serializeXml(buildGrampsTreeFromModel(db));
    expect(xml).toContain('<srcattribute type="_STYP" value="original"/>');
    const ev = birthCitation(parseXMLText(xml).db, 'I0001').eval;
    expect(ev?.source).toBe('original');
    expect(ev?.information).toBe('primary');
    expect(ev?.evidence).toBe('direct');
    expect(ev?.informant).toBe('Pfarrer Schmidt');
  });

  it('GRAMPS → GEDCOM → Modell: alle vier Achsen erhalten', () => {
    const { db } = parseXMLText(GRAMPS);
    const ged = serializeGedcom({ db, roots: buildGedcomTreeFromModel(db) });
    expect(assembleLines(ged)).toContain('4 _STYP original');
    const ev = birthCitation(parseGedcom(ged).db, '@I1@').eval;
    expect(ev?.source).toBe('original');
    expect(ev?.information).toBe('primary');
    expect(ev?.evidence).toBe('direct');
    expect(ev?.informant).toBe('Pfarrer Schmidt');
  });
});
