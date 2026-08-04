// core/interop/build-gramps-from-model.ts — Modell → GRAMPS-Vollbaum VON GRUND AUF
// (BL-158, ADR-v9-127; löst ADR-v9-113 Befund 3 endgültig ab).
//
// Cross-Family-Emission: baut aus einem `db` (egal welcher Herkunft — typ. GEDCOM-geladen)
// einen KOMPLETTEN GRAMPS-XML-Baum, statt — wie das native Write-Back (`applyDatabaseToXml`)
// — nur neue Records in einen BESTEHENDEN Quell-Baum zu synthetisieren. Der native Pfad
// bleibt unangetastet (harte Invariante, ADR-v9-127 Entscheidung 1): dieses Modul ist ein
// SEPARATER Code-Pfad, kein RT-1/RT-2/RT-3-Test wird berührt.
//
// ── Warum From-Scratch statt „applyDatabaseToXml auf leeres Gerüst" (ADR-v9-127 Verworfen d):
// Das Write-Back setzt einen Quell-Baum voraus — sein Schreib-Index (`buildWriteIndex`) trägt
// nur Personen/Archive nach, Quellen-/Notiz-/Medien-Handles kommen aus dem geparsten Baum.
// Auf einem leeren Gerüst liefen Cross-Referenzen (citation→source, source→repo) ins Leere
// (genau der „hohle" Zustand aus ADR-v9-113 Befund 3). Diese Orchestrierung löst das, indem
// `remapIdsForFormat` VORAB jeder Entität eine frische ziel-native id + Handle gibt — jede
// Referenz ist damit auflösbar, bevor der erste Record geschrieben wird.
//
// ── IDs + Handles (ADR-v9-127 Entscheidung 2): die Modell-`id` bleibt quell-nativ; der Output
// vergibt frische `I0001/F0001/S0001/…` + GRAMPS-Handles (`remapIdsForFormat(db,'gramps')`).
// GRAMPS referenziert AUSSCHLIESSLICH über `handle` (`<father hlink="_x">`), nicht inline —
// jede Referenz wird über die Handle-Abbildung geschrieben. Geteilte Events/Zitate werden zu
// Top-Level-Records (`<events>`/`<citations>`) mit Owner-`<eventref>`/`<citationref>`.
//
// ── Werte-Kodierung: Enum/Datum über die kanonischen Bausteine (enum-maps, gramps-date,
// gramps-events) — KEINE zweite Kodierung erfunden (Vereinfachen vor Erfinden).
//
// ── Places (GEDCOM→GRAMPS-Besonderheit): GEDCOM hält Orte als Inline-STRING am Event
// (`event.place`), GRAMPS als Top-Level-`<placeobj>` per `<place hlink>`. Damit `event.place`
// den Roundtrip überlebt, werden aus den distinkten Orts-Strings `<placeobj>`-Records
// synthetisiert und die Events daran gebunden. Ein `db` mit ECHTEN placeObjects/hofObjects
// (GRAMPS-Herkunft) emittiert diese direkt; der String-Fallback greift nur für nicht
// objektivierte Orte.
//
// Reine Funktion, DOM-/Plattform-frei (INV-ARCH-1), build-frei testbar (INV-ARCH-2).

import type {
  Citation,
  Database,
  Event,
  Family,
  Media,
  Note,
  Person,
  Repository,
  Source,
} from '../model/types';
import type { HofObject, PlaceObject } from '../places/types';
import { isEventPresent } from '../model/event';
import type { XmlDocument, XmlNode } from './xml-tree';
import { remapIdsForFormat, type IdRemap } from './id-remap';
import { EVAL_TAGS, evalAxisValue, mediToGrampsMedium, nameTypeToGramps, quayToConfidence, tagToGrampsType } from './enum-maps';
import { isEvidenceEvalEmpty } from '../research/eval';
import { descriptionIsAddress } from './gramps-events';
import { gedcomToGramps } from './gramps-date';

const PROLOG =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<!DOCTYPE database PUBLIC "-//Gramps//DTD Gramps XML 1.7.2//EN"\n' +
  '"http://gramps-project.org/xml/1.7.2/grampsxml.dtd">';

