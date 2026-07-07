// core/interop/gedcom-parse.ts — Projektion des GEDCOM-Zeilenbaums ins Domänenmodell
// (Spec 13 §3). Der Baum (gedcom-tree.ts) ist die Quelle der Roundtrip-Treue; diese
// Projektion macht die Records fürs Editieren zugänglich. Roundtrip-Fidelity hängt an
// den erhaltenen Roh-Teilbäumen, NICHT an vollständiger Modellierung jedes Tags.
//
// Reine Funktion (parse(text) → model), DOM-/Plattform-frei (INV-ARCH-1, TST-3).

import {
  makeDatabase,
  makePerson,
  makeFamily,
  makeSource,
  makeRepository,
  makeNote,
  makeEvent,
  makeCitation,
} from '../model/factory';
import { normalizeSex } from '../model/sex';
import type {
  Person,
  Family,
  Source,
  Repository,
  Note,
  Event,
  Citation,
  MediaRef,
  Quay,
} from '../model/types';
import { parseTree, child, children, childValue, unescapeAt } from './gedcom-tree';
import type { GedNode } from './gedcom-tree';
import type { ParsedGedcom } from './types';

// Sonder-Ereignisse mit festem Modell-Slot (Spec 10 §5.1).
const SPECIAL_EVENT_TAGS = new Set(['BIRT', 'CHR', 'DEAT', 'BURI']);

/** Sammelt reinen Text aus value + CONC/CONT-Kindern (GEDCOM-Textmodell §5). */
function collectText(node: GedNode): string {
  let out = node.value;
  for (const c of node.children) {
    if (c.tag === 'CONC') out += c.value;
    else if (c.tag === 'CONT') out += '\n' + c.value;
  }
  return out;
}

/** Geo-Koordinate: `N52.21`→52.21, `S…`/`W…`→negativ (Spec 13 §3, GEDCOM.md §3). */
export function parseCoord(raw: string): number | null {
  if (!raw) return null;
  const m = /^([NSEW])?\s*(-?\d+(?:\.\d+)?)/.exec(raw.trim());
  if (!m) return null;
  let n = parseFloat(m[2]);
  if (m[1] === 'S' || m[1] === 'W') n = -Math.abs(n);
  return n;
}

/** MAP kann auf Level 2 ODER 3 hängen (Legacy-Toleranz, Spec 13 §3). */
function findMap(node: GedNode): GedNode | null {
  const direct = child(node, 'MAP');
  if (direct) return direct;
  const plac = child(node, 'PLAC');
  if (plac) {
    const m = child(plac, 'MAP');
    if (m) return m;
  }
  return null;
}

function parseCitation(sourNode: GedNode): Citation {
  const sid = unescapeAt(sourNode.value);
  const cit = makeCitation(sid);
  cit.page = childValue(sourNode, 'PAGE');
  const quayRaw = childValue(sourNode, 'QUAY');
  if (quayRaw !== '') {
    const q = parseInt(quayRaw, 10);
    if (q >= 0 && q <= 3) cit.quay = q as Quay;
  }
  const noteNode = child(sourNode, 'NOTE');
  if (noteNode) cit.note = collectText(noteNode);
  for (const obje of children(sourNode, 'OBJE')) {
    cit.media.push(parseMedia(obje));
  }
  if (cit.media.length) cit.deepLinkUrl = cit.media[0].file;
  return cit;
}

function parseMedia(objeNode: GedNode): MediaRef {
  return {
    file: childValue(objeNode, 'FILE'),
    title: childValue(objeNode, 'TITL'),
  };
}

/** Event-Projektion aus einem Ereignis-Knoten (BIRT/EVEN/OCCU/…). */
function parseEvent(node: GedNode): Event {
  const ev = makeEvent(node.tag);
  ev.seen = true;
  ev.value = node.value;

  const dateNode = child(node, 'DATE');
  ev.date = dateNode ? dateNode.value : null;
  const typeNode = child(node, 'TYPE');
  if (typeNode) ev.eventType = typeNode.value;

  const placNode = child(node, 'PLAC');
  ev.place = placNode ? placNode.value : null;

  const map = findMap(node);
  if (map) {
    ev.lati = parseCoord(childValue(map, 'LATI'));
    ev.long = parseCoord(childValue(map, 'LONG'));
  }

  const addrNode = child(node, 'ADDR');
  if (addrNode) ev.addr = collectText(addrNode);

  const noteNode = child(node, 'NOTE');
  if (noteNode) ev.note = collectText(noteNode);

  for (const s of children(node, 'SOUR')) ev.citations.push(parseCitation(s));
  for (const o of children(node, 'OBJE')) ev.media.push(parseMedia(o));

  return ev;
}

