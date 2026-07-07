// ui/views/tasks/tasks-model.ts — reine Logik der globalen Aufgabenliste (Spec 20
// §1.11 [K] "Aufgaben-Tab mit Badge, Kanban-Status, Kategorien, globale Liste,
// MD-Export"; Verhaltens-Orakel: legacy-v8/ui-views-tasks.js `_collectAllTasks`/
// `renderTasksView`/`_renderTaskBoard`/`exportTasksMd`).
//
// DOM-frei testbar (Testpyramide, TST-5) — die Svelte-Komponente rendert nur.
// Liest AUSSCHLIESSLICH über db.individuals/db.families (Chokepoint-Zugriff, Spec 02
// §3) — keine Kern-Logik hier (kein Parsen, keine Identitätsauflösung).
//
// WICHTIG (Auftrags-Vorgabe): core/research/types.ts macht `category` bewusst zu
// einem FREIEN String OHNE geschlossenes Enum (anders als v8s `TASK_CATEGORIES`-3er-
// Liste) — diese Datei portiert die geschlossene Enum-Einschränkung NICHT. Kategorien
// werden dynamisch aus den tatsächlich vorkommenden Werten gruppiert; die v8-Label
// bleiben nur als UI-seitige Presets (s. TasksView.svelte `CATEGORY_PRESETS`).
import type { Database } from '../../../core/model/types';
import type { ResearchTask, TaskStatus } from '../../../core/research/types';
import { isTaskDone } from '../../../core/research/task';
import { displayName } from '../../shell/person-display';
import { familyLabelFor } from '../source/family-label';

export type TaskEntityKind = 'person' | 'family';

/** Eine Aufgabe zusammen mit ihrer Trägerentität (Spec 20 §1.11: "globale Liste"). */
export interface TaskEntry {
  kind: TaskEntityKind;
  entityId: string;
  entityLabel: string;
  task: ResearchTask;
}

/**
 * Sammelt ALLE Aufgaben über Personen UND Familien (Orakel: `_collectAllTasks`).
 * Reine Funktion, kein eigener Zustand — ein Kommando (Task hinzufügen/ändern) →
 * Chokepoints (db.individuals/db.families) neu lesen → diese Funktion erneut aufrufen.
 */
export function collectAllTasks(db: Database): TaskEntry[] {
  const out: TaskEntry[] = [];
  for (const [id, p] of db.individuals) {
    for (const task of p.tasks) {
      out.push({ kind: 'person', entityId: id, entityLabel: displayName(p), task });
    }
  }
  for (const [id] of db.families) {
    const label = familyLabelFor(db, id);
    const f = db.families.get(id)!;
    for (const task of f.tasks) {
      out.push({ kind: 'family', entityId: id, entityLabel: label, task });
    }
  }
  return out;
}

/** Anzahl offener Aufgaben (todo+doing, NICHT done) — Grundlage für das Bottom-Nav-Badge. */
export function openTaskCount(db: Database): number {
  let n = 0;
  for (const entry of collectAllTasks(db)) {
    if (!isTaskDone(entry.task)) n++;
  }
  return n;
}

/** Badge-Text (Orakel: `_updateTasksBadge` — "99+" ab >99, sonst die Zahl selbst). */
export function formatBadgeCount(n: number): string {
  return n > 99 ? '99+' : String(n);
}

export type TaskFilter = 'all' | 'open' | 'done';

/** Filtert nach Status (Orakel: `switchTasksFilter` alle/offen/erledigt). */
export function filterTasks(entries: TaskEntry[], filter: TaskFilter): TaskEntry[] {
  if (filter === 'all') return entries;
  if (filter === 'open') return entries.filter((e) => !isTaskDone(e.task));
  return entries.filter((e) => isTaskDone(e.task));
}

function entrySortName(e: TaskEntry): string {
  return e.entityLabel;
}

/** Sortiert Einträge innerhalb einer Kategorie/Spalte nach Trägername (Orakel: `.sort(...localeCompare)`). */
function sortEntries(entries: TaskEntry[]): TaskEntry[] {
  return entries.slice().sort((a, b) => entrySortName(a).localeCompare(entrySortName(b), 'de'));
}

