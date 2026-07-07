// ui/views/repository/repository-detail-model.ts — reine Projektion eines Archivs auf
// ein Detail-Modell (Spec 20 §1.6 [K]: "Detail mit verlinkten Quellen, Signatur").
import type { Database, Repository, Source } from '../../../core/model/types';

export interface RepositorySourceRow {
  sourceId: string;
  label: string;
  callNumber: string;
}

export interface RepositoryDetailModel {
  repository: Repository;
  sources: RepositorySourceRow[];
}

function toSourceRow(s: Source): RepositorySourceRow {
  return { sourceId: s.id, label: s.abbr || s.title || s.id, callNumber: s.callNumber };
}

/**
 * Baut das read-only Detail-Modell eines Archivs. Gibt null zurück, wenn die id im
 * aktuellen Datenbestand fehlt (definierter Fallback, Spec 21 §5).
 */
export function buildRepositoryDetail(db: Database, repoId: string): RepositoryDetailModel | null {
  const repository = db.repositories.get(repoId);
  if (!repository) return null;

  const sources = Array.from(db.sources.values())
    .filter((s) => s.repo === repoId)
    .map(toSourceRow)
    .sort((a, b) => a.label.localeCompare(b.label, 'de'));

  return { repository, sources };
}
