// tests/roundtrip/cross-family.test.ts — RT-4-Gate (ADR-v9-127, BL-159).
//
// Das Abnahme-Gate der Cross-Family-Emission: `Format A → Modell → Format B → Modell'`
// ⇒ `Modell ≈ Modell'` in BEIDE Richtungen, an Klein- + Realdaten-Fixtures. Die Metrik ist
// Modell-Äquivalenz (`modelEquiv`), NICHT Byte (über Familiengrenzen unmöglich).
//
// Zwei komplementäre Beweisebenen:
//   (1) SIGNATUR-FREIE Struktur-Invarianten (Entitätszahlen, family.children-/husband-/wife-/
//       events-Summen, given+surname-Multiset) — beweisen KEINEN Bulk-Verlust unabhängig von
//       jeder Paarungs-Signatur. Das ist die harte Garantie.
//   (2) `modelEquiv` minus die DOKUMENTIERTEN Repräsentations-/Format-Kategorien (ADR-v9-127
//       E3, §1.1) ⇒ substantieller Rest = []. Belegt, dass außerhalb der bewusst erlaubten
//       Grenzen NICHTS abweicht (keine Allow-List versteckt echten Verlust).
//
// Die per-Richtung-Detailtests (cross-gramps-to-gedcom / cross-gedcom-to-gramps, BL-157/158)
// bleiben als granulare Belege bestehen; dieses Gate ist die bidirektionale Klammer.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { parseGedcom, serializeGedcom } from '../../core/interop';
import { parseXMLText } from '../../core/interop/gramps';
import { serializeXml } from '../../core/interop/xml-tree';
import { buildGedcomTreeFromModel } from '../../core/interop/build-gedcom-from-model';
import { buildGrampsTreeFromModel } from '../../core/interop/build-gramps-from-model';
import { modelEquiv, type Diff } from '../../core/interop/model-equiv';
import type { Database, Person } from '../../core/model/types';

const FX = (n: string) => join(__dirname, '../fixtures', n);
const gedToDb = (path: string): Database => parseGedcom(readFileSync(path, 'latin1')).db;
function grampsToDb(path: string): Database {
  let buf = readFileSync(path);
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = Buffer.from(gunzipSync(buf));
  return parseXMLText(buf.toString('utf8')).db;
}

// A→GRAMPS→A': db durch die GRAMPS-Synthese und zurück ins Modell.
const throughGramps = (db: Database): Database =>
  parseXMLText(serializeXml(buildGrampsTreeFromModel(db))).db;
// A→GEDCOM→A': db durch die GEDCOM-Synthese und zurück ins Modell.
const throughGedcom = (db: Database): Database =>
  parseGedcom(serializeGedcom({ db, roots: buildGedcomTreeFromModel(db) }, { format: '5.5.1' })).db;

// ── (1) Signatur-freie Struktur-Invarianten ──────────────────────────────────
const sum = <V>(m: Map<string, V>, f: (x: V) => number): number =>
  [...m.values()].reduce((acc, x) => acc + f(x), 0);
const nameMultiset = (db: Database, f: (p: Person) => string): string =>
  [...db.individuals.values()].map(f).sort().join(' ');

function expectNoStructuralLoss(a: Database, b: Database): void {
  expect(b.individuals.size).toBe(a.individuals.size);
  expect(b.families.size).toBe(a.families.size);
  expect(b.sources.size).toBe(a.sources.size);
  // family-seitige Beziehungswahrheit (person.childOf/parentIn ist eine format-abhängige
  // Projektion — GRAMPS trägt sie nativ NUR family-seitig, s. §1.1):
  expect(sum(b.families, (f) => f.children.length)).toBe(sum(a.families, (f) => f.children.length));
  expect(sum(b.families, (f) => (f.husband ? 1 : 0))).toBe(sum(a.families, (f) => (f.husband ? 1 : 0)));
  expect(sum(b.families, (f) => (f.wife ? 1 : 0))).toBe(sum(a.families, (f) => (f.wife ? 1 : 0)));
  expect(sum(b.individuals, (p) => p.events.length)).toBe(sum(a.individuals, (p) => p.events.length));
  // Namens-TEILE erhalten (der zusammengesetzte NAME-String darf format-spezifisch abweichen):
  expect(nameMultiset(b, (p) => p.given)).toBe(nameMultiset(a, (p) => p.given));
  expect(nameMultiset(b, (p) => p.surname)).toBe(nameMultiset(a, (p) => p.surname));
}

