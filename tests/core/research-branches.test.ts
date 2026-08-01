// tests/core/research-branches.test.ts — Ast-Reifegrad, zweiter Scope-Erzeuger
// (Spec 20 §1.11g „Ast-Reifegrad", ADR-v9-167, BL-231). DOM-frei/framework-frei.
import { describe, expect, it } from 'vitest';
import { makeDatabase } from '../../core/model';
import {
  ancestorBranches,
  DEFAULT_BRANCH_LEVEL,
  MAX_BRANCH_LEVEL,
  MIN_BRANCH_LEVEL,
} from '../../core/research/index';
import { addPerson, buildFourGenTree, marry } from '../islands/tree-fixtures';

describe('ancestorBranches — Grundform (Spec 20 §1.11g)', () => {
  it('Ebene 2 (Eltern): 2 Äste, je Wurzel + Elternhülle; rest = alle übrigen', () => {
    const db = buildFourGenTree();
    const r = ancestorBranches(db, 'I1', 2);
    expect(r.level).toBe(2);
    expect(r.branches).toHaveLength(2);
    expect(r.branches.map((b) => b.rootId)).toEqual(['I2', 'I3']);
    // Vater-Ast: I2 + dessen ganze Elternhülle (I4/I5/I8/I9/I10/I11).
    expect([...r.branches[0].personIds].sort()).toEqual(
      ['I10', 'I11', 'I2', 'I4', 'I5', 'I8', 'I9'].sort(),
    );
    // Mutter-Ast: I3 + dessen Elternhülle (I6/I7/I12..I15).
    expect([...r.branches[1].personIds].sort()).toEqual(
      ['I12', 'I13', 'I14', 'I15', 'I3', 'I6', 'I7'].sort(),
    );
    // Proband, Ehepartner, Kinder liegen in keinem Ast.
    expect([...r.rest].sort()).toEqual(['I1', 'I20', 'I30', 'I31'].sort());
  });

  it('Ebene 3 (Großeltern): 4 Äste (Vorgabe-Ebene, DEFAULT_BRANCH_LEVEL)', () => {
    expect(DEFAULT_BRANCH_LEVEL).toBe(3);
    const db = buildFourGenTree();
    const r = ancestorBranches(db, 'I1', 3);
    expect(r.level).toBe(3);
    expect(r.branches).toHaveLength(4);
    expect(r.branches.map((b) => b.rootId)).toEqual(['I4', 'I5', 'I6', 'I7']);
    expect([...r.branches[0].personIds].sort()).toEqual(['I4', 'I8', 'I9'].sort());
  });

  it('Ebene 4 (Urgroßeltern): 8 Äste, Wurzeln ohne weitere Ahnen sind Einzelpersonen-Äste', () => {
    const db = buildFourGenTree();
    const r = ancestorBranches(db, 'I1', 4);
    expect(r.branches).toHaveLength(8);
    expect(r.branches.map((b) => b.rootId)).toEqual([
      'I8', 'I9', 'I10', 'I11', 'I12', 'I13', 'I14', 'I15',
    ]);
    for (const b of r.branches) expect([...b.personIds]).toEqual([b.rootId]);
  });

  it('Standard-Vorgabe ohne Level-Parameter ist Ebene 3', () => {
    const db = buildFourGenTree();
    const r = ancestorBranches(db, 'I1');
    expect(r.level).toBe(3);
  });
});

describe('ancestorBranches — fehlende Wurzeln bleiben sichtbare, leere Äste', () => {
  it('unbekannter Großvater: eigener Ast mit rootId null, leere Personenmenge', () => {
    const db = makeDatabase();
    addPerson(db, 'P', 'Proband');
    addPerson(db, 'V', 'Vater');
    // Vater ohne eigene Eltern hinterlegt (childOf leer) -> Großeltern väterlicherseits unbekannt.
    addPerson(db, 'M', 'Mutter');
    addPerson(db, 'MV', 'Großvater mv');
    addPerson(db, 'MM', 'Großmutter mv');
    marry(db, 'F_M', 'MV', 'MM', ['M']);
    marry(db, 'F1', 'V', 'M', ['P']);

    const r = ancestorBranches(db, 'P', 3);
    expect(r.branches).toHaveLength(4);
    // Vaterlinie: Großvater/Großmutter väterlicherseits unbekannt -> beide Äste leer.
    expect(r.branches[0].rootId).toBeNull();
    expect(r.branches[0].personIds.size).toBe(0);
    expect(r.branches[1].rootId).toBeNull();
    expect(r.branches[1].personIds.size).toBe(0);
    // Mutterlinie: beide Großeltern bekannt.
    expect(r.branches[2].rootId).toBe('MV');
    expect(r.branches[3].rootId).toBe('MM');
    // Zahl der Äste bleibt bei fehlenden Wurzeln 4 — sie verschwinden nicht (ADR-v9-167 Pkt 4).
  });

  it('Proband selbst unbekannt (leere Datenbank/kein Proband): alle Wurzeln null, rest leer', () => {
    const db = makeDatabase();
    const r = ancestorBranches(db, null, 2);
    expect(r.branches).toHaveLength(2);
    expect(r.branches.every((b) => b.rootId === null)).toBe(true);
    expect(r.rest.size).toBe(0);
  });
});

