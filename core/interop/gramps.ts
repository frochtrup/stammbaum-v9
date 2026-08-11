// core/interop/gramps.ts — GRAMPS-XML Parser/Writer + Test-Seam (Spec 13 §6).
//
// Test-Seam (INV-ARCH-1, Spec 32 §5): parseXMLText(xml) / buildXMLText(db) sind
// SYNCHRON und arbeiten auf reinem XML-Text — ohne gzip/Blob/DecompressionStream.
// Die Plattform-Schicht (services/) legt später die gzip-Hülle darum; der Kern bleibt
// headless testbar. Roundtrip-Ziel: xml1===xml2 (Writer-Idempotenz, Spec 13 §6).
//
// Fidelity-Strategie wie bei GEDCOM: der struktur-erhaltende XML-Baum (xml-tree.ts) ist
// der Passthrough-Backbone; die Modell-Projektion dient dem Editieren. Der Writer gibt
// primär den Baum wieder (verlustfrei), sodass ein nicht-mutierendes buildXMLText den
// geparsten Baum idempotent reproduziert.

import { makeDatabase, makePerson, makeFamily, makeSource, makeRepository, makeNote } from '../model/factory';
import { normalizeSex } from '../model/sex';
import type { Database, Person, Family, Source, Repository, Note } from '../model/types';
import { parseXml, serializeXml, attr, firstChild, childrenByTag } from './xml-tree';
import type { XmlDocument, XmlNode } from './xml-tree';
import { applyDatabaseToXml } from './gramps-write-back';
import { buildEnrichContext, enrichPerson, enrichFamily } from './gramps-enrich';
import type { EnrichContext } from './gramps-enrich';
import { collectGrampsMedia, grampsMediaRefs } from './gramps-media';
import { collectCitations } from './gramps-citations';
import { grampsMediumToMedi, childrefRelToPedi } from './enum-maps';
// BL-337: GRAMPS' `change`-Pflichtattribut (Epochensekunden) ist das Gegenstück zu
// GEDCOMs `CHAN` — beide landen im selben Modellfeld `lastChanged`.
import { epochToChangeStamp } from './change-stamp-wire';
import { projectPlaces } from './gramps-places';

/** Ergebnis von parseXMLText: Modell + verbatim erhaltener XML-Baum (Passthrough). */
export interface GrampsParsed {
  db: Database;
  doc: XmlDocument;
}

/** GRAMPS-Geschlecht → Modell-Sex. */
function grampsSex(g: string): 'M' | 'F' | 'U' {
  return normalizeSex(g === 'M' ? 'M' : g === 'F' ? 'F' : 'U');
}

// ── Projektion je Entität ───────────────────────────────────────────────────────────────
// Bewusst als eigene, exportierte Funktionen: das Write-Back (gramps-write-back.ts) muss
// einen Original-Knoten mit EXAKT derselben Vorschrift ins Modell projizieren, um „hat sich
// etwas geändert?" zu beantworten. Zwei Fassungen derselben Projektion würden auseinander-
// driften und den Vergleich still falsch machen — dasselbe Muster wie `parsePersonPublic`
// & Co. auf der GEDCOM-Seite (ADR-v9-14).

/** Der Modell-Schlüssel eines GRAMPS-Records: `id`, ersatzweise `handle`. */
export function grampsKey(node: XmlNode): string {
  return attr(node, 'id') || attr(node, 'handle');
}

/**
 * Handle ↔ Modell-id für den ganzen Baum (BL-136). GRAMPS verweist ausschließlich über
 * `handle` (`<father hlink="_x">`); die Records liegen im Modell aber unter ihrer
 * GEDCOM-konformen `id` (Handles sind Fidelity-Felder, KEINE Primär-IDs — ADR-v9-11).
 * Ohne diese Übersetzung liefen Store-Schlüssel (id) und Referenzen (handle) auseinander:
 * keine einzige Familien-/Quellen-Referenz wäre auflösbar. GRAMPS-Handles sind global
 * eindeutig, ein Index über alle Sektionen genügt.
 */
export interface GrampsRefIndex {
  handleToId: Map<string, string>;
  idToHandle: Map<string, string>;
  handles: Set<string>;
}