function parsePerson(rec: GedNode): Person {
  const id = rec.xref ?? '';
  const p = makePerson(id);

  for (const c of rec.children) {
    switch (c.tag) {
      case 'NAME': {
        if (!p.name) {
          p.name = c.value;
          p.given = childValue(c, 'GIVN');
          p.surname = childValue(c, 'SURN');
          p.prefix = childValue(c, 'NPFX');
          p.suffix = childValue(c, 'NSFX');
          if (!p.nick) p.nick = childValue(c, 'NICK');
          for (const s of children(c, 'SOUR')) p.nameCitations.push(parseCitation(s));
        }
        break;
      }
      case 'SEX':
        p.sex = normalizeSex(c.value);
        break;
      case 'TITL':
        p.title = c.value;
        break;
      case 'RELI':
        p.religion = c.value;
        break;
      case 'RESN':
        p.restriction = c.value;
        break;
      case 'EMAIL':
        p.email = c.value;
        break;
      case 'WWW':
        p.www = c.value;
        break;
      case '_UID':
        p.uid = c.value;
        break;
      case 'BIRT':
        p.birth = parseEvent(c);
        break;
      case 'CHR':
        p.chr = parseEvent(c);
        break;
      case 'DEAT':
        p.death = parseEvent(c);
        p.cause = childValue(c, 'CAUS');
        break;
      case 'BURI':
        p.buri = parseEvent(c);
        break;
      case 'FAMC': {
        const fam = unescapeAt(c.value);
        p.childOf.push({
          familyId: fam,
          pedigree: (childValue(c, 'PEDI') as Person['childOf'][number]['pedigree']) || '',
          fatherRel: childValue(c, '_FREL'),
          motherRel: childValue(c, '_MREL'),
          fatherRelSeen: child(c, '_FREL') != null,
          motherRelSeen: child(c, '_MREL') != null,
          citations: [],
        });
        break;
      }
      case 'FAMS':
        p.parentIn.push(unescapeAt(c.value));
        break;
      case 'ALIA':
        if (c.value.startsWith('@')) p.aliases.push(unescapeAt(c.value));
        else p.aliaNames.push(c.value);
        break;
      case 'ASSO':
        p.associations.push({
          personRef: c.value.startsWith('@') ? unescapeAt(c.value) : null,
          grampsHandle: null,
          role: childValue(c, 'RELA') || childValue(c, 'ROLE'),
          note: childValue(c, 'NOTE'),
          citations: children(c, 'SOUR').map(parseCitation),
        });
        break;
      case 'OBJE':
        p.media.push(parseMedia(c));
        break;
      case 'NOTE':
        if (c.value.startsWith('@')) p.noteRefs.push(unescapeAt(c.value));
        else p.noteText = p.noteText ? p.noteText + '\n' + collectText(c) : collectText(c);
        break;
      case 'SOUR':
        p.topLevelCitations.push(parseCitation(c));
        break;
      case 'CHAN':
        p.lastChanged = childValue(child(c, 'DATE') ?? c, 'TIME')
          ? childValue(c, 'DATE') + ' ' + childValue(child(c, 'DATE')!, 'TIME')
          : childValue(c, 'DATE');
        break;
      case 'REFN':
      case 'EXID':
        p.exids.push({ value: c.value, type: childValue(c, 'TYPE') });
        break;
      case 'CREA':
        p.createdDate = childValue(c, 'DATE');
        break;
      default:
        // Bekannte Ereignis-Tags → events[]; alles andere bleibt im Baum (Passthrough).
        if (isEventTag(c.tag)) p.events.push(parseEvent(c));
        break;
    }
  }
  return p;
}

const EVENT_TAGS = new Set([
  'OCCU', 'RESI', 'EDUC', 'EMIG', 'IMMI', 'NATU', 'EVEN', 'GRAD', 'ADOP',
  'MILI', 'FACT', 'CENS', 'PROP', 'BAPM', 'CONF', 'MARR', 'ENGA', 'DIV',
]);
function isEventTag(tag: string): boolean {
  return EVENT_TAGS.has(tag);
}

function parseFamily(rec: GedNode): Family {
  const id = rec.xref ?? '';
  const f = makeFamily(id);
  for (const c of rec.children) {
    switch (c.tag) {
      case 'HUSB':
        f.husband = unescapeAt(c.value);
        break;
      case 'WIFE':
        f.wife = unescapeAt(c.value);
        break;
      case 'CHIL':
        f.children.push(unescapeAt(c.value));
        break;
      case 'MARR':
        f.marriage = parseEvent(c);
        break;
      case 'ENGA':
        f.engagement = parseEvent(c);
        break;
      case 'NOTE':
        f.noteText = f.noteText ? f.noteText + '\n' + collectText(c) : collectText(c);
        break;
      case 'SOUR':
        f.citations.push(parseCitation(c));
        break;
      default:
        if (isEventTag(c.tag)) f.events.push(parseEvent(c));
        break;
    }
  }
  return f;
}

