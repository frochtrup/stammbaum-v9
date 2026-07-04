// core/model/types.ts — reine Typdefinitionen des Domänenkerns (Spec 10).
// DOM-frei, framework-frei (INV-ARCH-1). Keine Laufzeit-Logik hier.

// Konkrete Orts-/Hof-Form kommt aus dem Orts-Kern (Spec 11). Type-only-Import →
// unter isolatedModules erased, kein Laufzeit-Zyklus (Model ↔ Places, gleiche Schicht).
import type { PlaceObject as PlaceObjectT, HofObject as HofObjectT } from '../places/types';

// --- ID-Typen (GEDCOM-Konvention @Ixx@/@Fxx@/@Sxx@/@Rxx@/@Nxx@) ---
export type PersonId = string;
export type FamilyId = string;
export type SourceId = string;
export type RepoId = string;
export type NoteId = string;
export type PlaceId = string;
export type HofId = string;

export type Sex = 'M' | 'F' | 'U';

/** GEDCOM-Datumsangabe intern als normalisierter Raw-String (Spec 10 §5.2). */
export type DateValue = string;

// --- Evidenz (3-Achsen-Modell, Detail in Spec 12 §3) ---
export type EvidenceSource = 'original' | 'derivative' | 'authored' | '';
export type EvidenceInformation = 'primary' | 'secondary' | 'indeterminate' | '';
export type EvidenceEvidenceKind = 'direct' | 'indirect' | 'negative' | '';

export interface EvidenceEval {
  source: EvidenceSource;
  information: EvidenceInformation;
  evidence: EvidenceEvidenceKind;
}

export interface MediaRef {
  /** Relativer Pfad (bezogen auf Datei-/Sync-Ordner) — einzige Wahrheitsquelle. */
  file: string;
  title: string;
}

export type Quay = 0 | 1 | 2 | 3;

/** Einheitlicher Zitatkörper — gilt in ALLEN Kontexten (Spec 10 §5.3). */
export interface Citation {
  sourceId: SourceId;
  page: string;
  quay: Quay;
  note: string;
  media: MediaRef[];
  eval: EvidenceEval | null;
  /** = media[0].file (OBJE/FILE), NICHT page. */
  deepLinkUrl: string;
}

/** FAMC-Mitgliedschaft als Kind — Beziehungstyp lebt INDI-seitig (INV-P4). */
export interface ChildLink {
  familyId: FamilyId;
  pedigree: 'birth' | 'adopted' | 'foster' | 'sealing' | '';
  fatherRel: string;
  motherRel: string;
  fatherRelSeen: boolean;
  motherRelSeen: boolean;
  citations: Citation[];
}

export interface PersonName {
  nameRaw: string;
  given: string;
  surname: string;
  prefix: string;
  suffix: string;
  type: string;
  citations: Citation[];
}

export interface NameTranslation {
  lang: string;
  value: string;
}

export interface Association {
  personRef: PersonId | null;
  grampsHandle: string | null;
  role: string;
  note: string;
  citations: Citation[];
}

export interface ExternalId {
  value: string;
  type: string;
}

/**
 * Event — Person und Familie teilen ein Modell (Spec 10 §5.1).
 * Feld-Tristate für date/place: null (Tag fehlt), '' (Tag da, leer), Wert (belegt).
 */
export interface Event {
  type: string;
  value: string;
  eventType: string;
  date: DateValue | null;
  datePhrase: string;
  place: string | null;
  placeId: PlaceId | null;
  hofId: HofId | null;
  lati: number | null;
  long: number | null;
  addr: string;
  note: string;
  citations: Citation[];
  media: MediaRef[];
  /** INV-P5: bewahrt leere-aber-vorhandene Blöcke (`1 BIRT` ohne Sub-Tags). */
  seen: boolean;
}

export interface Person {
  id: PersonId;

  name: string;
  given: string;
  surname: string;
  prefix: string;
  suffix: string;
  nick: string;
  sex: Sex;
  title: string;
  religion: string;
  restriction: string;
  email: string;
  www: string;
  uid: string;

  birth: Event;
  chr: Event;
  death: Event;
  cause: string;
  buri: Event;
  events: Event[];

  extraNames: PersonName[];
  aliases: PersonId[];
  aliaNames: string[];
  nameTrans: NameTranslation[];

  topLevelCitations: Citation[];
  nameCitations: Citation[];

  childOf: ChildLink[];
  parentIn: FamilyId[];
  associations: Association[];

  media: MediaRef[];
  noteText: string;
  noteRefs: NoteId[];

  noEvents: Set<string>;
  exids: ExternalId[];
  createdDate: string;

  // Forschung (Spec 12) — als opake Referenzen; Modell-Kern rührt sie nicht an.
  tasks: unknown[];
  researchLog: unknown[];
  hypotheses: unknown[];

  lastChanged: string;
}

export interface Family {
  id: FamilyId;
  husband: PersonId | null;
  wife: PersonId | null;
  children: PersonId[];
  marriage: Event;
  engagement: Event;
  events: Event[];
  noteText: string;
  citations: Citation[];
  tasks: unknown[];
  researchLog: unknown[];
  hypotheses: unknown[];
  lastChanged: string;
}

export interface SourceDataEvent {
  eventTypes: string;
  date: string;
  place: string;
}

export interface Source {
  id: SourceId;
  abbr: string;
  title: string;
  author: string;
  date: string;
  publisher: string;
  text: string;
  repo: RepoId | string;
  callNumber: string;
  callMedia: string;
  dataEvents: SourceDataEvent[];
  externalRefs: { value: string; type: string }[];
  media: MediaRef[];
  lastChanged: string;
}

export interface Repository {
  id: RepoId;
  name: string;
  type: string;
  address: string;
  phone: string;
  www: string;
  email: string;
  findingAid: string;
  lastChanged: string;
}

export interface Note {
  id: NoteId;
  type: 'NOTE' | 'SNOTE';
  text: string;
}

export interface HeaderMeta {
  /** verbatim erhaltene HEAD-Zeilen (Roundtrip-Fidelity). */
  raw: string[];
}

export interface Database {
  individuals: Map<PersonId, Person>;
  families: Map<FamilyId, Family>;
  sources: Map<SourceId, Source>;
  repositories: Map<RepoId, Repository>;
  notes: Map<NoteId, Note>;
  // placeObjects/hofObjects (Spec 11): konkrete Form aus dem Orts-Kern.
  placeObjects: Map<PlaceId, PlaceObjectT>;
  hofObjects: Map<HofId, HofObjectT>;
  placForm: string;
  gedVersion: 'unknown' | '5.5.1' | '7.0';
  header: HeaderMeta;
}
