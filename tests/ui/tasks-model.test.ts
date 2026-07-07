// tests/ui/tasks-model.test.ts — reine Logik der globalen Aufgabenliste (Spec 20
// §1.11 [K]). Kein DOM nötig — kein besonderes Test-Environment-Directive gesetzt
// (läuft mit dem globalen 'node'-Environment, s. vitest.config.ts, analog app-state.test.ts).
import { describe, expect, it } from 'vitest';
import { makeDatabase, makePerson, makeFamily } from '../../core/model/index';
import { makeTask } from '../../core/research/index';
import {
  collectAllTasks,
  openTaskCount,
  formatBadgeCount,
  filterTasks,
  groupByCategory,
  buildKanbanColumns,
  nextTaskStatus,
  exportTasksMarkdown,
} from '../../ui/views/tasks/tasks-model';

describe('collectAllTasks — globale Sammlung über Personen UND Familien', () => {
  it('sammelt Tasks aus beiden Entitätsarten mit Trägerlabel', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@');
    p.given = 'Otto';
    p.surname = 'Meyer';
    p.tasks.push(makeTask('t1', { text: 'Kirchenbuch prüfen', category: 'Kirchenbuch', created: '2026-01-01' }));
    db.individuals.set(p.id, p);

    const f = makeFamily('@F1@');
    f.tasks.push(makeTask('t2', { text: 'Heiratsurkunde beschaffen', category: 'Urkunde', created: '2026-01-02' }));
    db.families.set(f.id, f);

    const entries = collectAllTasks(db);
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.kind === 'person')?.entityLabel).toContain('Otto');
    expect(entries.find((e) => e.kind === 'family')?.entityId).toBe('@F1@');
  });

  it('liefert eine leere Liste, wenn keine Entität Tasks hat', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@'));
    expect(collectAllTasks(db)).toEqual([]);
  });
});

describe('openTaskCount + formatBadgeCount — Bottom-Nav-Badge (Orakel _allOpenTasksCount/_updateTasksBadge)', () => {
  it('zählt todo+doing, NICHT done', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@');
    p.tasks.push(makeTask('t1', { status: 'todo' }));
    p.tasks.push(makeTask('t2', { status: 'doing' }));
    p.tasks.push(makeTask('t3', { status: 'done' }));
    db.individuals.set(p.id, p);

    expect(openTaskCount(db)).toBe(2);
  });

  it('formatBadgeCount zeigt "99+" ab 100, sonst die exakte Zahl', () => {
    expect(formatBadgeCount(0)).toBe('0');
    expect(formatBadgeCount(5)).toBe('5');
    expect(formatBadgeCount(99)).toBe('99');
    expect(formatBadgeCount(100)).toBe('99+');
    expect(formatBadgeCount(250)).toBe('99+');
  });
});

describe('filterTasks — alle/offen/erledigt (Orakel switchTasksFilter)', () => {
  function entries() {
    const db = makeDatabase();
    const p = makePerson('@I1@');
    p.tasks.push(makeTask('t1', { status: 'todo' }));
    p.tasks.push(makeTask('t2', { status: 'doing' }));
    p.tasks.push(makeTask('t3', { status: 'done' }));
    db.individuals.set(p.id, p);
    return collectAllTasks(db);
  }

  it("'all' liefert alle drei", () => {
    expect(filterTasks(entries(), 'all')).toHaveLength(3);
  });

  it("'open' liefert todo+doing", () => {
    expect(filterTasks(entries(), 'open')).toHaveLength(2);
  });

  it("'done' liefert nur done", () => {
    const result = filterTasks(entries(), 'done');
    expect(result).toHaveLength(1);
    expect(result[0]!.task.status).toBe('done');
  });
});

