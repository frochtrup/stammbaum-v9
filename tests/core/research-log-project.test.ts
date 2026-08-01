// Spec 12 §2 (Forschungsprotokoll) + §5 (Forschungsprojekt).
import { describe, it, expect } from 'vitest';
import { makePerson, makeEvent } from '../../core/model/index';
import {
  makeLogEntry,
  makeProject,
  makeScopePersonRef,
  makeTask,
  linkLogToTask,
  matchesScope,
  normalizeProject,
  resolveScopePersonRef,
} from '../../core/research/index';

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
      personRefs: [],
    });
  });

  it('Scope-Felder sind übersteuerbar', () => {
    const p = makeProject('p2', {
      scope: {
        surnames: ['Decker'],
        places: [],
        yearFrom: 1800,
        yearTo: 1900,
        personRefs: [{ id: '@I1@', name: 'Johann Decker', year: 1850 }],
      },
    });
    expect(p.scope.surnames).toEqual(['Decker']);
    expect(p.scope.yearFrom).toBe(1800);
    expect(p.scope.personRefs).toEqual([{ id: '@I1@', name: 'Johann Decker', year: 1850 }]);
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
    expect(matchesScope(decker(), { surnames: ['decker'], places: [], yearFrom: null, yearTo: null, personRefs: [] })).toBe(true);
    expect(matchesScope(decker(), { surnames: ['Meyer'], places: [], yearFrom: null, yearTo: null, personRefs: [] })).toBe(false);
  });

  it('Ort (Teilstring der Ortskette) und Zeitraum je einzeln', () => {
    expect(matchesScope(decker(), { surnames: [], places: ['Ochtrup'], yearFrom: null, yearTo: null, personRefs: [] })).toBe(true);
    expect(matchesScope(decker(), { surnames: [], places: ['Rheine'], yearFrom: null, yearTo: null, personRefs: [] })).toBe(false);
    expect(matchesScope(decker(), { surnames: [], places: [], yearFrom: 1840, yearTo: 1860, personRefs: [] })).toBe(true);
    expect(matchesScope(decker(), { surnames: [], places: [], yearFrom: 1920, yearTo: 1930, personRefs: [] })).toBe(false);
  });

  it('UND-Verknüpfung: nur wenn ALLE nicht-leeren Achsen passen', () => {
    // richtiger Nachname, aber falscher Zeitraum → kein Treffer
    expect(matchesScope(decker(), { surnames: ['Decker'], places: [], yearFrom: 1920, yearTo: 1930, personRefs: [] })).toBe(false);
    // Nachname + Ort + Zeitraum alle passend → Treffer
    expect(matchesScope(decker(), { surnames: ['Decker'], places: ['Ochtrup'], yearFrom: 1800, yearTo: 1900, personRefs: [] })).toBe(true);
  });

  it('personRefs übersteuert: ausdrücklich gelistete Person ist immer enthalten', () => {
    // Achsen würden ausschließen (falscher Nachname), der Personenbezug holt sie zurück
    const ref = makeScopePersonRef(decker());
    expect(matchesScope(decker(), { surnames: ['Meyer'], places: [], yearFrom: null, yearTo: null, personRefs: [ref] })).toBe(true);
  });
});

