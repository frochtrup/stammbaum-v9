// tests/ui/repository-model.test.ts — Archiv-Liste + -Detail (Spec 20 §1.6 [K]:
// "Archive (Repository): Picker, Detail mit verlinkten Quellen, Signatur"). Reine
// Funktionen, deshalb Unit statt Component-Test (TST-5).
import { describe, expect, it } from 'vitest';
import { makeDatabase, makeRepository, makeSource } from '../../core/model';
import { buildRepositoryRows, countSourcesByRepository } from '../../ui/views/repository/repository-list-model';
import { buildRepositoryDetail } from '../../ui/views/repository/repository-detail-model';

describe('buildRepositoryRows — Name/Typ/Quellenzähler, alphabetisch sortiert', () => {
  it('zählt Quellen pro Archiv über Source.repo', () => {
    const db = makeDatabase();
    db.repositories.set('@R1@', makeRepository('@R1@', { name: 'Bistumsarchiv' }));
    db.sources.set('@S1@', makeSource('@S1@', { repo: '@R1@' }));
    db.sources.set('@S2@', makeSource('@S2@', { repo: '@R1@' }));

    const rows = buildRepositoryRows(db);

    expect(rows[0].sourceCount).toBe(2);
  });

  it('zeigt 0 Quellen, wenn kein Quelle auf das Archiv verweist', () => {
    const db = makeDatabase();
    db.repositories.set('@R1@', makeRepository('@R1@', { name: 'Leeres Archiv' }));

    const rows = buildRepositoryRows(db);

    expect(rows[0].sourceCount).toBe(0);
  });

  it('sortiert Archive alphabetisch nach Namen', () => {
    const db = makeDatabase();
    db.repositories.set('@R1@', makeRepository('@R1@', { name: 'Zebra-Archiv' }));
    db.repositories.set('@R2@', makeRepository('@R2@', { name: 'Anton-Archiv' }));

    const rows = buildRepositoryRows(db);

    expect(rows.map((r) => r.id)).toEqual(['@R2@', '@R1@']);
  });
});

describe('countSourcesByRepository', () => {
  it('ignoriert Quellen ohne Archiv-Zuordnung', () => {
    const db = makeDatabase();
    db.sources.set('@S1@', makeSource('@S1@'));

    const counts = countSourcesByRepository(db);

    expect(counts.size).toBe(0);
  });
});

describe('buildRepositoryDetail — verlinkte Quellen inkl. Signatur', () => {
  it('gibt null zurück, wenn die id im aktuellen Datenbestand fehlt (definierter Fallback)', () => {
    const db = makeDatabase();
    expect(buildRepositoryDetail(db, '@R999@')).toBeNull();
  });

  it('listet alle Quellen, die auf das Archiv verweisen, mit Signatur', () => {
    const db = makeDatabase();
    db.repositories.set('@R1@', makeRepository('@R1@', { name: 'Bistumsarchiv' }));
    db.sources.set('@S1@', makeSource('@S1@', { repo: '@R1@', abbr: 'KB', callNumber: 'A-12' }));
    db.sources.set('@S2@', makeSource('@S2@', { repo: '@R2@' }));

    const detail = buildRepositoryDetail(db, '@R1@')!;

    expect(detail.sources).toHaveLength(1);
    expect(detail.sources[0]).toMatchObject({ sourceId: '@S1@', label: 'KB', callNumber: 'A-12' });
  });

  it('liefert eine leere Quellenliste, wenn kein Quelle verweist', () => {
    const db = makeDatabase();
    db.repositories.set('@R1@', makeRepository('@R1@'));

    const detail = buildRepositoryDetail(db, '@R1@')!;

    expect(detail.sources).toEqual([]);
  });
});
