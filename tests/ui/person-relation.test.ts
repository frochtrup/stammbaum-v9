// tests/ui/person-relation.test.ts — die Verwandtschafts-Zeile des Steckbriefs als reine
// Query (BL-365, ADR-v9-274 E7). Unit statt Component (TST-5); die Darstellung selbst prüft
// PersonDetail.component.test.ts.
import { describe, expect, it } from 'vitest';
import { makeDatabase, makeFamily, makePerson } from '../../core/model';
import type { ChildLink } from '../../core/model/types';
import { relationLineFor } from '../../ui/views/person/person-relation';

function childLink(familyId: string): ChildLink {
  return { familyId, pedigree: 'birth', fatherRel: '', motherRel: '', fatherRelSeen: false, motherRelSeen: false, citations: [] };
}

/** Otto (@I1@) ist der Vater von Sohn (@I2@). */
function vaterUndSohn() {
  const db = makeDatabase();
  db.individuals.set('@I1@', makePerson('@I1@', { given: 'Otto', surname: 'Alt', sex: 'M', parentIn: ['@F1@'] }));
  db.individuals.set('@I2@', makePerson('@I2@', { given: 'Sohn', surname: 'Alt', sex: 'M', childOf: [childLink('@F1@')] }));
  db.families.set('@F1@', makeFamily('@F1@', { husband: '@I1@', children: ['@I2@'] }));
  return db;
}

const proband = (id: string | null) => ({ getProband: () => id });

describe('relationLineFor', () => {
  it('nennt Grad und Bezugsperson getrennt', () => {
    expect(relationLineFor(vaterUndSohn(), proband('@I1@'), '@I2@')).toEqual({
      degree: 'Sohn',
      suffix: 'von Otto Alt',
      text: 'Sohn von Otto Alt',
    });
  });

  it('ohne GESETZTEN Probanden keine Zeile — die Vorbelegung zählt hier bewusst nicht', () => {
    expect(relationLineFor(vaterUndSohn(), proband(null), '@I2@')).toBeNull();
  });

  it('am Probanden selbst keine Zeile (das sagt „★ Proband")', () => {
    expect(relationLineFor(vaterUndSohn(), proband('@I1@'), '@I1@')).toBeNull();
  });

  it('ohne angezeigte Person keine Zeile', () => {
    expect(relationLineFor(vaterUndSohn(), proband('@I1@'), null)).toBeNull();
  });

  it('nach einem Datei-Wechsel: gesetzte Id nicht mehr im Bestand → keine Zeile', () => {
    expect(relationLineFor(vaterUndSohn(), proband('@I999@'), '@I2@')).toBeNull();
  });

  it('ohne gemeinsamen Vorfahren sagt sie genau das', () => {
    const db = vaterUndSohn();
    db.individuals.set('@I9@', makePerson('@I9@', { given: 'Fremd', surname: 'Neu' }));
    expect(relationLineFor(db, proband('@I1@'), '@I9@')).toEqual({
      degree: '',
      suffix: 'nicht mit Otto Alt verwandt',
      text: 'nicht mit Otto Alt verwandt',
    });
  });
});
