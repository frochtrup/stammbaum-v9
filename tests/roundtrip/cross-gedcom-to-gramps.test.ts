// tests/roundtrip/cross-gedcom-to-gramps.test.ts — RT-4 Cross-Family: GEDCOM → Modell →
// GRAMPS → Modell' (BL-158, ADR-v9-127). Metrik = Modell-Äquivalenz (modelEquiv), NICHT
// Byte — über Familiengrenzen ist Byte-Gleichheit unmöglich (Entscheidung 3). Der native
// GRAMPS-Roundtrip (xml1===xml2) ist ein SEPARATES, unberührtes Gate (Entscheidung 1).
//
// ── Beweisführung (kein blindes Allow-List): Die verbleibenden modelEquiv-Diffs sind
// AUSSCHLIESSLICH die dokumentierten Repräsentations-/Coverage-Transformationen GEDCOM↔GRAMPS
// (BL-155-Report; Schliessen = BL-162). Statt diese Diffs pauschal zu erlauben (das würde
// echten Verlust verdecken), wird jede benannte Transformation auf BEIDEN Seiten NEUTRALISIERT
// — und danach MUSS modelEquiv LEER sein. So ist bewiesen, dass es KEINEN Diff ausserhalb der
// benannten Kategorien gibt (jeder unerwartete Verlust liesse den Test scheitern).
//
// Verbleibende, benannte Abweichungen (GEDCOM → GRAMPS), alle „darf abweichen" (Entscheidung 3):
//   A. person.name — GEDCOM trägt eine formatierte NAME-Zeile („Dr.-Ing. Franz /Decker/",
//      „Emil Bernard /Decker/"); GRAMPS hat kein Voll-Namensfeld und REKONSTRUIERT
//      `given /surname/` (Titel/Präfix + Komma-vs-Leerzeichen der Vornamen gehen im String
//      verloren — die Namens-TEILE given/surname/prefix/suffix bleiben erhalten).
//   B. event.eventType (TYPE-Verfeinerung auf Standard-Tags) — GEDCOM `2 TYPE Fichtenweg 6`
//      unter `1 RESI`; GRAMPS' Typ-Vokabular kennt keine Sub-Typisierung → die Verfeinerung
//      fällt weg (Tag/Datum/Ort/Wert bleiben). Sonderfall: ein Custom-`EVEN` mit eventType =
//      GRAMPS-Built-in-Name („Marriage") kollabiert auf diesen Tag (MARR) — inhärente
//      Vokabular-Ambiguität.
//   C. place-Records — GEDCOM hat KEINE Ort-Records (Inline-String am Event); GRAMPS verlangt
//      Top-Level-`<placeobj>` → aus den distinkten event.place-Strings synthetisiert. Der
//      Orts-STRING (event.place) round-trippt (über ptitle); nur die Records-Sammlung ist neu.
//   D. person.childOf / person.parentIn — der GRAMPS-Parser projiziert Familien-Links NICHT
//      person-seitig zurück (die Wahrheit steht family-seitig in father/mother/childref und
//      round-trippt).
//   E. person.suffix — vom GRAMPS-Parser nicht in die Projektion gelesen.
//   F. person.noteText / family.noteText — GRAMPS hält Notizen als eigene Records (noteref),
//      nicht als Inline-Text; der Parser projiziert sie nicht zurück in den Owner-Text.
//   G. source.date / source.text / source.callNumber — kein direktes `<source>`-Gegenstück.
//   H. repository.address / repository.email — das komplexe GRAMPS-`<address>`-Element wird
//      nicht projiziert (da repoSig die Adresse einschliesst, kann ein Repo als Ganzes
//      unpaarbar werden — dieselbe Ursache).
//   I. Datums-Qualifier `INT` (interpretiertes Datum) — GRAMPS' Datumsmodell kennt die
//      GEDCOM-Konstruktion `INT <date> (<phrase>)` nicht → der Qualifier fällt weg (selten).
//
// Coverage-Grenzen dokumentiert in Spec 13 §1.1; Schliessen ist BL-162 (nicht BL-158).

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseGedcom, parseXMLText, serializeXml, modelEquiv, type Diff } from '../../core/interop';
import { buildGrampsTreeFromModel } from '../../core/interop/build-gramps-from-model';
import { GRAMPS_BY_TAG, TAG_BY_GRAMPS } from '../../core/interop/enum-maps';
import type { Database, Event } from '../../core/model/types';

const MINI = readFileSync(join(__dirname, '../fixtures/mini.small.ged'), 'utf8');
const ANCESTRIS = join(__dirname, '../fixtures/MeineDaten_ancestris.ged');
const hasAncestris = existsSync(ANCESTRIS);

/** GEDCOM-Text → GRAMPS-Baum → re-parst → { db (Quelle), db2 (nach Cross-Roundtrip), xml }. */
function crossToGramps(ged: string) {
  const { db } = parseGedcom(ged);
  const xml = serializeXml(buildGrampsTreeFromModel(db));
  const { db: db2 } = parseXMLText(xml);
  return { db, db2, xml };
}

// ── Neutralisierung der benannten Transformationen (A–I) ─────────────────────────────────────

