// Kern-Tests der Per-Person-Severity-Projektion (Spec 21 §8, BL-152, ADR-v9-123).
// Reine Reduktion Befunde → schwerste Schwere je Person; DOM-frei, deterministisch.
import { describe, expect, it } from 'vitest';
import { computePersonSeverity, type Finding, type Severity } from '../../core/validate/index';

function finding(personId: string | null, severity: Severity, text = 'Befund'): Finding {
  return { rule: 'MISSING_BIRTH', severity, text, category: 'kirche', personId, familyId: null, placeId: null, hofId: null };
}

describe('computePersonSeverity', () => {
  it('schwerster Befund gewinnt: Fehler + Warnung + Hinweis → error', () => {
    const m = computePersonSeverity([finding('@I1@', 'warn'), finding('@I1@', 'error'), finding('@I1@', 'info')]);
    expect(m.get('@I1@')!.severity).toBe('error');
  });

  it('nur Warnungen → warn; nur Hinweise → info', () => {
    const m = computePersonSeverity([finding('@I1@', 'warn'), finding('@I2@', 'info')]);
    expect(m.get('@I1@')!.severity).toBe('warn');
    expect(m.get('@I2@')!.severity).toBe('info');
  });

  it('Person ohne Befund fehlt in der Map (= sauber, kein Ring)', () => {
    const m = computePersonSeverity([finding('@I1@', 'error')]);
    expect(m.has('@I2@')).toBe(false);
  });

  it('gruppiert alle Befunde je Schwere (für Tooltip/Fokus)', () => {
    const m = computePersonSeverity([
      finding('@I1@', 'error', 'E1'),
      finding('@I1@', 'error', 'E2'),
      finding('@I1@', 'warn', 'W1'),
    ]);
    const g = m.get('@I1@')!;
    expect(g.error.map((f) => f.text)).toEqual(['E1', 'E2']);
    expect(g.warn.map((f) => f.text)).toEqual(['W1']);
    expect(g.info).toEqual([]);
  });

  it('übergeht Befunde ohne Trägerperson (Orte/Höfe/Familien-nur)', () => {
    const orphan: Finding = { ...finding(null, 'error'), placeId: '@P1@' as never };
    const m = computePersonSeverity([orphan, finding('@I1@', 'warn')]);
    expect(m.size).toBe(1);
    expect(m.get('@I1@')!.severity).toBe('warn');
  });

  it('respektiert inScope: Personen ausserhalb des Scopes werden übergangen', () => {
    const m = computePersonSeverity([finding('@I1@', 'error'), finding('@I2@', 'error')], new Set(['@I1@']));
    expect(m.has('@I1@')).toBe(true);
    expect(m.has('@I2@')).toBe(false);
  });

  it('ist deterministisch: gleiche Eingabe → identisches Ergebnis', () => {
    const input = [finding('@I1@', 'warn'), finding('@I2@', 'info'), finding('@I1@', 'error')];
    expect(computePersonSeverity(input)).toEqual(computePersonSeverity(input));
  });
});
