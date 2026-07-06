// core/model/index.ts — öffentliche API des Domänenmodells (Spec 10).
// Framework-frei, DOM-frei (INV-ARCH-1), build-frei testbar (INV-ARCH-2).

export * from './types';
export { normalizeSex } from './sex';
export {
  makeIdAllocator,
  nextId,
  idNumber,
  allocatorFromDatabase,
  type IdAllocator,
  type IdPrefix,
} from './ids';
export {
  makeDatabase,
  makeEvent,
  makePerson,
  makeFamily,
  makeSource,
  makeRepository,
  makeNote,
  makeCitation,
} from './factory';
export { isEventPresent } from './event';
export {
  parseDateValue,
  formatDateValue,
  normalizeMonth,
  type DateParts,
  type DateQualifier,
} from './gedcom-date';
export { savePerson, deletePerson } from './commands';
export {
  dedupeCitations,
  setCitationQuay,
  suggestQuayFromEval,
  applyEvalToCitation,
} from './citation';
export {
  findOrphanRefs,
  checkIndiFamConsistency,
  addChildToFamily,
  removeChildFromFamily,
  addParentToFamily,
  removeParentFromFamily,
  type OrphanRef,
  type ConsistencyIssue,
} from './integrity';
export { saveFamily, deleteFamily } from './commands';