describe('BL-238: der Personenbezug wird am Referenten geprüft (ADR-v9-174)', () => {
  function decker() {
    const p = makePerson('@I1@', { given: 'Johann', surname: 'Decker' });
    p.birth = makeEvent('BIRT', { date: '1850', place: 'Ochtrup' });
    return p;
  }
  /** Dieselbe Id in einem ANDEREN Bestand — `@I1@` existiert in fast jeder Datei. */
  function fremder() {
    const p = makePerson('@I1@', { given: 'Wilhelm', surname: 'Meyer' });
    p.birth = makeEvent('BIRT', { date: '1912', place: 'Rheine' });
    return p;
  }

  it('makeScopePersonRef nimmt Id + Fingerabdruck (Name + Geburtsjahr) auf', () => {
    expect(makeScopePersonRef(decker())).toEqual({ id: '@I1@', name: 'Johann Decker', year: 1850 });
  });

  it('resolveScopePersonRef löst am passenden Referenten auf', () => {
    const p = decker();
    expect(resolveScopePersonRef(makeScopePersonRef(p), p)).toBe(p);
  });

  it('DER DEFEKT: dieselbe Id in einer anderen Datei zeigt auf eine fremde Person → null', () => {
    // Ohne Prüfung am Referenten hätte `@I1@` hier die fremde Person ins Projekt geholt.
    expect(resolveScopePersonRef(makeScopePersonRef(decker()), fremder())).toBeNull();
    expect(
      matchesScope(fremder(), {
        surnames: ['Decker'],
        places: [],
        yearFrom: null,
        yearTo: null,
        personRefs: [makeScopePersonRef(decker())],
      }),
    ).toBe(false);
  });

  it('fehlender Referent (Id gibt es im Bestand gar nicht) → null', () => {
    expect(resolveScopePersonRef(makeScopePersonRef(decker()), undefined)).toBeNull();
  });

  it('Id-Neuvergabe im SELBEN Baum: gleicher Name unter fremder Id zählt nicht', () => {
    // Fremdwerkzeug (GRAMPS→GEDCOM) vergibt Ids neu — der Bezug zeigt jetzt auf jemand
    // anderen. Genau der Fall, an dem eine Baum-Identität still gescheitert wäre.
    const umnummeriert = makePerson('@I7@', { given: 'Johann', surname: 'Decker' });
    expect(resolveScopePersonRef(makeScopePersonRef(decker()), umnummeriert)).toBeNull();
  });

  it('Geburtsjahr entscheidet nur, wenn BEIDE Seiten es kennen (Namensvetter)', () => {
    const vetter = makePerson('@I1@', { given: 'Johann', surname: 'Decker' });
    vetter.birth = makeEvent('BIRT', { date: '1799' });
    expect(resolveScopePersonRef(makeScopePersonRef(decker()), vetter)).toBeNull();
    // Jahr auf einer Seite unbekannt → der Name allein trägt, kein falscher Ausschluss
    const ohneJahr = makePerson('@I1@', { given: 'Johann', surname: 'Decker' });
    expect(resolveScopePersonRef(makeScopePersonRef(decker()), ohneJahr)).toBe(ohneJahr);
  });

  it('Altbestand ohne Fingerabdruck bleibt gültig (Migrations-Kompromiss)', () => {
    // Bestehende Projekte kennen nur die Id; sie entstanden im Bestand des Nutzers und
    // werden nicht nachträglich entwertet — der Fingerabdruck entsteht beim nächsten Edit.
    const p = decker();
    expect(resolveScopePersonRef({ id: '@I1@', name: '', year: null }, p)).toBe(p);
  });

  it('normalizeProject hebt den alten `personIds: string[]`-Bestand auf die Ref-Form', () => {
    const alt = {
      id: 'p9',
      name: 'Alt',
      color: '',
      note: '',
      created: '2026-01-01',
      scope: { surnames: [], places: [], yearFrom: null, yearTo: null, personIds: ['@I1@', '@I2@'] },
    };
    expect(normalizeProject(alt).scope.personRefs).toEqual([
      { id: '@I1@', name: '', year: null },
      { id: '@I2@', name: '', year: null },
    ]);
  });

  it('normalizeProject verträgt Schrott aus einer fremd bearbeiteten app-data.json', () => {
    const kaputt = { id: 'p9', scope: { surnames: 'Decker', personRefs: [{ id: '@I1@' }, 'nope', null] } };
    const p = normalizeProject(kaputt);
    expect(p.scope.surnames).toEqual([]);
    expect(p.scope.personRefs).toEqual([{ id: '@I1@', name: '', year: null }]);
  });
});
