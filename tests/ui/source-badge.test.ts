// tests/ui/source-badge.test.ts — §N-Badge + QUAY-Farbindikator (Spec 21 §7).
import { describe, expect, it } from 'vitest';
import { makeCitation, makeSource } from '../../core/model';
import { badgeLabel, badgeNumber, badgeTitle, quayClass } from '../../ui/shell/source-badge';

describe('badgeNumber/badgeLabel — §N aus dem numerischen ID-Teil', () => {
  it('extrahiert die Zahl aus einer GEDCOM-ID wie @S042@', () => {
    expect(badgeNumber('@S042@')).toBe('042');
  });

  it('baut das Label §N ohne Seiten-Suffix, wenn keine Seite gesetzt ist', () => {
    const cit = makeCitation('@S42@');
    expect(badgeLabel(cit)).toBe('§42');
  });

  it('hängt eine kurze Seitenangabe (<=5 Zeichen) als Suffix an', () => {
    const cit = makeCitation('@S42@', { page: '15' });
    expect(badgeLabel(cit)).toBe('§42·15');
  });

  it('lässt eine zu lange Seitenangabe weg (>5 Zeichen)', () => {
    const cit = makeCitation('@S42@', { page: 'S. 15-22 ff' });
    expect(badgeLabel(cit)).toBe('§42');
  });
});

describe('quayClass — QUAY-Farbindikator q0..q3', () => {
  it.each([0, 1, 2, 3] as const)('mappt quay=%s auf src-badge--q%s', (q) => {
    const cit = makeCitation('@S1@', { quay: q });
    expect(quayClass(cit)).toBe(`src-badge--q${q}`);
  });
});

describe('badgeTitle — Tooltip zeigt den Quellentitel, nicht die GEDCOM-ID', () => {
  it('bevorzugt den Kurznamen (abbr)', () => {
    const cit = makeCitation('@S1@');
    const src = makeSource('@S1@', { abbr: 'KB Ochtrup', title: 'Kirchenbuch Ochtrup, Band 3' });
    expect(badgeTitle(cit, src)).toBe('KB Ochtrup');
  });

  it('fällt auf den vollen Titel zurück, wenn kein Kurzname gesetzt ist', () => {
    const cit = makeCitation('@S1@');
    const src = makeSource('@S1@', { title: 'Kirchenbuch Ochtrup' });
    expect(badgeTitle(cit, src)).toBe('Kirchenbuch Ochtrup');
  });

  it('fällt auf die rohe Quellen-ID zurück, wenn die Quelle nicht (mehr) existiert', () => {
    const cit = makeCitation('@S404@');
    expect(badgeTitle(cit, undefined)).toBe('@S404@');
  });
});