// Events/Citations sind mit aufgenommen, seit das Modell auch geteilte Records über ihre
// `id` referenziert (BL-142/144): das Write-Back braucht `id → handle`, um Owner-`<eventref>`/
// `<citationref>` zu schreiben. Handles sind global eindeutig, ein Index über alle Sektionen
// bleibt korrekt (die zusätzlichen Einträge stören keine Person-/Quellen-Auflösung).
// `places` ist seit BL-143 mit aufgenommen: `<placeref hlink>` (enclosedBy-Kette) und der
// Village-Verweis eines Building-Hofs referenzieren placeobjs per Handle; das Modell hält sie
// über ihre `id` (P0000). Ohne diesen Eintrag blieben placeobj-Referenzen als rohe Handles
// stehen (id↔handle für den placeobj-Write-Back gälte ebenfalls nicht).
// `objects` seit ADR-v9-125 mit aufgenommen: `<objref hlink>` referenziert Medien-Records per
// Handle; das Modell hält sie über ihre `id` (O0000). Ohne diesen Eintrag bliebe die mediaId
// ein roher Handle (und der object-Write-Back-`id↔handle` gälte ebenfalls nicht).
const REF_SECTIONS = ['people', 'families', 'sources', 'repositories', 'notes', 'events', 'citations', 'places', 'objects'];

export function buildRefIndex(root: XmlNode): GrampsRefIndex {
  const handleToId = new Map<string, string>();
  const idToHandle = new Map<string, string>();
  const handles = new Set<string>();
  for (const secName of REF_SECTIONS) {
    const sec = firstChild(root, secName);
    if (!sec) continue;
    for (const node of sec.children) {
      const h = attr(node, 'handle');
      if (!h) continue;
      handles.add(h);
      const id = grampsKey(node);
      handleToId.set(h, id);
      idToHandle.set(id, h);
    }
  }
  return { handleToId, idToHandle, handles };
}

/**
 * Datei-Handle → Modell-id beim Lesen. Ein unbekanntes Handle wird unverändert
 * durchgereicht — eine echte Fremd-/Dangling-Referenz bleibt erkennbar, statt erfunden
 * zu werden (Gegenstück zu `alsHandle` beim Schreiben).
 */
function resolveRef(hlink: string, index: GrampsRefIndex): string {
  if (hlink === '') return hlink;
  return index.handleToId.get(hlink) ?? hlink;
}

export function projectPerson(person: XmlNode): Person {
  const p = makePerson(grampsKey(person));
  p.lastChanged = epochToChangeStamp(attr(person, 'change'));
  const gender = firstChild(person, 'gender');
  p.sex = grampsSex(gender ? gender.text : 'U');
  const nameNode = firstChild(person, 'name');
  if (nameNode) {
    p.given = firstChild(nameNode, 'first')?.text ?? '';
    const surn = firstChild(nameNode, 'surname');
    p.surname = surn ? surn.text : '';
    p.prefix = firstChild(nameNode, 'title')?.text ?? '';
    p.nick = firstChild(nameNode, 'nick')?.text ?? '';
    p.name = `${p.given} /${p.surname}/`.trim();
  }
  return p;
}

export function projectFamily(family: XmlNode, index: GrampsRefIndex): Family {
  const f = makeFamily(grampsKey(family));
  f.lastChanged = epochToChangeStamp(attr(family, 'change'));
  const father = firstChild(family, 'father');
  const mother = firstChild(family, 'mother');
  f.husband = father ? resolveRef(attr(father, 'hlink'), index) : null;
  f.wife = mother ? resolveRef(attr(mother, 'hlink'), index) : null;
  f.children = childrenByTag(family, 'childref').map((c) => resolveRef(attr(c, 'hlink'), index));
  return f;
}

/**
 * Die INDI-Seite einer `<childref>`-Beziehung (BL-329): GRAMPS führt Kind-Verhältnis und
 * Kindschafts-Belege AM `<childref>` der Familie, das Modell führt beides INDI-seitig am
 * `ChildLink` ([10 §3] — „beim Lesen einer FAM-seitigen Beziehung wird sie in die INDI-Seite
 * gemergt"). Ohne diese Projektion blieb `Person.childOf` auf dem GRAMPS-Weg LEER (gemessen
 * an `Unsere Familie.gramps`: 2013 `<childref>`, 0 `childOf`) — die Herkunftsfamilie war im
 * Personen-Steckbrief unsichtbar und ein Kindschafts-Edit hatte nichts, woran er hängt.
 *
 * `frel`/`mrel` sind die GRAMPS-Form von `_FREL`/`_MREL`; sind beide gleich, ist das die
 * Aussage, die GEDCOM als `PEDI` schreibt (Umkehrung von `pediToChildrefRel`). Sind sie
 * verschieden, bleibt `pedigree` leer und die beiden Rohwerte tragen die Aussage — dieselbe
 * Regel wie auf der GEDCOM-Seite ([10 §2]).
 */
