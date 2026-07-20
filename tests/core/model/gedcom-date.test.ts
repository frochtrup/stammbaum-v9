// Spec 10 §5.2 (Datumsmodell) + Spec 20 §2 ("Datum: Qualifier-Dropdown + Tag/Monat/Jahr").
// Reine Formular-Hilfslogik: rohen GEDCOM-Datumsstring ⇄ editierbare Teile.
// KEIN Bezug zum GEDCOM-Parser/Writer (core/interop bleibt unberührt).
import { describe, it, expect } from 'vitest';
import {
  parseDateValue,
  formatDateValue,
  normalizeMonth,
  formatDateForDisplay,
  type DateParts,
} from '../../../core/model/gedcom-date';

describe('parseDateValue — alle 8 Qualifier (Spec 10 §5.2)', () => {
  it('exakt (kein Qualifier)', () => {
    expect(parseDateValue('12 MAR 1890')).toEqual({
      qualifier: 'EXACT',
      day: 12, month: 'MAR', year: 1890,
      day2: null, month2: null, year2: null,
    });
  });

  it('ABT', () => {
    expect(parseDateValue('ABT 1875')).toEqual({
      qualifier: 'ABT', day: null, month: null, year: 1875,
      day2: null, month2: null, year2: null,
    });
  });

  it('CAL', () => {
    expect(parseDateValue('CAL 1875')).toMatchObject({ qualifier: 'CAL', year: 1875 });
  });

  it('EST', () => {
    expect(parseDateValue('EST 1875')).toMatchObject({ qualifier: 'EST', year: 1875 });
  });

  it('BEF', () => {
    expect(parseDateValue('BEF 1900')).toMatchObject({ qualifier: 'BEF', year: 1900 });
  });

  it('AFT', () => {
    expect(parseDateValue('AFT 1850')).toMatchObject({ qualifier: 'AFT', year: 1850 });
  });

  it('BET…AND… — beide Grenzen belegt', () => {
    expect(parseDateValue('BET 1880 AND 1890')).toEqual({
      qualifier: 'BET', day: null, month: null, year: 1880,
      day2: null, month2: null, year2: 1890,
    });
  });

  it('FROM…TO… — beide Grenzen belegt', () => {
    expect(parseDateValue('FROM 1985 TO 2005')).toEqual({
      qualifier: 'FROM', day: null, month: null, year: 1985,
      day2: null, month2: null, year2: 2005,
    });
  });

  it('BET mit vollen Teildaten auf beiden Seiten', () => {
    expect(parseDateValue('BET 1 JAN 1880 AND 31 DEC 1890')).toEqual({
      qualifier: 'BET', day: 1, month: 'JAN', year: 1880,
      day2: 31, month2: 'DEC', year2: 1890,
    });
  });
});

describe('parseDateValue — Teildatum-Varianten', () => {
  it('nur Jahr', () => {
    expect(parseDateValue('1890')).toEqual({
      qualifier: 'EXACT', day: null, month: null, year: 1890,
      day2: null, month2: null, year2: null,
    });
  });

  it('Monat + Jahr', () => {
    expect(parseDateValue('MAR 1890')).toEqual({
      qualifier: 'EXACT', day: null, month: 'MAR', year: 1890,
      day2: null, month2: null, year2: null,
    });
  });

  it('Tag + Monat + Jahr', () => {
    expect(parseDateValue('5 JUN 1900')).toMatchObject({ day: 5, month: 'JUN', year: 1900 });
  });

  it('ABT + Monat + Jahr', () => {
    expect(parseDateValue('ABT MAR 1875')).toMatchObject({
      qualifier: 'ABT', day: null, month: 'MAR', year: 1875,
    });
  });
});

describe('parseDateValue — defensiver Fehlerfall (nicht parsbarer Monat)', () => {
  it('unbekannter Monat → month: null statt Crash', () => {
    const p = parseDateValue('12 FOO 1890');
    expect(p.month).toBeNull();
    expect(p.day).toBe(12);
    expect(p.year).toBe(1890);
  });
});

