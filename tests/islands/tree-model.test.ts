// tests/islands/tree-model.test.ts — reine Traversal-/Kekule-Tests der Sanduhr-Insel
// (Spec 32 §2: Layout-Berechnung wird über Modell -> Positionen unit-getestet).
import { describe, expect, it } from 'vitest';
import { makeDatabase } from '../../core/model';
import {
  ancestorLevel,
  ancestorLevelHasAny,
  computeKekuleNumbers,
  getParentIds,
  getSpouseFamilies,
} from '../../ui/islands/tree/tree-model';
import { addPerson, buildFourGenTree, marry } from './tree-fixtures';

describe('getParentIds', () => {
  it('liefert Vater/Mutter aus der ersten Herkunftsfamilie (famc[0])', () => {
    const db = buildFourGenTree();
    expect(getParentIds(db, 'I1')).toEqual({ father: 'I2', mother: 'I3' });
  });

  it('liefert {null,null} für unbekannte/fehlende Person', () => {
    const db = buildFourGenTree();
    expect(getParentIds(db, null)).toEqual({ father: null, mother: null });
    expect(getParentIds(db, 'I999')).toEqual({ father: null, mother: null });
    expect(getParentIds(db, 'I20')).toEqual({ father: null, mother: null }); // kein childOf hinterlegt
  });
});

describe('getSpouseFamilies', () => {
  it('liefert alle Familien, in denen die Person Elternteil ist, inkl. Gegenpartner + Kinder', () => {
    const db = buildFourGenTree();
    const fams = getSpouseFamilies(db, 'I1');
    expect(fams).toHaveLength(1);
    expect(fams[0]).toEqual({ familyId: 'F2', spouseId: 'I20', children: ['I30', 'I31'] });
  });

  it('unterstützt Mehrfach-Ehen (Spec 20 §1.3 [K]: ⚭N)', () => {
    const db = buildFourGenTree();
    addPerson(db, 'I21', 'Zweite Ehefrau', 'F');
    addPerson(db, 'I32', 'Kind aus zweiter Ehe');
    marry(db, 'F3', 'I1', 'I21', ['I32']);
    const fams = getSpouseFamilies(db, 'I1');
    expect(fams).toHaveLength(2);
    expect(fams.map((f) => f.spouseId)).toEqual(['I20', 'I21']);
  });

  it('liefert leeres Array für unbekannte Person', () => {
    const db = makeDatabase();
    expect(getSpouseFamilies(db, 'nope')).toEqual([]);
  });
});

describe('computeKekuleNumbers', () => {
  it('Proband=1, Vater=2, Mutter=3, Großeltern=4..7 (Standard-Ahnentafel-Nummerierung)', () => {
    const db = buildFourGenTree();
    const k = computeKekuleNumbers(db, 'I1');
    expect(k.get('I1')).toBe(1);
    expect(k.get('I2')).toBe(2);
    expect(k.get('I3')).toBe(3);
    expect(k.get('I4')).toBe(4);
    expect(k.get('I5')).toBe(5);
    expect(k.get('I6')).toBe(6);
    expect(k.get('I7')).toBe(7);
    expect(k.get('I8')).toBe(8);
    expect(k.get('I15')).toBe(15);
  });

  it('bricht bei maxDepth ab (kein endloser Aufstieg)', () => {
    const db = buildFourGenTree();
    const k = computeKekuleNumbers(db, 'I1', 1);
    expect(k.has('I2')).toBe(true);
    expect(k.has('I4')).toBe(false); // Großeltern liegen jenseits maxDepth=1
  });

  it('Zyklus-Guard: eine Person bekommt nie zwei Kekule-Nummern, auch bei Eltern-Zirkel', () => {
    const db = makeDatabase();
    addPerson(db, 'A');
    addPerson(db, 'B');
    // Künstlicher Zirkel: A ist Kind der Familie, in der B UND A selbst Elternteil sind.
    marry(db, 'F1', 'A', 'B', ['A']);
    const k = computeKekuleNumbers(db, 'A');
    expect(k.get('A')).toBe(1);
    // A taucht nicht zusätzlich als eigener Vorfahre mit anderer Nummer auf.
    expect([...k.values()].filter((n) => n === 1)).toHaveLength(1);
  });
});

describe('ancestorLevel / ancestorLevelHasAny', () => {
  it('Ebene 1 = [Vater, Mutter], Ebene 2 = 4 Großeltern-Slots in Reihenfolge vv/vm/mv/mm', () => {
    const db = buildFourGenTree();
    expect(ancestorLevel(db, 'I1', 1)).toEqual(['I2', 'I3']);
    expect(ancestorLevel(db, 'I1', 2)).toEqual(['I4', 'I5', 'I6', 'I7']);
  });

  it('Ebene 3 enthält alle 8 Urgroßeltern-Slots', () => {
    const db = buildFourGenTree();
    expect(ancestorLevel(db, 'I1', 3)).toEqual(['I8', 'I9', 'I10', 'I11', 'I12', 'I13', 'I14', 'I15']);
  });

  it('unbekannte Vorfahren werden als null-Slots dargestellt, Array bleibt Länge 2^depth', () => {
    const db = makeDatabase();
    addPerson(db, 'solo');
    const lvl2 = ancestorLevel(db, 'solo', 2);
    expect(lvl2).toEqual([null, null, null, null]);
  });

  it('ancestorLevelHasAny erkennt komplett-leere Ebenen', () => {
    expect(ancestorLevelHasAny([null, null, null, null])).toBe(false);
    expect(ancestorLevelHasAny([null, 'X', null, null])).toBe(true);
  });

  it('Zyklus-Guard verhindert Endlosrekursion bei zirkulärem Eltern-Graph', () => {
    const db = makeDatabase();
    addPerson(db, 'A');
    addPerson(db, 'B');
    marry(db, 'F1', 'A', 'B', ['A']); // A ist "Kind" der eigenen Familie
    expect(() => ancestorLevel(db, 'A', 4)).not.toThrow();
  });
});
