// tests/ui/event-grouping.test.ts — DIE EINE Gruppierungsfunktion (INV-UI-4), inkl.
// optionalem `order`-Parameter für feste (nicht-alphabetische) Kategorie-Reihenfolge
// (Nutzer-Vorgabe 2026-07-10). Reine Funktion (TST-5).
import { describe, expect, it } from 'vitest';
import { groupByKey } from '../../ui/shell/event-grouping';

describe('groupByKey — ohne order (Default, bestehendes Verhalten)', () => {
  it('gruppiert und sortiert Gruppen alphabetisch (de)', () => {
    const rows = [{ v: 1, t: 'B' }, { v: 2, t: 'A' }, { v: 3, t: 'B' }];
    const groups = groupByKey(rows, (r) => r.t);
    expect(groups.map((g) => g.type)).toEqual(['A', 'B']);
    expect(groups.find((g) => g.type === 'B')!.rows.map((r) => r.v)).toEqual([1, 3]);
  });
});

describe('groupByKey — mit order (feste Reihenfolge, Nutzer-Vorgabe 2026-07-10)', () => {
  it('sortiert Gruppen nach der übergebenen Reihenfolge statt alphabetisch', () => {
    const rows = [{ t: 'Beruf' }, { t: 'Lebensdaten' }, { t: 'Bildung' }];
    const groups = groupByKey(rows, (r) => r.t, ['Lebensdaten', 'Bildung', 'Beruf']);
    // Alphabetisch wäre "Beruf, Bildung, Lebensdaten" — die feste Reihenfolge gewinnt.
    expect(groups.map((g) => g.type)).toEqual(['Lebensdaten', 'Bildung', 'Beruf']);
  });

  it('Gruppen, die nicht in order vorkommen, sortieren ans Ende (alphabetisch untereinander)', () => {
    const rows = [{ t: 'Sonstiges' }, { t: 'Lebensdaten' }, { t: 'Anderes' }];
    const groups = groupByKey(rows, (r) => r.t, ['Lebensdaten']);
    expect(groups.map((g) => g.type)).toEqual(['Lebensdaten', 'Anderes', 'Sonstiges']);
  });
});
