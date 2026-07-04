// core/research/index.ts — öffentliche API der Forschungsdaten (Spec 12).
// Framework-frei, DOM-frei (INV-ARCH-1), build-frei testbar (INV-ARCH-2).

export * from './types';
export { makeTask, setTaskStatus, isTaskDone } from './task';
export { makeLogEntry } from './log';
export { makeProject } from './project';
export { makeHypothesis, addHypothesisEvidence } from './hypothesis';
export { evalToQuay, makeEvidenceEval } from './eval';
