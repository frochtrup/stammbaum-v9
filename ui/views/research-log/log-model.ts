// ui/views/research-log/log-model.ts — reine Logik der globalen Forschungsprotokoll-
// Liste (Spec 12 §2, Spec 20 §1.11 [S] "Forschungsprotokoll (RLOG) ... globaler
// Protokoll-Tab + Markdown-Export"). Analog ui/views/tasks/tasks-model.ts
// (collectAllTasks) — DOM-frei testbar (Testpyramide, TST-5), liest AUSSCHLIESSLICH
// über db.individuals/db.families (Chokepoint-Zugriff, Spec 02 §3).
import type { Database, PersonId } from '../../../core/model/types';
import type { PlaceContext } from '../../../core/places';
import type { LogEntry, LogResult, ResearchTask, ProjectScope } from '../../../core/research/types';
import { displayName, yearPlaceSummary } from '../../shell/person-display';
import { familyLabelFor } from '../source/family-label';
import { entityInScope, type TaskEntityKind } from '../tasks/tasks-model';
import { matchesResearchQuery } from '../research-search';

/** Vorbelegung des Protokoll-Formulars aus einer Aufgabe heraus (UI-Kurzweg, BL-65).
 *  ResearchTab hält diesen Wert transient, TasksView setzt ihn, LogView konsumiert ihn. */
export interface LogPrefill {
  kind: TaskEntityKind;
  entityId: string;
  task: ResearchTask;
}

/** Ein Protokoll-Eintrag zusammen mit seiner Trägerentität + Index (Bearbeiten/Löschen-Adressierung). */
export interface LogEntryRow {
  kind: TaskEntityKind;
  entityId: string;
  entityLabel: string;
  /** Disambiguierendes Sekundärmerkmal (INV-UI-6, BL-109) — s. TaskEntry.entitySummary. */
  entitySummary: string;
  index: number;
  entry: LogEntry;
}

/**
 * Sammelt ALLE Protokoll-Einträge über Personen UND Familien (analog collectAllTasks).
 * Reine Funktion, kein eigener Zustand — ein Kommando (Eintrag hinzufügen/ändern) →
 * Chokepoints (db.individuals/db.families) neu lesen → diese Funktion erneut aufrufen.
 * `ctx` optional (INV-UI-6, BL-109) — s. collectAllTasks.
 */
export function collectAllLogEntries(
  db: Database,
  ctx?: PlaceContext,
  scope?: ProjectScope | null,
  allowed: ReadonlySet<PersonId> | null = null,
): LogEntryRow[] {
  const out: LogEntryRow[] = [];
  for (const [id, p] of db.individuals) {
    if (!entityInScope(db, 'person', id, scope, allowed)) continue;
    const summary = ctx ? yearPlaceSummary(p.birth, ctx) : '';
    p.researchLog.forEach((entry, index) => {
      out.push({ kind: 'person', entityId: id, entityLabel: displayName(p), entitySummary: summary, index, entry });
    });
  }
  for (const [id] of db.families) {
    if (!entityInScope(db, 'family', id, scope, allowed)) continue;
    const label = familyLabelFor(db, id);
    const f = db.families.get(id)!;
    f.researchLog.forEach((entry, index) => {
      out.push({ kind: 'family', entityId: id, entityLabel: label, entitySummary: '', index, entry });
    });
  }
  // Neueste zuerst (Orakel-analoges Verhalten für ein Protokoll: jüngster Sucheintrag
  // zuerst sichtbar) — stabile Sortierung nach `date` absteigend, bei Gleichstand
  // Einfüge-Reihenfolge (Array.prototype.sort ist stabil).
  return out.slice().sort((a, b) => (b.entry.date || '').localeCompare(a.entry.date || ''));
}

/**
 * Research-Timeline (BL-56, Spec 20 §1.11b): dieselben Einträge chronologisch, neueste
 * zuerst — die „was habe ich wann getan"-Sicht. Reine Sortier-/Darstellungsvariante über
 * demselben Datenbestand wie die gruppierte Liste; `collectAllLogEntries` sortiert bereits
 * absteigend nach Datum, die Timeline ist genau diese flache Reihenfolge.
 */
export function buildResearchTimeline(
  db: Database,
  ctx?: PlaceContext,
  scope?: ProjectScope | null,
  allowed: ReadonlySet<PersonId> | null = null,
): LogEntryRow[] {
  return collectAllLogEntries(db, ctx, scope, allowed);
}