export interface TaskCategoryGroup {
  category: string;
  entries: TaskEntry[];
}

/**
 * Gruppiert nach Kategorie (Orakel: `byCat`), Reihenfolge = erstes Auftreten in der
 * (bereits gefilterten) Liste — es gibt kein fest verdrahtetes Enum mehr, daher keine
 * feste `catOrder`-Rangliste wie in v8, sondern Erstauftreten + danach alphabetisch
 * innerhalb jeder Gruppe. Leere Kategorie ("") wird als eigene Gruppe geführt, nicht
 * stillschweigend verworfen.
 */
export function groupByCategory(entries: TaskEntry[]): TaskCategoryGroup[] {
  const order: string[] = [];
  const byCat = new Map<string, TaskEntry[]>();
  for (const e of entries) {
    const cat = e.task.category;
    if (!byCat.has(cat)) {
      byCat.set(cat, []);
      order.push(cat);
    }
    byCat.get(cat)!.push(e);
  }
  return order.map((category) => ({ category, entries: sortEntries(byCat.get(category)!) }));
}

export const TASK_STATUSES: { key: TaskStatus; label: string }[] = [
  { key: 'todo', label: 'Offen' },
  { key: 'doing', label: 'In Arbeit' },
  { key: 'done', label: 'Erledigt' },
];

/** Tap-to-Advance-Reihenfolge im Kanban-Board (Orakel: `_TASK_STATUS_NEXT`). */
const NEXT_STATUS: Record<TaskStatus, TaskStatus> = { todo: 'doing', doing: 'done', done: 'todo' };

export function nextTaskStatus(status: TaskStatus): TaskStatus {
  return NEXT_STATUS[status];
}

export interface KanbanColumn {
  status: TaskStatus;
  label: string;
  entries: TaskEntry[];
}

/** Kanban-Spaltenaufteilung (Orakel: `_renderTaskBoard` cols todo/doing/done). */
export function buildKanbanColumns(entries: TaskEntry[]): KanbanColumn[] {
  return TASK_STATUSES.map(({ key, label }) => ({
    status: key,
    label,
    entries: sortEntries(entries.filter((e) => e.task.status === key)),
  }));
}

const FILTER_LABELS: Record<TaskFilter, string> = { all: 'Alle', open: 'Offen', done: 'Erledigt' };

/**
 * Erzeugt den Markdown-Export-String (Orakel: `exportTasksMd`, respektiert den
 * aktuellen Filter). Reine Funktion (Daten -> String) — das eigentliche Herunterladen
 * ist Sache der dünnen UI-Schicht (services/file DownloadAdapter).
 *
 * Format: `# Forschungsaufgaben` + Metazeile (Datum/Filter/Anzahl) + je Kategorie ein
 * `##`-Abschnitt mit `- [ ]`/`- [x]`-Checkboxen, gruppiert nach Trägerentität.
 */
export function exportTasksMarkdown(db: Database, filter: TaskFilter, today: string): string {
  const all = collectAllTasks(db);
  const filtered = filterTasks(all, filter);
  const groups = groupByCategory(filtered);
  const total = filtered.length;

  let md = `# Forschungsaufgaben\n\n`;
  md += `Exportiert: ${today} · Filter: ${FILTER_LABELS[filter]} · ${total} Aufgabe${total === 1 ? '' : 'n'}\n\n---\n\n`;

  if (total === 0) {
    md += '_Keine Aufgaben._\n';
    return md;
  }

  for (const group of groups) {
    md += `## ${group.category || '(ohne Kategorie)'}\n\n`;
    let lastKey: string | null = null;
    for (const e of group.entries) {
      const key = `${e.kind}:${e.entityId}`;
      if (key !== lastKey) {
        const prefix = e.kind === 'person' ? 'Person' : 'Familie';
        md += `### ${prefix}: ${e.entityLabel} (${e.entityId})\n\n`;
        lastKey = key;
      }
      md += `- [${isTaskDone(e.task) ? 'x' : ' '}] ${e.task.text}\n`;
    }
    md += '\n';
  }

  return md;
}
