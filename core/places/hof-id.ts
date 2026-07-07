// core/places/hof-id.ts — deterministische HofId + reiner findOrCreateHof (Spec 11 §1, §6).
// HofId = `_hof_<addrSlug>_<villageSlug>` (Suffix bei Kollision). Rein: erzeugt Ergebnisse
// aus Eingaben, ohne globalen Zustand zu mutieren (TST-3, Spec 11 §4.1).
import type { HofId, PlaceId } from '../model/types';
import type { HofObject, HofObjects } from './types';
import { normHofAddr, extractHofAddr, slugify } from './normalize';

/**
 * Deterministische HofId aus (Adress-Norm, villageId). Der Kollisions-Suffix hängt
 * von den bereits existierenden Höfen (`existing`) ab — bei gleichem Kontext gleiche ID.
 */
export function makeHofId(addrNorm: string, villageId: PlaceId, existing: HofObjects): HofId {
  const slug = slugify(addrNorm) || 'x';
  const vSlug = slugify(villageId) || 'v';
  const base = `_hof_${slug}_${vSlug}`;
  if (!existing.has(base)) return base;
  let n = 1;
  let id = `${base}_${++n}`;
  while (existing.has(id)) id = `${base}_${++n}`;
  return id;
}

export interface FindOrCreateResult {
  hofId: HofId;
  /** Gesetzt, wenn ein neuer Hof entstand — der Aufrufer muss ihn einfügen. */
  created: HofObject | null;
}

/**
 * Findet einen bestehenden Hof für (addr, villageId) oder gibt einen neu zu erzeugenden
 * HofObject zurück (Bootstrap). Read-Tolerance beim Finden: Voll-Norm ODER Extract-Norm.
 * Rein: mutiert `existing` NICHT — der neue Hof kommt als `created` zurück.
 * Die addrs[0].value = Extract (Konvention α) — Nutzer-explizite Varianten laufen an
 * dieser Funktion vorbei (siehe addHofVariant).
 */
export function findOrCreateHof(
  addr: string,
  villageId: PlaceId,
  existing: HofObjects,
): FindOrCreateResult | null {
  if (!addr || !villageId) return null;
  const cleanAddr = extractHofAddr(addr);
  if (!cleanAddr) return null;
  const normAddr = normHofAddr(cleanAddr);
  if (!normAddr) return null;
  const fullNorm = normHofAddr(addr);

  // Idempotenz + Read-Tolerance: Voll-Norm ODER Extract-Norm, im selben Dorf.
  for (const h of existing.values()) {
    if (h.villageId !== villageId) continue;
    for (const a of h.addrs) {
      const aNorm = normHofAddr(a.value);
      if (aNorm === fullNorm || aNorm === normAddr) return { hofId: h.id, created: null };
    }
  }

  const hofId = makeHofId(normAddr, villageId, existing);
  const created: HofObject = {
    id: hofId,
    villageId,
    addrs: [{ value: cleanAddr, lang: 'deu', from: null, to: null, dateRaw: null }],
    lat: null,
    long: null,
    note: '',
    existsFrom: null,
    existsTo: null,
    predecessor: null,
    successor: null,
    govId: null,
    govTypes: null,
    schemaVersion: 1,
  };
  return { hofId, created };
}

/**
 * Hängt eine Adress-Variante an einen bestehenden Hof (Review-Aktion „Variante zum Hof",
 * Spec 11 §6). Durchläuft den Extract NICHT — Nutzer-Intent „diese Schreibweise speichern"
 * bleibt erhalten. Idempotent (dedupliziert per Norm). Gibt eine neue HofObject-Kopie zurück.
 */
export function addHofVariant(hof: HofObject, value: string): HofObject {
  const norm = normHofAddr(value);
  if (!norm || hof.addrs.some((a) => normHofAddr(a.value) === norm)) return hof;
  return {
    ...hof,
    addrs: [...hof.addrs, { value, lang: 'deu', from: null, to: null, dateRaw: null }],
  };
}
