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
  makeAssociation,
  makeMedia,
  makeMediaCitation,
} from './factory';
export { isEventPresent, isEventEmpty } from './event';
export { smallestPersonId } from './queries';
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
  citationUrl,
  setCitationUrl,
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
export {
  saveSource,
  deleteSource,
  saveRepository,
  deleteRepository,
  saveMedia,
  deleteMedia,
  withAddedMediaCitation,
  withRemovedMediaCitation,
  withUpdatedMediaCitation,
} from './commands';
export {
  deletePersonCascade,
  deleteFamilyCascade,
  deleteSourceCascade,
  deleteRepositoryCascade,
} from './delete-cascade';
