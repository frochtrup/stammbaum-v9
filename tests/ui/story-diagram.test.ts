// tests/ui/story-diagram.test.ts — Inline-Diagramm des Story-Modus (BL-188, Spec 20 §1.10).
// Reine Funktion db+Ref→SVG-String; gleiche Traversierung wie die Baum-Insel (kein zweiter
// Rechenweg). Wächter: bleibt unskipped.
import { describe, expect, it } from 'vitest';
import { makeDatabase, makePerson, makeFamily, makeEvent } from '../../core/model';
import type { ChildLink } from '../../core/model/types';
import { buildStoryDiagramSvg } from '../../ui/islands/story/story-diagram';

function childLink(familyId: string): ChildLink {
  return { familyId, pedigree: 'birth', fatherRel: '', motherRel: '', fatherRelSeen: false, motherRelSeen: false, citations: [] };
}

function makeTree(): ReturnType<typeof makeDatabase> {
  const db = makeDatabase();
  db.individuals.set('I1', makePerson('I1', {
    given: 'Otto', surname: 'Meyer', sex: 'M',
    birth: makeEvent('BIRT', { date: '1850' }), death: makeEvent('DEAT', { date: '1920' }),
    childOf: [childLink('F1')], parentIn: ['F2'],
  }));
  db.individuals.set('I2', makePerson('I2', { given: 'Hans', surname: 'Meyer', sex: 'M', parentIn: ['F1'] }));
  db.individuals.set('I3', makePerson('I3', { given: 'Anna', surname: 'Schmidt', sex: 'F', parentIn: ['F1'] }));
  db.individuals.set('I4', makePerson('I4', { given: 'Berta', surname: 'Klein', sex: 'F', parentIn: ['F2'] }));
  db.individuals.set('I5', makePerson('I5', { given: 'Carl', surname: 'Meyer', sex: 'M', birth: makeEvent('BIRT', { date: '1880' }), childOf: [childLink('F2')] }));
  db.families.set('F1', makeFamily('F1', { husband: 'I2', wife: 'I3', children: ['I1'] }));
  db.families.set('F2', makeFamily('F2', { husband: 'I1', wife: 'I4', children: ['I5'], marriage: makeEvent('MARR', { date: '1878' }) }));
  return db;
}

describe('buildStoryDiagramSvg — Person', () => {
  const svg = buildStoryDiagramSvg(makeTree(), { subject: 'person', id: 'I1' });

  it('selbst-enthaltenes SVG, keine externen Ressourcen', () => {
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).not.toMatch(/\bsrc=|<image|\bhref=/);
  });

  it('zeigt Eltern, Proband+Partner und Kind mit klickbaren Karten (data-person-id)', () => {
    for (const id of ['I1', 'I2', 'I3', 'I4', 'I5']) {
      expect(svg).toContain(`data-person-id="${id}"`);
    }
    // Kompakte Karten zeigen den Vornamen.
    expect(svg).toContain('>Otto<');
    expect(svg).toContain('>Carl<');
  });

  it('unbekannte Person → leerer String', () => {
    expect(buildStoryDiagramSvg(makeTree(), { subject: 'person', id: 'IX' })).toBe('');
  });
});

describe('buildStoryDiagramSvg — Familie', () => {
  const svg = buildStoryDiagramSvg(makeTree(), { subject: 'family', id: 'F2' });

  it('zeigt Paar + Kind', () => {
    expect(svg).toContain('data-person-id="I1"');
    expect(svg).toContain('data-person-id="I4"');
    expect(svg).toContain('data-person-id="I5"');
  });

  it('unbekannte Familie → leerer String', () => {
    expect(buildStoryDiagramSvg(makeTree(), { subject: 'family', id: 'FX' })).toBe('');
  });
});