// Fester, wall-clock-freier Header (INV-ARCH-1): der Header wird von der Modell-Äquivalenz
// (RT-4) nicht verglichen und von parseXMLText nicht gelesen — ein deterministischer
// Platzhalter genügt und hält die Writer-Idempotenz (xml1===xml2) stabil.
const CREATED_DATE = '2026-01-01';

function el(tag: string, attrs: [string, string][] = [], children: XmlNode[] = [], text = ''): XmlNode {
  return { tag, attrs, children, text };
}
function textEl(tag: string, value: string): XmlNode {
  return { tag, attrs: [], children: [], text: value };
}

/** Standard-Attribut-Gerüst eines GRAMPS-Records: handle, change, id (native Reihenfolge). */
function recordAttrs(handle: string, id: string): [string, string][] {
  return [['handle', handle], ['change', '0'], ['id', id]];
}

// ── Referenz-Auflösung über die Remap-Abbildung ────────────────────────────────────────────
// Ein Modell-Verweis (quell-native id bzw. Objekt-Identität) → Datei-Handle der Ziel-id.

interface Refs {
  remap: IdRemap;
  personHandle: (id: string | null) => string;
  familyHandle: (id: string | null) => string;
  sourceHandle: (id: string) => string;
  repoHandle: (id: string) => string;
  noteHandle: (id: string) => string;
  mediaHandle: (id: string) => string;
  eventHandle: (e: Event) => string;
  citationHandle: (c: Citation) => string;
}

function makeRefs(remap: IdRemap): Refs {
  const viaMap = (map: Map<string, string>, id: string | null): string => {
    if (!id) return '';
    const targetId = map.get(id);
    return targetId ? (remap.handle.get(targetId) ?? '') : '';
  };
  const viaObj = <K>(map: Map<K, string>, key: K): string => {
    const targetId = map.get(key);
    return targetId ? (remap.handle.get(targetId) ?? '') : '';
  };
  return {
    remap,
    personHandle: (id) => viaMap(remap.person, id),
    familyHandle: (id) => viaMap(remap.family, id),
    sourceHandle: (id) => viaMap(remap.source, id),
    repoHandle: (id) => viaMap(remap.repo, id),
    noteHandle: (id) => viaMap(remap.note, id),
    mediaHandle: (id) => viaMap(remap.media, id),
    eventHandle: (e) => viaObj(remap.event, e),
    citationHandle: (c) => viaObj(remap.citation, c),
  };
}

// ── Owned-Events / -Zitate (dieselbe Reihenfolge wie remapIdsForFormat) ─────────────────────

function personEvents(p: Person): Event[] {
  return [p.birth, p.chr, p.death, p.buri, ...p.events].filter(isEventPresent);
}
function familyEvents(f: Family): Event[] {
  return [f.marriage, f.engagement, ...f.events].filter(isEventPresent);
}

// ── Places: distinkte Orts-Strings → synthetische placeobjs (+ echte place/hof-Records) ──────
// GEDCOM-Orte sind Inline-Strings; damit `event.place` round-trippt, bekommt jeder distinkte
// String ein eigenes `<placeobj>` (ptitle=String) und die Events binden per `<place hlink>`.

interface Places {
  records: XmlNode[];
  /** `<place hlink>` eines Events (echtes placeobj/hof zuerst, sonst String-Fallback), oder ''. */
  placeHandleFor: (e: Event) => string;
}

function padId(n: number): string {
  return 'P' + String(n).padStart(4, '0');
}