export function projectChildLink(childref: XmlNode, familyId: string, ctx: EnrichContext): Person['childOf'][number] {
  const frel = attr(childref, 'frel');
  const mrel = attr(childref, 'mrel');
  return {
    familyId,
    pedigree: frel === mrel ? childrefRelToPedi(frel) : '',
    fatherRel: frel,
    motherRel: mrel,
    fatherRelSeen: frel !== '',
    motherRelSeen: mrel !== '',
    citations: collectCitations(childref, ctx.citationOf, ctx.resolveSourceId, ctx.handleToId),
  };
}

export function projectSource(source: XmlNode, index: GrampsRefIndex): Source {
  const s = makeSource(grampsKey(source));
  s.lastChanged = epochToChangeStamp(attr(source, 'change'));
  s.title = firstChild(source, 'stitle')?.text ?? '';
  s.author = firstChild(source, 'sauthor')?.text ?? '';
  s.abbr = firstChild(source, 'sabbrev')?.text ?? '';
  s.publisher = firstChild(source, 'spubinfo')?.text ?? '';
  const reporef = firstChild(source, 'reporef');
  if (reporef) {
    s.repo = resolveRef(attr(reporef, 'hlink'), index);
    // Signatur (BL-245, ADR-v9-180): `callno`/`medium` sind native `<reporef>`-Attribute
    // (grampsxml.dtd), nicht Kinder von `<source>`. Sie hier NICHT zu lesen hieß bisher:
    // ein GRAMPS-Bestand zeigt keine Signatur, und ein Nutzer-Edit daran wird beim
    // Speichern still verworfen, weil das Write-Back gegen ein leeres Feld vergleicht.
    s.callNumber = attr(reporef, 'callno');
    s.callMedia = grampsMediumToMedi(attr(reporef, 'medium'));
  }
  // Externe Referenzen (BL-244): GRAMPS legt GEDCOM-`REFN` als `<srcattribute type="REFN">`
  // ab (`libgedcom.py::__source_attr` setzt `type` auf den Tag-Namen) — im Realbestand
  // belegt. Ein `2 TYPE` unter dem REFN kennt GRAMPS nicht; es verwirft untergeordnete
  // Zeilen, deshalb kommt der Untertyp hier leer zurück (dokumentierte Grenze, 13 §1).
  // GRAMPS' `<source>` hat für diese Felder kein Element; sie reisen als `<srcattribute>`
  // (ADR-v9-180), Schlüssel = der GEDCOM-Tagname — die Konvention, die GRAMPS selbst nutzt.
  for (const a of childrenByTag(source, 'srcattribute')) {
    const typ = attr(a, 'type');
    if (typ === 'REFN') s.externalRefs.push({ value: attr(a, 'value'), type: '' });
    else if (typ === 'AGNC') s.agnc = attr(a, 'value');          // SOUR.DATA.AGNC (BL-217)
    else if (typ === '_DATE') s.createdDate = attr(a, 'value');  // Erfassung (BL-243)
  }
  s.media = grampsMediaRefs(source, index.handleToId);
  return s;
}

export function projectRepository(repo: XmlNode): Repository {
  const r = makeRepository(grampsKey(repo));
  r.lastChanged = epochToChangeStamp(attr(repo, 'change'));
  r.name = firstChild(repo, 'rname')?.text ?? '';
  r.type = firstChild(repo, 'type')?.text ?? '';
  const url = firstChild(repo, 'url');
  if (url) r.www = attr(url, 'href');
  return r;
}

export function projectNote(note: XmlNode): Note {
  const n = makeNote(grampsKey(note));
  n.text = firstChild(note, 'text')?.text ?? '';
  return n;
}

/**
 * Parst GRAMPS-XML-Text → { db, doc }. Der doc-Baum trägt die Roundtrip-Treue,
 * db ist die editierbare Projektion. Handle-basierte Referenzen bleiben im Baum;
 * das Modell hält die für die App relevanten Kern-Felder.
 */
