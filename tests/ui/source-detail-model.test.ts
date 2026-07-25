// tests/ui/source-detail-model.test.ts — Quellen-Detail-Projektion (Spec 20 §1.6 [K]):
// "Detail mit allen referenzierenden Personen/Familien inkl. PAGE/QUAY". Reine
// Funktion, deshalb Unit statt Component-Test (TST-5).
import { describe, expect, it } from 'vitest';
import {
  makeCitation,
  makeDatabase,
  makeFamily,
  makePerson,
  makeRepository,
  makeSource,
} from '../../core/model';
import { buildSourceDetail, hasPageContent } from '../../ui/views/source/source-detail-model';

describe('hasPageContent (#2, reine Logik)', () => {
  it('false für den Anonymisierungs-Rest ")" und andere reine Satzzeichen/Whitespace', () => {
    expect(hasPageContent(')')).toBe(false);
    expect(hasPageContent('')).toBe(false);
    expect(hasPageContent('   ')).toBe(false);
    expect(hasPageContent('()')).toBe(false);
    expect(hasPageContent('— , .')).toBe(false);
  });

  it('true, sobald mindestens ein Buchstabe oder eine Ziffer enthalten ist', () => {
    expect(hasPageContent('12')).toBe(true);
    expect(hasPageContent('S. 93/94')).toBe(true);
    expect(hasPageContent('fol. iv')).toBe(true);
    expect(hasPageContent('(12)')).toBe(true);
  });
});

describe('buildSourceDetail — Referenzen inkl. PAGE/QUAY + verlinktes Archiv', () => {
  it('gibt null zurück, wenn die id im aktuellen Datenbestand fehlt (definierter Fallback)', () => {
    const db = makeDatabase();
    expect(buildSourceDetail(db, '@S999@')).toBeNull();
  });

  it('listet referenzierende Personen mit Kontext-Label, Seite und QUAY', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.birth.citations.push(makeCitation('@S1@', { page: '12', quay: 3 }));
    db.individuals.set('@I1@', p);
    db.sources.set('@S1@', makeSource('@S1@', { abbr: 'KB' }));

    const detail = buildSourceDetail(db, '@S1@')!;

    expect(detail.references).toHaveLength(1);
    expect(detail.references[0]).toMatchObject({
      ownerKind: 'person',
      ownerId: '@I1@',
      ownerLabel: 'Anna Bauer',
      context: 'Geburt',
      page: '12',
      quay: 3,
    });
  });

  it('listet referenzierende Familien mit Elternpaar-Label', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Otto', surname: 'Bauer' }));
    const f = makeFamily('@F1@', { husband: '@I1@' });
    f.marriage.citations.push(makeCitation('@S1@', { quay: 1 }));
    db.families.set('@F1@', f);
    db.sources.set('@S1@', makeSource('@S1@'));

    const detail = buildSourceDetail(db, '@S1@')!;

    expect(detail.references[0].ownerKind).toBe('family');
    expect(detail.references[0].ownerLabel).toBe('Otto Bauer');
  });

  it('filtert Referenzen auf die angefragte Quelle — andere Quellen tauchen nicht auf', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@');
    p.birth.citations.push(makeCitation('@S1@'));
    p.death.citations.push(makeCitation('@S2@'));
    db.individuals.set('@I1@', p);
    db.sources.set('@S1@', makeSource('@S1@'));
    db.sources.set('@S2@', makeSource('@S2@'));

    const detail = buildSourceDetail(db, '@S1@')!;

    expect(detail.references).toHaveLength(1);
    expect(detail.references[0].context).toBe('Geburt');
  });

  it('liefert das verlinkte Archiv, wenn Source.repo auf ein existierendes Repository zeigt', () => {
    const db = makeDatabase();
    db.repositories.set('@R1@', makeRepository('@R1@', { name: 'Bistumsarchiv Münster' }));
    db.sources.set('@S1@', makeSource('@S1@', { repo: '@R1@' }));

    const detail = buildSourceDetail(db, '@S1@')!;

    expect(detail.repository?.name).toBe('Bistumsarchiv Münster');
  });

  it('liefert null als Archiv, wenn kein Repository gesetzt oder es nicht existiert', () => {
    const db = makeDatabase();
    db.sources.set('@S1@', makeSource('@S1@'));

    const detail = buildSourceDetail(db, '@S1@')!;

    expect(detail.repository).toBeNull();
  });

  it('gibt eine leere Referenzliste zurück für eine unzitierte Quelle (Orphan)', () => {
    const db = makeDatabase();
    db.sources.set('@S1@', makeSource('@S1@'));

    const detail = buildSourceDetail(db, '@S1@')!;

    expect(detail.references).toEqual([]);
    expect(detail.referencesByType).toEqual([]);
  });
});

describe('buildSourceDetail — referencesByType (Spec 21 §10b, Gruppierung nach Kontext-Typ)', () => {
  it('gruppiert Referenzen nach ihrem Kontext-Label (Geburt/Tod/Heirat/…), alphabetisch (de)', () => {
    const db = makeDatabase();
    const p1 = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p1.birth.citations.push(makeCitation('@S1@'));
    p1.death.citations.push(makeCitation('@S1@'));
    const p2 = makePerson('@I2@', { given: 'Otto', surname: 'Klein' });
    p2.birth.citations.push(makeCitation('@S1@'));
    db.individuals.set('@I1@', p1);
    db.individuals.set('@I2@', p2);
    db.sources.set('@S1@', makeSource('@S1@'));

    const detail = buildSourceDetail(db, '@S1@')!;

    expect(detail.referencesByType.map((g) => g.type)).toEqual(['Geburt', 'Tod']);
    expect(detail.referencesByType.find((g) => g.type === 'Geburt')?.rows).toHaveLength(2);
    expect(detail.referencesByType.find((g) => g.type === 'Tod')?.rows).toHaveLength(1);
  });

  it('jede Referenzzeile hat einen stabilen, eindeutigen key (mehrere gleichartige Zitate derselben Person)', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.nameCitations.push(makeCitation('@S1@'));
    p.nameCitations.push(makeCitation('@S1@'));
    db.individuals.set('@I1@', p);
    db.sources.set('@S1@', makeSource('@S1@'));

    const detail = buildSourceDetail(db, '@S1@')!;

    const keys = detail.references.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('TST-7 Kapazitäts-Fall: viele Referenzen desselben Typs landen in einer Gruppe', () => {
    const db = makeDatabase();
    for (let i = 0; i < 45; i++) {
      const p = makePerson(`@I${i}@`, { given: `P${i}`, surname: 'Bauer' });
      p.birth.citations.push(makeCitation('@S1@'));
      db.individuals.set(`@I${i}@`, p);
    }
    db.sources.set('@S1@', makeSource('@S1@'));

    const detail = buildSourceDetail(db, '@S1@')!;

    expect(detail.references).toHaveLength(45);
    expect(detail.referencesByType).toHaveLength(1);
    expect(detail.referencesByType[0].rows).toHaveLength(45);
  });
});