describe('normalizeMonth — Zahl / DE / EN → JAN..DEC', () => {
  it('Zahlen 1-12', () => {
    expect(normalizeMonth(1)).toBe('JAN');
    expect(normalizeMonth('1')).toBe('JAN');
    expect(normalizeMonth(12)).toBe('DEC');
    expect(normalizeMonth('03')).toBe('MAR');
  });

  it('deutsche Monatsnamen (voll + kurz, case-insensitiv)', () => {
    expect(normalizeMonth('Januar')).toBe('JAN');
    expect(normalizeMonth('januar')).toBe('JAN');
    expect(normalizeMonth('Jan')).toBe('JAN');
    expect(normalizeMonth('März')).toBe('MAR');
    expect(normalizeMonth('Maerz')).toBe('MAR');
    expect(normalizeMonth('Dezember')).toBe('DEC');
    expect(normalizeMonth('Mai')).toBe('MAY');
    expect(normalizeMonth('Oktober')).toBe('OCT');
  });

  it('englische Monatsnamen (voll + kurz, case-insensitiv)', () => {
    expect(normalizeMonth('January')).toBe('JAN');
    expect(normalizeMonth('january')).toBe('JAN');
    expect(normalizeMonth('JAN')).toBe('JAN');
    expect(normalizeMonth('December')).toBe('DEC');
    expect(normalizeMonth('May')).toBe('MAY');
  });

  it('ungültig → null', () => {
    expect(normalizeMonth(0)).toBeNull();
    expect(normalizeMonth(13)).toBeNull();
    expect(normalizeMonth('foo')).toBeNull();
    expect(normalizeMonth('')).toBeNull();
  });
});

describe('formatDateValue — inverse Operation', () => {
  it('baut exaktes Volldatum', () => {
    const parts: DateParts = {
      qualifier: 'EXACT', day: 12, month: 'MAR', year: 1890,
      day2: null, month2: null, year2: null,
    };
    expect(formatDateValue(parts)).toBe('12 MAR 1890');
  });

  it('baut BET…AND…', () => {
    const parts: DateParts = {
      qualifier: 'BET', day: null, month: null, year: 1880,
      day2: null, month2: null, year2: 1890,
    };
    expect(formatDateValue(parts)).toBe('BET 1880 AND 1890');
  });

  it('baut FROM…TO…', () => {
    const parts: DateParts = {
      qualifier: 'FROM', day: null, month: null, year: 1985,
      day2: null, month2: null, year2: 2005,
    };
    expect(formatDateValue(parts)).toBe('FROM 1985 TO 2005');
  });
});