function buildPlaces(db: Database, remap: IdRemap): Places {
  const records: XmlNode[] = [];
  const resolvePlaceId = (id: string | null): string => {
    if (!id) return '';
    const t = remap.place.get(id);
    return t ? (remap.handle.get(t) ?? '') : '';
  };

  // Echte Verwaltungs-Orte.
  for (const [id, po] of db.placeObjects) {
    const targetId = remap.place.get(id)!;
    records.push(placeobjNode(targetId, remap.handle.get(targetId)!, po, resolvePlaceId));
  }
  // Echte Building-Höfe.
  for (const hof of db.hofObjects.values()) {
    const targetId = remap.hof.get(hof.id)!;
    records.push(buildingHofNode(targetId, remap.handle.get(targetId)!, hof, resolvePlaceId));
  }

  // String-Fallback: distinkte event.place-Strings, die auf kein echtes placeobj/hof binden.
  let counter = db.placeObjects.size + db.hofObjects.size;
  const stringHandle = new Map<string, string>();
  const ensureStringPlace = (place: string): string => {
    const key = place;
    const existing = stringHandle.get(key);
    if (existing) return existing;
    const id = padId(++counter);
    const handle = '_stb' + id;
    stringHandle.set(key, handle);
    records.push(el('placeobj', recordAttrs(handle, id), [textEl('ptitle', place), el('pname', [['value', place]])]));
    return handle;
  };

  const placeHandleFor = (e: Event): string => {
    if (e.hofId) {
      const t = remap.hof.get(e.hofId);
      if (t) return remap.handle.get(t) ?? '';
    }
    if (e.placeId) {
      const t = remap.place.get(e.placeId);
      if (t) return remap.handle.get(t) ?? '';
    }
    const s = (e.place ?? '').trim();
    if (s !== '') return ensureStringPlace(e.place ?? '');
    return '';
  };

  // Deterministisch: die String-Places in Event-Reihenfolge (Personen→Familien) vorab anlegen,
  // damit ihre ids/Handles stabil sind, unabhängig davon, wann sie beim Emit erstmals gebraucht
  // werden. Danach ist `placeHandleFor` ein reiner Lookup (idempotent).
  for (const p of db.individuals.values()) for (const e of personEvents(p)) placeHandleFor(e);
  for (const f of db.families.values()) for (const e of familyEvents(f)) placeHandleFor(e);

  return { records, placeHandleFor };
}

function placeobjNode(
  id: string,
  handle: string,
  po: PlaceObject,
  resolvePlaceId: (id: string | null) => string,
): XmlNode {
  const attrs: [string, string][] = [['handle', handle], ['change', '0'], ['id', id]];
  if (po.type) attrs.push(['type', po.type]);
  const children: XmlNode[] = [];
  if (po.title) children.push(textEl('ptitle', po.title));
  for (const pn of po.pnames) children.push(el('pname', [['value', pn.value]]));
  if (po.pnames.length === 0 && po.title) children.push(el('pname', [['value', po.title]]));
  if (po.lat != null && po.long != null) {
    children.push(el('coord', [['lat', coordWire(po.lat, 'lat')], ['long', coordWire(po.long, 'long')]]));
  }
  for (const ref of po.enclosedBy) {
    const h = resolvePlaceId(ref.placeId);
    if (h) children.push(el('placeref', [['hlink', h]]));
  }
  return el('placeobj', attrs, children);
}

function buildingHofNode(
  id: string,
  handle: string,
  hof: HofObject,
  resolvePlaceId: (id: string | null) => string,
): XmlNode {
  const addr = hof.addrs[0]?.value ?? '';
  const children: XmlNode[] = [];
  if (addr) {
    children.push(textEl('ptitle', addr));
    children.push(el('pname', [['value', addr]]));
  }
  if (hof.lat != null && hof.long != null) {
    children.push(el('coord', [['lat', coordWire(hof.lat, 'lat')], ['long', coordWire(hof.long, 'long')]]));
  }
  const village = resolvePlaceId(hof.villageId || null);
  if (village) children.push(el('placeref', [['hlink', village]]));
  return el('placeobj', [['handle', handle], ['change', '0'], ['id', id], ['type', 'Building']], children);
}

function coordWire(n: number, kind: 'lat' | 'long'): string {
  const pos = kind === 'lat' ? 'N' : 'E';
  const neg = kind === 'lat' ? 'S' : 'W';
  return (n < 0 ? neg : pos) + Math.abs(n);
}

// ── Datum ───────────────────────────────────────────────────────────────────────────────────

function dateChild(date: string | null, datePhrase: string): XmlNode | null {
  const d = gedcomToGramps(date, datePhrase);
  return d ? el(d.tag, d.attrs) : null;
}

// ── Geteilte Records: Events + Zitate ─────────────────────────────────────────────────────

