// TST-3 (Determinismus): IDs folgen GEDCOM-Konvention @Ixx@/@Fxx@/@Sxx@/@Rxx@/@Nxx@
// und werden aus einem injizierten, deterministischen Zähler abgeleitet — kein Zufall,
// keine Wall-Clock. Spec 10 §Wurzel (ID-Konvention), 02 INV-ARCH-1, 32 §5.
import { describe, it, expect } from 'vitest';
import {
  makeIdAllocator,
  nextId,
  allocatorFromDatabase,
  makeDatabase,
  makePerson,
} from '../../core/model/index';

describe('ID-Generierung (deterministisch, injiziert)', () => {
  it('vergibt aufeinanderfolgende GEDCOM-konforme IDs pro Präfix', () => {
    const alloc = makeIdAllocator();
    expect(nextId(alloc, 'I')).toBe('@I1@');
    expect(nextId(alloc, 'I')).toBe('@I2@');
    expect(nextId(alloc, 'F')).toBe('@F1@');
    expect(nextId(alloc, 'S')).toBe('@S1@');
    expect(nextId(alloc, 'R')).toBe('@R1@');
    expect(nextId(alloc, 'N')).toBe('@N1@');
  });

  it('ist deterministisch: gleicher Startzustand → gleiche Sequenz', () => {
    const a = makeIdAllocator();
    const b = makeIdAllocator();
    const seqA = [nextId(a, 'I'), nextId(a, 'I'), nextId(a, 'F')];
    const seqB = [nextId(b, 'I'), nextId(b, 'I'), nextId(b, 'F')];
    expect(seqA).toEqual(seqB);
  });

  it('leitet den Startzustand aus vorhandenen IDs einer Datenbank ab (kollisionsfrei)', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@'));
    db.individuals.set('@I5@', makePerson('@I5@'));
    const alloc = allocatorFromDatabase(db);
    // nächste freie INDI-Nummer ist 6, nicht 2.
    expect(nextId(alloc, 'I')).toBe('@I6@');
  });
});
