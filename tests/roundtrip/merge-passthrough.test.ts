// tests/roundtrip/merge-passthrough.test.ts — BL-164 Phase 1 (ADR-v9-129).
//
// Dedup ist auch auf der Passthrough-Ebene verlustfrei: beim Personen-Merge wird der
// Record-Passthrough des Verlierers in den Gewinner übernommen (Mechanik M1': eine
// format-agnostische id-Liste `mergedRecordIds` am Modell; der Write-Back holt die
// un-modellierten Zeilen aus `roots` und hängt sie dedupliziert an den Gewinner).
// Diese Phase deckt GEDCOM ab; GRAMPS + Orte/Höfe folgen (BL-164 Phase 2/3).

import { describe, it, expect } from 'vitest';
import { parseGedcom, serializeGedcom, applyDatabaseToRoots } from '../../core/interop';
import { mergePersons } from '../../core/dedup';
import type { GedNode } from '../../core/interop';

const GED = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 5.5.1',
  '0 @I1@ INDI', // Gewinner
  '1 NAME Max /Muster/',
  '1 SEX M',
  '1 _STAT tot', // gemeinsam mit dem Verlierer → muss dedupliziert werden
  '0 @I2@ INDI', // Verlierer
  '1 NAME Max /Muster/',
  '1 SEX M',
  '1 _STAT tot', // gleich wie beim Gewinner
  '1 _MILITARY WW1', // EINZIG beim Verlierer → darf NICHT verloren gehen
  '0 TRLR',
].join('\n');

/** Kind-Tags des INDI-Records mit gegebenem xref im Baum. */
function childTags(roots: GedNode[], xref: string): string[] {
  const rec = roots.find((r) => r.tag === 'INDI' && r.xref === xref);
  return rec ? rec.children.map((c) => c.tag) : [];
}
const count = (tags: string[], tag: string) => tags.filter((t) => t === tag).length;

/** parse → merge(I1←I2) → write-back → GEDCOM-Text. */
function mergeAndSerialize(): string {
  const { db, roots } = parseGedcom(GED);
  const merged = mergePersons(db, '@I1@', '@I2@');
  return serializeGedcom({ db: merged, roots: applyDatabaseToRoots(merged, roots) });
}

describe('BL-164 — Personen-Merge ist auf der Passthrough-Ebene verlustfrei (GEDCOM)', () => {
  it('der EINZIGE Passthrough des Verlierers (_MILITARY) landet beim Gewinner', () => {
    const { db, roots } = parseGedcom(mergeAndSerialize());
    expect(db.individuals.size).toBe(1); // Verlierer ist weg
    const tags = childTags(roots, '@I1@');
    expect(tags).toContain('_MILITARY');
    expect(tags).toContain('_STAT');
  });

  it('der GEMEINSAME Passthrough (_STAT) wird dedupliziert (genau einmal, kein Doppel)', () => {
    const { roots } = parseGedcom(mergeAndSerialize());
    const tags = childTags(roots, '@I1@');
    expect(count(tags, '_STAT')).toBe(1);
    expect(count(tags, '_MILITARY')).toBe(1);
  });

  it('idempotent: zweimal serialisiert ergibt byte-identisches GEDCOM (RT-1)', () => {
    const out1 = mergeAndSerialize();
    // out1 erneut parsen + serialisieren (ohne weiteren Edit) → muss stabil sein
    const { db, roots } = parseGedcom(out1);
    const out2 = serializeGedcom({ db, roots: applyDatabaseToRoots(db, roots) });
    expect(out2).toBe(out1);
  });

  it('ohne Merge bleibt alles unverändert (Kontrollfall — kein ungewolltes Anhängen)', () => {
    const { db, roots } = parseGedcom(GED);
    const out = serializeGedcom({ db, roots: applyDatabaseToRoots(db, roots) });
    const { roots: r2 } = parseGedcom(out);
    // Beide Personen erhalten, je ihr eigener _STAT, kein fremder _MILITARY beim Gewinner.
    expect(childTags(r2, '@I1@')).not.toContain('_MILITARY');
    expect(count(childTags(r2, '@I2@'), '_MILITARY')).toBe(1);
  });
});