function eventRecord(id: string, e: Event, refs: Refs, places: Places): XmlNode {
  const handle = refs.remap.handle.get(id)!;
  const children: XmlNode[] = [];
  children.push(textEl('type', tagToGrampsType(e.type, e.eventType)));
  const d = dateChild(e.date, e.datePhrase);
  if (d) children.push(d);
  const placeHandle = places.placeHandleFor(e);
  if (placeHandle) children.push(el('place', [['hlink', placeHandle]]));
  const desc = descriptionIsAddress(e.type) ? e.addr : e.value;
  if (desc) children.push(textEl('description', desc));
  for (const c of e.citations) {
    const h = refs.citationHandle(c);
    if (h) children.push(el('citationref', [['hlink', h]]));
  }
  for (const m of e.media) {
    const h = refs.mediaHandle(m.mediaId);
    if (h) children.push(el('objref', [['hlink', h]]));
  }
  return el('event', recordAttrs(handle, id), children);
}

function citationRecord(id: string, c: Citation, refs: Refs): XmlNode {
  const handle = refs.remap.handle.get(id)!;
  const children: XmlNode[] = [];
  if (c.page) children.push(textEl('page', c.page));
  // GRAMPS kennt kein Ohne-Bewertung: <confidence> ist Pflicht, null wird zu 0.
  children.push(textEl('confidence', quayToConfidence(c.quay ?? 0)));
  for (const m of c.media) {
    const h = refs.mediaHandle(m.mediaId);
    if (h) children.push(el('objref', [['hlink', h]]));
  }
  // Evidenz-Bewertung (BL-83) als `<srcattribute>` — DTD-Position: nach objref, vor sourceref.
  if (!isEvidenceEvalEmpty(c.eval)) {
    for (const tag of EVAL_TAGS) {
      const v = evalAxisValue(c.eval!, tag);
      if (v) children.push(el('srcattribute', [['type', tag], ['value', v]]));
    }
  }
  const src = refs.sourceHandle(c.sourceId);
  if (src) children.push(el('sourceref', [['hlink', src]]));
  return el('citation', recordAttrs(handle, id), children);
}

// ── Records mit eigenem Store ──────────────────────────────────────────────────────────────

function personRecord(id: string, p: Person, refs: Refs): XmlNode {
  const handle = refs.remap.handle.get(id)!;
  const children: XmlNode[] = [];
  children.push(textEl('gender', p.sex));

  const nameChildren: XmlNode[] = [];
  if (p.given) nameChildren.push(textEl('first', p.given));
  if (p.surname) nameChildren.push(textEl('surname', p.surname));
  if (p.suffix) nameChildren.push(textEl('suffix', p.suffix));
  if (p.prefix) nameChildren.push(textEl('title', p.prefix));
  if (p.nick) nameChildren.push(textEl('nick', p.nick));
  for (const c of p.nameCitations) {
    const h = refs.citationHandle(c);
    if (h) nameChildren.push(el('citationref', [['hlink', h]]));
  }
  children.push(el('name', [['type', nameTypeToGramps(p.nameType) || 'Birth Name']], nameChildren));
  // Weitere Namensformen (BL-292): GRAMPS fuehrt sie als zusaetzliche `<name alt="1">`.
  // Ohne sie erreichten die aus GEDCOM gelesenen `extraNames` das GRAMPS-Format nie — und
  // `buildCitationMap` schriebe ihre Zitate als verwaiste `<citation>`-Records mit.
  for (const n of p.extraNames) {
    const k: XmlNode[] = [];
    if (n.given) k.push(textEl('first', n.given));
    if (n.surname) k.push(textEl('surname', n.surname));
    if (n.suffix) k.push(textEl('suffix', n.suffix));
    if (n.prefix) k.push(textEl('title', n.prefix));
    for (const c of n.citations) {
      const h = refs.citationHandle(c);
      if (h) k.push(el('citationref', [['hlink', h]]));
    }
    children.push(el('name', [['alt', '1'], ['type', nameTypeToGramps(n.type)]], k));
  }

  for (const e of personEvents(p)) {
    const h = refs.eventHandle(e);
    if (h) children.push(el('eventref', [['hlink', h], ['role', 'Primary']]));
  }
  for (const m of p.media) {
    const h = refs.mediaHandle(m.mediaId);
    if (h) children.push(el('objref', [['hlink', h]]));
  }
  for (const c of p.topLevelCitations) {
    const h = refs.citationHandle(c);
    if (h) children.push(el('citationref', [['hlink', h]]));
  }
  return el('person', recordAttrs(handle, id), children);
}

