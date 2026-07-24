// INV-P2: Jede referenzierte ID existiert oder wird als verwaiste Referenz GEMELDET
// (nicht still ignoriert). Spec 10 §6.
import { describe, it, expect } from 'vitest';
import {
  makeDatabase,
  makePerson,
  makeFamily,
  makeSource,
  findOrphanRefs,
} from '../../core/model/index';

describe('INV-P2: verwaiste Referenzen werden gemeldet', () => {
  it('meldet nichts für eine konsistente Datenbank', () => {
    const db = makeDatabase();
    const src = makeSource('@S1@');
    db.sources.set(src.id, src);
    const husb = makePerson('@I1@');
    const wife = makePerson('@I2@');
    const child = makePerson('@I3@');
    const fam = makeFamily('@F1@', { husband: husb.id, wife: wife.id, children: [child.id] });
    for (const p of [husb, wife, child]) db.individuals.set(p.id, p);
    db.families.set(fam.id, fam);
    husb.parentIn = ['@F1@'];
    wife.parentIn = ['@F1@'];
    child.childOf = [{ familyId: '@F1@', pedigree: '', fatherRel: '', motherRel: '', fatherRelSeen: false, motherRelSeen: false, citations: [] }];

    expect(findOrphanRefs(db)).toEqual([]);
  });

  it('meldet fehlende husband/wife/children-Referenz einer Familie', () => {
    const db = makeDatabase();
    const fam = makeFamily('@F1@', { husband: '@I99@', wife: '@I98@', children: ['@I97@'] });
    db.families.set(fam.id, fam);

    const orphans = findOrphanRefs(db);
    const missing = orphans.map((o) => o.targetId).sort();
    expect(missing).toEqual(['@I97@', '@I98@', '@I99@']);
    // Jede Meldung nennt Quelle, Feld und fehlendes Ziel — nicht still ignoriert.
    for (const o of orphans) {
      expect(o.ownerId).toBe('@F1@');
      expect(o.kind).toBe('missing-ref');
      expect(typeof o.field).toBe('string');
    }
  });

  it('meldet fehlende sourceId in einer Zitation', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@');
    p.topLevelCitations = [
      { sourceId: '@S404@', page: '12', quay: 2, note: '', media: [], eval: null, deepLinkUrl: '', grampsHandle: null },
    ];
    db.individuals.set(p.id, p);

    const orphans = findOrphanRefs(db);
    expect(orphans).toHaveLength(1);
    expect(orphans[0].targetId).toBe('@S404@');
    expect(orphans[0].field).toContain('citation');
  });

  it('meldet fehlende association-/alias-Referenz', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@');
    p.associations = [{ personRef: '@I50@', grampsHandle: null, role: 'Pate', note: '', citations: [] }];
    p.aliases = ['@I60@'];
    db.individuals.set(p.id, p);

    const targets = findOrphanRefs(db).map((o) => o.targetId).sort();
    expect(targets).toEqual(['@I50@', '@I60@']);
  });

  it('meldet fehlende childOf-/parentIn-Familienreferenz einer Person', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@');
    p.parentIn = ['@F77@'];
    p.childOf = [{ familyId: '@F88@', pedigree: '', fatherRel: '', motherRel: '', fatherRelSeen: false, motherRelSeen: false, citations: [] }];
    db.individuals.set(p.id, p);

    const targets = findOrphanRefs(db).map((o) => o.targetId).sort();
    expect(targets).toEqual(['@F77@', '@F88@']);
  });
});
