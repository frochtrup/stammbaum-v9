// tests/ui/media/media-detail-model.test.ts — Spec 20 §1.4 [S] "② Medium-Detail" /
// "③ Referenzliste". Reine Modell-Logik (kein DOM) — TST-5 Testpyramide.
import { describe, it, expect } from 'vitest';
import { buildMediaDetail } from '../../../ui/views/media/media-detail-model';
import {
  makeDatabase,
  makeMedia,
  makeMediaCitation,
  makePerson,
  makeFamily,
  makeSource,
  makeCitation,
} from '../../../core/model/index';
import type { Database } from '../../../core/model/types';

describe('buildMediaDetail', () => {
  it('liefert null bei unbekannter id (definierter Fallback, kein Wurf)', () => {
    expect(buildMediaDetail(makeDatabase(), 'unbekannt')).toBeNull();
  });

  it('liefert media + displayTitle', () => {
    const db = makeDatabase();
    db.media.set('a.jpg', makeMedia('a.jpg', { title: 'Anna' }));
    const detail = buildMediaDetail(db, 'a.jpg')!;
    expect(detail.media.id).toBe('a.jpg');
    expect(detail.displayTitle).toBe('Anna');
  });

  it('Person-Top-Level-Referenz ist EDITIERBAR (Spec 20 §1.4 [S] "+Person")', () => {
    const db = makeDatabase();
    db.media.set('a.jpg', makeMedia('a.jpg'));
    const p = makePerson('@I1@');
    p.given = 'Anna';
    p.surname = 'Bild';
    p.media = [makeMediaCitation('a.jpg')];
    db.individuals.set(p.id, p);

    const detail = buildMediaDetail(db, 'a.jpg')!;
    const ref = detail.references.find((r) => r.ownerKind === 'person')!;
    expect(ref.editable).toBe(true);
    expect(ref.ownerId).toBe('@I1@');
    expect(ref.ownerKindForNav).toBe('person');
    expect(ref.context).toBe('Person');
  });

  it('Familien-Heirat-Referenz ist EDITIERBAR (Spec 20 §1.4 [S] "+Familie" hängt an marriage)', () => {
    const db = makeDatabase();
    db.media.set('a.jpg', makeMedia('a.jpg'));
    const f = makeFamily('@F1@');
    f.marriage.media = [makeMediaCitation('a.jpg')];
    db.families.set(f.id, f);

    const detail = buildMediaDetail(db, 'a.jpg')!;
    const ref = detail.references.find((r) => r.ownerKind === 'family')!;
    expect(ref.editable).toBe(true);
    expect(ref.context).toBe('Heirat');
  });

  it('Familien-Verlobung-Referenz ist NUR LESEND (kein "+Familie"-Speicherziel)', () => {
    const db = makeDatabase();
    db.media.set('a.jpg', makeMedia('a.jpg'));
    const f = makeFamily('@F1@');
    f.engagement.media = [makeMediaCitation('a.jpg')];
    db.families.set(f.id, f);

    const detail = buildMediaDetail(db, 'a.jpg')!;
    const ref = detail.references.find((r) => r.ownerKind === 'family')!;
    expect(ref.editable).toBe(false);
    expect(ref.context).toBe('Verlobung');
  });

  it('Quellen-Top-Level-Referenz ist EDITIERBAR (Spec 20 §1.4 [S] "+Quelle")', () => {
    const db = makeDatabase();
    db.media.set('a.jpg', makeMedia('a.jpg'));
    const s = makeSource('@S1@');
    s.abbr = 'Standesamt';
    s.media = [makeMediaCitation('a.jpg')];
    db.sources.set(s.id, s);

    const detail = buildMediaDetail(db, 'a.jpg')!;
    const ref = detail.references.find((r) => r.ownerKind === 'source')!;
    expect(ref.editable).toBe(true);
    expect(ref.ownerLabel).toBe('Standesamt');
  });

  it('Event- und Citation-Fundstellen sind SICHTBAR, aber NICHT editierbar (bewusste Scope-Grenze, TST-9)', () => {
    const db = makeDatabase();
    db.media.set('a.jpg', makeMedia('a.jpg'));
    const p = makePerson('@I1@');
    p.birth.media = [makeMediaCitation('a.jpg')];
    const s = makeSource('@S2@');
    s.abbr = 'Kirchenbuch';
    db.sources.set(s.id, s);
    p.birth.citations = [makeCitation('@S2@', { media: [makeMediaCitation('a.jpg')] })];
    db.individuals.set(p.id, p);

    const detail = buildMediaDetail(db, 'a.jpg')!;
    const eventRef = detail.references.find((r) => r.ownerKind === 'event')!;
    const citationRef = detail.references.find((r) => r.ownerKind === 'citation')!;
    expect(eventRef.editable).toBe(false);
    expect(eventRef.context).toBe('Geburt');
    expect(citationRef.editable).toBe(false);
    expect(citationRef.context).toBe('Zitat: Kirchenbuch');
  });

  it('referencesByType gruppiert nach context (analog SourceDetail)', () => {
    const db = makeDatabase();
    db.media.set('a.jpg', makeMedia('a.jpg'));
    const p1 = makePerson('@I1@');
    p1.media = [makeMediaCitation('a.jpg')];
    const p2 = makePerson('@I2@');
    p2.media = [makeMediaCitation('a.jpg')];
    db.individuals.set(p1.id, p1);
    db.individuals.set(p2.id, p2);

    const detail = buildMediaDetail(db, 'a.jpg')!;
    const personGroup = detail.referencesByType.find((g) => g.type === 'Person')!;
    expect(personGroup.rows).toHaveLength(2);
  });

  describe('Kapazitäts-Fall (TST-7): dicht referenziertes Medium', () => {
    it('sammelt Referenzen von 100 Personen auf DASSELBE Medium ohne Verlust', () => {
      const db: Database = makeDatabase();
      db.media.set('a.jpg', makeMedia('a.jpg'));
      for (let i = 0; i < 100; i++) {
        const p = makePerson(`@I${i}@`);
        p.media = [makeMediaCitation('a.jpg')];
        db.individuals.set(p.id, p);
      }
      const detail = buildMediaDetail(db, 'a.jpg')!;
      expect(detail.references).toHaveLength(100);
      expect(detail.references.every((r) => r.editable)).toBe(true);
    });
  });
});
