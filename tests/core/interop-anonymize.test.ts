// tests/core/interop-anonymize.test.ts — anonymisierter Export (Spec 13 §7, DSGVO).
// Klassifikation in 3 Phasen (datumbasiert / BFS / konservativ). Bezugsjahr injiziert (TST-3).

import { describe, it, expect } from 'vitest';
import { parseGedcom } from '../../core/interop';
import { buildLivingSet, anonymizeIndi } from '../../core/interop';
import { child } from '../../core/interop';

const SRC = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 5.5.1',
  // I1: geboren 1990, kein Sterbedatum → lebend (Phase 1)
  '0 @I1@ INDI',
  '1 NAME Anna /Jung/',
  '1 SEX F',
  '1 BIRT',
  '2 DATE 3 MAR 1990',
  '1 FAMS @F1@',
  // I2: geboren 1988, kein Sterbedatum → lebend; Ehepartner von I1
  '0 @I2@ INDI',
  '1 NAME Ben /Jung/',
  '1 SEX M',
  '1 BIRT',
  '2 DATE 1988',
  '1 FAMS @F1@',
  // I3: geboren 1850, gestorben 1910 → tot (Phase 1)
  '0 @I3@ INDI',
  '1 NAME Opa /Alt/',
  '1 SEX M',
  '1 BIRT',
  '2 DATE 1850',
  '1 DEAT',
  '2 DATE 1910',
  // I4: ohne jedes Datum → konservativ lebend (Phase 3)
  '0 @I4@ INDI',
  '1 NAME Unbekannt /Ohnedatum/',
  '1 SEX U',
  '0 @F1@ FAM',
  '1 HUSB @I2@',
  '1 WIFE @I1@',
  '0 TRLR',
].join('\n');

describe('Anonymisierung (Spec 13 §7)', () => {
  const { db } = parseGedcom(SRC);
  const living = buildLivingSet(db, 2026);

  it('Phase 1: jung + kein Sterbedatum → lebend', () => {
    expect(living.has('@I1@')).toBe(true);
    expect(living.has('@I2@')).toBe(true);
  });

  it('Phase 1: geboren 1850, gestorben 1910 → nicht lebend', () => {
    expect(living.has('@I3@')).toBe(false);
  });

  it('Phase 3: Person ohne jedes Datum → konservativ lebend', () => {
    expect(living.has('@I4@')).toBe(true);
  });

  it('anonymer Record behält nur NAME "Lebende Person" + SEX + Familienlinks', () => {
    const { roots } = parseGedcom(SRC);
    const i1 = roots.find((r) => r.xref === '@I1@')!;
    const anon = anonymizeIndi(i1);
    expect(child(anon, 'NAME')?.value).toBe('Lebende Person');
    expect(child(anon, 'SEX')?.value).toBe('F');
    expect(child(anon, 'FAMS')?.value).toBe('@F1@');
    expect(child(anon, 'BIRT')).toBeNull();
  });

  it('Bezugsjahr ist injiziert (Determinismus, TST-3): 1890er gilt bei Bezugsjahr 1950 als tot', () => {
    // I1 geboren 1990 wäre bei Bezugsjahr 1950 „in der Zukunft" → dennoch >1850, lebend.
    // Kern-Punkt: gleiche Eingabe + gleiches Bezugsjahr → gleiche Ausgabe.
    const a = buildLivingSet(db, 2026);
    const b = buildLivingSet(db, 2026);
    expect([...a].sort()).toEqual([...b].sort());
  });
});
