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
import type { Database } from '../model/types';
import { parseXml, serializeXml, attr, firstChild, childrenByTag } from './xml-tree';
import type { XmlDocument, XmlNode } from './xml-tree';

/** Ergebnis von parseXMLText: Modell + verbatim erhaltener XML-Baum (Passthrough). */
export interface GrampsParsed {
  db: Database;
  doc: XmlDocument;
}

/** GRAMPS-Geschlecht → Modell-Sex. */
function grampsSex(g: string): 'M' | 'F' | 'U' {
  return normalizeSex(g === 'M' ? 'M' : g === 'F' ? 'F' : 'U');
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

  const peopleSec = firstChild(root, 'people');
  if (peopleSec) {
    for (const person of childrenByTag(peopleSec, 'person')) {
      const id = attr(person, 'id') || attr(person, 'handle');
      const p = makePerson(id);
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
      db.individuals.set(p.id, p);
    }
  }

  const familiesSec = firstChild(root, 'families');
  if (familiesSec) {
    for (const family of childrenByTag(familiesSec, 'family')) {
      const id = attr(family, 'id') || attr(family, 'handle');
      const f = makeFamily(id);
      const father = firstChild(family, 'father');
      const mother = firstChild(family, 'mother');
      f.husband = father ? attr(father, 'hlink') : null;
      f.wife = mother ? attr(mother, 'hlink') : null;
      f.children = childrenByTag(family, 'childref').map((c) => attr(c, 'hlink'));
      db.families.set(f.id, f);
    }
  }

  const sourcesSec = firstChild(root, 'sources');
  if (sourcesSec) {
    for (const source of childrenByTag(sourcesSec, 'source')) {
      const id = attr(source, 'id') || attr(source, 'handle');
      const s = makeSource(id);
      s.title = firstChild(source, 'stitle')?.text ?? '';
      s.author = firstChild(source, 'sauthor')?.text ?? '';
      s.abbr = firstChild(source, 'sabbrev')?.text ?? '';
      s.publisher = firstChild(source, 'spubinfo')?.text ?? '';
      const reporef = firstChild(source, 'reporef');
      if (reporef) s.repo = attr(reporef, 'hlink');
      db.sources.set(s.id, s);
    }
  }

  const reposSec = firstChild(root, 'repositories');
  if (reposSec) {
    for (const repo of childrenByTag(reposSec, 'repository')) {
      const id = attr(repo, 'id') || attr(repo, 'handle');
      const r = makeRepository(id);
      r.name = firstChild(repo, 'rname')?.text ?? '';
      r.type = firstChild(repo, 'type')?.text ?? '';
      const url = firstChild(repo, 'url');
      if (url) r.www = attr(url, 'href');
      db.repositories.set(r.id, r);
    }
  }

  const notesSec = firstChild(root, 'notes');
  if (notesSec) {
    for (const note of childrenByTag(notesSec, 'note')) {
      const id = attr(note, 'id') || attr(note, 'handle');
      const n = makeNote(id);
      n.text = firstChild(note, 'text')?.text ?? '';
      db.notes.set(n.id, n);
    }
  }

  return { db, doc };
}

/**
 * Serialisiert das Dokument zu GRAMPS-XML-Text. Für einen nicht-mutierenden Roundtrip
 * wird der erhaltene doc-Baum wiedergegeben → xml1===xml2 (Idempotenz).
 * Signatur akzeptiert das ganze GrampsParsed (der Baum ist die Wahrheitsquelle) ODER
 * einen bereits vorhandenen XmlDocument-Baum.
 */
export function buildXMLText(input: GrampsParsed | XmlDocument): string {
  const doc = 'doc' in input ? input.doc : input;
  return serializeXml(doc);
}

export type { XmlDocument, XmlNode };
