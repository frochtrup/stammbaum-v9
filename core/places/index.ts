// core/places/index.ts — öffentliche API der Orts-/Hof-Identitätsauflösung (Spec 11).
// Framework-frei, DOM-frei (INV-ARCH-1), build-frei testbar (INV-ARCH-2).

export type {
  Year,
  Dated,
  DatedName,
  DatedAddress,
  DatedRef,
  PlaceObject,
  HofObject,
  PlaceObjects,
  HofObjects,
} from './types';

export {
  normPlaceName,
  normHofAddr,
  extractHofAddr,
  placeYear,
  placeTypeRank,
  slugify,
} from './normalize';

export { makePlaceRegistry, type PlaceRegistry, type EnclosureMeta } from './place-registry';
export { makeHofRegistry, type HofRegistry } from './hof-registry';

// Chokepoint 4 (Spec 11 §5): PLAC-Bau + Kontext-Typ.
export { buildPlacForGedcom, buildFormString, eventYear, type PlaceContext } from './build-plac';

// Chokepoints 1–3 (Spec 11 §5): die einzigen erlaubten Reads.
export { eventPlaceId, eventHofId, eventCoords, type Coords } from './chokepoints';

// Deterministische Hof-Identität + Bootstrap-Helfer.
export {
  makeHofId,
  findOrCreateHof,
  addHofVariant,
  type FindOrCreateResult,
} from './hof-id';

// Kern: die reine, deterministische Auflösungsfunktion + Review-Klassifikation.
export {
  resolveEvents,
  hofHasAddr,
  HOF_EVENT_TYPES,
  type ResolvePath,
  type ReviewClass,
  type ReviewItem,
  type ResolvedEvent,
  type ResolveResult,
} from './resolve';

// Mutations-Kommandos (Spec 20 §1.7/§1.8 [K] "Bearbeitung") — savePlaceObject(model)-
// Muster, keine verstreuten Feld-Setter.
export {
  savePlaceObject,
  deletePlaceObject,
  saveHofObject,
  deleteHofObject,
  withAddedPname,
  withRemovedPname,
  withAddedEnclosedBy,
  withRemovedEnclosedBy,
  withAddedHofAddr,
  withRemovedHofAddr,
  linkEventToPlace,
} from './commands';
