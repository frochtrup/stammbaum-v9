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
import { buildSourceDetail } from '../../ui/views/source/source-detail-model';

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
  });
});
