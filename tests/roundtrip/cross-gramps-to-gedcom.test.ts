// tests/roundtrip/cross-gramps-to-gedcom.test.ts — BL-157 (Cross-Family GRAMPS→GEDCOM).
//
// Gate für die Modell→GEDCOM-Vollbaum-Synthese (ADR-v9-127 BL-157). Kette:
//   GRAMPS-Text --parseXMLText--> db --buildGedcomTreeFromModel--> roots
//        --serializeGedcom--> GEDCOM-Text --parseGedcom--> db'
// Metrik ist MODELL-Äquivalenz (RT-4, ADR-v9-127 E3), NICHT Byte — über Familiengrenzen
// ist Byte-Gleichheit unmöglich. `modelEquiv(db, db')` muss im dokumentierten Rahmen liegen:
// leere Diff-Liste ODER nur die bekannten Passthrough-/Repräsentations-Abweichungen (BL-155,
// BL-162/159-Futter). Entscheidung 1 (Native unangetastet) wird von den nativen Suiten gehalten.
//
// Test-Seam: parseXMLText/buildXMLText synchron, gzip-Entpackung in der Plattform-Randschicht
// (node:zlib), nicht im Kern (INV-ARCH-1/-2, Spec 32 §5).

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import {
  parseXMLText,
  parseGedcom,
  serializeGedcom,
  modelEquiv,
  type Diff,
} from '../../core/interop';
// buildGedcomTreeFromModel wird (noch) NICHT über index.ts re-exportiert (der Orchestrator
// verdrahtet die Cross-Family-Exporte nach BL-157/158) — daher der direkte Modul-Import.
import { buildGedcomTreeFromModel } from '../../core/interop/build-gedcom-from-model';

const MINI = join(__dirname, '../fixtures/mini.small.gramps');
const EVENTS_MINI = join(__dirname, '../fixtures/events-mini.small.gramps');
const BIG = join(__dirname, '../fixtures/Unsere Familie.gramps');

function readXml(path: string): string {
  const buf = readFileSync(path);
  if (buf[0] === 0x1f && buf[1] === 0x8b) return gunzipSync(buf).toString('utf8');
  return buf.toString('utf8');
}

// ── Dokumentierter Repräsentations-Rahmen (ADR-v9-127 E3, BL-162-Futter) ──────────────────
// GEDCOM kennt KEINE Ort-/Hof-RECORDS — Orte sind inline `PLAC`-Strings am Ereignis. Beim
// GRAMPS→GEDCOM-Cross-Export gehen daher die placeObject/hofObject-ENTITÄTEN als eigenständige
// Records verloren (→ `place`/`hof` `missing`). Die Ort-INFORMATION bleibt vollständig erhalten:
// jedes Ereignis trägt seinen `ev.place`-String weiter (Gate: 0 `*.place`-Diffs, s. u.). Diese
// entity-Grenze ist die EINZIGE zulässige Abweichung im GRAMPS→GEDCOM-Pfad; alles andere MUSS
// erhalten bleiben (Personen/Familien/Quellen/Notizen/Links/Zitat-Quellen/Medien).
function isPlaceRecordBoundary(d: Diff): boolean {
  return (d.entity === 'place' || d.entity === 'hof') && d.kind === 'missing';
}
/** Diffs außerhalb der dokumentierten Ort-/Hof-Record-Grenze — MÜSSEN leer sein. */
function substantiveDiffs(diffs: Diff[]): Diff[] {
  return diffs.filter((d) => !isPlaceRecordBoundary(d));
}

/** GRAMPS-Text → db → GEDCOM-Vollbaum → GEDCOM-Text → db'. Liefert die modelEquiv-Diffs. */
function crossDiffs(grampsXml: string): { diffs: Diff[]; nPersons: number; nFamilies: number } {
  const { db } = parseXMLText(grampsXml);
  const roots = buildGedcomTreeFromModel(db);
  const gedText = serializeGedcom({ db, roots }, { format: '5.5.1' });
  const { db: db2 } = parseGedcom(gedText);
  return { diffs: modelEquiv(db, db2), nPersons: db.individuals.size, nFamilies: db.families.size };
}

