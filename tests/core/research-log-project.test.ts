// Spec 12 §2 (Forschungsprotokoll) + §5 (Forschungsprojekt).
import { describe, it, expect } from 'vitest';
import { makeLogEntry, makeProject } from '../../core/research/index';

describe('Spec 12 §2: LogEntry (Forschungsprotokoll)', () => {
  it('trägt date/repoRef/sourceRef/query/result/note; date injiziert (TST-3)', () => {
    const e = makeLogEntry({
      date: '2026-07-04',
      repoRef: '@R1@',
      sourceRef: '@S1@',
      query: 'Taufregister 1832',
      result: 'found',
      note: 'Seite 44',
    });
    expect(e.date).toBe('2026-07-04');
    expect(e.repoRef).toBe('@R1@');
    expect(e.sourceRef).toBe('@S1@');
    expect(e.result).toBe('found');
  });

  it('result-Default = pending; akzeptiert found/notfound/pending', () => {
    expect(makeLogEntry().result).toBe('pending');
    for (const r of ['found', 'notfound', 'pending'] as const) {
      expect(makeLogEntry({ result: r }).result).toBe(r);
    }
  });
});

describe('Spec 12 §5: Project (app-privat)', () => {
  it('trägt id/name/color/scope/note/created mit leerem Scope als Default', () => {
    const p = makeProject('p1', { name: 'Linie Decker', color: '#c33', created: '2026-07-04' });
    expect(p.id).toBe('p1');
    expect(p.name).toBe('Linie Decker');
    expect(p.scope).toEqual({
      surnames: [],
      places: [],
      yearFrom: null,
      yearTo: null,
      personIds: [],
    });
  });

  it('Scope-Felder sind übersteuerbar', () => {
    const p = makeProject('p2', {
      scope: { surnames: ['Decker'], places: [], yearFrom: 1800, yearTo: 1900, personIds: ['@I1@'] },
    });
    expect(p.scope.surnames).toEqual(['Decker']);
    expect(p.scope.yearFrom).toBe(1800);
    expect(p.scope.personIds).toEqual(['@I1@']);
  });
});
