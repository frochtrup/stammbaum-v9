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

const REF_SECTIONS = ['people', 'families', 'sources', 'repositories', 'notes'];

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
  const father = firstChild(family, 'father');
  const mother = firstChild(family, 'mother');
  f.husband = father ? resolveRef(attr(father, 'hlink'), index) : null;
  f.wife = mother ? resolveRef(attr(mother, 'hlink'), index) : null;
  f.children = childrenByTag(family, 'childref').map((c) => resolveRef(attr(c, 'hlink'), index));
  return f;
}

export function projectSource(source: XmlNode, index: GrampsRefIndex): Source {
  const s = makeSource(grampsKey(source));
  s.title = firstChild(source, 'stitle')?.text ?? '';
  s.author = firstChild(source, 'sauthor')?.text ?? '';
  s.abbr = firstChild(source, 'sabbrev')?.text ?? '';
  s.publisher = firstChild(source, 'spubinfo')?.text ?? '';
  const reporef = firstChild(source, 'reporef');
  if (reporef) s.repo = resolveRef(attr(reporef, 'hlink'), index);
  return s;
}

export function projectRepository(repo: XmlNode): Repository {
  const r = makeRepository(grampsKey(repo));
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
  // Auflösungs-Kontext für die Lese-Anreicherung (BL-140 Stufe 1d): Ereignisse/Zitate/Orte
  // liegen als Top-Level-Records vor und werden je Person/Familie per Handle nachgezogen.
  const enrich = buildEnrichContext(root, index);

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