function parseSource(rec: GedNode): Source {
  const id = rec.xref ?? '';
  const s = makeSource(id);
  s.abbr = childValue(rec, 'ABBR');
  const titl = child(rec, 'TITL');
  if (titl) s.title = collectText(titl);
  s.author = childValue(rec, 'AUTH');
  s.date = childValue(rec, 'DATE');
  s.publisher = childValue(rec, 'PUBL');
  const text = child(rec, 'TEXT');
  if (text) s.text = collectText(text);
  const repo = child(rec, 'REPO');
  if (repo) {
    s.repo = repo.value.startsWith('@') ? unescapeAt(repo.value) : repo.value;
    s.callNumber = childValue(repo, 'CALN');
    const caln = child(repo, 'CALN');
    if (caln) s.callMedia = childValue(caln, 'MEDI');
  }
  for (const refn of [...children(rec, 'REFN'), ...children(rec, 'EXID')]) {
    s.externalRefs.push({ value: refn.value, type: childValue(refn, 'TYPE') });
  }
  for (const o of children(rec, 'OBJE')) s.media.push(parseMedia(o));
  return s;
}

function parseRepository(rec: GedNode): Repository {
  const id = rec.xref ?? '';
  const r = makeRepository(id);
  r.name = childValue(rec, 'NAME');
  const addr = child(rec, 'ADDR');
  if (addr) r.address = collectText(addr);
  r.phone = childValue(rec, 'PHON');
  r.www = childValue(rec, 'WWW');
  r.email = childValue(rec, 'EMAIL');
  r.type = childValue(rec, '_RTYPE');
  r.findingAid = childValue(rec, '_FAURL');
  return r;
}

function parseNote(rec: GedNode): Note {
  const id = rec.xref ?? '';
  const n = makeNote(id, { type: rec.tag === 'SNOTE' ? 'SNOTE' : 'NOTE' });
  n.text = collectText(rec);
  return n;
}

/**
 * Parst GEDCOM-Text → { db, roots }. Der db-Teil ist die editierbare Projektion,
 * roots der verbatim erhaltene Baum (Roundtrip-Backbone, INV-PT).
 */
export function parseGedcom(text: string): ParsedGedcom {
  const roots = parseTree(text);
  const db = makeDatabase();

  for (const rec of roots) {
    switch (rec.tag) {
      case 'HEAD': {
        const out: string[] = [];
        // Verbatim HEAD-Zeilen (ohne das führende `0 HEAD`) für den Roundtrip bewahren.
        for (const c of rec.children) headLinesOf(c, 1, out);
        db.header.raw = out;
        const gedc = child(rec, 'GEDC');
        const vers = gedc ? childValue(gedc, 'VERS') : '';
        if (vers.startsWith('7')) db.gedVersion = '7.0';
        else if (vers.startsWith('5.5')) db.gedVersion = '5.5.1';
        const plac = child(rec, 'PLAC');
        if (plac) db.placForm = childValue(plac, 'FORM');
        break;
      }
      case 'INDI': {
        const p = parsePerson(rec);
        db.individuals.set(p.id, p);
        break;
      }
      case 'FAM': {
        const f = parseFamily(rec);
        db.families.set(f.id, f);
        break;
      }
      case 'SOUR': {
        const s = parseSource(rec);
        db.sources.set(s.id, s);
        break;
      }
      case 'REPO': {
        const r = parseRepository(rec);
        db.repositories.set(r.id, r);
        break;
      }
      case 'NOTE':
      case 'SNOTE': {
        if (rec.xref) {
          const n = parseNote(rec);
          db.notes.set(n.id, n);
        }
        break;
      }
      // HEAD-loser Rest (SUBM etc.), TRLR: bleiben nur im roots-Baum (Passthrough).
      default:
        break;
    }
  }
  return { db, roots };
}

/** HEAD-Kindzeilen rekursiv als flache Strings (`1 SOUR ANCESTRIS`, …). */
function headLinesOf(node: GedNode, depth: number, out: string[]): void {
  let line = String(depth) + ' ' + node.tag;
  if (node.value !== '') line += ' ' + node.value;
  out.push(line);
  for (const c of node.children) headLinesOf(c, depth + 1, out);
}

export { SPECIAL_EVENT_TAGS };

// --- Öffentliche Per-Record-Projektion (für write-back.ts) ---------------------
// Der Write-Back-Pfad (Spec 13 §2.1) braucht dieselbe Projektion pro Record, um zu
// erkennen, ob sich ein Record gegenüber seinem Original-GedNode geändert hat. Genau
// dieselben Funktionen wie parseGedcom sie intern nutzt → garantierte Konsistenz.
export {
  parsePerson as parsePersonPublic,
  parseFamily as parseFamilyPublic,
  parseSource as parseSourcePublic,
  parseRepository as parseRepositoryPublic,
};
