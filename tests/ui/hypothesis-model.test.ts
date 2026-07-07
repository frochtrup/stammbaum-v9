// tests/ui/hypothesis-model.test.ts — reine Logik der globalen Hypothesen-Liste
// (Spec 12 §4). Kein DOM nötig — läuft im globalen 'node'-Environment.
import { describe, expect, it } from 'vitest';
import { makeDatabase, makePerson, makeFamily } from '../../core/model/index';
import { addHypothesis } from '../../ui/views/hypotheses/hypothesis-commands';
import {
  collectAllHypotheses,
  filterHypotheses,
  statusLabel,
  weightLabel,
} from '../../ui/views/hypotheses/hypothesis-model';

function dbWithHypotheses() {
  const db = makeDatabase();
  db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna', surname: 'Muster' }));
  db.families.set('@F1@', makeFamily('@F1@'));
  addHypothesis(db, 'person', '@I1@', 'h1', { text: 'offene Hypothese', status: 'open' }, '2026-07-07');
  addHypothesis(db, 'person', '@I1@', 'h2', { text: 'bestätigte Hypothese', status: 'confirmed' }, '2026-07-07');
  addHypothesis(db, 'family', '@F1@', 'h3', { text: 'verworfene Hypothese', status: 'rejected' }, '2026-07-07');
  return db;
}

describe('collectAllHypotheses — sammelt über Personen UND Familien', () => {
  it('liefert alle Hypothesen aus beiden Quellen', () => {
    const entries = collectAllHypotheses(dbWithHypotheses());
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.hypothesis.id).sort()).toEqual(['h1', 'h2', 'h3']);
  });

  it('liefert ein leeres Array bei leerer Datenbank', () => {
    expect(collectAllHypotheses(makeDatabase())).toEqual([]);
  });
});

describe('filterHypotheses — filtert nach Status', () => {
  it('"all" liefert alles unverändert', () => {
    const entries = collectAllHypotheses(dbWithHypotheses());
    expect(filterHypotheses(entries, 'all')).toHaveLength(3);
  });

  it('filtert auf einen einzelnen Status', () => {
    const entries = collectAllHypotheses(dbWithHypotheses());
    expect(filterHypotheses(entries, 'open').map((e) => e.hypothesis.id)).toEqual(['h1']);
    expect(filterHypotheses(entries, 'confirmed').map((e) => e.hypothesis.id)).toEqual(['h2']);
    expect(filterHypotheses(entries, 'rejected').map((e) => e.hypothesis.id)).toEqual(['h3']);
  });
});

describe('statusLabel/weightLabel — deutsche Labels', () => {
  it('liefert die drei Status-Labels', () => {
    expect(statusLabel('open')).toBe('Offen');
    expect(statusLabel('confirmed')).toBe('Bestätigt');
    expect(statusLabel('rejected')).toBe('Verworfen');
  });

  it('liefert die drei Gewicht-Labels', () => {
    expect(weightLabel('low')).toBe('Niedrig');
    expect(weightLabel('medium')).toBe('Mittel');
    expect(weightLabel('high')).toBe('Hoch');
  });
});
