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
  /** "Notizen"-Badge (Spec 20 §1.6 [K], ADR-v9-79 Punkt 3/4) — `true` wenn `text`
   *  (GEDCOM SOUR.TEXT) nicht leer ist. FELD-UNSCHÄRFE (bewusst nicht abschließend
   *  geklärt, ADR-v9-79 Punkt 4): `Source` hat kein eigenes `noteRefs`/`noteText`
   *  (anders als Person/Family) — `text` ist die einzige vorhandene Textablage und
   *  wurde behelfsweise als "Notizen"-Abbildung gewählt, ist inhaltlich aber eher
   *  Transkription/zitierter Urtext als Anmerkung. Falls stattdessen Zitat-Notizen
   *  (`Citation.note`, pro Referenz) gemeint waren, gehört das zu SourceCitationRow
   *  (Spec 21 §10d), nicht hierher — vor einer Änderung am Nutzer verifizieren. */
  hasNotes: boolean;
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
    hasNotes: s.text.trim() !== '',
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

/**
 * Textmatch über Kurzname/Titel/Autor/Datum/Verlag/Signatur/Notiz (Spec 20 §1.6 [K]:
 * "Liste (Kurzname, Autor, Datum, Referenzzähler)"). Der lokale Quellen-Tab selbst hat
 * (noch) kein eigenes Suchfeld — diese Funktion existiert primär als der EINE Baustein,
 * den die globale Suche nutzt (ui/views/search/global-search-model.ts, Spec 20 §1.1
 * [K]), analog zu den bereits exportierten `matchesSearch` in person-/family-/
 * place-list-model.ts (ADR-v9-18-Lehre: eine Extraktionsfunktion statt Drift).
 */
export function matchesSearch(s: Source, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [s.abbr, s.title, s.author, s.date, s.publisher, s.text, s.callNumber]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}
