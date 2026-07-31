// core/dedup/index.ts — öffentliche Fläche der Duplikat-Erkennung (Spec 20 §1.12,
// ADR-v9-104). Eigener Ordner statt core/model: das Scoring ist eine Analyse ÜBER dem
// Modell, kein Bestandteil davon — es schreibt nichts und kennt keine Kommandos.
export {
  findPersonDuplicates,
  scorePersonPair,
  normalizeNameForMatch,
  nameSimilarity,
  pairKey,
  DEFAULT_DUPLICATE_THRESHOLD,
  type PersonGraph,
  type DuplicateCandidate,
} from './person-duplicates';

export { collectIdentityExclusions } from './identity-exclusions';
export { isIdentityExclusion } from '../research/hypothesis';

export {
  mergePersons,
  MERGEABLE_PERSON_FIELDS,
  type MergeSide,
  type MergeSelections,
  type MergeableField,
} from './merge-persons';

export {
  compareImport,
  diffPerson,
  IMPORT_MATCH_THRESHOLD,
  IMPORT_UNCERTAIN_THRESHOLD,
  type ImportStatus,
  type ImportMatch,
  type FieldDiff,
  type PersonDiff,
} from './compare-import';

export {
  applyImportPatch,
  type FieldDecision,
  type ImportedFile,
  type ImportSelections,
  type ImportSourceConfig,
  type ApplyImportResult,
} from './apply-import';
