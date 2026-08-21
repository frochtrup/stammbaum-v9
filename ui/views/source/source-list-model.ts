// ui/views/source/source-list-model.ts — reine Aufbereitung der Quellen-Liste
// (Spec 20 §1.6 [K]: "Liste (Kurzname, Autor, Datum, Referenzzähler)"). Reine Funktion
// (db -> Zeilen). Der Referenzzähler zählt jedes Zitat dieser Quelle über ALLE
// Personen- und Familien-Zitatstellen (Sonder-Events, Ereignisse, Namen, Kindschaft,
// Assoziationen, Familien-Ereignisse, Familien-Top-Level) — s. collectCitationRefs.
import type { Citation, Database, Source } from '../../../core/model/types';
import { sourceKindOf, type SourceKind } from '../../../core/model/source-kinds';
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
  /** Abgeleitete Gattung (BL-373, `sourceKindOf`) — NICHT als Zeilen-Pille sichtbar,
   *  sondern die Grundlage des Gattungs-Filters. Eine Pille trüge hier kein Signal:
   *  am Realbestand fielen 66 von 153 Quellen in EINE Gattung, das Etikett stünde
   *  also auf fast jeder Zeile (dieselbe Messlatte, an der ADR-v9-149 die
   *  Anreicherungs-Pille zum Filter gemacht hat, [21 §10l]). */
  kind: SourceKind;
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
    kind: sourceKindOf(s),
  };
}

/** Filterfelder der Quellenliste (BL-373). Ein Feld — mehr hat die Fläche nicht zu
 *  fragen; `countActiveFilters` vergleicht es gegen `defaultSourceFilters()`. */
export interface SourceFilters {
  /** '' = alle Gattungen. `sonstiges` ist eine wählbare Stufe („ohne erkennbare Gattung"). */
  kind: SourceKind | '';
}

export function defaultSourceFilters(): SourceFilters {
  return { kind: '' };
}

/**
 * Alphabetisch nach Anzeigelabel (Kurzname bevorzugt) sortiert, gefiltert nach Suchanfrage
 * und Gattung.
 *
 * `query`/`filters` sind vorbelegt, damit die Funktion ohne sie die ungefilterte Liste
 * liefert — die Aufrufer, die nur zählen wollen, müssen nichts über Filter wissen.
 */
export function buildSourceRows(
  db: Database,
  query = '',
  filters: SourceFilters = defaultSourceFilters(),
): SourceRow[] {
  const refCounts = countReferencesBySource(db);
  const sources = Array.from(db.sources.values());
  return sources
    .filter((s) => matchesSearch(s, query))
    .map((s) => toRow(s, refCounts.get(s.id)?.length ?? 0, db))
    .filter((row) => !filters.kind || row.kind === filters.kind)
    .sort((a, b) => a.label.localeCompare(b.label, 'de'));
}

/**
 * Textmatch über Kurzname/Titel/Autor/Datum/Verlag/Signatur/Notiz (Spec 20 §1.6 [K]:
 * "Liste (…), Suche, Detail"). DERSELBE Baustein für beide Flächen: die globale Suche
 * (ui/views/search/global-search-model.ts, Spec 20 §1.1 [K]) und seit BL-372 das
 * Suchfeld der Quellenliste selbst — analog zu den `matchesSearch` in person-/family-/
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