function familyRecord(id: string, f: Family, refs: Refs): XmlNode {
  const handle = refs.remap.handle.get(id)!;
  const children: XmlNode[] = [];
  const father = refs.personHandle(f.husband);
  if (father) children.push(el('father', [['hlink', father]]));
  const mother = refs.personHandle(f.wife);
  if (mother) children.push(el('mother', [['hlink', mother]]));
  for (const e of familyEvents(f)) {
    const h = refs.eventHandle(e);
    if (h) children.push(el('eventref', [['hlink', h], ['role', 'Family']]));
  }
  for (const childId of f.children) {
    const h = refs.personHandle(childId);
    if (h) children.push(el('childref', [['hlink', h]]));
  }
  for (const c of f.citations) {
    const h = refs.citationHandle(c);
    if (h) children.push(el('citationref', [['hlink', h]]));
  }
  return el('family', recordAttrs(handle, id), children);
}

function sourceRecord(id: string, s: Source, refs: Refs): XmlNode {
  const handle = refs.remap.handle.get(id)!;
  const children: XmlNode[] = [];
  if (s.title) children.push(textEl('stitle', s.title));
  if (s.author) children.push(textEl('sauthor', s.author));
  if (s.publisher) children.push(textEl('spubinfo', s.publisher));
  if (s.abbr) children.push(textEl('sabbrev', s.abbr));
  for (const m of s.media) {
    const h = refs.mediaHandle(m.mediaId);
    if (h) children.push(el('objref', [['hlink', h]]));
  }
  // Externe Referenzen (BL-244, ADR-v9-180) — DTD-Position: nach objref, VOR reporef
  // (`source (…, noteref*, objref*, srcattribute*, reporef*, tagref*)`). `type="REFN"` ist
  // die Form, die GRAMPS selbst schreibt und liest; ohne sie ging der Wert beim Export
  // verloren, obwohl das Zielprogramm ihn erhält.
  for (const ref of s.externalRefs) {
    if (ref.value) children.push(el('srcattribute', [['type', 'REFN'], ['value', ref.value]]));
  }
  // Behörde (BL-217) und Erfassungsdatum (BL-243) — beide einwertig, also je ein
  // `<srcattribute>`. `dataEvents` reist hier BEWUSST NICHT mit: ein Eintrag trägt drei
  // Felder (Arten, Zeitraum, Ort), `<srcattribute>` nur ein `value` — eine zusammengesetzte
  // Zeichenkette wäre eine erfundene Kodierung in einem nutzersichtbaren Feld. Der Verlust
  // ist als Repräsentationsgrenze in [13 §1] benannt, nicht stillschweigend.
  if (s.agnc) children.push(el('srcattribute', [['type', 'AGNC'], ['value', s.agnc]]));
  if (s.createdDate) children.push(el('srcattribute', [['type', '_DATE'], ['value', s.createdDate]]));
  const repo = refs.repoHandle(typeof s.repo === 'string' ? s.repo : '');
  if (repo) {
    // Signatur (BL-245): native `<reporef>`-Attribute. `medium` wird auf GRAMPS'
    // Vokabular abgebildet (`manuscript` → `Manuscript`), sonst liest GRAMPS es als
    // Custom-Typ statt als das Medium, das gemeint war.
    const a: [string, string][] = [['hlink', repo]];
    if (s.callNumber) a.push(['callno', s.callNumber]);
    const medium = mediToGrampsMedium(s.callMedia);
    if (medium) a.push(['medium', medium]);
    children.push(el('reporef', a));
  }
  return el('source', recordAttrs(handle, id), children);
}

function repositoryRecord(id: string, r: Repository, refs: Refs): XmlNode {
  const handle = refs.remap.handle.get(id)!;
  const children: XmlNode[] = [];
  if (r.name) children.push(textEl('rname', r.name));
  if (r.type) children.push(textEl('type', r.type));
  if (r.www) children.push(el('url', [['href', r.www]]));
  return el('repository', recordAttrs(handle, id), children);
}

