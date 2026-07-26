// core/interop/index.ts — öffentliche Interop-API (Spec 13).
// Framework-frei, DOM-frei (INV-ARCH-1), build-frei testbar (INV-ARCH-2).
//
// Kernversprechen (LP-1): verlustfreier Roundtrip GEDCOM (5.5.1/7.0/Strict) + GRAMPS.
//   parse(text)            → { db, roots }   (Modell + Passthrough-Backbone)
//   serialize(doc, format) → string          (GEDCOM-Bytes)

export type {
  GedNode,
  GedLine,
} from './gedcom-tree';
export {
  lexLines,
  buildTree,
  parseTree,
  writeTree,
  writeNode,
  child,
  children,
  childValue,
  unescapeAt,
} from './gedcom-tree';

export type { GedFormat, SerializeFormat, ParsedGedcom, Clock } from './types';

export { parseGedcom, parseCoord } from './gedcom-parse';
export { serializeGedcom, type SerializeOptions } from './gedcom-serialize';

export { applyDatabaseToRoots } from './write-back';
export {
  emitPerson,
  emitFamily,
  emitSource,
  emitRepository,
} from './write-back-emit';

export { transformGed7 } from './ged7-adapter';
export { stripStrict } from './strict-adapter';
export { buildLivingSet, anonymizeIndi, anonymizeFam, anonymizeDoc } from './anonymize';

export { modelEquiv, type Diff } from './model-equiv';

export {
  grampsTypeToTag,
  tagToGrampsType,
  confidenceToQuay,
  quayToConfidence,
  pediToChildrefRel,
  childrefRelToPedi,
  normalizeMedi,
  type Pedigree,
} from './enum-maps';
export { remapIdsForFormat, mappedOr, type IdRemap, type TargetFormat } from './id-remap';

// Cross-Family-Vollbaum-Synthese aus dem Modell (ADR-v9-127, BL-157/158).
export { buildGedcomTreeFromModel } from './build-gedcom-from-model';
export { buildGrampsTreeFromModel } from './build-gramps-from-model';

export { buildXMLText, parseXMLText, type GrampsParsed } from './gramps';
export { applyDatabaseToXml } from './gramps-write-back';
export type { XmlNode, XmlDocument } from './xml-tree';
export { parseXml, serializeXml } from './xml-tree';
