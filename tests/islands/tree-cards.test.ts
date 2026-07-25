// @vitest-environment happy-dom
// tests/islands/tree-cards.test.ts — geteilter Karten-Renderer (BL-121-Ring, ADR-v9-123).
// Prüft das reine Rendering (data-severity + Ring), unabhängig von den Validierungsregeln.
import { describe, expect, it } from 'vitest';
import { makeDatabase, makePerson } from '../../core/model';
import { appendPersonCard, type PersonCardSpec } from '../../ui/islands/tree/tree-cards';
import type { DrawContext } from '../../ui/islands/tree/tree-viewport';

function ctx(): DrawContext {
  return {
    wrap: document.createElement('div'),
    svg: document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
    portrait: false,
    shouldSuppressClick: () => false,
    reducedMotion: false,
  };
}

function db1(): ReturnType<typeof makeDatabase> {
  const db = makeDatabase();
  db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna', surname: 'Bauer' }));
  return db;
}

const spec = (extra: Partial<PersonCardSpec> = {}): PersonCardSpec => ({
  id: '@I1@',
  x: 0,
  y: 0,
  width: 96,
  height: 64,
  isCenter: false,
  ...extra,
});

describe('appendPersonCard — Vollständigkeits-Ring (BL-121)', () => {
  it('setzt data-severity, wenn ein Ring übergeben wird (Farbe kommt aus CSS)', () => {
    const div = appendPersonCard(ctx(), db1(), spec({ ring: { severity: 'warn', tooltip: '⚠ Geburtsdatum fehlt' } }), { onSelect: () => {} });
    expect(div!.dataset.severity).toBe('warn');
  });

  it('trägt jede der drei Schweren durch', () => {
    for (const sev of ['info', 'warn', 'error'] as const) {
      const div = appendPersonCard(ctx(), db1(), spec({ ring: { severity: sev, tooltip: 'x' } }), { onSelect: () => {} });
      expect(div!.dataset.severity).toBe(sev);
    }
  });

  it('kein data-severity ohne Ring (saubere Person)', () => {
    const div = appendPersonCard(ctx(), db1(), spec({}), { onSelect: () => {} });
    expect(div!.dataset.severity).toBeUndefined();
  });
});
