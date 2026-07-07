// ui/views/research-log/log-model.ts — reine Logik der globalen Forschungsprotokoll-
// Liste (Spec 12 §2, Spec 20 §1.11 [S] "Forschungsprotokoll (RLOG) ... globaler
// Protokoll-Tab + Markdown-Export"). Analog ui/views/tasks/tasks-model.ts
// (collectAllTasks) — DOM-frei testbar (Testpyramide, TST-5), liest AUSSCHLIESSLICH
// über db.individuals/db.families (Chokepoint-Zugriff, Spec 02 §3).
import type { Database } from '../../../core/model/types';
import type { LogEntry, LogResult } from '../../../core/research/types';
import { displayName } from '../../shell/person-display';
import { familyLabelFor } from '../source/family-label';
import type { TaskEntityKind } from '../tasks/tasks-model';

/** Ein Protokoll-Eintrag zusammen mit seiner Trägerentität + Index (Bearbeiten/Löschen-Adressierung). */
export interface LogEntryRow {
  kind: TaskEntityKind;
  entityId: string;
  entityLabel: string;
  index: number;
  entry: LogEntry;
}

/**
 * Sammelt ALLE Protokoll-Einträge über Personen UND Familien (analog collectAllTasks).
 * Reine Funktion, kein eigener Zustand — ein Kommando (Eintrag hinzufügen/ändern) →
 * Chokepoints (db.individuals/db.families) neu lesen → diese Funktion erneut aufrufen.
 */
export function collectAllLogEntries(db: Database): LogEntryRow[] {
  const out: LogEntryRow[] = [];
  for (const [id, p] of db.individuals) {
    p.researchLog.forEach((entry, index) => {
      out.push({ kind: 'person', entityId: id, entityLabel: displayName(p), index, entry });
    });
  }
  for (const [id] of db.families) {
    const label = familyLabelFor(db, id);
    const f = db.families.get(id)!;
    f.researchLog.forEach((entry, index) => {
      out.push({ kind: 'family', entityId: id, entityLabel: label, index, entry });
    });
  }
  // Neueste zuerst (Orakel-analoges Verhalten für ein Protokoll: jüngster Sucheintrag
  // zuerst sichtbar) — stabile Sortierung nach `date` absteigend, bei Gleichstand
  // Einfüge-Reihenfolge (Array.prototype.sort ist stabil).
  return out.slice().sort((a, b) => (b.entry.date || '').localeCompare(a.entry.date || ''));
}

export type LogFilter = 'all' | LogResult;

const RESULT_LABELS: Record<LogResult, string> = {
  found: 'Gefunden',
  notfound: 'Nichts gefunden',
  pending: 'Ausstehend',
};

export function resultLabel(result: LogResult): string {
  return RESULT_LABELS[result];
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
