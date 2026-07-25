// core/research/index.ts — öffentliche API der Forschungsdaten (Spec 12).
// Framework-frei, DOM-frei (INV-ARCH-1), build-frei testbar (INV-ARCH-2).

export * from './types';
export { makeTask, setTaskStatus, isTaskDone } from './task';
export { makeLogEntry, linkLogToTask } from './log';
export { makeProject, matchesScope } from './project';
export { makeHypothesis, addHypothesisEvidence } from './hypothesis';
export { evalToQuay, makeEvidenceEval } from './eval';
export { buildProofSummary, type ProofSummary, type ProofSources } from './proof-summary';
