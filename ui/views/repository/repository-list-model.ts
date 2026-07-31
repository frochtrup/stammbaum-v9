// ui/views/repository/repository-list-model.ts — reine Aufbereitung der Archiv-Liste
// (Spec 20 §1.6 [K]: "Archive (Repository): Picker, Detail mit verlinkten Quellen,
// Signatur"). Reine Funktion (db -> Zeilen).
import type { Database, Repository } from '../../../core/model/types';
import { repoTypeLabel } from '../../shell/repo-labels';

export interface RepositoryRow {
  id: string;
  name: string;
  /** DEUTSCHES Label (`repoTypeLabel`), nicht der rohe GRAMPS-/`_RTYPE`-Wert (BL-203).
   *  Leer bei `Unknown`/kein Typ — die Zeile zeigt dann gar kein Typ-Element. */
  typeLabel: string;
  sourceCount: number;
}

/** Anzahl Quellen, die auf dieses Archiv verweisen (Source.repo === Repository.id). */
export function countSourcesByRepository(db: Database): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of db.sources.values()) {
    if (!s.repo) continue;
    counts.set(s.repo, (counts.get(s.repo) ?? 0) + 1);
  }
  return counts;
}

function toRow(r: Repository, sourceCount: number): RepositoryRow {
  return { id: r.id, name: r.name || r.id, typeLabel: repoTypeLabel(r.type), sourceCount };
}

/** Alphabetisch nach Name sortiert. */
export function buildRepositoryRows(db: Database): RepositoryRow[] {
  const counts = countSourcesByRepository(db);
  const repos = Array.from(db.repositories.values());
  return repos
    .map((r) => toRow(r, counts.get(r.id) ?? 0))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/**
 * Textmatch über Name/Typ/Adresse (analog `matchesSearch` in source-list-model.ts,
 * ADR-v9-18-Lehre: eine Extraktionsfunktion statt Drift). Wiederverwendet vom
 * generischen Entitäts-Picker (`ui/shell/RepositoryPicker.svelte`, ADR-v9-40) — die
 * Match-Logik gehört ins Modell, nicht in die Picker-Komponente selbst.
 */
export function matchesSearch(r: Repository, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  // BL-203: gesucht wird über BEIDE Schreibweisen des Typs — den rohen Speicherwert
  // (`Library`) UND das angezeigte deutsche Label („Bibliothek"). Nur den Rohwert zu
  // durchsuchen hieße, dass die Suche genau den Text nicht findet, den die Liste zeigt;
  // nur das Label, dass ein aus GRAMPS gewohnter englischer Begriff nicht mehr trifft.
  const haystack = [r.name, r.type, repoTypeLabel(r.type), r.address]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}
