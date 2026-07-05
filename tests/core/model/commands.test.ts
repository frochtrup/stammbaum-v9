// Spec 20 §2 ("Bearbeitung & Formulare", savePerson(model)-Muster) + Spec 10 §2 (Person).
// Reine Upsert-/Delete-Kommandos, analog core/places/commands.ts (savePlaceObject).
// KEINE Relationship-Graph-Seiteneffekte (childOf/parentIn/Family.* außerhalb Scope,
// Spec 20 §1.87 [S/E]) — analog deletePlaceObject, das enclosedBy auch nicht nachführt.
import { describe, it, expect } from 'vitest';
import { savePerson, deletePerson } from '../../../core/model/commands';
import { makePerson } from '../../../core/model/index';
import type { Person, PersonId } from '../../../core/model/types';

function fresh(): Map<PersonId, Person> {
  return new Map<PersonId, Person>();
}

describe('savePerson — Upsert per id', () => {
  it('legt eine neue Person an', () => {
    const map = fresh();
    const p = makePerson('@I1@');
    savePerson(map, p);
    expect(map.get('@I1@')).toBe(p);
    expect(map.size).toBe(1);
  });

  it('ersetzt eine bestehende Person vollständig (per id)', () => {
    const map = fresh();
    const p1 = makePerson('@I1@');
    p1.given = 'Alt';
    savePerson(map, p1);

    const p2 = makePerson('@I1@');
    p2.given = 'Neu';
    savePerson(map, p2);

    expect(map.size).toBe(1);
    expect(map.get('@I1@')).toBe(p2);
    expect(map.get('@I1@')!.given).toBe('Neu');
  });

  it('rührt andere Personen nicht an', () => {
    const map = fresh();
    const a = makePerson('@I1@');
    const b = makePerson('@I2@');
    savePerson(map, a);
    savePerson(map, b);
    expect(map.size).toBe(2);
    expect(map.get('@I1@')).toBe(a);
    expect(map.get('@I2@')).toBe(b);
  });

  it('fasst KEINE Beziehungs-Referenzen an (childOf/parentIn bleiben wie übergeben)', () => {
    const map = fresh();
    const p = makePerson('@I1@');
    p.parentIn = ['@F9@'];
    p.childOf = [];
    savePerson(map, p);
    // savePerson ersetzt nur das Objekt — kein Graph-Seiteneffekt.
    expect(map.get('@I1@')!.parentIn).toEqual(['@F9@']);
    expect(map.get('@I1@')!.childOf).toEqual([]);
  });
});

describe('deletePerson — Entfernen per id', () => {
  it('entfernt eine vorhandene Person', () => {
    const map = fresh();
    savePerson(map, makePerson('@I1@'));
    deletePerson(map, '@I1@');
    expect(map.has('@I1@')).toBe(false);
    expect(map.size).toBe(0);
  });

  it('ist ein No-Op bei unbekannter id', () => {
    const map = fresh();
    savePerson(map, makePerson('@I1@'));
    deletePerson(map, '@I999@');
    expect(map.size).toBe(1);
  });

  it('führt KEINE Familien-Referenzen nach (außerhalb Scope, wie deletePlaceObject)', () => {
    const map = fresh();
    const p = makePerson('@I1@');
    p.parentIn = ['@F1@'];
    savePerson(map, p);
    deletePerson(map, '@I1@');
    // Nur die Person selbst ist weg; keine Kaskade in Family-Objekte (die diese Funktion
    // gar nicht kennt) — bewusst außerhalb dieser Scheibe.
    expect(map.has('@I1@')).toBe(false);
  });
});
