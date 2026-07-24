// tests/ui/citation-refs.test.ts — Traversierung aller Zitatstellen der Datenbank
// (Spec 20 §1.6 [K]: Grundlage für Referenzzähler + Quellen-Detail-Referenzliste).
import { describe, expect, it } from 'vitest';
import { makeCitation, makeDatabase, makeFamily, makePerson } from '../../core/model';
import { collectCitationRefs } from '../../ui/views/source/citation-refs';

describe('collectCitationRefs — alle Zitatstellen über Personen und Familien', () => {
  it('sammelt Zitate aus Sonder-Events, freien Events, Namen, Kindschaft und Assoziationen einer Person', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.birth.citations.push(makeCitation('@S1@'));
    p.events.push({
      type: 'EVEN',
      value: '',
      eventType: 'Beruf',
      date: null,
      datePhrase: '',
      place: null,
      placeId: null,
      hofId: null,
      lati: null,
      long: null,
      addr: '',
      note: '',
      citations: [makeCitation('@S2@')],
      media: [],
      seen: true,
      grampsHandle: null,
    });
    p.topLevelCitations.push(makeCitation('@S3@'));
    p.nameCitations.push(makeCitation('@S4@'));
    p.childOf.push({
      familyId: '@F1@',
      pedigree: 'birth',
      fatherRel: '',
      motherRel: '',
      fatherRelSeen: false,
      motherRelSeen: false,
      citations: [makeCitation('@S5@')],
    });
    p.associations.push({
      personRef: '@I2@',
      grampsHandle: null,
      role: 'Zeuge',
      note: '',
      citations: [makeCitation('@S6@')],
    });
    db.individuals.set('@I1@', p);

    const refs = collectCitationRefs(db);

    expect(refs.map((r) => r.citation.sourceId).sort()).toEqual(['@S1@', '@S2@', '@S3@', '@S4@', '@S5@', '@S6@']);
    expect(refs.every((r) => r.ownerKind === 'person' && r.ownerId === '@I1@')).toBe(true);
  });

  it('sammelt Zitate aus Familien-Ereignissen und Familien-Top-Level', () => {
    const db = makeDatabase();
    const f = makeFamily('@F1@');
    f.marriage.citations.push(makeCitation('@S10@'));
    f.citations.push(makeCitation('@S11@'));
    db.families.set('@F1@', f);

    const refs = collectCitationRefs(db);

    expect(refs.map((r) => r.citation.sourceId).sort()).toEqual(['@S10@', '@S11@']);
    expect(refs.every((r) => r.ownerKind === 'family' && r.ownerId === '@F1@')).toBe(true);
  });

  it('gibt eine leere Liste zurück, wenn keine Zitate vorhanden sind', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@'));

    expect(collectCitationRefs(db)).toEqual([]);
  });
});