function neutralizeEvent(e: Event): void {
  // B (Sonderfall): Custom-EVEN mit Built-in-Namen kollabiert auf den Tag (MARR/OCCU/…).
  if ((e.type === 'EVEN' || e.type === 'FACT') && TAG_BY_GRAMPS[e.eventType]) {
    e.type = TAG_BY_GRAMPS[e.eventType];
    e.eventType = '';
  }
  // B: TYPE-Verfeinerung auf einem Standard-Tag fällt weg.
  if (GRAMPS_BY_TAG[e.type]) e.eventType = '';
  // I: `INT`-Qualifier (interpretiertes Datum) — Präfix + optionale Phrase entfernen.
  if (e.date && /^INT\s+/i.test(e.date)) e.date = e.date.replace(/^INT\s+/i, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
}

function neutralize(db: Database): void {
  db.placeObjects.clear(); // C: Ort-Records-Sammlung (event.place round-trippt separat)
  db.hofObjects.clear();
  for (const p of db.individuals.values()) {
    p.name = `${p.given} /${p.surname}/`.trim(); // A
    p.suffix = ''; // E
    p.childOf = []; p.parentIn = []; // D
    p.noteText = ''; // F
    for (const e of [p.birth, p.chr, p.death, p.buri, ...p.events]) neutralizeEvent(e);
  }
  for (const f of db.families.values()) {
    f.noteText = ''; // F
    for (const e of [f.marriage, f.engagement, ...f.events]) neutralizeEvent(e);
  }
  for (const s of db.sources.values()) { s.date = ''; s.text = ''; s.callNumber = ''; } // G
  for (const r of db.repositories.values()) { r.address = ''; r.email = ''; } // H
}

function summarize(diffs: Diff[]): Record<string, number> {
  const by: Record<string, number> = {};
  for (const d of diffs) {
    const k = `${d.entity}.${d.path || '(entity)'}`;
    by[k] = (by[k] ?? 0) + 1;
  }
  return by;
}

/** Grob-Kategorie eines Roh-Diffs (nur für den DoD-Bericht — nicht das Gate). */
function category(d: Diff): string {
  if (d.entity === 'place') return 'C place-records';
  if (d.entity === 'repository') return 'H repo-address';
  if (d.entity === 'person' && d.path === '') return 'A person.name (sig-cascade)';
  if (d.entity === 'family' && d.path === '') return 'A/I family sig-cascade';
  if (d.path.startsWith('events[')) return 'B eventType-refinement';
  if (d.path === 'childOf' || d.path === 'parentIn') return 'D person family-links';
  if (d.path === 'suffix') return 'E person.suffix';
  if (d.path === 'noteText') return 'F noteText';
  if (['date', 'text', 'callNumber'].includes(d.path)) return 'G source-fields';
  if (d.path === 'children') return 'A/I children sig-cascade';
  return `? ${d.entity}.${d.path}`;
}

function report(label: string, db: Database, db2: Database): void {
  const raw = modelEquiv(db, db2);
  const byCat: Record<string, number> = {};
  for (const d of raw) byCat[category(d)] = (byCat[category(d)] ?? 0) + 1;
  const unexplained = raw.filter((d) => category(d).startsWith('?'));
  console.log(`${label}: modelEquiv roh=${raw.length}`, byCat, unexplained.length ? summarize(unexplained) : '');
}

describe('RT-4 Cross-Family GEDCOM→GRAMPS (BL-158)', () => {
  it('Mini: Kern-Daten kommen an; Restdiffs nur dokumentiert', () => {
    const { db, db2 } = crossToGramps(MINI);
    expect(db2.individuals.size).toBe(db.individuals.size);
    expect(db2.sources.size).toBe(db.sources.size);
    expect(db2.notes.size).toBe(db.notes.size);
    report('MINI', db, db2);
    neutralize(db); neutralize(db2);
    expect(modelEquiv(db, db2)).toEqual([]); // nach Neutralisierung KEIN Rest → nichts anderes verloren
  });

  it('Mini: erzeugter GRAMPS-Baum ist selbst-idempotent (xml1===xml2)', () => {
    const { xml } = crossToGramps(MINI);
    const xml2 = serializeXml(parseXMLText(xml).doc);
    expect(xml).toBe(xml2);
  });

  it.skipIf(!hasAncestris)('Ancestris (Orakel, 2795 Pers.): nur dokumentierte Repräsentations-Diffs', () => {
    const { db, db2, xml } = crossToGramps(readFileSync(ANCESTRIS, 'utf8'));
    // Vollständigkeit: keine Entität verloren/erfunden.
    expect(db2.individuals.size).toBe(db.individuals.size);
    expect(db2.families.size).toBe(db.families.size);
    expect(db2.sources.size).toBe(db.sources.size);
    // Selbst-Idempotenz des erzeugten Baums (GRAMPS-nativer Roundtrip auf dem Cross-Output).
    expect(serializeXml(parseXMLText(xml).doc)).toBe(xml);
    report('ANCESTRIS', db, db2);
    // Das Gate: nach Neutralisierung der benannten Transformationen ist NICHTS übrig.
    neutralize(db); neutralize(db2);
    const rest = modelEquiv(db, db2);
    if (rest.length) console.log('UNERWARTET übrig:', summarize(rest), rest.slice(0, 10));
    expect(rest).toEqual([]);
  });
});