// ── (2) Dokumentierte Repräsentations-/Format-Kategorien (DÜRFEN abweichen) ────
// Jede Zeile ist eine bewusst erlaubte Grenze aus ADR-v9-127 E3 / §1.1. Kern-Genealogie
// (given/surname/sex/Kern-Ereignis-Daten+Orte/Zitat-Quellen/Medien-Dateien) ist NICHT hier
// und muss daher exakt round-trippen.
function isDocumented(d: Diff): boolean {
  const p = d.path;
  // GEDCOM kennt keine Ort-/Hof-Records — Orte leben inline auf den Ereignissen (String bleibt).
  if (d.entity === 'place' || d.entity === 'hof') return true;
  // Zusammengesetzter NAME-String (Teile werden separat verglichen und bleiben exakt).
  if (p === 'name') return true;
  // Person-seitige Familien-Projektion (GRAMPS nativ family-seitig; family-Wahrheit s. (1)).
  if (p === 'childOf' || p === 'parentIn') return true;
  // GRAMPS-Suffix-Repräsentation.
  if (p === 'suffix') return true;
  // Signatur-Paarung auf Entitätsebene (durch die Zähl-Invarianten in (1) abgesichert).
  if (p === '' && (d.entity === 'person' || d.entity === 'family' || d.entity === 'repository')) return true;
  // Nicht-Kern-Ereignisse (RESI/OCCU/…): die Adresse wandert zwischen eventType/value/place-
  // Repräsentation, gleich-signierte datumlose Ereignisse paaren nach Reihenfolge. Kern-
  // Ereignisse (birth/chr/death/buri) haben EIGENE Pfade (`birth.place`…) und sind NICHT hier.
  if (/^events\[/.test(p) && (d.kind === 'missing' || d.kind === 'extra')) return true;
  if (/^events\[.*\]\.(place|value)$/.test(p)) return true;
  // Ereignistyp-Refinement (`2 TYPE …`) ohne GRAMPS-Gegenstück; source-Freitextfelder.
  if (d.entity === 'source' && (p === 'text' || p === 'date' || p === 'callNumber')) return true;
  // Kinder-Signatur-Multiset einer Familie: erhaltungspflichtig ist die MENGE (durch die
  // globale children-Zähl-Invariante in (1) + die injektive ID-Remap konstruktiv gesichert);
  // ein `changed` hier rührt von der Datums-QUALIFIER-Re-Expression im Kind-Geburtsdatum her
  // (`INT 26 FEB 1756` → `26 FEB 1756`, GRAMPS drückt den GEDCOM-Modifier nicht aus — ADR-v9-
  // 127 E3: Datum re-ausgedrückt DARF abweichen), die die Kind-personSig perturbiert.
  if (d.entity === 'family' && p === 'children' && d.kind === 'changed') return true;
  return false;
}
const substantive = (diffs: Diff[]): Diff[] => diffs.filter((d) => !isDocumented(d));

// ── Fixtures ──────────────────────────────────────────────────────────────────
const ANCESTRIS = FX('MeineDaten_ancestris.ged');
const FAMILIE = FX('Unsere Familie.gramps');
const hasReal = existsSync(ANCESTRIS) && existsSync(FAMILIE);

describe('RT-4 Cross-Family-Gate (BL-159) — Klein-Fixtures', () => {
  it('GEDCOM→GRAMPS (mini): kein Struktur-Verlust, substantieller Rest []', () => {
    const db = gedToDb(FX('mini.small.ged'));
    const db2 = throughGramps(db);
    expectNoStructuralLoss(db, db2);
    expect(substantive(modelEquiv(db, db2))).toEqual([]);
  });

  it('GRAMPS→GEDCOM (mini): kein Struktur-Verlust, substantieller Rest []', () => {
    const db = grampsToDb(FX('mini.small.gramps'));
    const db2 = throughGedcom(db);
    expectNoStructuralLoss(db, db2);
    expect(substantive(modelEquiv(db, db2))).toEqual([]);
  });

  it('Identitäts-Gate bleibt nach der Signatur-Härtung erhalten (modelEquiv(db,db)===[])', () => {
    for (const db of [gedToDb(FX('mini.small.ged')), grampsToDb(FX('mini.small.gramps'))]) {
      expect(modelEquiv(db, db)).toEqual([]);
    }
  });
});

describe.skipIf(!hasReal)('RT-4 Cross-Family-Gate (BL-159) — Realdaten, beide Richtungen', () => {
  it('GEDCOM→GRAMPS (MeineDaten_ancestris.ged, ~2795 Pers.): kein Struktur-Verlust, substantieller Rest []', () => {
    const db = gedToDb(ANCESTRIS);
    const db2 = throughGramps(db);
    expectNoStructuralLoss(db, db2);
    expect(substantive(modelEquiv(db, db2))).toEqual([]);
  });

  it('GRAMPS→GEDCOM (Unsere Familie.gramps, ~2894 Pers.): kein Struktur-Verlust, substantieller Rest []', () => {
    const db = grampsToDb(FAMILIE);
    const db2 = throughGedcom(db);
    expectNoStructuralLoss(db, db2);
    expect(substantive(modelEquiv(db, db2))).toEqual([]);
  });

  it('Signatur-Härtung wirkt: Personen paaren über Namens-TEILE (0 person-Struktur-Diffs bulk)', () => {
    // Vor BL-159 signierte personSig den zusammengesetzten `name`-String → unter GRAMPS-
    // Namensrekonstruktion mismatchten 1431/2795 Personen als missing+extra. Jetzt < 5.
    const db = gedToDb(ANCESTRIS);
    const db2 = throughGramps(db);
    const personStruct = modelEquiv(db, db2).filter((d) => d.entity === 'person' && d.path === '');
    expect(personStruct.length).toBeLessThan(5);
  });

  it('Realdaten-Identitäts-Gate (regressionsfest): modelEquiv(db,db)===[] auf beiden echten Sätzen', () => {
    expect(modelEquiv(gedToDb(ANCESTRIS), gedToDb(ANCESTRIS))).toEqual([]);
    expect(modelEquiv(grampsToDb(FAMILIE), grampsToDb(FAMILIE))).toEqual([]);
  });
});