describe('ancestorBranches — Ahnenschwund zählt doppelt (ADR-v9-167 Pkt 3, Verworfen (d))', () => {
  it('derselbe Vorfahre in zwei Ästen zugleich, ohne Auflösung', () => {
    const db = makeDatabase();
    addPerson(db, 'P', 'Proband');
    addPerson(db, 'V', 'Vater');
    addPerson(db, 'M', 'Mutter');
    addPerson(db, 'X', 'Gemeinsamer Vorfahre (Vetter-Ehe)');
    // Vater UND Mutter stammen (Vetter/Cousine-Ehe) von derselben Person X ab —
    // klassischer Ahnenschwund-Fall.
    addPerson(db, 'VV', 'Vaters anderer Elternteil');
    addPerson(db, 'MM', 'Mutters anderer Elternteil');
    marry(db, 'F_V', 'X', 'VV', ['V']);
    marry(db, 'F_M', 'X', 'MM', ['M']);
    marry(db, 'F1', 'V', 'M', ['P']);

    const r = ancestorBranches(db, 'P', 2);
    expect(r.branches).toHaveLength(2);
    expect(r.branches[0].personIds.has('X')).toBe(true);
    expect(r.branches[1].personIds.has('X')).toBe(true);
    // X ist Mitglied BEIDER Äste zugleich — keine "erste Fundstelle gewinnt"-Auflösung.
    const totalAcrossBranches = r.branches.reduce((n, b) => n + b.personIds.size, 0);
    const distinctPersons = new Set(r.branches.flatMap((b) => [...b.personIds]));
    expect(totalAcrossBranches).toBeGreaterThan(distinctPersons.size);
  });
});

describe('ancestorBranches — Restmenge ist das Komplement (ADR-v9-167 Pkt 4)', () => {
  it('rest = alle Personen der DB minus Vereinigung aller Astmengen', () => {
    const db = buildFourGenTree();
    const r = ancestorBranches(db, 'I1', 3);
    const union = new Set(r.branches.flatMap((b) => [...b.personIds]));
    const all = new Set(db.individuals.keys());
    const expectedRest = new Set([...all].filter((id) => !union.has(id)));
    expect(r.rest).toEqual(expectedRest);
    // Restmenge + Vereinigung deckt exakt den ganzen Bestand ab, ohne Überschneidung.
    for (const id of r.rest) expect(union.has(id)).toBe(false);
  });
});

describe('ancestorBranches — Zyklus-Guard', () => {
  it('ein Eltern-Zirkel (Person ist ihr eigener Ahn) läuft nicht endlos', () => {
    const db = makeDatabase();
    addPerson(db, 'A');
    addPerson(db, 'B');
    // Künstlicher Zirkel: A ist Kind der Familie, in der A selbst UND B Elternteil sind.
    marry(db, 'F1', 'A', 'B', ['A']);
    expect(() => ancestorBranches(db, 'A', 2)).not.toThrow();
    const r = ancestorBranches(db, 'A', 2);
    // Vater-Ast (A selbst): die Elternhülle bricht am Zirkel ab, A kommt genau einmal vor.
    expect([...r.branches[0].personIds].filter((id) => id === 'A')).toHaveLength(1);
  });
});

describe('ancestorBranches — Obergrenze und Klemmen', () => {
  it('Ebene 5 (Ururgroßeltern): 16 Äste', () => {
    const db = buildFourGenTree();
    // Fixture reicht bis Urgroßeltern (I8..I15); Ebene 5 fragt eine Generation darüber ab
    // -> alle 16 Wurzeln unbekannt, aber 16 Äste bleiben sichtbar.
    const r = ancestorBranches(db, 'I1', 5);
    expect(r.level).toBe(5);
    expect(r.branches).toHaveLength(16);
    expect(r.branches.every((b) => b.rootId === null)).toBe(true);
  });

  it('Werte über der Obergrenze werden auf 5 geklemmt, nicht abgelehnt', () => {
    const db = buildFourGenTree();
    const r = ancestorBranches(db, 'I1', 9);
    expect(r.level).toBe(MAX_BRANCH_LEVEL);
    expect(r.branches).toHaveLength(16);
  });

  it('Werte unter der Untergrenze werden auf 2 geklemmt', () => {
    const db = buildFourGenTree();
    const r = ancestorBranches(db, 'I1', 0);
    expect(r.level).toBe(MIN_BRANCH_LEVEL);
    expect(r.branches).toHaveLength(2);
  });
});

describe('ancestorBranches — Anzeige-Label', () => {
  it('trägt einen Namen, wenn die Wurzel bekannt ist, sonst "unbekannt"', () => {
    const db = buildFourGenTree();
    const r = ancestorBranches(db, 'I1', 2);
    expect(r.branches[0].label).toContain('Vater Testperson');
    expect(r.branches[0].label).toMatch(/^Vater/);
  });

  it('unbekannte Wurzel trägt trotzdem ein unterscheidbares Label (nicht leer)', () => {
    const db = makeDatabase();
    addPerson(db, 'P', 'Proband');
    const r = ancestorBranches(db, 'P', 2);
    expect(r.branches[0].label.length).toBeGreaterThan(0);
    expect(r.branches[0].label).toContain('unbekannt');
    expect(r.branches[0].label).not.toBe(r.branches[1].label);
  });
});
