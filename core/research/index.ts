// core/research/index.ts — öffentliche API der Forschungsdaten (Spec 12).
// Framework-frei, DOM-frei (INV-ARCH-1), build-frei testbar (INV-ARCH-2).

export * from './types';
export { makeTask, setTaskStatus, isTaskDone } from './task';
export { makeLogEntry, linkLogToTask } from './log';
export {
  makeProject,
  makeScopePersonRef,
  matchesScope,
  normalizeProject,
  resolveScopePersonRef,
} from './project';
export { makeHypothesis, addHypothesisEvidence, isIdentityExclusion } from './hypothesis';
export { evalToQuay, isEvidenceEvalEmpty, makeEvidenceEval } from './eval';
export {
  suggestResearchStep,
  type ResearchStepInput,
  type ResearchStepContext,
  type ResearchStepSuggestion,
} from './suggest';
export { buildProofSummary, type ProofSummary, type ProofSources } from './proof-summary';
export {
  ancestorBranches,
  DEFAULT_BRANCH_LEVEL,
  MIN_BRANCH_LEVEL,
  MAX_BRANCH_LEVEL,
  type AncestorBranch,
  type AncestorBranches,
} from './branches';
