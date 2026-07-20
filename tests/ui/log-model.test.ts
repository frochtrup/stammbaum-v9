// tests/ui/log-model.test.ts — reine Logik der globalen Forschungsprotokoll-Liste
// (Spec 12 §2). Kein DOM nötig — läuft im globalen 'node'-Environment.
import { describe, expect, it } from 'vitest';
import { makeDatabase, makePerson, makeFamily } from '../../core/model/index';
import { makeLogEntry } from '../../core/research/index';
import { addLogEntry } from '../../ui/views/research-log/log-commands';
import {
  collectAllLogEntries,
  filterLogEntries,
  resultLabel,
  exportLogMarkdown,
} from '../../ui/views/research-log/log-model';

function dbWithEntries() {
  let db = makeDatabase();
  db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna', surname: 'Muster' }));
  db.families.set('@F1@', makeFamily('@F1@'));
  db = addLogEntry(db, 'person', '@I1@', makeLogEntry({ date: '2026-07-01', query: 'ältester Eintrag', result: 'pending' })) ?? db;
  db = addLogEntry(db, 'person', '@I1@', makeLogEntry({ date: '2026-07-05', query: 'neuester Eintrag', result: 'found' })) ?? db;
  db = addLogEntry(db, 'family', '@F1@', makeLogEntry({ date: '2026-07-03', query: 'Fam-Eintrag', result: 'notfound' })) ?? db;
  return db;
}

describe('collectAllLogEntries — sammelt über Personen UND Familien, neueste zuerst', () => {
  it('liefert alle Einträge aus beiden Quellen', () => {
    const rows = collectAllLogEntries(dbWithEntries());
    expect(rows).toHaveLength(3);
  });

  it('sortiert nach Datum absteigend (neuester Sucheintrag zuerst)', () => {
    const rows = collectAllLogEntries(dbWithEntries());
    expect(rows.map((r) => r.entry.query)).toEqual(['neuester Eintrag', 'Fam-Eintrag', 'ältester Eintrag']);
  });

  it('hält den korrekten Array-Index pro Zeile fest (Bearbeiten/Löschen-Adressierung)', () => {
    const rows = collectAllLogEntries(dbWithEntries());
    const personRows = rows.filter((r) => r.kind === 'person');
    expect(personRows.map((r) => r.index).sort()).toEqual([0, 1]);
  });
});

describe('filterLogEntries — filtert nach Suchergebnis', () => {
  it('"all" liefert alles unverändert', () => {
    const rows = collectAllLogEntries(dbWithEntries());
    expect(filterLogEntries(rows, 'all')).toHaveLength(3);
  });

  it('filtert auf ein einzelnes Ergebnis', () => {
    const rows = collectAllLogEntries(dbWithEntries());
    expect(filterLogEntries(rows, 'found')).toHaveLength(1);
    expect(filterLogEntries(rows, 'notfound')).toHaveLength(1);
    expect(filterLogEntries(rows, 'pending')).toHaveLength(1);
  });
});

describe('resultLabel — deutsche Labels für LogResult', () => {
  it('liefert die drei erwarteten Labels', () => {
    expect(resultLabel('found')).toBe('Gefunden');
    expect(resultLabel('notfound')).toBe('Nichts gefunden');
    expect(resultLabel('pending')).toBe('Ausstehend');
  });
});

describe('exportLogMarkdown — reine Daten-zu-String-Funktion', () => {
  it('enthält Überschrift, Filter-Info und pro Eintrag eine Zeile', () => {
    const md = exportLogMarkdown(dbWithEntries(), 'all', '07.07.2026');
    expect(md).toContain('# Forschungsprotokoll');
    expect(md).toContain('07.07.2026');
    expect(md).toContain('ältester Eintrag');
    expect(md).toContain('neuester Eintrag');
    expect(md).toContain('Fam-Eintrag');
  });

  it('meldet explizit, wenn nach Filterung keine Einträge übrig sind', () => {
    const db = makeDatabase();
    const md = exportLogMarkdown(db, 'all', '07.07.2026');
    expect(md).toContain('Keine Einträge');
  });
});
