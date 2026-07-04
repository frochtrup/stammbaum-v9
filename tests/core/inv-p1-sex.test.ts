// INV-P1: sex ∈ {M, F, U}; unbekannt/leer → U.
// Spec 10 §6 (10-Domaenenmodell.md). Kontrakt-Matrix 32 §6, Zeile Spec 10.
import { describe, it, expect } from 'vitest';
import { normalizeSex, makePerson } from '../../core/model/index';

describe('INV-P1: sex-Normalisierung', () => {
  it('akzeptiert M/F/U unverändert', () => {
    expect(normalizeSex('M')).toBe('M');
    expect(normalizeSex('F')).toBe('F');
    expect(normalizeSex('U')).toBe('U');
  });

  it('normiert leeren/fehlenden Wert auf U', () => {
    expect(normalizeSex('')).toBe('U');
    expect(normalizeSex(undefined)).toBe('U');
    expect(normalizeSex(null)).toBe('U');
  });

  it('normiert unbekannten Wert auf U', () => {
    expect(normalizeSex('X')).toBe('U');
    expect(normalizeSex('male')).toBe('U');
    expect(normalizeSex('1')).toBe('U');
  });

  it('normiert Klein-/Weißraum-Varianten von M/F', () => {
    expect(normalizeSex('m')).toBe('M');
    expect(normalizeSex(' f ')).toBe('F');
  });

  it('makePerson setzt sex immer auf einen gültigen Wert', () => {
    expect(makePerson('@I1@').sex).toBe('U');
    expect(makePerson('@I2@', { sex: normalizeSex('m') }).sex).toBe('M');
    expect(makePerson('@I3@', { sex: normalizeSex('unsinn') }).sex).toBe('U');
  });
});
