// ui/views/source/source-list-model.ts — reine Aufbereitung der Quellen-Liste
// (Spec 20 §1.6 [K]: "Liste (Kurzname, Autor, Datum, Referenzzähler)"). Reine Funktion
// (db -> Zeilen). Der Referenzzähler zählt jedes Zitat dieser Quelle über ALLE
// Personen- und Familien-Zitatstellen (Sonder-Events, Ereignisse, Namen, Kindschaft,
// Assoziationen, Familien-Ereignisse, Familien-Top-Level) — s. collectCitationRefs.
import type { Citation, Database, Source } from '../../../core/model/types';
import { collectCitationRefs } from './citation-refs';

export interface SourceRow {
  id: string;
  label: string;
  author: string;
  date: string;
  refCount: number;
}

/** Alle Zitate der Datenbank, gruppiert nach Quellen-Id -> Zitat-Liste (mit Herkunft). */
export function countReferencesBySource(db: Database): Map<string, Citation[]> {
  const bySource = new Map<string, Citation[]>();
  for (const ref of collectCitationRefs(db)) {
    const list = bySource.get(ref.citation.sourceId);
    if (list) list.push(ref.citation);
    else bySource.set(ref.citation.sourceId, [ref.citation]);
  }
  return bySource;
}

function toRow(s: Source, refCount: number): SourceRow {
  return {
    id: s.id,
    label: s.abbr || s.title || s.id,
    author: s.author,
    date: s.date,
    refCount,
  };
}

/** Alphabetisch nach Anzeigelabel (Kurzname bevorzugt) sortiert. */
export function buildSourceRows(db: Database): SourceRow[] {
  const refCounts = countReferencesBySource(db);
  const sources = Array.from(db.sources.values());
  return sources
    .map((s) => toRow(s, refCounts.get(s.id)?.length ?? 0))
    .sort((a, b) => a.label.localeCompare(b.label, 'de'));
}
