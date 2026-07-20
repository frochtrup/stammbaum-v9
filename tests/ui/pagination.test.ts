// tests/ui/pagination.test.ts — Slice-Arithmetik für "N weitere laden" (Spec 21 §10b).
import { describe, expect, it } from 'vitest';
import { pageSlice, DEFAULT_PAGE_SIZE } from '../../ui/shell/pagination';

describe('pageSlice', () => {
  it('zeigt alle Elemente + remaining=0, wenn weniger als "shown" vorhanden sind', () => {
    const items = [1, 2, 3];
    const result = pageSlice(items, DEFAULT_PAGE_SIZE);
    expect(result.visible).toEqual([1, 2, 3]);
    expect(result.remaining).toBe(0);
  });

  it('schneidet auf genau "shown" Elemente zu und meldet den Rest', () => {
    const items = Array.from({ length: 45 }, (_, i) => i);
    const result = pageSlice(items, 30);
    expect(result.visible).toHaveLength(30);
    expect(result.visible[29]).toBe(29);
    expect(result.remaining).toBe(15);
  });

  it('ein zweiter Aufruf mit shown+PAGE_SIZE zeigt alle restlichen Elemente (TST-7 Kapazitäts-Fall)', () => {
    const items = Array.from({ length: 45 }, (_, i) => i);
    const first = pageSlice(items, DEFAULT_PAGE_SIZE);
    const second = pageSlice(items, first.visible.length + DEFAULT_PAGE_SIZE);
    expect(second.visible).toHaveLength(45);
    expect(second.remaining).toBe(0);
  });

  it('leere Liste liefert leeres visible + remaining=0', () => {
    const result = pageSlice([], DEFAULT_PAGE_SIZE);
    expect(result.visible).toEqual([]);
    expect(result.remaining).toBe(0);
  });

  it('shown=0 zeigt nichts, meldet aber die volle Länge als remaining', () => {
    const items = [1, 2, 3];
    const result = pageSlice(items, 0);
    expect(result.visible).toEqual([]);
    expect(result.remaining).toBe(3);
  });
});
