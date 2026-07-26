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
    addr: '',
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
    nick: '',
    sex: 'U',
    title: '',
    religion: '',
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
    date: '',
    publisher: '',
    text: '',
    repo: '',
    callNumber: '',
    callMedia: '',
    dataEvents: [],
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
    address: '',
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

/** Globales Medium (ADR-v9-124). `id === file` (content-adressiert). */
export function makeMedia(id: MediaId, patch: Partial<Media> = {}): Media {
  return { id, file: id, form: '', type: '', lastChanged: '', ...patch };
}

/** Referenz-spezifische Medienverknüpfung. */
export function makeMediaCitation(
  mediaId: MediaId,
  patch: Partial<Omit<MediaCitation, 'mediaId'>> = {},
): MediaCitation {
  return { mediaId, title: '', date: '', note: '', primary: false, extra: [], ...patch };
}

export function makeCitation(
  sourceId: SourceId,
  patch: Partial<Omit<Citation, 'sourceId'>> = {},
): Citation {
  const base: Citation = {
    sourceId,
    page: '',
    quay: 0,
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
