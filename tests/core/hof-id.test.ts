// Deterministische HofId + reiner findOrCreateHof + addHofVariant (Spec 11 §1, §6).
import { describe, it, expect } from 'vitest';
import { makeHofId, findOrCreateHof, addHofVariant } from '../../core/places/index';
import { hof, hofMap } from './places-fixtures';

describe('makeHofId — deterministisch _hof_<addr>_<village>', () => {
  it('gleiche Eingabe → gleiche ID', () => {
    // slugify kollabiert Nicht-Alnum-Läufe zu einem _ und entfernt Randstriche:
    // '@OCHTRUP@' → 'ochtrup'.
    expect(makeHofId('wall 33', '@OCHTRUP@', hofMap())).toBe('_hof_wall_33_ochtrup');
  });
  it('Kollision → nummerierter Suffix', () => {
    const existing = hofMap(hof('_hof_wall_33_ochtrup', '@OCHTRUP@'));
    expect(makeHofId('wall 33', '@OCHTRUP@', existing)).toBe('_hof_wall_33_ochtrup_2');
  });
});

describe('findOrCreateHof — rein, Extract (Konvention α) bei Neuanlage', () => {
  it('legt neuen Hof aus Extract an, ohne existing zu mutieren', () => {
    const existing = hofMap();
    const res = findOrCreateHof('Wall 33, 48607 Ochtrup', '@OCHTRUP@', existing)!;
    expect(res.created).not.toBeNull();
    expect(res.created!.addrs[0].value).toBe('Wall 33'); // Extract, nicht der volle String
    expect(res.created!.villageId).toBe('@OCHTRUP@');
    expect(existing.size).toBe(0); // rein: existing unangetastet
  });

  it('findet bestehenden Hof idempotent (Read-Tolerance)', () => {
    const existing = hofMap(
      hof('_hof_wall_33_x', '@OCHTRUP@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }),
    );
    const res = findOrCreateHof('Wall 33, 48607 Ochtrup', '@OCHTRUP@', existing)!;
    expect(res.created).toBeNull();
    expect(res.hofId).toBe('_hof_wall_33_x');
  });

  it('historischer Komma-Hof wird via Voll-Norm wiedergefunden', () => {
    const existing = hofMap(
      hof('_hof_komma', '@OCHTRUP@', { addrs: [{ value: 'Oster 82a, Wester 141', from: null, to: null }] }),
    );
    const res = findOrCreateHof('Oster 82a, Wester 141', '@OCHTRUP@', existing)!;
    expect(res.created).toBeNull();
    expect(res.hofId).toBe('_hof_komma');
  });

  it('anderes Dorf → eigener Hof', () => {
    const existing = hofMap(
      hof('_hof_wall_33_a', '@A@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }),
    );
    const res = findOrCreateHof('Wall 33', '@B@', existing)!;
    expect(res.created).not.toBeNull();
  });
});

describe('addHofVariant — Nutzer-Intent, KEIN Extract', () => {
  it('hängt Variante an, ohne Extract; dedupliziert per Norm', () => {
    const base = hof('_hof_x', '@OCHTRUP@', { addrs: [{ value: 'Wall 33', from: null, to: null }] });
    const withVariant = addHofVariant(base, 'Wall 33, Hinterhaus');
    // Voller String bleibt erhalten (kein Extract-Cut).
    expect(withVariant.addrs.map((a) => a.value)).toContain('Wall 33, Hinterhaus');
    // Idempotent: gleiche Norm nicht doppelt.
    const again = addHofVariant(withVariant, 'wall 33');
    expect(again.addrs.filter((a) => a.value.toLowerCase() === 'wall 33')).toHaveLength(1);
  });
});
