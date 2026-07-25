// Spec 12 §2 (Forschungsprotokoll) + §5 (Forschungsprojekt).
import { describe, it, expect } from 'vitest';
import { makePerson, makeEvent } from '../../core/model/index';
import { makeLogEntry, makeProject, makeTask, linkLogToTask, matchesScope } from '../../core/research/index';

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

  it('result-Default = pending; akzeptiert found/partial/notfound/pending (BL-135)', () => {
    expect(makeLogEntry().result).toBe('pending');
    for (const r of ['found', 'partial', 'notfound', 'pending'] as const) {
      expect(makeLogEntry({ result: r }).result).toBe(r);
    }
  });

  it('linkLogToTask baut einen vorbefüllten offenen Eintrag aus der Aufgabe (BL-65)', () => {
    const task = makeTask('t_42', { text: 'Kirchenbuch prüfen', sourceRef: '@S3@', created: '2026-01-01' });
    const e = linkLogToTask(task, '2026-07-25');
    expect(e.taskId).toBe('t_42'); // Vorwärtsverweis (ADR-v9-36)
    expect(e.sourceRef).toBe('@S3@'); // Quellenbezug der Aufgabe übernommen
    expect(e.date).toBe('2026-07-25'); // injiziert (TST-3)
    expect(e.result).toBe('pending'); // noch offen — kein Auto-Schließen der Aufgabe
    expect(e.query).toBe('');
  });

  it('linkLogToTask übernimmt keinen Quellenbezug, wenn die Aufgabe keinen hat', () => {
    const e = linkLogToTask(makeTask('t_1'), '2026-07-25');
    expect(e.sourceRef).toBe('');
    expect(e.taskId).toBe('t_1');
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

describe('BL-58: matchesScope — drei Achsen UND-verknüpft, leere Achse schränkt nicht ein', () => {
  function decker() {
    const p = makePerson('@I1@', { given: 'Johann', surname: 'Decker' });
    p.birth = makeEvent('BIRT', { date: '1850', place: 'Ochtrup, Steinfurt' });
    p.death = makeEvent('DEAT', { date: '1910', place: 'Ochtrup' });
    return p;
  }

  it('leerer Scope trifft jede Person', () => {
    expect(matchesScope(decker(), makeProject('p').scope)).toBe(true);
  });

  it('Nachname allein: passt bei Treffer, sonst nicht (case-insensitiv)', () => {
    expect(matchesScope(decker(), { surnames: ['decker'], places: [], yearFrom: null, yearTo: null, personIds: [] })).toBe(true);
    expect(matchesScope(decker(), { surnames: ['Meyer'], places: [], yearFrom: null, yearTo: null, personIds: [] })).toBe(false);
  });

  it('Ort (Teilstring der Ortskette) und Zeitraum je einzeln', () => {
    expect(matchesScope(decker(), { surnames: [], places: ['Ochtrup'], yearFrom: null, yearTo: null, personIds: [] })).toBe(true);
    expect(matchesScope(decker(), { surnames: [], places: ['Rheine'], yearFrom: null, yearTo: null, personIds: [] })).toBe(false);
    expect(matchesScope(decker(), { surnames: [], places: [], yearFrom: 1840, yearTo: 1860, personIds: [] })).toBe(true);
    expect(matchesScope(decker(), { surnames: [], places: [], yearFrom: 1920, yearTo: 1930, personIds: [] })).toBe(false);
  });

  it('UND-Verknüpfung: nur wenn ALLE nicht-leeren Achsen passen', () => {
    // richtiger Nachname, aber falscher Zeitraum → kein Treffer
    expect(matchesScope(decker(), { surnames: ['Decker'], places: [], yearFrom: 1920, yearTo: 1930, personIds: [] })).toBe(false);
    // Nachname + Ort + Zeitraum alle passend → Treffer
    expect(matchesScope(decker(), { surnames: ['Decker'], places: ['Ochtrup'], yearFrom: 1800, yearTo: 1900, personIds: [] })).toBe(true);
  });

  it('personIds übersteuert: ausdrücklich gelistete Person ist immer enthalten', () => {
    // Achsen würden ausschließen (falscher Nachname), personIds holt sie zurück
    expect(matchesScope(decker(), { surnames: ['Meyer'], places: [], yearFrom: null, yearTo: null, personIds: ['@I1@'] })).toBe(true);
  });
});