describe('groupByCategory — dynamische Kategorien, KEIN geschlossenes Enum (Kern-Vorgabe)', () => {
  it('gruppiert nach dem tatsächlich vorkommenden Kategorie-Freitext', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@');
    p.tasks.push(makeTask('t1', { category: 'Kirchenbuch' }));
    p.tasks.push(makeTask('t2', { category: 'Ahnenforschung.de' })); // frei erfundene Kategorie, kein Preset
    p.tasks.push(makeTask('t3', { category: 'Kirchenbuch' }));
    db.individuals.set(p.id, p);

    const groups = groupByCategory(collectAllTasks(db));
    const cats = groups.map((g) => g.category);
    expect(cats).toContain('Kirchenbuch');
    expect(cats).toContain('Ahnenforschung.de');
    expect(groups.find((g) => g.category === 'Kirchenbuch')?.entries).toHaveLength(2);
  });

  it('behandelt eine leere Kategorie als eigene Gruppe statt sie zu verwerfen', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@');
    p.tasks.push(makeTask('t1', { category: '' }));
    db.individuals.set(p.id, p);

    const groups = groupByCategory(collectAllTasks(db));
    expect(groups).toHaveLength(1);
    expect(groups[0]!.category).toBe('');
  });
});

describe('buildKanbanColumns + nextTaskStatus — 3 Spalten, Tap-to-Advance (Orakel _renderTaskBoard/_TASK_STATUS_NEXT)', () => {
  it('teilt Einträge in genau 3 Spalten todo/doing/done auf', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@');
    p.tasks.push(makeTask('t1', { status: 'todo' }));
    p.tasks.push(makeTask('t2', { status: 'doing' }));
    p.tasks.push(makeTask('t3', { status: 'done' }));
    db.individuals.set(p.id, p);

    const cols = buildKanbanColumns(collectAllTasks(db));
    expect(cols.map((c) => c.status)).toEqual(['todo', 'doing', 'done']);
    expect(cols[0]!.entries).toHaveLength(1);
    expect(cols[1]!.entries).toHaveLength(1);
    expect(cols[2]!.entries).toHaveLength(1);
  });

  it('nextTaskStatus zyklisch todo->doing->done->todo', () => {
    expect(nextTaskStatus('todo')).toBe('doing');
    expect(nextTaskStatus('doing')).toBe('done');
    expect(nextTaskStatus('done')).toBe('todo');
  });
});

describe('exportTasksMarkdown — lesbarer MD-String, respektiert den aktuellen Filter (Orakel exportTasksMd)', () => {
  it('enthält Metazeile, Kategorie-Überschrift und Checkbox je Aufgabe', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@');
    p.given = 'Otto';
    p.surname = 'Meyer';
    p.tasks.push(makeTask('t1', { text: 'Kirchenbuch prüfen', category: 'Kirchenbuch', status: 'todo' }));
    p.tasks.push(makeTask('t2', { text: 'Sterbeurkunde beschaffen', category: 'Kirchenbuch', status: 'done' }));
    db.individuals.set(p.id, p);

    const md = exportTasksMarkdown(db, 'all', '04.07.2026');

    expect(md).toContain('# Forschungsaufgaben');
    expect(md).toContain('04.07.2026');
    expect(md).toContain('## Kirchenbuch');
    expect(md).toContain('- [ ] Kirchenbuch prüfen');
    expect(md).toContain('- [x] Sterbeurkunde beschaffen');
    expect(md).toContain('Otto');
  });

  it('respektiert den Filter (open blendet erledigte Aufgaben aus)', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@');
    p.tasks.push(makeTask('t1', { text: 'Offen', status: 'todo' }));
    p.tasks.push(makeTask('t2', { text: 'Fertig', status: 'done' }));
    db.individuals.set(p.id, p);

    const md = exportTasksMarkdown(db, 'open', '04.07.2026');
    expect(md).toContain('Offen');
    expect(md).not.toContain('Fertig');
  });

  it('zeigt einen Leerzustand-Hinweis, wenn keine Aufgabe zum Filter passt', () => {
    const db = makeDatabase();
    const md = exportTasksMarkdown(db, 'all', '04.07.2026');
    expect(md).toContain('Keine Aufgaben');
  });
});
