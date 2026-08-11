// core/model/factory.ts — Konstruktoren, die Invarianten-Defaults etablieren.
// makePerson garantiert INV-P1 (sex=U), makeEvent das Tristate-Default (date/place=null).
import type {
  Person,
  Family,
  Source,
  Repository,
  Note,
  Event,
  Database,
  Citation,
  Association,
  Media,
  MediaCitation,
  PersonId,
  FamilyId,
  SourceId,
  RepoId,
  NoteId,
  MediaId,
  Quay,
  EvidenceEval,
} from './types';
import { normalizeSex } from './sex';

export function makeDatabase(): Database {
  return {
    individuals: new Map(),
    families: new Map(),
    sources: new Map(),
    repositories: new Map(),
    notes: new Map(),
    media: new Map(),
    placeObjects: new Map(),
    hofObjects: new Map(),
    placForm: '',
    gedVersion: 'unknown',
    header: { raw: [] },
  };
}

/** Frisches Event mit Tristate-Default: date/place = null (Tag fehlt), seen = false. */
export function makeEvent(type: string, patch: Partial<Event> = {}): Event {
  return {
    type,
    value: '',
    eventType: '',
    date: null,
    datePhrase: '',
    place: null,
    placeId: null,
    hofId: null,
    lati: null,
    long: null,
    addr: null,
    addrExtra: [],
    note: '',
    citations: [],
    media: [],
    seen: false,
    grampsId: null,
    ...patch,
  };
}

export function makePerson(id: PersonId, patch: Partial<Person> = {}): Person {
  const base: Person = {
    id,
    name: '',
    given: '',
    surname: '',
    prefix: '',
    suffix: '',
    givenSeen: false,
    surnameSeen: false,
    suffixSeen: false,
    nick: '',
    nameType: '',
    sex: 'U',
    sexSeen: false,
    title: '',
    restriction: '',
    email: '',
    www: '',
    uid: '',
    birth: makeEvent('BIRT'),
    chr: makeEvent('CHR'),
    death: makeEvent('DEAT'),
    cause: '',
    buri: makeEvent('BURI'),
    events: [],
    extraNames: [],
    aliases: [],
    aliaNames: [],
    nameTrans: [],
    topLevelCitations: [],
    nameCitations: [],
    childOf: [],
    parentIn: [],
    associations: [],
    media: [],
    noteText: '',
    extraNotes: [],
    noteRefs: [],
    noEvents: new Set<string>(),
    exids: [],
    createdDate: '',
    tasks: [],
    researchLog: [],
    hypotheses: [],
    lastChanged: '',
  };
  const merged = { ...base, ...patch };
  // INV-P1: sex ist immer gültig, egal was der Patch liefert.
  merged.sex = normalizeSex(merged.sex);
  return merged;
}

export function makeFamily(id: FamilyId, patch: Partial<Family> = {}): Family {
  return {
    id,
    husband: null,
    wife: null,
    children: [],
    marriage: makeEvent('MARR'),
    engagement: makeEvent('ENGA'),
    events: [],
    noteText: '',
    extraNotes: [],
    citations: [],
    tasks: [],
    researchLog: [],
    hypotheses: [],
    lastChanged: '',
    ...patch,
  };
}

export function makeSource(id: SourceId, patch: Partial<Source> = {}): Source {
  return {
    id,
    abbr: '',
    title: '',
    author: '',
    createdDate: '',
    publisher: '',
    text: '',
    repo: '',
    callNumber: '',
    callMedia: '',
    agnc: '',
    noteText: '',
    extraNotes: [],
    noteRefs: [],
    dataEvents: [],
    dataExtra: [],
    externalRefs: [],
    media: [],
    lastChanged: '',
    ...patch,
  };
}

export function makeRepository(id: RepoId, patch: Partial<Repository> = {}): Repository {
  return {
    id,
    name: '',
    type: '',
    address: null,
    addressExtra: [],
    phone: '',
    www: '',
    email: '',
    findingAid: '',
    lastChanged: '',
    ...patch,
  };
}

export function makeNote(id: NoteId, patch: Partial<Note> = {}): Note {
  return { id, type: 'NOTE', text: '', ...patch };
}

/** Top-Level-Medium (ADR-v9-125). `id` content-adressiert (Xref/Pfad/GRAMPS-id). */
export function makeMedia(id: MediaId, patch: Partial<Media> = {}): Media {
  return {
    id, file: id, form: '', formWire: '', type: '', typeWire: '',
    title: '', wireOrigin: 'inline', lastChanged: '', ...patch,
  };
}

/** Referenz-spezifische Medienverknüpfung. */
export function makeMediaCitation(
  mediaId: MediaId,
  patch: Partial<Omit<MediaCitation, 'mediaId'>> = {},
): MediaCitation {
  // `formSeen`/`typeSeen` sind bewusst `true` per Default (BL-306): eine neu angelegte
  // Fundstelle ist die volle Form. Nur eine aus der Datei gelesene weiß es besser.
  return {
    mediaId, title: '', date: '', note: '', primary: false,
    formSeen: true, typeSeen: true, extra: [], ...patch,
  };
}

/** Assoziation (ASSO/RELA bzw. ROLE) — Zeuge/Pate/Informant ohne Familienbindung.
 *  `personRef` ist die Wahrheit; `grampsHandle` bleibt für GRAMPS-Importe erhalten,
 *  deren Ziel (noch) nicht auf eine id abgebildet werden konnte (BL-127). */
export function makeAssociation(
  personRef: PersonId | null,
  patch: Partial<Omit<Association, 'personRef'>> = {},
): Association {
  return { personRef, grampsHandle: null, role: '', note: '', citations: [], ...patch };
}

export function makeCitation(
  sourceId: SourceId,
  patch: Partial<Omit<Citation, 'sourceId'>> = {},
): Citation {
  const base: Citation = {
    sourceId,
    page: '',
    quay: null,
    note: '',
    media: [],
    eval: null,
    deepLinkUrl: '',
    grampsId: null,
  };
  return { ...base, ...patch };
}

// Re-Exports für Konsumenten der Zitatlogik.
export type { Quay, EvidenceEval };
