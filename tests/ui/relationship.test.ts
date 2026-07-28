// tests/ui/relationship.test.ts — Beziehungsrechner (BL-134, Spec 20 §1.12).
// Reine BFS-Logik + Grad-Benennung, headless. Orakel: v8 `calcRelationship`/`_relLabel`.
import { describe, expect, it } from 'vitest';
import { makeDatabase, makePerson, makeFamily } from '../../core/model';
import type { ChildLink, Database } from '../../core/model/types';
import { findRelationshipPath, relationshipLabel } from '../../ui/views/tools/relationship';

function childLink(familyId: string): ChildLink {
  return { familyId, pedigree: 'birth', fatherRel: '', motherRel: '', fatherRelSeen: false, motherRelSeen: false, citations: [] };
}

/**
 * Baum:  Opa Otto (I1) + Oma (I2) → F1 → Kinder Anna (I3, F) & Bernd (I4, M)
 *        Anna (F2, mit Mann I5) → Carla (I6, F)
 *        Bernd (F3, mit Frau I7) → David (I8, M) → (F4, mit I9) → Emil (I10, M)
 */
function makeTree(): Database {
  const db = makeDatabase();
  const P = (id: string, sex: 'M' | 'F', patch = {}) => db.individuals.set(id, makePerson(id, { sex, ...patch }));
  P('I1', 'M', { given: 'Otto', surname: 'Alt', parentIn: ['F1'] });
  P('I2', 'F', { given: 'Oma', surname: 'Alt', parentIn: ['F1'] });
  P('I3', 'F', { given: 'Anna', surname: 'Alt', childOf: [childLink('F1')], parentIn: ['F2'] });
  P('I4', 'M', { given: 'Bernd', surname: 'Alt', childOf: [childLink('F1')], parentIn: ['F3'] });
  P('I5', 'M', { given: 'Ehemann', surname: 'Anna', parentIn: ['F2'] });
  P('I6', 'F', { given: 'Carla', surname: 'X', childOf: [childLink('F2')] });
  P('I7', 'F', { given: 'Ehefrau', surname: 'Bernd', parentIn: ['F3'] });
  P('I8', 'M', { given: 'David', surname: 'Alt', childOf: [childLink('F3')], parentIn: ['F4'] });
  P('I9', 'F', { given: 'Frau', surname: 'David', parentIn: ['F4'] });
  P('I10', 'M', { given: 'Emil', surname: 'Alt', childOf: [childLink('F4')] });
  db.families.set('F1', makeFamily('F1', { husband: 'I1', wife: 'I2', children: ['I3', 'I4'] }));
  db.families.set('F2', makeFamily('F2', { husband: 'I5', wife: 'I3', children: ['I6'] }));
  db.families.set('F3', makeFamily('F3', { husband: 'I4', wife: 'I7', children: ['I8'] }));
  db.families.set('F4', makeFamily('F4', { husband: 'I8', wife: 'I9', children: ['I10'] }));
  return db;
}

describe('relationshipLabel (Grad-Benennung, Orakel _relLabel)', () => {
  it('direkte Vorfahren (distB=0-Seite: A ist Vorfahre von B)', () => {
    expect(relationshipLabel(0, 1, 'F')).toBe('Mutter');
    expect(relationshipLabel(0, 1, 'M')).toBe('Vater');
    expect(relationshipLabel(0, 2, 'M')).toBe('Großvater');
    expect(relationshipLabel(0, 3, 'F')).toBe('Urgroßmutter');
    expect(relationshipLabel(0, 4, 'M')).toBe('UrUrgroßvater'); // Ur.repeat (v8-Orakel-treu)
  });
  it('direkte Nachkommen', () => {
    expect(relationshipLabel(1, 0, 'M')).toBe('Sohn');
    expect(relationshipLabel(2, 0, 'F')).toBe('Enkelin');
    expect(relationshipLabel(3, 0, 'M')).toBe('Urenkel');
  });
  it('Geschwister / Onkel-Tante / Neffe-Nichte', () => {
    expect(relationshipLabel(1, 1, 'M')).toBe('Geschwister');
    expect(relationshipLabel(1, 2, 'F')).toBe('Tante'); // A näher am Vorfahren → älter
    expect(relationshipLabel(2, 1, 'M')).toBe('Neffe');
    expect(relationshipLabel(1, 3, 'M')).toBe('Großonkel');
  });
  it('Cousin-Grade mit „entfernt"', () => {
    expect(relationshipLabel(2, 2, 'M')).toBe('Cousin 1. Grads');
    expect(relationshipLabel(3, 3, 'F')).toBe('Cousine 2. Grads');
    expect(relationshipLabel(2, 3, 'M')).toBe('Cousin 1. Grads, 1× entfernt');
  });
});

describe('findRelationshipPath (BFS)', () => {
  const db = makeTree();

  it('null für ungültige/identische Eingabe', () => {
    expect(findRelationshipPath(db, 'I1', 'I1')).toBeNull();
    expect(findRelationshipPath(db, 'I1', 'IX')).toBeNull();
  });

  it('Vater → Kind', () => {
    const r = findRelationshipPath(db, 'I1', 'I3')!; // Otto (M) ist Vater von Anna
    expect(r.related).toBe(true);
    expect(r.label).toBe('Vater');
    expect(r.commonId).toBe('I1');
    expect(r.distA).toBe(0);
    expect(r.distB).toBe(1);
  });

  it('Geschwister (Anna ↔ Bernd)', () => {
    const r = findRelationshipPath(db, 'I3', 'I4')!;
    expect(r.label).toBe('Geschwister');
    expect(r.commonId).toBe('I1'); // kürzester gemeinsamer Vorfahre (Vater vor Mutter in BFS)
    expect(r.path).toEqual(['I3', 'I1', 'I4']);
  });

  it('Cousins 1. Grads (Carla ↔ David)', () => {
    const r = findRelationshipPath(db, 'I6', 'I8')!; // Carla (F) ↔ David
    expect(r.label).toBe('Cousine 1. Grads');
    expect(r.distA).toBe(2);
    expect(r.distB).toBe(2);
  });

  it('entfernte Cousins (Carla ↔ Emil, 1. Grads 1× entfernt)', () => {
    const r = findRelationshipPath(db, 'I6', 'I10')!; // Carla (Gen 2) ↔ Emil (Gen 3)
    expect(r.label).toBe('Cousine 1. Grads, 1× entfernt');
  });

  it('Großtante (Anna ↔ Emil): Anna ist Großtante von Emil', () => {
    const r = findRelationshipPath(db, 'I3', 'I10')!; // Anna dist1, Emil dist3 → Großtante
    expect(r.label).toBe('Großtante');
  });

  it('nicht verwandt', () => {
    const r = findRelationshipPath(db, 'I5', 'I7')!; // angeheiratete, kein gemeinsamer Vorfahre
    expect(r.related).toBe(false);
    expect(r.label).toBe('Nicht verwandt');
    expect(r.path).toEqual([]);
  });
});
