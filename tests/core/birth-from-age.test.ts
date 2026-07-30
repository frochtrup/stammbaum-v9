// tests/core/birth-from-age.test.ts — Geburtsdatum aus Sterbedatum + Sterbealter
// (BL-212, ADR-v9-156). Die KODIERUNG stammt aus dem v8-Orakel (`ui-quicktpl.js`
// `_qtCalcBirthFromAge`), nicht aus eigener Erfindung — insbesondere `CAL` („errechnet"),
// nicht `ABT` („ungefähr"): der Wert ist gerechnet, nicht geschätzt (TST-6 Wert-Ebene).
import { describe, expect, it } from 'vitest';
import { birthDateFromDeathAge } from '../../core/model/birth-from-age';

describe('birthDateFromDeathAge — Genauigkeit folgt dem Sterbedatum', () => {
  it('volles Sterbedatum → volles errechnetes Geburtsdatum', () => {
    expect(birthDateFromDeathAge('3 MAR 1832', 25, 0, 0)).toBe('CAL 3 MAR 1807');
  });

  it('rechnet Monate und Tage mit, inkl. Monatsübertrag', () => {
    // 3. März minus 2 Monate 5 Tage = 29. Dezember des Vorjahres.
    expect(birthDateFromDeathAge('3 MAR 1832', 25, 2, 5)).toBe('CAL 29 DEC 1806');
  });

  it('nur Monat+Jahr bekannt → Ergebnis bleibt monatsgenau (kein erfundener Tag)', () => {
    expect(birthDateFromDeathAge('MAR 1832', 25, 0, 0)).toBe('CAL MAR 1807');
    expect(birthDateFromDeathAge('MAR 1832', 25, 4, 0)).toBe('CAL NOV 1806');
  });

  it('nur Jahr bekannt → Ergebnis bleibt jahresgenau', () => {
    expect(birthDateFromDeathAge('1832', 25, 0, 0)).toBe('CAL 1807');
    // Monate/Tage können ein Jahr-only-Datum nicht verfeinern — sie werden ignoriert,
    // nicht in einen scheingenauen Tag umgerechnet.
    expect(birthDateFromDeathAge('1832', 25, 7, 12)).toBe('CAL 1807');
  });

  it('ein Qualifier am Sterbedatum wird abgestreift, der Monat NICHT (Orakel-Whitelist)', () => {
    expect(birthDateFromDeathAge('ABT 3 MAR 1832', 25, 0, 0)).toBe('CAL 3 MAR 1807');
    expect(birthDateFromDeathAge('BEF MAR 1832', 10, 0, 0)).toBe('CAL MAR 1822');
  });

  it('ohne Jahr im Sterbedatum ist nichts errechenbar', () => {
    expect(birthDateFromDeathAge('', 25, 0, 0)).toBeNull();
    expect(birthDateFromDeathAge(null, 25, 0, 0)).toBeNull();
    expect(birthDateFromDeathAge('unlesbar', 25, 0, 0)).toBeNull();
  });

  it('ohne Altersangabe (alles 0/leer) wird nichts errechnet', () => {
    expect(birthDateFromDeathAge('3 MAR 1832', 0, 0, 0)).toBeNull();
    expect(birthDateFromDeathAge('3 MAR 1832', null, null, null)).toBeNull();
  });

  it('ein Säuglingsalter (0 Jahre, aber Monate/Tage) ist eine gültige Angabe', () => {
    expect(birthDateFromDeathAge('10 JUN 1850', 0, 3, 0)).toBe('CAL 10 MAR 1850');
    expect(birthDateFromDeathAge('10 JUN 1850', 0, 0, 9)).toBe('CAL 1 JUN 1850');
  });

  it('negative oder unsinnige Alterswerte liefern kein Datum', () => {
    expect(birthDateFromDeathAge('3 MAR 1832', -5, 0, 0)).toBeNull();
    expect(birthDateFromDeathAge('3 MAR 1832', 250, 0, 0)).toBeNull();
  });
});
