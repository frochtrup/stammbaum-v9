// tests/ui/curation-dedup.test.ts — geteilte Massen-Dedup-Gewinner-Heuristik
// (ui/shell/curation-dedup.ts, Spec 11 §9.2 "Verwendungszahl → Koordinaten → Notiz →
// kleinste ID"). Reine Funktion (TST-5).
import { describe, expect, it } from 'vitest';
import { pickWinnerId, type DedupCandidateMeta } from '../../ui/shell/curation-dedup';

function meta(entries: [string, DedupCandidateMeta][]): Map<string, DedupCandidateMeta> {
  return new Map(entries);
}

describe('pickWinnerId — Spec 11 §9.2 Gewinner-Heuristik', () => {
  it('höhere Verwendungszahl gewinnt', () => {
    const m = meta([
      ['@A@', { usage: 1, hasCoords: false, hasNote: false }],
      ['@B@', { usage: 5, hasCoords: false, hasNote: false }],
    ]);
    expect(pickWinnerId(['@A@', '@B@'], m)).toBe('@B@');
  });

  it('bei gleicher Verwendungszahl: Koordinaten vorhanden gewinnt', () => {
    const m = meta([
      ['@A@', { usage: 1, hasCoords: false, hasNote: false }],
      ['@B@', { usage: 1, hasCoords: true, hasNote: false }],
    ]);
    expect(pickWinnerId(['@A@', '@B@'], m)).toBe('@B@');
  });

  it('bei gleicher Verwendungszahl + Koordinaten: Notiz vorhanden gewinnt', () => {
    const m = meta([
      ['@A@', { usage: 1, hasCoords: true, hasNote: false }],
      ['@B@', { usage: 1, hasCoords: true, hasNote: true }],
    ]);
    expect(pickWinnerId(['@A@', '@B@'], m)).toBe('@B@');
  });

  it('bei völliger Gleichheit: kleinste ID gewinnt (deterministischer Tie-Breaker)', () => {
    const m = meta([
      ['@B@', { usage: 0, hasCoords: false, hasNote: false }],
      ['@A@', { usage: 0, hasCoords: false, hasNote: false }],
    ]);
    expect(pickWinnerId(['@B@', '@A@'], m)).toBe('@A@');
  });

  it('fehlender Meta-Eintrag zählt als 0/false (defensiv)', () => {
    const m = meta([['@A@', { usage: 3, hasCoords: false, hasNote: false }]]);
    expect(pickWinnerId(['@A@', '@MISSING@'], m)).toBe('@A@');
  });
});