describe('formatDateForDisplay — volles, lokalisiertes Datum (Spec 10 §5.2, INV-UI-9)', () => {
  it('leer/null/undefiniert → \'\' (unverändert zum bisherigen Verhalten bei fehlendem Datum)', () => {
    expect(formatDateForDisplay(null)).toBe('');
    expect(formatDateForDisplay('')).toBe('');
    expect(formatDateForDisplay('   ')).toBe('');
  });

  it('Tag+Monat+Jahr → deutscher Monatsname, "12. März 1890"', () => {
    expect(formatDateForDisplay('12 MAR 1890')).toBe('12. März 1890');
  });

  it('nur Monat+Jahr (kein Tag) → "März 1890"', () => {
    expect(formatDateForDisplay('MAR 1890')).toBe('März 1890');
  });

  it('nur Jahr → "1890"', () => {
    expect(formatDateForDisplay('1890')).toBe('1890');
  });

  it('alle 12 Monate übersetzen korrekt', () => {
    expect(formatDateForDisplay('1 JAN 2000')).toBe('1. Januar 2000');
    expect(formatDateForDisplay('1 FEB 2000')).toBe('1. Februar 2000');
    expect(formatDateForDisplay('1 MAR 2000')).toBe('1. März 2000');
    expect(formatDateForDisplay('1 APR 2000')).toBe('1. April 2000');
    expect(formatDateForDisplay('1 MAY 2000')).toBe('1. Mai 2000');
    expect(formatDateForDisplay('1 JUN 2000')).toBe('1. Juni 2000');
    expect(formatDateForDisplay('1 JUL 2000')).toBe('1. Juli 2000');
    expect(formatDateForDisplay('1 AUG 2000')).toBe('1. August 2000');
    expect(formatDateForDisplay('1 SEP 2000')).toBe('1. September 2000');
    expect(formatDateForDisplay('1 OCT 2000')).toBe('1. Oktober 2000');
    expect(formatDateForDisplay('1 NOV 2000')).toBe('1. November 2000');
    expect(formatDateForDisplay('1 DEC 2000')).toBe('1. Dezember 2000');
  });

  it('ABT → "ca. <Datum>"', () => {
    expect(formatDateForDisplay('ABT 1875')).toBe('ca. 1875');
    expect(formatDateForDisplay('ABT MAR 1875')).toBe('ca. März 1875');
    expect(formatDateForDisplay('ABT 12 MAR 1875')).toBe('ca. 12. März 1875');
  });

  it('CAL → "errechnet <Datum>"', () => {
    expect(formatDateForDisplay('CAL 1875')).toBe('errechnet 1875');
  });

  it('EST → "geschätzt <Datum>"', () => {
    expect(formatDateForDisplay('EST 1875')).toBe('geschätzt 1875');
  });

  it('BEF → "vor <Datum>"', () => {
    expect(formatDateForDisplay('BEF 1900')).toBe('vor 1900');
    expect(formatDateForDisplay('BEF MAR 1900')).toBe('vor März 1900');
  });

  it('AFT → "nach <Datum>"', () => {
    expect(formatDateForDisplay('AFT 1850')).toBe('nach 1850');
    expect(formatDateForDisplay('AFT 5 JUN 1850')).toBe('nach 5. Juni 1850');
  });

  it('BET…AND… → "zwischen <Datum1> und <Datum2>"', () => {
    expect(formatDateForDisplay('BET 1880 AND 1890')).toBe('zwischen 1880 und 1890');
  });

  it('BET…AND… mit vollen Teildaten auf beiden Seiten', () => {
    expect(formatDateForDisplay('BET 1 JAN 1880 AND 31 DEC 1890')).toBe(
      'zwischen 1. Januar 1880 und 31. Dezember 1890',
    );
  });

  it('FROM…TO… → "<Datum1>–<Datum2>"', () => {
    expect(formatDateForDisplay('FROM 1985 TO 2005')).toBe('1985–2005');
  });

  it('FROM…TO… mit vollen Teildaten auf beiden Seiten', () => {
    expect(formatDateForDisplay('FROM 1 JAN 1985 TO 31 DEC 2005')).toBe(
      '1. Januar 1985–31. Dezember 2005',
    );
  });

  it('nutzt denselben parseDateValue-Parser (kein zweiter Parser, INV-UI-9/INV-UI-4) — Roundtrip über beide Formate stimmt konzeptionell überein', () => {
    // Kein zweiter Parser bedeutet: ein Wert, den parseDateValue nicht sinnvoll zerlegen
    // kann (z. B. ein unbekannter Monat), führt zu demselben defensiven Verhalten wie dort
    // (kein Crash, day/year bleiben erhalten, Monat fällt weg).
    expect(formatDateForDisplay('12 FOO 1890')).toBe('12. 1890');
  });
});

describe('Roundtrip-Identität: formatDateValue(parseDateValue(raw)) === raw', () => {
  const cases = [
    '12 MAR 1890',
    'MAR 1890',
    '1890',
    'ABT 1875',
    'ABT MAR 1875',
    'ABT 12 MAR 1875',
    'CAL 1875',
    'EST 1875',
    'BEF 1900',
    'BEF MAR 1900',
    'AFT 1850',
    'AFT 5 JUN 1850',
    'BET 1880 AND 1890',
    'BET MAR 1880 AND APR 1890',
    'BET 1 JAN 1880 AND 31 DEC 1890',
    'FROM 1985 TO 2005',
    'FROM MAR 1985 TO APR 2005',
    'FROM 1 JAN 1985 TO 31 DEC 2005',
  ];
  for (const raw of cases) {
    it(`roundtrip: "${raw}"`, () => {
      expect(formatDateValue(parseDateValue(raw))).toBe(raw);
    });
  }
});
