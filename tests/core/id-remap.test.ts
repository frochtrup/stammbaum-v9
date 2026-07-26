// tests/core/id-remap.test.ts — deterministische Modell-id → Ziel-id-Abbildung (BL-156,
// ADR-v9-127 Entscheidung 2). Gate laut DoD: jede Modell-id → genau eine Ziel-id (injektiv);
// zweimaliger Lauf → identisches Ergebnis (deterministisch); alle Referenzen sind über die
// Abbildung auflösbar. Reine, build-freie Kern-Tests (INV-ARCH-2).

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { parseGedcom, parseXMLText } from '../../core/interop';
import { remapIdsForFormat, mappedOr } from '../../core/interop/id-remap';
import type { Database } from '../../core/model/types';

const FX = (name: string) => join(__dirname, '../fixtures', name);

function loadGed(name: string): Database {
  return parseGedcom(readFileSync(FX(name), 'utf8')).db;
}
function readXmlText(name: string): string {
  const buf = readFileSync(FX(name));
  if (buf[0] === 0x1f && buf[1] === 0x8b) return gunzipSync(buf).toString('utf8');
  return buf.toString('utf8');
}
function loadGramps(name: string): Database {
  return parseXMLText(readXmlText(name)).db;
}

/** Alle Werte einer Map sind paarweise verschieden (Injektivität). */
function injective(m: Map<unknown, string>): boolean {
  return new Set(m.values()).size === m.size;
}

const GED_FIXTURES = ['mini.small.ged', 'media.small.ged', 'media-ptr.small.ged'];
const GRAMPS_FIXTURES = ['mini.small.gramps', 'media.small.gramps', 'events-mini.small.gramps'];

function eachDb(fn: (db: Database, label: string) => void): void {
  for (const f of GED_FIXTURES) fn(loadGed(f), `GED ${f}`);
  for (const f of GRAMPS_FIXTURES) fn(loadGramps(f), `GRAMPS ${f}`);
}

describe('remapIdsForFormat — Injektivität (jede Modell-id → genau eine Ziel-id)', () => {
  eachDb((db, label) => {
    for (const format of ['gedcom', 'gramps'] as const) {
      it(`${label} → ${format}: alle Entitäts-Maps sind injektiv`, () => {
        const r = remapIdsForFormat(db, format);
        expect(injective(r.person)).toBe(true);
        expect(injective(r.family)).toBe(true);
        expect(injective(r.source)).toBe(true);
        expect(injective(r.repo)).toBe(true);
        expect(injective(r.note)).toBe(true);
        expect(injective(r.media)).toBe(true);
        expect(injective(r.place)).toBe(true);
        expect(injective(r.event)).toBe(true);
        expect(injective(r.citation)).toBe(true);
        // Vollständigkeit: jede Store-Entität hat einen Eintrag.
        expect(r.person.size).toBe(db.individuals.size);
        expect(r.family.size).toBe(db.families.size);
        expect(r.source.size).toBe(db.sources.size);
        expect(r.note.size).toBe(db.notes.size);
        expect(r.media.size).toBe(db.media.size);
      });
    }
  });
});

describe('remapIdsForFormat — Determinismus (zweimaliger Lauf identisch)', () => {
  eachDb((db, label) => {
    for (const format of ['gedcom', 'gramps'] as const) {
      it(`${label} → ${format}: zwei Läufe liefern identische Abbildungen`, () => {
        const a = remapIdsForFormat(db, format);
        const b = remapIdsForFormat(db, format);
        expect([...a.person.entries()]).toEqual([...b.person.entries()]);
        expect([...a.family.entries()]).toEqual([...b.family.entries()]);
        expect([...a.source.entries()]).toEqual([...b.source.entries()]);
        expect([...a.event.values()]).toEqual([...b.event.values()]);
        expect([...a.citation.values()]).toEqual([...b.citation.values()]);
        expect([...a.handle.entries()]).toEqual([...b.handle.entries()]);
      });
    }
  });
});

