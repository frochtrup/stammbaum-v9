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
  /** Erfassungsdatum („Erfasst am", ADR-v9-179) — NICHT das Datum des Dokuments. */
  createdDate: string;
  refCount: number;
  /** "Notizen"-Badge (Spec 20 §1.6 [K], ADR-v9-79 Punkt 3/4) — `true`, sobald `text`
   *  (SOUR>TEXT, zitierter Wortlaut) ODER `noteText` (SOUR>NOTE, Anmerkung über die
   *  Quelle) etwas trägt.
   *
   *  DIE FELD-UNSCHÄRFE IST AUFGELÖST (BL-336, vorher ADR-v9-79 Punkt 4 / Spec 20 §1.6
   *  „vor dem Bau am Nutzer verifizieren"): `Source` hatte kein `noteText`, weshalb `text`
   *  behelfsweise als „Notizen" herhalten musste — inhaltlich Transkription statt
   *  Anmerkung. Jetzt gibt es beide Felder, und das Badge hängt an beiden: es sagt „hier
   *  steht Text", und das erfüllen sie gleichermaßen (Nutzer-Entscheidung 2026-08-11). */
  hasNotes: boolean;
  /** 📎-Medien-Badge (BL-200) — `true`, wenn die Quelle mind. eine Medien-Zitation trägt
   *  (`Source.media`). Dasselbe 📎-Vokabular wie in der Personenliste (Spec 21 §7). */
  hasMedia: boolean;
  /** 🏛-Archiv-Name (BL-202) — der Name des Archivs, in dem die Quelle liegt (`Source.repo`
   *  über `db.repositories` aufgelöst; freier Repo-Text durchgereicht). Leer = kein Archiv. */
  repoName: string;
}

/** Archiv-Name zu `Source.repo` — aufgelöst über `db.repositories`, sonst der freie
 *  Repo-Text (GEDCOM erlaubt sowohl `@R1@`-Pointer als auch Inline-Text). */
function repoNameOf(db: Database, s: Source): string {
  if (!s.repo) return '';
  return db.repositories.get(s.repo)?.name || s.repo;
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

function toRow(s: Source, refCount: number, db: Database): SourceRow {
  return {
    id: s.id,
    label: s.abbr || s.title || s.id,
    author: s.author,
    createdDate: s.createdDate,
    refCount,
    hasNotes: s.text.trim() !== '' || s.noteText.trim() !== '',
    hasMedia: s.media.length > 0,
    repoName: repoNameOf(db, s),
  };
}

/** Alphabetisch nach Anzeigelabel (Kurzname bevorzugt) sortiert. */
export function buildSourceRows(db: Database): SourceRow[] {
  const refCounts = countReferencesBySource(db);
  const sources = Array.from(db.sources.values());
  return sources
    .map((s) => toRow(s, refCounts.get(s.id)?.length ?? 0, db))
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
  // `noteText` gehört in dieselbe Zeile wie `text` (BL-336): ein Feld, das die Liste über
  // ein Badge ankündigt, muss auch auffindbar sein — sonst zeigt das Badge auf etwas, das
  // die Suche nicht kennt.
  const haystack = [s.abbr, s.title, s.author, s.createdDate, s.publisher, s.text, s.noteText, s.callNumber, s.agnc]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}
