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
export { isEventPresent, isEventEmpty, addrDisplay } from './event';
export { isPersonEmpty, isSourceEmpty, isRepositoryEmpty } from './empty';
export {
  classifyMediaFile,
  isWebLink,
  webLinkHost,
  webLinkLabel,
  isImageMedia,
  isEmbeddedImage,
  type MediaFileKind,
} from './media-kind';
export { smallestPersonId, getParentIds, type ParentIds } from './queries';
export {
  parseDateValue,
  formatDateValue,
  normalizeMonth,
  type DateParts,
  type DateQualifier,
} from './gedcom-date';
export { birthDateFromDeathAge } from './birth-from-age';
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
export { saveFamily, deleteFamily, saveChildLink } from './commands';
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
export { SOURCE_TEMPLATES, type SourceTemplate } from './source-templates';
export {
  BUILTIN_ENTRY_TEMPLATES,
  ENTRY_FAMILY_ROLES,
  ENTRY_PERSON_ROLES,
  EVENT_FIELDS,
  FAMILY_EVENT_TAGS,
  IDENTITY_FIELDS,
  isBuiltinEntryTemplate,
  isEventSlot,
  isFamilyRole,
  isIdentitySlot,
  makeEntryTemplate,
  normalizeEntryTemplate,
  resolveEntrySourcePrefill,
  slotKey,
  type EntryFamilyRole,
  type EntryPersonRole,
  type EntryRole,
  type EntrySlot,
  type EntrySourcePrefill,
  type EntryTemplate,
  type EventFieldName,
  type FamilyEventSlot,
  type FamilyEventTag,
  type IdentityFieldName,
  type IdentitySlot,
  type PersonEventSlot,
  type PrefillMode,
} from './entry-templates';
export {
  applyEntryTemplate,
  findFamilyFor,
  makeEntryDraft,
  type ApplyEntryTemplateResult,
  type EntryTemplateAmbiguity,
  type EntryTemplateDraft,
  type FamilyWish,
  type ParentWish,
} from './apply-entry-template';
export { withChangeStamps } from './change-stamp';
