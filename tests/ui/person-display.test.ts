// tests/ui/person-display.test.ts — reine Darstellungs-Helfer (ui/shell/person-display.ts).
// Fokus hier: fullDateLabel/dateSummary (Spec 21 §6f INV-UI-9, ADR-v9-64) — Eigene-
// Ereignis-Kontext zeigt das VOLLE, lokalisierte Datum statt Jahr-only. Die bestehende
// yearPlaceSummary()/eventYearLabel()-Disambiguierungs-Form bleibt unverändert (siehe
// person-detail-model.test.ts/family-detail-model.test.ts für deren Abdeckung).
import { describe, expect, it } from 'vitest';
import { makeEvent } from '../../core/model';
import { makePlaceRegistry, makeHofRegistry, type PlaceContext } from '../../core/places';
import { fullDateLabel, dateSummary } from '../../ui/shell/person-display';

function emptyContext(): PlaceContext {
  return { places: makePlaceRegistry(new Map()), hofs: makeHofRegistry(new Map()) };
}

describe('fullDateLabel — volles, lokalisiertes Datum (INV-UI-9)', () => {
  it('Tag+Monat+Jahr → deutscher Monatsname', () => {
    const ev = makeEvent('BIRT', { date: '12 MAR 1890' });
    expect(fullDateLabel(ev)).toBe('12. März 1890');
  });

  it('Qualifier-Präfix wird durchgereicht (ABT → "ca.")', () => {
    const ev = makeEvent('BIRT', { date: 'ABT 1875' });
    expect(fullDateLabel(ev)).toBe('ca. 1875');
  });

  it('kein Datum → leerer String', () => {
    const ev = makeEvent('BIRT', { date: null });
    expect(fullDateLabel(ev)).toBe('');
  });
});

describe('dateSummary — kombiniert volles Datum + Ort (analog yearPlaceSummary, aber Datums-Tiefe voll)', () => {
  it('Datum + Ort → "12. März 1890, Ochtrup"', () => {
    const ev = makeEvent('BIRT', { date: '12 MAR 1890', place: 'Ochtrup' });
    expect(dateSummary(ev, emptyContext())).toBe('12. März 1890, Ochtrup');
  });

  it('nur Datum, kein Ort → nur das Datum', () => {
    const ev = makeEvent('BIRT', { date: '12 MAR 1890' });
    expect(dateSummary(ev, emptyContext())).toBe('12. März 1890');
  });

  it('nur Ort, kein Datum → nur der Ort', () => {
    const ev = makeEvent('BIRT', { date: null, place: 'Ochtrup' });
    expect(dateSummary(ev, emptyContext())).toBe('Ochtrup');
  });

  it('weder Datum noch Ort → leerer String', () => {
    const ev = makeEvent('BIRT', {});
    expect(dateSummary(ev, emptyContext())).toBe('');
  });

  it('Qualifier + Ort kombiniert', () => {
    const ev = makeEvent('DEAT', { date: 'BEF 1900', place: 'Ochtrup' });
    expect(dateSummary(ev, emptyContext())).toBe('vor 1900, Ochtrup');
  });
});
