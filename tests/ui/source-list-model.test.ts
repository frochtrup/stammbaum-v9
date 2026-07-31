// tests/ui/source-list-model.test.ts — Quellen-Listen-Aufbereitung (Spec 20 §1.6 [K]):
// Kurzname, Autor, Datum, Referenzzähler über alle Personen/Familien. Reine Funktion,
// deshalb Unit statt Component-Test (TST-5).
import { describe, expect, it } from 'vitest';
import { makeCitation, makeDatabase, makeFamily, makePerson, makeSource, makeRepository, makeMediaCitation } from '../../core/model';
import { buildSourceRows, countReferencesBySource } from '../../ui/views/source/source-list-model';

describe('buildSourceRows — Kurzname/Autor/Datum/Referenzzähler, alphabetisch sortiert', () => {
  it('baut eine Zeile mit Kurzname bevorzugt vor Titel', () => {
    const db = makeDatabase();
    db.sources.set('@S1@', makeSource('@S1@', { abbr: 'KB Ochtrup', title: 'Kirchenbuch Ochtrup', author: 'Pfarramt', date: '1850' }));

    const rows = buildSourceRows(db);

    expect(rows[0].label).toBe('KB Ochtrup');
    expect(rows[0].author).toBe('Pfarramt');
    expect(rows[0].date).toBe('1850');
  });

  it('fällt auf den Titel zurück, wenn kein Kurzname gesetzt ist', () => {
    const db = makeDatabase();
    db.sources.set('@S1@', makeSource('@S1@', { title: 'Kirchenbuch Ochtrup' }));

    const rows = buildSourceRows(db);

    expect(rows[0].label).toBe('Kirchenbuch Ochtrup');
  });

  it('zählt jedes Zitat einer Quelle über Personen UND Familien als Referenz', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@');
    p.birth.citations.push(makeCitation('@S1@'));
    p.death.citations.push(makeCitation('@S1@'));
    const f = makeFamily('@F1@');
    f.marriage.citations.push(makeCitation('@S1@'));
    db.individuals.set('@I1@', p);
    db.families.set('@F1@', f);
    db.sources.set('@S1@', makeSource('@S1@', { abbr: 'Q1' }));

    const rows = buildSourceRows(db);

    expect(rows[0].refCount).toBe(3);
  });

  it('zeigt 0 als Referenzzähler, wenn keine Zitatstelle auf die Quelle verweist (Orphan)', () => {
    const db = makeDatabase();
    db.sources.set('@S1@', makeSource('@S1@', { abbr: 'Q1' }));

    const rows = buildSourceRows(db);

    expect(rows[0].refCount).toBe(0);
  });

  it('sortiert Quellen alphabetisch nach Anzeigelabel', () => {
    const db = makeDatabase();
    db.sources.set('@S1@', makeSource('@S1@', { abbr: 'Zebra' }));
    db.sources.set('@S2@', makeSource('@S2@', { abbr: 'Anton' }));

    const rows = buildSourceRows(db);

    expect(rows.map((r) => r.id)).toEqual(['@S2@', '@S1@']);
  });
});

describe('Notizen-Badge (ADR-v9-79 Punkt 3/4) — hasNotes-Feld je Zeile', () => {
  it('Source mit nicht-leerem text → hasNotes=true', () => {
    const db = makeDatabase();
    db.sources.set('@S1@', makeSource('@S1@', { abbr: 'Q1', text: 'Zitierter Urtext' }));

    expect(buildSourceRows(db)[0].hasNotes).toBe(true);
  });

  it('Source ohne text (bzw. nur Whitespace) → hasNotes=false', () => {
    const db = makeDatabase();
    db.sources.set('@S1@', makeSource('@S1@', { abbr: 'Q1' }));
    db.sources.set('@S2@', makeSource('@S2@', { abbr: 'Q2', text: '   ' }));

    expect(buildSourceRows(db).every((r) => r.hasNotes === false)).toBe(true);
  });
});

describe('countReferencesBySource — Zitat-Map nach Quellen-Id', () => {
  it('gruppiert Zitate mehrerer Quellen getrennt', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@');
    p.birth.citations.push(makeCitation('@S1@'));
    p.death.citations.push(makeCitation('@S2@'));
    db.individuals.set('@I1@', p);

    const bySource = countReferencesBySource(db);

    expect(bySource.get('@S1@')).toHaveLength(1);
    expect(bySource.get('@S2@')).toHaveLength(1);
  });
});

describe('BL-200/202 — Medien-📎 + Archiv-🏛 in der Quellenzeile', () => {
  it('hasMedia true bei Medien-Zitat; repoName aus db.repositories aufgelöst', () => {
    const db = makeDatabase();
    db.repositories.set('@R1@', makeRepository('@R1@', { name: 'Bistumsarchiv Münster' }));
    const s = makeSource('@S1@', { abbr: 'KB', repo: '@R1@' });
    s.media.push(makeMediaCitation('scan.jpg'));
    db.sources.set('@S1@', s);
    const row = buildSourceRows(db)[0];
    expect(row.hasMedia).toBe(true);
    expect(row.repoName).toBe('Bistumsarchiv Münster');
  });

  it('freier Repo-Text wird durchgereicht; ohne Medien hasMedia=false', () => {
    const db = makeDatabase();
    db.sources.set('@S1@', makeSource('@S1@', { abbr: 'KB', repo: 'Privatbesitz' }));
    const row = buildSourceRows(db)[0];
    expect(row.repoName).toBe('Privatbesitz');
    expect(row.hasMedia).toBe(false);
  });
});