export function parseXMLText(xml: string): GrampsParsed {
  const doc = parseXml(xml);
  const db = makeDatabase();
  const root = doc.root;
  // Handle→id-Index über den ganzen Baum, bevor irgendeine Referenz projiziert wird
  // (BL-136): Familien-/Quellen-Referenzen zeigen dann auf Store-Schlüssel, nicht Handles.
  const index = buildRefIndex(root);
  // BL-143: die native `<places>`-Sektion (Verwaltungshierarchie + Building-Höfe) VOR den
  // Events projizieren — die Events binden ihren `<place hlink>` dann direkt an die native
  // placeId/hofId (kein String-Seeding nötig; der Village-Seed überspringt aufgelöste Events).
  const projectedPlaces = projectPlaces(root, (h) => index.handleToId.get(h) ?? h);
  db.placeObjects = projectedPlaces.placeObjects;
  db.hofObjects = projectedPlaces.hofObjects;
  // Medien-Records (ADR-v9-125): <object> → db.media; <objref> je Owner → MediaCitation.
  db.media = collectGrampsMedia(root);
  // Auflösungs-Kontext für die Lese-Anreicherung (BL-140 Stufe 1d): Ereignisse/Zitate/Orte
  // liegen als Top-Level-Records vor und werden je Person/Familie per Handle nachgezogen.
  const enrich = buildEnrichContext(root, index, projectedPlaces.linkByHandle);

  const peopleSec = firstChild(root, 'people');
  if (peopleSec) {
    for (const person of childrenByTag(peopleSec, 'person')) {
      const p = projectPerson(person);
      enrichPerson(p, person, enrich);
      db.individuals.set(p.id, p);
    }
  }

  const familiesSec = firstChild(root, 'families');
  if (familiesSec) {
    for (const family of childrenByTag(familiesSec, 'family')) {
      const f = projectFamily(family, index);
      enrichFamily(f, family, enrich);
      db.families.set(f.id, f);
      // INDI-Seite der Kindschaft nachziehen (BL-329). Die Personen sind oben bereits
      // gelesen, der Link hängt also an einem vorhandenen Objekt; ein `<childref>` auf
      // eine unbekannte Person wird ÜBERSPRUNGEN (kein erfundener Datensatz — dieselbe
      // Regel wie bei hängenden Zitat-Handles).
      for (const cr of childrenByTag(family, 'childref')) {
        const kind = db.individuals.get(resolveRef(attr(cr, 'hlink'), index));
        if (kind) kind.childOf.push(projectChildLink(cr, f.id, enrich));
      }
    }
  }

  const sourcesSec = firstChild(root, 'sources');
  if (sourcesSec) {
    for (const source of childrenByTag(sourcesSec, 'source')) {
      const s = projectSource(source, index);
      db.sources.set(s.id, s);
    }
  }

  const reposSec = firstChild(root, 'repositories');
  if (reposSec) {
    for (const repo of childrenByTag(reposSec, 'repository')) {
      const r = projectRepository(repo);
      db.repositories.set(r.id, r);
    }
  }

  const notesSec = firstChild(root, 'notes');
  if (notesSec) {
    for (const note of childrenByTag(notesSec, 'note')) {
      const n = projectNote(note);
      db.notes.set(n.id, n);
    }
  }

  return { db, doc };
}

/**
 * Serialisiert das Dokument zu GRAMPS-XML-Text.
 *
 * Mit `GrampsParsed` (Modell + Baum) wird der editierte `db`-Stand ZUERST in den Baum
 * zurückprojiziert (`applyDatabaseToXml`, BL-80) — bis dahin fiel jede Änderung am Modell
 * still unter den Tisch, weil hier nur der geparste Baum wiedergegeben wurde. Für einen
 * nicht-mutierenden Roundtrip bleibt xml1===xml2 erhalten: unveränderte Records liefern
 * denselben Knoten zurück, das Write-Back ist dort nachweislich wirkungslos.
 *
 * Mit einem blanken `XmlDocument` (kein Modell dabei) wird verbatim geschrieben — der Weg
 * für Aufrufer, die bewusst nur den Baum halten.
 */
export function buildXMLText(input: GrampsParsed | XmlDocument): string {
  const doc = 'doc' in input ? applyDatabaseToXml(input.db, input.doc) : input;
  return serializeXml(doc);
}

export type { XmlDocument, XmlNode };