function noteRecord(id: string, n: Note, refs: Refs): XmlNode {
  const handle = refs.remap.handle.get(id)!;
  // GRAMPS-`<note>` verlangt ein `type`-Attribut (Built-in-Notiztyp). Das Modell führt nur
  // NOTE/SNOTE (GEDCOM-Recordart) — die GRAMPS-Notiztypisierung ist nicht modelliert; ein
  // valider Built-in ("General") hält den Import sauber, den Roundtrip beeinflusst er nicht
  // (parseXMLText liest das Attribut nicht).
  return el('note', [['handle', handle], ['change', '0'], ['id', id], ['type', 'General']], [textEl('text', n.text)]);
}

function objectRecord(id: string, m: Media, _refs: Refs): XmlNode {
  const fileAttrs: [string, string][] = [['src', m.file]];
  if (m.form) fileAttrs.push(['mime', m.form]);
  if (m.title) fileAttrs.push(['description', m.title]);
  const handle = _refs.remap.handle.get(id)!;
  return el('object', recordAttrs(handle, id), [el('file', fileAttrs)]);
}

// ── Orchestrierung ─────────────────────────────────────────────────────────────────────────

function section(tag: string, children: XmlNode[]): XmlNode | null {
  return children.length ? el(tag, [], children) : null;
}

/**
 * Baut aus `db` einen KOMPLETTEN GRAMPS-XML-Baum von Grund auf (BL-158). Reine Funktion —
 * `db` wird nicht mutiert. Der zurückgegebene `XmlDocument` serialisiert über `serializeXml`
 * zu gültigem GRAMPS-XML und re-parst über `parseXMLText` zu einem modell-äquivalenten `db'`
 * (RT-4, im dokumentierten Rahmen — s. cross-gedcom-to-gramps.test.ts).
 */
export function buildGrampsTreeFromModel(db: Database): XmlDocument {
  const remap = remapIdsForFormat(db, 'gramps');
  const refs = makeRefs(remap);
  const places = buildPlaces(db, remap);

  // Geteilte Records aus den Remap-Maps (Einfüge-Reihenfolge = deterministisch).
  const eventRecords: XmlNode[] = [];
  for (const [e, id] of remap.event) eventRecords.push(eventRecord(id, e, refs, places));
  const citationRecords: XmlNode[] = [];
  for (const [c, id] of remap.citation) citationRecords.push(citationRecord(id, c, refs));

  const peopleRecords: XmlNode[] = [];
  for (const [modelId, p] of db.individuals) peopleRecords.push(personRecord(remap.person.get(modelId)!, p, refs));
  const familyRecords: XmlNode[] = [];
  for (const [modelId, f] of db.families) familyRecords.push(familyRecord(remap.family.get(modelId)!, f, refs));
  const sourceRecords: XmlNode[] = [];
  for (const [modelId, s] of db.sources) sourceRecords.push(sourceRecord(remap.source.get(modelId)!, s, refs));
  const repoRecords: XmlNode[] = [];
  for (const [modelId, r] of db.repositories) repoRecords.push(repositoryRecord(remap.repo.get(modelId)!, r, refs));
  const noteRecords: XmlNode[] = [];
  for (const [modelId, n] of db.notes) noteRecords.push(noteRecord(remap.note.get(modelId)!, n, refs));
  const objectRecords: XmlNode[] = [];
  for (const [modelId, m] of db.media) objectRecords.push(objectRecord(remap.media.get(modelId)!, m, refs));

  const header = el('header', [], [
    el('created', [['date', CREATED_DATE], ['version', 'Stammbaum']]),
    el('researcher', [], []),
  ]);

  // GRAMPS-DTD-Sektionsreihenfolge (aus `Unsere Familie.gramps` verifiziert):
  // header, events, people, families, citations, sources, places, objects, repositories, notes.
  const sections: XmlNode[] = [header];
  for (const s of [
    section('events', eventRecords),
    section('people', peopleRecords),
    section('families', familyRecords),
    section('citations', citationRecords),
    section('sources', sourceRecords),
    section('places', places.records),
    section('objects', objectRecords),
    section('repositories', repoRecords),
    section('notes', noteRecords),
  ]) {
    if (s) sections.push(s);
  }

  const root = el('database', [['xmlns', 'http://gramps-project.org/xml/1.7.2/']], sections);
  return { prolog: PROLOG, root };
}
