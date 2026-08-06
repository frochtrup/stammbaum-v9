// tests/ui/curation-dedup.test.ts — geteilte Massen-Dedup-Gewinner-Heuristik
// (ui/shell/curation-dedup.ts, Spec 11 §9.2). Reihenfolge seit ADR-v9-225:
// KURATIERT → Verwendungszahl → Koordinaten → Notiz → kleinste ID. Reine Funktion (TST-5).
import { describe, expect, it } from 'vitest';
import { pickWinnerId, type DedupCandidateMeta } from '../../ui/shell/curation-dedup';

function meta(entries: [string, DedupCandidateMeta][]): Map<string, DedupCandidateMeta> {
  return new Map(entries);
}

describe('pickWinnerId — Spec 11 §9.2 Gewinner-Heuristik', () => {
  // ADR-v9-225, am Realbestand gemessener Beinahe-Verlust: ein kuratierter Ort (2
  // Namensvarianten, 6 datierte Ketten-Einträge, Koordinaten, Ortsgeschichte) OHNE
  // Ereignisbezug stand neben einer Seed-Dublette, die das eine Ereignis trug. Die alte
  // Reihenfolge schlug die Dublette vor — und seit ADR-v9-222 behält der Gewinner nur
  // seine eigenen Angaben, der Vorschlag hätte die Kuration gelöscht. Die Ereignisse
  // folgen dem Gewinner ohnehin (`placeRemap`); die Verwendungszahl war nie ein Argument
  // FÜR ein Objekt, nur ein Proxy für „wird gebraucht".
  it('KURATIERT schlägt die höhere Verwendungszahl (der Aligse-Fall)', () => {
    const m = meta([
      ['@SEED@', { usage: 7, hasCoords: false, hasNote: false, curated: false }],
      ['@KURATIERT@', { usage: 0, hasCoords: true, hasNote: true, curated: true }],
    ]);
    expect(pickWinnerId(['@SEED@', '@KURATIERT@'], m)).toBe('@KURATIERT@');
  });

  it('unter kuratierten Kandidaten entscheidet weiterhin die Verwendungszahl', () => {
    const m = meta([
      ['@A@', { usage: 1, hasCoords: false, hasNote: false, curated: true }],
      ['@B@', { usage: 5, hasCoords: false, hasNote: false, curated: true }],
    ]);
    expect(pickWinnerId(['@A@', '@B@'], m)).toBe('@B@');
  });

  it('höhere Verwendungszahl gewinnt', () => {
    const m = meta([
      ['@A@', { usage: 1, hasCoords: false, hasNote: false, curated: false }],
      ['@B@', { usage: 5, hasCoords: false, hasNote: false, curated: false }],
    ]);
    expect(pickWinnerId(['@A@', '@B@'], m)).toBe('@B@');
  });

  it('bei gleicher Verwendungszahl: Koordinaten vorhanden gewinnt', () => {
    const m = meta([
      ['@A@', { usage: 1, hasCoords: false, hasNote: false, curated: false }],
      ['@B@', { usage: 1, hasCoords: true, hasNote: false, curated: false }],
    ]);
    expect(pickWinnerId(['@A@', '@B@'], m)).toBe('@B@');
  });

  it('bei gleicher Verwendungszahl + Koordinaten: Notiz vorhanden gewinnt', () => {
    const m = meta([
      ['@A@', { usage: 1, hasCoords: true, hasNote: false, curated: false }],
      ['@B@', { usage: 1, hasCoords: true, hasNote: true, curated: false }],
    ]);
    expect(pickWinnerId(['@A@', '@B@'], m)).toBe('@B@');
  });

  it('bei völliger Gleichheit: kleinste ID gewinnt (deterministischer Tie-Breaker)', () => {
    const m = meta([
      ['@B@', { usage: 0, hasCoords: false, hasNote: false, curated: false }],
      ['@A@', { usage: 0, hasCoords: false, hasNote: false, curated: false }],
    ]);
    expect(pickWinnerId(['@B@', '@A@'], m)).toBe('@A@');
  });

  it('fehlender Meta-Eintrag zählt als 0/false (defensiv)', () => {
    const m = meta([['@A@', { usage: 3, hasCoords: false, hasNote: false, curated: false }]]);
    expect(pickWinnerId(['@A@', '@MISSING@'], m)).toBe('@A@');
  });
});