/**
 * Textsuche über Suchanfrage, Notiz und Trägername (BL-374, Spec 20 §1.11b). Archiv und
 * Quelle sind bewusst NICHT dabei: beide stehen als Id im Eintrag (`repoRef`/`sourceRef`),
 * ihr Klartext entsteht erst in der Zeile — eine Suche über „@R1@" fände niemand, und die
 * Auflösung hier hieße, das Anzeige-Modell in die Matchfunktion zu ziehen.
 */
export function matchesLogQuery(row: LogEntryRow, query: string): boolean {
  return matchesResearchQuery([row.entry.query, row.entry.note, row.entityLabel], query);
}

/** Eine Trägerentität mit ihren Protokollzeilen (personenweise gruppierte Ansicht, BL-56). */
export interface LogEntityGroup {
  kind: TaskEntityKind;
  entityId: string;
  entityLabel: string;
  entitySummary: string;
  rows: LogEntryRow[];
}

/**
 * Gruppiert die (bereits datums-sortierten) Zeilen personenweise (Spec 20 §1.11b
 * „globaler Protokoll-Modus, personenweise gruppiert"). Gruppen-Reihenfolge = erstes
 * Auftreten in der Eingabe (also nach dem jüngsten Eintrag der Entität), Zeilen innerhalb
 * behalten ihre Datums-Reihenfolge.
 */
export function groupLogByEntity(rows: LogEntryRow[]): LogEntityGroup[] {
  const order: string[] = [];
  const byKey = new Map<string, LogEntityGroup>();
  for (const row of rows) {
    const key = `${row.kind}:${row.entityId}`;
    let group = byKey.get(key);
    if (!group) {
      group = { kind: row.kind, entityId: row.entityId, entityLabel: row.entityLabel, entitySummary: row.entitySummary, rows: [] };
      byKey.set(key, group);
      order.push(key);
    }
    group.rows.push(row);
  }
  return order.map((k) => byKey.get(k)!);
}

export type LogFilter = 'all' | LogResult;

const RESULT_LABELS: Record<LogResult, string> = {
  found: 'Gefunden',
  partial: 'Teilweise',
  notfound: 'Nichts gefunden',
  pending: 'Ausstehend',
};

export function resultLabel(result: LogResult): string {
  return RESULT_LABELS[result];
}

/** BL-65 „⇄": Text der über `taskId` verknüpften Aufgabe einer Protokollzeile — leer,
 *  wenn kein Bezug gesetzt ist oder die Aufgabe inzwischen gelöscht wurde. */
export function linkedTaskText(db: Database, row: LogEntryRow): string {
  if (!row.entry.taskId) return '';
  const owner = row.kind === 'person' ? db.individuals.get(row.entityId) : db.families.get(row.entityId);
  return owner?.tasks.find((t) => t.id === row.entry.taskId)?.text ?? '';
}

/** Filtert nach Suchergebnis (analog filterTasks). */
export function filterLogEntries(rows: LogEntryRow[], filter: LogFilter): LogEntryRow[] {
  if (filter === 'all') return rows;
  return rows.filter((r) => r.entry.result === filter);
}

/**
 * Erzeugt den Markdown-Export-String (Spec 12 §2 "globaler Protokoll-Tab +
 * Markdown-Export", analog exportTasksMarkdown). Reine Funktion (Daten -> String).
 */
export function exportLogMarkdown(db: Database, filter: LogFilter, today: string): string {
  const all = collectAllLogEntries(db);
  const filtered = filterLogEntries(all, filter);
  const total = filtered.length;

  let md = `# Forschungsprotokoll\n\n`;
  const filterLabel = filter === 'all' ? 'Alle' : resultLabel(filter);
  md += `Exportiert: ${today} · Filter: ${filterLabel} · ${total} Eintrag${total === 1 ? '' : 'einträge'}\n\n---\n\n`;

  if (total === 0) {
    md += '_Keine Einträge._\n';
    return md;
  }

  let lastKey: string | null = null;
  for (const row of filtered) {
    const key = `${row.kind}:${row.entityId}`;
    if (key !== lastKey) {
      const prefix = row.kind === 'person' ? 'Person' : 'Familie';
      md += `## ${prefix}: ${row.entityLabel} (${row.entityId})\n\n`;
      lastKey = key;
    }
    md += `- **${row.entry.date || '(kein Datum)'}** — ${resultLabel(row.entry.result)}: ${row.entry.query || '(keine Suchbegriff-Angabe)'}`;
    if (row.entry.note) md += ` — ${row.entry.note}`;
    md += '\n';
  }

  return md;
}
