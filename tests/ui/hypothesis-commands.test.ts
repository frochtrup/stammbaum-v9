// tests/ui/hypothesis-commands.test.ts — Mutations-Kommandos für Hypothesis (Spec 12
// §4, Spec 20 §1.11 [S]). Kein DOM nötig (reine Datenmutation) — läuft im globalen
// 'node'-Environment. Hypothesis HAT eine id (anders als LogEntry), adressierbar wie Task.
import { describe, expect, it } from 'vitest';
import { makeDatabase, makePerson, makeFamily } from '../../core/model/index';
import {
  addHypothesis,
  updateHypothesis,
  deleteHypothesis,
  newHypothesisId,
} from '../../ui/views/hypotheses/hypothesis-commands';

describe('addHypothesis — legt eine Hypothese an Person oder Familie an', () => {
  it('fügt eine Hypothese zu einer Person hinzu, created wird injiziert (kein Date.now() im Kommando)', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@'));

    const ok = addHypothesis(db, 'person', '@I1@', 'h1', { text: 'Vermutlich derselbe Josef' }, '2026-07-07');

    expect(ok).toBe(true);
    const h = db.individuals.get('@I1@')!.hypotheses[0]!;
    expect(h.text).toBe('Vermutlich derselbe Josef');
    expect(h.created).toBe('2026-07-07');
    expect(h.status).toBe('open');
    expect(h.weight).toBe('medium');
  });

  it('fügt eine Hypothese zu einer Familie hinzu', () => {
    const db = makeDatabase();
    db.families.set('@F1@', makeFamily('@F1@'));

    const ok = addHypothesis(db, 'family', '@F1@', 'h1', { text: 'x' }, '2026-07-07');

    expect(ok).toBe(true);
    expect(db.families.get('@F1@')!.hypotheses).toHaveLength(1);
  });

  it('übernimmt einen expliziten patch.created statt now, falls gesetzt', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@'));

    addHypothesis(db, 'person', '@I1@', 'h1', { text: 'x', created: '2020-01-01' }, '2026-07-07');

    expect(db.individuals.get('@I1@')!.hypotheses[0]!.created).toBe('2020-01-01');
  });

  it('gibt false zurück, wenn die Zielentität nicht existiert (kein stiller Verlust)', () => {
    const db = makeDatabase();
    expect(addHypothesis(db, 'person', '@I999@', 'h1', { text: 'x' }, '2026-07-07')).toBe(false);
  });
});

describe('updateHypothesis — ersetzt eine bestehende Hypothese vollständig', () => {
  it('aktualisiert Text/Status/Gewicht, id bleibt erhalten', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@'));
    addHypothesis(db, 'person', '@I1@', 'h1', { text: 'alt', status: 'open' }, '2026-07-07');

    const ok = updateHypothesis(db, 'person', '@I1@', 'h1', { text: 'neu', status: 'confirmed', weight: 'high' });

    expect(ok).toBe(true);
    const h = db.individuals.get('@I1@')!.hypotheses[0]!;
    expect(h.id).toBe('h1');
    expect(h.text).toBe('neu');
    expect(h.status).toBe('confirmed');
    expect(h.weight).toBe('high');
  });

  it('behält nicht im patch enthaltene Felder bei (Teil-Update)', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@'));
    addHypothesis(db, 'person', '@I1@', 'h1', { text: 'x', rationale: 'Begründung bleibt' }, '2026-07-07');

    updateHypothesis(db, 'person', '@I1@', 'h1', { status: 'rejected' });

    expect(db.individuals.get('@I1@')!.hypotheses[0]!.rationale).toBe('Begründung bleibt');
  });

  it('gibt false zurück, wenn die Hypothese nicht existiert', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@'));
    expect(updateHypothesis(db, 'person', '@I1@', 'missing', { text: 'x' })).toBe(false);
  });
});

describe('deleteHypothesis — entfernt eine Hypothese', () => {
  it('entfernt genau die angegebene Hypothese', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@'));
    addHypothesis(db, 'person', '@I1@', 'h1', { text: 'a' }, '2026-07-07');
    addHypothesis(db, 'person', '@I1@', 'h2', { text: 'b' }, '2026-07-07');

    const ok = deleteHypothesis(db, 'person', '@I1@', 'h1');

    expect(ok).toBe(true);
    const remaining = db.individuals.get('@I1@')!.hypotheses;
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe('h2');
  });

  it('gibt false zurück, wenn nichts entfernt wurde', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@'));
    expect(deleteHypothesis(db, 'person', '@I1@', 'missing')).toBe(false);
  });
});

describe('newHypothesisId — liefert eindeutige, deterministisch strukturierte IDs', () => {
  it('liefert unterschiedliche IDs bei wiederholtem Aufruf, mit h_-Präfix', () => {
    const a = newHypothesisId();
    const b = newHypothesisId();
    expect(a).toMatch(/^h_/);
    expect(a).not.toBe(b);
  });
});