describe('remapIdsForFormat — ziel-natives Format der frischen IDs', () => {
  it('GEDCOM → @I1@/@F1@/@S1@ … (single-@, 1-basiert, unpadded)', () => {
    const db = loadGed('mini.small.ged');
    const r = remapIdsForFormat(db, 'gedcom');
    for (const id of r.person.values()) expect(id).toMatch(/^@I\d+@$/);
    for (const id of r.family.values()) expect(id).toMatch(/^@F\d+@$/);
    // GEDCOM trägt Events/Zitate inline (kein eigener Wire-Xref) → leere Maps + keine Handles.
    expect(r.event.size).toBe(0);
    expect(r.citation.size).toBe(0);
    expect(r.place.size).toBe(0);
    expect(r.handle.size).toBe(0);
    // Erste Person bekommt @I1@ (deterministische Store-Reihenfolge).
    expect([...r.person.values()][0]).toBe('@I1@');
  });

  it('GRAMPS → I0001/F0001/… (4-stellig gepadded) + Handle je Ziel-id', () => {
    const db = loadGramps('mini.small.gramps');
    const r = remapIdsForFormat(db, 'gramps');
    for (const id of r.person.values()) expect(id).toMatch(/^I\d{4}$/);
    for (const id of r.family.values()) expect(id).toMatch(/^F\d{4}$/);
    expect([...r.person.values()][0]).toBe('I0001');
    // Jede vergebene Ziel-id hat genau ein Handle; Handles sind eindeutig.
    for (const id of r.person.values()) expect(r.handle.has(id)).toBe(true);
    expect(new Set(r.handle.values()).size).toBe(r.handle.size);
  });
});

describe('remapIdsForFormat — Referenz-Rewriting (alle Refs über die Abbildung auflösbar)', () => {
  eachDb((db, label) => {
    for (const format of ['gedcom', 'gramps'] as const) {
      it(`${label} → ${format}: Familien-/Zitat-/Repo-/Notiz-Refs bleiben auflösbar`, () => {
        const r = remapIdsForFormat(db, format);
        // Familie→Person: jeder gesetzte husband/wife/child ist eine bekannte Person-id.
        for (const f of db.families.values()) {
          if (f.husband) expect(mappedOr(r.person, f.husband)).toBe(r.person.get(f.husband));
          if (f.wife) expect(mappedOr(r.person, f.wife)).toBe(r.person.get(f.wife));
          for (const c of f.children) {
            if (db.individuals.has(c)) expect(r.person.has(c)).toBe(true);
          }
        }
        // Person→Familie (childOf/parentIn): jede vorhandene Familien-id ist gemappt.
        for (const p of db.individuals.values()) {
          for (const cl of p.childOf) if (db.families.has(cl.familyId)) expect(r.family.has(cl.familyId)).toBe(true);
          for (const fid of p.parentIn) if (db.families.has(fid)) expect(r.family.has(fid)).toBe(true);
        }
        // Quelle→Repo: gesetzte, vorhandene Repo-id ist gemappt.
        for (const s of db.sources.values()) {
          if (typeof s.repo === 'string' && db.repositories.has(s.repo)) expect(r.repo.has(s.repo)).toBe(true);
        }
        // dangling Ref → mappedOr reicht den Original-Wert durch (nicht erfunden).
        expect(mappedOr(r.person, '@NICHT_DA@')).toBe('@NICHT_DA@');
      });
    }
  });
});

// ── Realdaten (skipIf gitignored, TST-Fixtures) ────────────────────────────────
const REAL_GED = 'MeineDaten_ancestris.ged';
const REAL_GRAMPS = 'Unsere Familie.gramps';

describe('remapIdsForFormat — Realdaten (skipIf nicht vorhanden)', () => {
  it.skipIf(!existsSync(FX(REAL_GED)))(`${REAL_GED}: injektiv + deterministisch (beide Zielformate)`, () => {
    const db = loadGed(REAL_GED);
    for (const format of ['gedcom', 'gramps'] as const) {
      const a = remapIdsForFormat(db, format);
      const b = remapIdsForFormat(db, format);
      expect(injective(a.person)).toBe(true);
      expect(injective(a.family)).toBe(true);
      expect([...a.person.entries()]).toEqual([...b.person.entries()]);
    }
  });
  it.skipIf(!existsSync(FX(REAL_GRAMPS)))(`${REAL_GRAMPS}: injektiv + Handle-Eindeutigkeit`, () => {
    const db = loadGramps(REAL_GRAMPS);
    const r = remapIdsForFormat(db, 'gramps');
    expect(injective(r.person)).toBe(true);
    expect(injective(r.event)).toBe(true);
    expect(injective(r.citation)).toBe(true);
    expect(new Set(r.handle.values()).size).toBe(r.handle.size);
  });
});
