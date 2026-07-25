// tests/ui/tree-ring-model.test.ts — Ring-Model der Baum-Inseln (BL-121, ADR-v9-123).
// End-to-end über die echten Regeln: unvollständige Person → Ring mit Befund-Tooltip;
// die Ableitung selbst (schwerste Schwere) ist in person-severity.test.ts abgedeckt.
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../core/validate/index';
import { buildTreeRings } from '../../ui/views/tree/tree-ring-model';
import { dbWith, personWith } from '../core/validate-fixtures';

describe('buildTreeRings', () => {
  it('unvollständige Person (ohne Geburt/Quellen) bekommt einen Ring mit Befund-Tooltip', () => {
    const db = dbWith([personWith('@I1@')]);
    const rings = buildTreeRings(db, defaultConfig());
    const r = rings.get('@I1@');
    expect(r).toBeTruthy();
    expect(['error', 'warn', 'info']).toContain(r!.severity);
    expect(r!.tooltip.length).toBeGreaterThan(0);
    // Tooltip trägt das Schwere-Icon der jeweiligen Befunde (✗/⚠/ℹ).
    expect(/[✗⚠ℹ]/u.test(r!.tooltip)).toBe(true);
  });

  it('liefert eine plain Map (Personen ohne Befund fehlen)', () => {
    const db = dbWith([personWith('@I1@')]);
    const rings = buildTreeRings(db, defaultConfig());
    expect(rings).toBeInstanceOf(Map);
    expect(rings.has('@INEXISTENT@')).toBe(false);
  });
});
