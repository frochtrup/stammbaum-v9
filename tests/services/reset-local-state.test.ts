// tests/services/reset-local-state.test.ts — die zwei Selbsthilfe-Aktionen (Spec 14 §3.3,
// [ADR-v9-297]).
//
// DER WÄCHTER, um den es hier eigentlich geht: der Warnhinweis vor „Alles zurücksetzen"
// zählt auf, was verschwindet. Diese Aufzählung darf nicht neben der Store-Liste her
// existieren — sonst nennt sie nach dem nächsten neuen Store neun von zehn Dingen und
// sieht trotzdem vollständig aus. Der erste Test hält die Kopplung mechanisch fest.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ALL_STORES, STORE_PLACES_MIRROR } from '../../services/idb-schema';
import { LOKALE_DATEN, resetAllLocalState, resetPlacesMirror } from '../../services/reset-local-state';

vi.mock('../../services/idb-schema', async (echt) => {
  const m = await echt<typeof import('../../services/idb-schema')>();
  return { ...m, idbClearStores: vi.fn(() => Promise.resolve()) };
});
const { idbClearStores } = await import('../../services/idb-schema');

beforeEach(() => vi.mocked(idbClearStores).mockClear());

describe('LOKALE_DATEN — die Aufzählung im Warnhinweis', () => {
  it('nennt JEDEN Store aus ALL_STORES (sonst wäre der Hinweis unvollständig)', () => {
    expect(ALL_STORES.length).toBeGreaterThan(0);
    const genannt = new Set(LOKALE_DATEN.map((d) => d.store));
    expect([...ALL_STORES].filter((s) => !genannt.has(s))).toEqual([]);
  });

  it('erfindet keinen Posten, den es nicht gibt (die Gegenrichtung)', () => {
    const vorhanden = new Set(ALL_STORES);
    expect(LOKALE_DATEN.filter((d) => !vorhanden.has(d.store)).map((d) => d.store)).toEqual([]);
  });

  it('das Unwiederbringliche steht oben — der Hinweis wird von oben gelesen', () => {
    const raenge = { nein: 0, 'nur-mit-export': 0, ja: 0 } as Record<string, number>;
    LOKALE_DATEN.forEach((d, i) => { if (!raenge[d.woher]) raenge[d.woher] = i; });
    const letzteUnwiederbringlich = LOKALE_DATEN.map((d) => d.woher).lastIndexOf('nein');
    const ersteWiederbeschaffbar = LOKALE_DATEN.map((d) => d.woher).indexOf('ja');
    expect(letzteUnwiederbringlich).toBeLessThan(ersteWiederbeschaffbar);
  });

  it('die kuratierten Orte sind als „nur mit Export" markiert — sie stehen in keiner GEDCOM', () => {
    const orte = LOKALE_DATEN.find((d) => d.store === STORE_PLACES_MIRROR);
    expect(orte?.woher).toBe('nur-mit-export');
  });
});

describe('die beiden Aktionen', () => {
  it('„Ortsdaten zurücksetzen" fasst NUR den Spiegel an', async () => {
    await resetPlacesMirror();
    expect(idbClearStores).toHaveBeenCalledWith([STORE_PLACES_MIRROR]);
  });

  it('„Alles zurücksetzen" geht über ALL_STORES, nicht über eine eigene Liste', async () => {
    await resetAllLocalState();
    expect(idbClearStores).toHaveBeenCalledWith(ALL_STORES);
  });
});
