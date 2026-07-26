// tests/core/model-equiv.test.ts — Äquivalenz-Vergleicher modelEquiv (RT-4, ADR-v9-127,
// BL-155). Gate: modelEquiv(db, db) === [] (Identität) auf allen Fixtures + gezielte
// Negativ-Tests (ein Feld ändern → genau der erwartete Diff). Reine, build-freie
// Kern-Tests (INV-ARCH-2).

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { parseGedcom, parseXMLText, modelEquiv } from '../../core/interop';
import type { Database } from '../../core/model/types';

const FX = (name: string) => join(__dirname, '../fixtures', name);

function loadGed(name: string): Database {
  return parseGedcom(readFileSync(FX(name), 'utf8')).db;
}
/** gzip-Magic 1f 8b → entpacken (Realdaten-`.gramps` sind gzip), sonst Klartext. */
function readXmlText(name: string): string {
  const buf = readFileSync(FX(name));
  if (buf[0] === 0x1f && buf[1] === 0x8b) return gunzipSync(buf).toString('utf8');
  return buf.toString('utf8');
}
function loadGramps(name: string): Database {
  return parseXMLText(readXmlText(name)).db;
}

// ── Identitäts-Gate: db mit sich selbst ist immer äquivalent ──────────────────

describe('modelEquiv — Identität (db ≡ db) auf committeten Klein-Fixturen', () => {
  const gedFixtures = ['mini.small.ged', 'media.small.ged', 'media-ptr.small.ged', 'mini.untagged.small.ged'];
  for (const f of gedFixtures) {
    it(`GEDCOM ${f}: modelEquiv(db, db) === []`, () => {
      const db = loadGed(f);
      expect(modelEquiv(db, db)).toEqual([]);
    });
  }

  const grampsFixtures = ['mini.small.gramps', 'media.small.gramps', 'events-mini.small.gramps'];
  for (const f of grampsFixtures) {
    it(`GRAMPS ${f}: modelEquiv(db, db) === []`, () => {
      const db = loadGramps(f);
      expect(modelEquiv(db, db)).toEqual([]);
    });
  }
});

// ── Identitäts-Gate auf Realdaten (gitignored → skipIf, sonst ENOENT in CI) ────

describe('modelEquiv — Identität auf Realdaten-Fixtures', () => {
  const GED = FX('MeineDaten_ancestris.ged');
  const GRAMPS = FX('Unsere Familie.gramps');

  it.skipIf(!existsSync(GED))('MeineDaten_ancestris.ged: modelEquiv(db, db) === []', () => {
    const db = loadGed('MeineDaten_ancestris.ged');
    expect(modelEquiv(db, db)).toEqual([]);
  });

  it.skipIf(!existsSync(GRAMPS))('Unsere Familie.gramps: modelEquiv(db, db) === []', () => {
    const db = loadGramps('Unsere Familie.gramps');
    expect(modelEquiv(db, db)).toEqual([]);
  });
});

// ── Negativ-Tests: gezielte Änderung eines NICHT-Signatur-Kernfeldes → 1 Diff ──
// (Signatur-Felder — Name/Datum — würden bei Änderung ein missing+extra-Paar erzeugen;
//  für den „genau ein changed"-Nachweis werden vergleichsrelevante Nicht-Signatur-Felder
//  verändert. Die Struktur- (missing/extra-)Fälle werden separat geprüft.)

describe('modelEquiv — Negativ: geändertes Nicht-Signatur-Feld → genau ein changed-Diff', () => {
  it('geänderter birth.place erzeugt genau einen person/birth.place-Diff', () => {
    const a = loadGed('mini.small.ged');
    const b = loadGed('mini.small.ged');
    const p = [...b.individuals.values()][0];
    p.birth.place = 'Ein ganz anderer Ort';
    const diffs = modelEquiv(a, b);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({ entity: 'person', path: 'birth.place', kind: 'changed' });
  });

  it('geänderter person.prefix erzeugt genau einen person/prefix-Diff', () => {
    const a = loadGed('mini.small.ged');
    const b = loadGed('mini.small.ged');
    const p = [...b.individuals.values()][0];
    p.prefix = 'Dr.';
    const diffs = modelEquiv(a, b);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({ entity: 'person', path: 'prefix', kind: 'changed' });
  });

  it('geänderter source.title (Signatur) erzeugt missing+extra (Struktur-Diff)', () => {
    const a = loadGed('mini.small.ged');
    const b = loadGed('mini.small.ged');
    const s = [...b.sources.values()][0];
    s.title = 'Völlig anderer Quellen-Titel';
    const diffs = modelEquiv(a, b).filter((d) => d.entity === 'source');
    // Titel ist Teil der Quellen-Signatur → Quelle matcht nicht mehr → missing (a) + extra (b),
    // UND: das birth-Zitat verweist auf die Quelle → Zitat-Quellen-Signatur ändert sich.
    expect(diffs.some((d) => d.kind === 'missing')).toBe(true);
    expect(diffs.some((d) => d.kind === 'extra')).toBe(true);
  });

  it('geänderter source.publisher (Nicht-Signatur) erzeugt genau einen source/publisher-Diff', () => {
    const a = loadGed('mini.small.ged');
    const b = loadGed('mini.small.ged');
    const s = [...b.sources.values()][0];
    s.publisher = 'Neuer Verlag';
    const diffs = modelEquiv(a, b);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({ entity: 'source', path: 'publisher', kind: 'changed' });
  });

  it('entfernte Person erzeugt einen person/missing-Diff', () => {
    const a = loadGed('mini.small.ged');
    const b = loadGed('mini.small.ged');
    const firstId = [...b.individuals.keys()][0];
    b.individuals.delete(firstId);
    const diffs = modelEquiv(a, b).filter((d) => d.entity === 'person');
    expect(diffs).toHaveLength(1);
    expect(diffs[0].kind).toBe('missing');
  });

  it('geändertes Geschlecht (Signatur-Teil) erzeugt Struktur-Diff (missing+extra)', () => {
    const a = loadGed('mini.small.ged');
    const b = loadGed('mini.small.ged');
    const p = [...b.individuals.values()][0];
    p.sex = 'F';
    const diffs = modelEquiv(a, b).filter((d) => d.entity === 'person');
    expect(diffs.some((d) => d.kind === 'missing')).toBe(true);
    expect(diffs.some((d) => d.kind === 'extra')).toBe(true);
  });

  it('IDs allein erzeugen KEINEN Diff (Referenz-Auflösung, remap-fest)', () => {
    // mini.small.ged remappt: @I1@ → @I99@ (Person-Record + FAMS/FAMC-Referenzen gäbe es
    // hier nicht; das Zitat @S1@ bleibt). Der Vergleicher darf die reine ID-Änderung
    // nicht sehen.
    const a = loadGed('mini.small.ged');
    const bSrc = readFileSync(FX('mini.small.ged'), 'utf8').replace(/@I1@/g, '@I77@');
    const b = parseGedcom(bSrc).db;
    expect(modelEquiv(a, b)).toEqual([]);
  });
});
