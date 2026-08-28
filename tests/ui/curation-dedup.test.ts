// tests/ui/curation-dedup.test.ts — geteilte Massen-Dedup-Gewinner-Heuristik
// (ui/shell/curation-dedup.ts, Spec 11 §9.2). Reihenfolge seit [ADR-v9-296]:
// KURATIERT → Anreicherungs-Grad → datierte Perioden → Verwendungszahl → kleinste ID.
// Reine Funktion (TST-5).
import { describe, expect, it } from 'vitest';
import { pickWinnerId, type DedupCandidateMeta } from '../../ui/shell/curation-dedup';

/** Basis-Kandidat; jeder Test überschreibt genau die Achse, um die es ihm geht. */
const k = (p: Partial<DedupCandidateMeta> = {}): DedupCandidateMeta => ({
  curated: false, level: 'none', datiertePerioden: 0, usage: 0, ...p,
});
function meta(entries: [string, DedupCandidateMeta][]): Map<string, DedupCandidateMeta> {
  return new Map(entries);
}

describe('pickWinnerId — Spec 11 §9.2 Gewinner-Heuristik', () => {
  // ADR-v9-225, am Realbestand gemessener Beinahe-Verlust: ein kuratierter Ort (2
  // Namensvarianten, 6 datierte Ketten-Einträge, Koordinaten, Ortsgeschichte) OHNE
  // Ereignisbezug stand neben einer Seed-Dublette, die das eine Ereignis trug. Die damalige
  // Reihenfolge schlug die Dublette vor — und seit ADR-v9-222 behält der Gewinner nur seine
  // eigenen Angaben, der Vorschlag hätte die Kuration gelöscht.
  it('KURATIERT schlägt alles andere (der Aligse-Fall)', () => {
    const m = meta([
      ['@SEED@', k({ usage: 7, datiertePerioden: 9, level: 'rich' })],
      ['@KURATIERT@', k({ curated: true })],
    ]);
    expect(pickWinnerId(['@SEED@', '@KURATIERT@'], m)).toBe('@KURATIERT@');
  });

  it('unter Kuratierten entscheidet der Anreicherungs-Grad (der Deutschland-Fall)', () => {
    // Gemessen: `Deutschland` (rich, 8 datierte Namensperioden) neben zwei nackten
    // GOV-Platzhaltern `Deutscher Bund`/`Norddeutscher Bund` (sparse).
    const m = meta([
      ['@BUND@', k({ curated: true, level: 'sparse', datiertePerioden: 1 })],
      ['@DE@', k({ curated: true, level: 'rich', datiertePerioden: 8 })],
    ]);
    expect(pickWinnerId(['@BUND@', '@DE@'], m)).toBe('@DE@');
  });

  it('bei gleichem Grad entscheiden die datierten Perioden (der Schlesien-Fall)', () => {
    // Beide `rich`, beide kuratiert, beide mit Koordinaten UND Notiz, beide ohne
    // Ereignisbezug — bis ADR-v9-296 entschied hier der ID-String.
    const m = meta([
      ['@A_PROV_NIEDERSCHLESIEN@', k({ curated: true, level: 'rich', datiertePerioden: 2 })],
      ['@Z_SCHLESIEN@', k({ curated: true, level: 'rich', datiertePerioden: 5 })],
    ]);
    expect(pickWinnerId(['@A_PROV_NIEDERSCHLESIEN@', '@Z_SCHLESIEN@'], m)).toBe('@Z_SCHLESIEN@');
  });

  // Nutzer-Entscheidung 2026-08-27: „die Verwendung sagt nichts über die Güte des
  // gepflegten Ortes, also nach hinten schieben."
  it('die Verwendungszahl steht HINTER beiden Evidenz-Kriterien', () => {
    const m = meta([
      ['@VIEL_GENUTZT@', k({ curated: true, level: 'rich', datiertePerioden: 0, usage: 99 })],
      ['@GEPFLEGT@', k({ curated: true, level: 'rich', datiertePerioden: 3, usage: 0 })],
    ]);
    expect(pickWinnerId(['@VIEL_GENUTZT@', '@GEPFLEGT@'], m)).toBe('@GEPFLEGT@');
  });

  it('… entscheidet aber weiterhin, wenn die Evidenz gleichsteht', () => {
    const m = meta([
      ['@A@', k({ curated: true, level: 'rich', datiertePerioden: 3, usage: 1 })],
      ['@B@', k({ curated: true, level: 'rich', datiertePerioden: 3, usage: 5 })],
    ]);
    expect(pickWinnerId(['@A@', '@B@'], m)).toBe('@B@');
  });

  it('bei völliger Gleichheit: kleinste ID (deterministischer Tie-Breaker)', () => {
    const m = meta([['@B@', k()], ['@A@', k()]]);
    expect(pickWinnerId(['@B@', '@A@'], m)).toBe('@A@');
  });

  it('fehlender Meta-Eintrag zählt als 0/none/false (defensiv)', () => {
    const m = meta([['@A@', k({ usage: 3 })]]);
    expect(pickWinnerId(['@A@', '@MISSING@'], m)).toBe('@A@');
  });

  it('deterministisch: die Eingabe-Reihenfolge ändert das Ergebnis nicht', () => {
    const m = meta([
      ['@A@', k({ curated: true, level: 'rich', datiertePerioden: 5 })],
      ['@B@', k({ curated: true, level: 'rich', datiertePerioden: 5, usage: 2 })],
      ['@C@', k({ curated: true, level: 'sparse', datiertePerioden: 9 })],
    ]);
    expect(pickWinnerId(['@A@', '@B@', '@C@'], m)).toBe('@B@');
    expect(pickWinnerId(['@C@', '@B@', '@A@'], m)).toBe('@B@');
  });
});
