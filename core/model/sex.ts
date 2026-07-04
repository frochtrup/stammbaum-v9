// core/model/sex.ts — INV-P1: sex ∈ {M, F, U}; unbekannt/leer → U (Spec 10 §6).
import type { Sex } from './types';

/** Normiert einen beliebigen Roh-Wert auf {M, F, U}. Unbekannt/leer → U. */
export function normalizeSex(raw: string | null | undefined): Sex {
  if (raw == null) return 'U';
  const v = raw.trim().toUpperCase();
  if (v === 'M') return 'M';
  if (v === 'F') return 'F';
  return 'U';
}