describe('Cross-Family: GRAMPS → Modell → GEDCOM (BL-157, RT-4)', () => {
  it('erzeugt ein wohlgeformtes, re-parsbares GEDCOM (HEAD + Records + TRLR)', () => {
    const { db } = parseXMLText(readXml(MINI));
    const roots = buildGedcomTreeFromModel(db);
    expect(roots[0].tag).toBe('HEAD');
    expect(roots[roots.length - 1].tag).toBe('TRLR');
    const text = serializeGedcom({ db, roots }, { format: '5.5.1' });
    // re-parst ohne Verlust der Personen (Pointer-Form korrekt, @I1@ statt roher GRAMPS-id)
    const { db: db2 } = parseGedcom(text);
    expect(db2.individuals.size).toBe(db.individuals.size);
    expect(text).toContain('0 @I1@ INDI');
    expect(text).toContain('0 TRLR');
  });

  it('remappt Referenzen: keine rohen GRAMPS-ids (I0001/F0001/S0001) im Output', () => {
    const { db } = parseXMLText(readXml(MINI));
    const text = serializeGedcom({ db, roots: buildGedcomTreeFromModel(db) }, { format: '5.5.1' });
    // GRAMPS-native ids (unpadded @-los) dürfen NICHT als rohe Pointer/Xref auftauchen.
    expect(text).not.toMatch(/\b(?:HUSB|WIFE|CHIL|FAMC|FAMS|SOUR|REPO|NOTE|OBJE) I\d{4}\b/);
    expect(text).not.toMatch(/^0 I\d{4} /m);
  });

  it('modelEquiv(db, db\') im Rahmen (mini): keine Diffs (keine Orte in mini)', () => {
    const { diffs } = crossDiffs(readXml(MINI));
    if (diffs.length) console.log('mini Rest-Diffs:', JSON.stringify(diffs, null, 2));
    expect(diffs).toEqual([]);
  });

  it('modelEquiv(db, db\') im Rahmen (events-mini): nur Ort-Record-Grenze', () => {
    const { diffs } = crossDiffs(readXml(EVENTS_MINI));
    const substantive = substantiveDiffs(diffs);
    if (substantive.length) console.log('events-mini substanzielle Diffs:', JSON.stringify(substantive, null, 2));
    // KEINE substanziellen Diffs: nur der placeObject-Record fehlt (GEDCOM inline).
    expect(substantive).toEqual([]);
    // Ort-INFORMATION erhalten: kein einziger `*.place`-String-Diff.
    expect(diffs.filter((d) => d.path.endsWith('.place'))).toEqual([]);
  });
});

describe.skipIf(!existsSync(BIG))('Cross-Family: Unsere Familie.gramps → GEDCOM (BL-157, Orakel)', () => {
  it('Realdaten-Roundtrip: nur Ort-Record-Grenze, keine Kern-Verletzung', () => {
    const { diffs, nPersons } = crossDiffs(readXml(BIG));
    expect(nPersons).toBeGreaterThan(2000);
    const substantive = substantiveDiffs(diffs);
    // Aggregierte Diagnose der (erwartet leeren) substanziellen Diffs — BL-159/162-Futter.
    if (substantive.length) {
      const agg = new Map<string, number>();
      for (const d of substantive) {
        const k = `${d.entity}.${d.path.replace(/\[[^\]]*\]/g, '[]')}.${d.kind}`;
        agg.set(k, (agg.get(k) ?? 0) + 1);
      }
      console.log('Unsere Familie: substanzielle GRAMPS→GEDCOM-Diffs (aggregiert):');
      for (const [k, n] of [...agg].sort((a, b) => b[1] - a[1])) console.log(`  ${n}\t${k}`);
      console.log('Beispiele:', JSON.stringify(substantive.slice(0, 5), null, 2));
    }
    // Kern-Erhaltung: KEINE substanziellen Diffs (Name/Geschlecht/Ereignisdaten+Orte-inline/
    // Quellen/Links/Notizen/Medien). Einzig zulässig: fehlende Ort-/Hof-RECORDS (inline in GEDCOM).
    expect(substantive).toEqual([]);
    // Ort-Strings erhalten (inline): kein `*.place`-Diff trotz fehlender Ort-Records.
    expect(diffs.filter((d) => d.path.endsWith('.place'))).toEqual([]);
  });
});
