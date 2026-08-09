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

export { makePlaceRegistry, chainCompatibleAnyPath, type PlaceRegistry, type EnclosureMeta } from './place-registry';
export { makeHofRegistry, type HofRegistry } from './hof-registry';

// Chokepoint 4 (Spec 11 §5): PLAC-Bau + Kontext-Typ.
export {
  buildPlacForGedcom,
  buildFormString,
  buildFullPlaceName,
  // Listen-Anzeige (INV-UI-14, Spec 21 §6l) — Kurzname statt Verwaltungskette.
  buildListPlaceName,
  placeDisplayName,
  eventYear,
  eventSpanne,
  type PlaceContext,
} from './build-plac';

// Zeitrechnung der Auflösung (BL-324, ADR-v9-243): Jahr ODER Tag, EINE Intervall-Regel.
export {
  alsGrenze,
  alsSpanne,
  grenzeAusEingabe,
  grenzeText,
  istDatiert,
  jahrAus,
  jahresBeginn,
  jahresEnde,
  jahresSpanne,
  spanneVonDatiert,
  spanneVonEreignis,
  tagesOrdinal,
  trifft,
  OFFENE_GRENZE,
  type Grenze,
  type GrenzEingabe,
  type Spanne,
  type Zeitbezug,
} from './zeitbezug';

// Chokepoints 1–3 (Spec 11 §5): die einzigen erlaubten Reads.
export { eventPlaceId, eventHofId, eventCoords, type Coords } from './chokepoints';

// Koordinaten-Eingabe (Spec 20 §1.7): ein Feld, komplettes Apple-Maps-Paar automatisch
// zerlegt; sonst Einzelwert je Feld (GEDCOM/Dezimal). Reine Parser, v8-Orakel parseCoordInput.
export { parseCoordPair, parseCoordAxis, resolveCoordFields, type CoordPair } from './coords';

// Nominatim-Geocoding (BL-130): reine Antwort-Auswertung (Netzwerk lebt in services/places).
export {
  parseNominatimResults,
  nominatimSearchUrl,
  type NominatimResult,
  type GeocodeHit,
} from './geocode';

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

// Orte-Bootstrap-Vorschlag (Spec 20 §1.7 [K], ADR-v9-27): reine Vorschlags-Sammlung,
// legt NICHTS automatisch an (kuratierte placeObjects, Spec 11 §2).
// Village-Seed-Vorpass (Spec 11 §4.2 Schritt 0, ADR-v9-28/-29): erzeugt fehlende
// Village-PlaceObjects automatisch beim Import — Dedup nach Name+Hierarchie-Verträglichkeit.
// Ersetzt den früheren Opt-in-Vorschlag `suggestPlaceCandidates` (ADR-v9-27, entfernt).
export { seedPlacesFromEvents } from './seed';

// Mutations-Kommandos (Spec 20 §1.7/§1.8 [K] "Bearbeitung") — savePlaceObject(model)-
// Muster, keine verstreuten Feld-Setter.
export {
  savePlaceObject,
  deletePlaceObject,
  saveHofObject,
  deleteHofObject,
  markPlaceReviewed,
  markHofReviewed,
  withAddedPname,
  withRemovedPname,
  withUpdatedPname,
  withAddedTranslation,
  withRemovedTranslation,
  withAddedEnclosedBy,
  withRemovedEnclosedBy,
  withUpdatedEnclosedBy,
  withAddedHofAddr,
  withRemovedHofAddr,
  withUpdatedHofAddr,
  linkEventToPlace,
  linkEventToHof,
  mergePlaceObjects,
  mergeHofObjects,
  moveHofToVillage,
  type MergeResult,
  type MoveHofResult,
} from './commands';

// Kurations-Layer (Spec 11 §9, ADR-v9-44/45/46): reine Anzeige-/Dedup-Prädikate über
// orte.json (kein Schreibgate, kein persistierter Zustand). Anreicherungs-Prädikat (§9.1),
// Referenz-Sichtbarkeit (§9.3), Massen-Dedup-Finder (§9.2).
export {
  isEnrichedPlace,
  isEnrichedHof,
  placeEnrichmentLevel,
  hofEnrichmentLevel,
  isReviewed,
  isCuratedPlace,
  isCuratedHof,
  hasReference,
  findPlaceDuplicates,
  type DedupKind,
  type DuplicateGroup,
  type EnrichmentLevel,
} from './curation';

// GOV-Import (BL-131, Spec 20 §1.7): Textzusammenfassung von gov.genealogy.net → Namen/
// Übersetzungen/Typ-Historie/Verwaltungs-Zugehörigkeit. Reine Funktionen, kein Netzwerk.
export {
  parseGovText,
  applyGovEntry,
  isUnresolvedGovPlaceholder,
  countUnresolvedGovPlaceholders,
  govPlaceholderId,
  GOV_TYPE_TO_PLACE_TYPE,
  type GovEntry,
  type GovTypeEntry,
  type GovNameEntry,
  type GovParentEntry,
  type GovApplyResult,
} from './gov';
