// Konvention α (Spec 11 §4.4) + Norm-Primitive. Extract endet beim ersten Komma/Umbruch.
import { describe, it, expect } from 'vitest';
import {
  normPlaceName,
  extractHofAddr,
  placeYear,
  placeTypeRank,
  slugify,
} from '../../core/places/index';

describe('Konvention α — extractHofAddr (Spec 11 §4.4)', () => {
  it('gibt reine Adresse unverändert zurück', () => {
    expect(extractHofAddr('Wall 33')).toBe('Wall 33');
    expect(extractHofAddr('Schulze-Hof')).toBe('Schulze-Hof');
  });

  it('endet beim ersten Komma', () => {
    expect(extractHofAddr('Wall 33, 48607 Ochtrup, Deutschland')).toBe('Wall 33');
    expect(extractHofAddr('Wall 33, Hinterhaus')).toBe('Wall 33');
  });

  it('endet beim ersten Zeilenumbruch', () => {
    expect(extractHofAddr('Wall 33\n48607 Ochtrup')).toBe('Wall 33');
  });

  it('leere/nullige Eingabe → leerer String', () => {
    expect(extractHofAddr('')).toBe('');
    expect(extractHofAddr(null)).toBe('');
    expect(extractHofAddr(undefined)).toBe('');
  });
});

describe('normPlaceName — kanonische Norm-Form', () => {
  it('casefold + NFC + Whitespace-Kollaps', () => {
    expect(normPlaceName('  Sassenberg  ')).toBe('sassenberg');
    expect(normPlaceName('SASSENBERG')).toBe(normPlaceName('sassenberg'));
    expect(normPlaceName('Ochtrup   Stadt')).toBe('ochtrup stadt');
  });
  it('idempotent + NFC-stabil (Umlaute)', () => {
    const a = normPlaceName('Münster');
    expect(normPlaceName(a)).toBe(a);
  });
});

describe('placeYear — erste 3–4-stellige Jahreszahl', () => {
  it('extrahiert aus GEDCOM/ISO/Freitext', () => {
    expect(placeYear('12 MAR 1890')).toBe(1890);
    expect(placeYear('1946-01-01')).toBe(1946);
    expect(placeYear('um 850')).toBe(850);
    expect(placeYear(null)).toBeNull();
    expect(placeYear(1912)).toBe(1912);
  });
});

describe('placeTypeRank — Siedlung vor Verwaltung', () => {
  it('spezifisch (niedrig) vor allgemein (hoch)', () => {
    expect(placeTypeRank('Town')).toBeLessThan(placeTypeRank('County'));
    expect(placeTypeRank('Village')).toBeLessThan(placeTypeRank('State'));
    expect(placeTypeRank(null)).toBe(6);
    expect(placeTypeRank('WeirdType')).toBe(6);
  });
});

describe('slugify — deterministischer ID-Slug', () => {
  it('nur [a-z0-9], Randstriche entfernt', () => {
    expect(slugify('Wall 33')).toBe('wall_33');
    expect(slugify('Oster 82a, Wester 141')).toBe('oster_82a_wester_141');
  });
});
