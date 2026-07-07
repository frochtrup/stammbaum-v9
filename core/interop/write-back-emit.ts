// core/interop/write-back-emit.ts — Modell → GedNode-Synthese (kanonische Ausgabe).
//
// Erzeugt aus einer Modell-Entität einen frischen GedNode-Teilbaum in KANONISCHER
// Tag-Reihenfolge (GEDCOM.md §1). Zwei Verwendungen (Spec 13 §2.1):
//   - Fall 3 (neuer Record): der ganze Record wird hieraus synthetisiert.
//   - Fall 2 (geänderter Record): nur die ERKANNTEN Feldgruppen werden hieraus geholt und
//     ersetzen die alten erkannten Kind-Zeilen; Passthrough bleibt in write-back.ts erhalten.
//
// KRITISCH (roundtrip-stabil ab Neuanlage): Jeder hier erzeugte Knoten muss beim Re-Parse
// (gedcom-parse.ts) exakt wieder dasselbe Modell-Feld ergeben — Writer und Parser sind
// zueinander invers. Deshalb spiegelt die Feld-für-Feld-Erzeugung die Parser-Projektion.
//
// Reine Funktionen, DOM-/Plattform-frei (INV-ARCH-1).

import type {
  Citation,
  Event,
  Family,
  MediaRef,
  Person,
  Repository,
  Source,
} from '../model/types';
import type { GedNode } from './gedcom-tree';

/** Knoten-Konstruktor (level dient nur der Diagnose; writeNode leitet Tiefe aus dem Baum ab). */
export function N(tag: string, value: string, children: GedNode[] = [], xref: string | null = null): GedNode {
  return { level: 0, xref, tag, value, children };
}

// Pointer-IDs (`@F1@`, `@S2@`) werden VERBATIM geschrieben (single-@), nicht `@@`-escaped:
// der Parser speichert sie via unescapeAt bereits single-@, und der Baum-Writer gibt Werte
// verbatim aus — die `@@`-Verdopplung ist nur eine tolerierte Legacy-Lese-Konvention, keine
// Ausgabe-Konvention (siehe gedcom-tree.ts unescapeAt + Ancestris-Fixture `@F1@`).

// --- gemeinsame Bausteine ---------------------------------------------------------------

/** CONT/CONC-freier Textknoten: mehrzeiligen Text auf value + CONT-Kinder abbilden. */
function textNode(tag: string, text: string): GedNode {
  const parts = text.split('\n');
  const children: GedNode[] = [];
  for (let i = 1; i < parts.length; i++) children.push(N('CONT', parts[i]));
  return N(tag, parts[0], children);
}

/** Geo-Koordinate zurück ins `N52.21`/`S…`-Wire-Format (parseCoord ist die Umkehr). */
function coordValue(n: number, kind: 'LATI' | 'LONG'): string {
  const positive = kind === 'LATI' ? 'N' : 'E';
  const negative = kind === 'LATI' ? 'S' : 'W';
  return (n < 0 ? negative : positive) + Math.abs(n);
}

function mediaNode(m: MediaRef): GedNode {
  const kids: GedNode[] = [N('FILE', m.file)];
  if (m.title) kids.push(N('TITL', m.title));
  return N('OBJE', '', kids);
}

/** Zitat `1/2 SOUR @Sx@` + PAGE/QUAY/NOTE/OBJE (parseCitation ist die Umkehr). */
function citationNode(c: Citation): GedNode {
  const kids: GedNode[] = [];
  if (c.page) kids.push(N('PAGE', c.page));
  if (c.quay !== 0) kids.push(N('QUAY', String(c.quay)));
  if (c.note) kids.push(textNode('NOTE', c.note));
  for (const m of c.media) kids.push(mediaNode(m));
  return N('SOUR', c.sourceId, kids);
}

/** Ereignis-Knoten (BIRT/OCCU/…) — parseEvent ist die Umkehr; nur „seen" Ereignisse. */
function eventNode(ev: Event): GedNode {
  const kids: GedNode[] = [];
  if (ev.eventType) kids.push(N('TYPE', ev.eventType));
  if (ev.date !== null) kids.push(N('DATE', ev.date));
  if (ev.place !== null) {
    const placKids: GedNode[] = [];
    // MAP nur ausgeben, wenn Koordinaten vorhanden (parseEvent liest MAP unter PLAC oder Event).
    if (ev.lati !== null || ev.long !== null) {
      const mapKids: GedNode[] = [];
      if (ev.lati !== null) mapKids.push(N('LATI', coordValue(ev.lati, 'LATI')));
      if (ev.long !== null) mapKids.push(N('LONG', coordValue(ev.long, 'LONG')));
      placKids.push(N('MAP', '', mapKids));
    }
    kids.push(N('PLAC', ev.place, placKids));
  }
  if (ev.addr) kids.push(textNode('ADDR', ev.addr));
  if (ev.note) kids.push(textNode('NOTE', ev.note));
  for (const c of ev.citations) kids.push(citationNode(c));
  for (const m of ev.media) kids.push(mediaNode(m));
  return N(ev.type, ev.value, kids);
}

// --- Person (INDI) ----------------------------------------------------------------------

/** Synthetisiert einen INDI-Record in kanonischer Reihenfolge (GEDCOM.md §1 INDI). */
export function emitPerson(p: Person): GedNode {
  const kids: GedNode[] = [];

  if (p.name || p.given || p.surname || p.prefix || p.suffix || p.nick || p.nameCitations.length) {
    const nameKids: GedNode[] = [];
    if (p.given) nameKids.push(N('GIVN', p.given));
    if (p.surname) nameKids.push(N('SURN', p.surname));
    if (p.prefix) nameKids.push(N('NPFX', p.prefix));
    if (p.suffix) nameKids.push(N('NSFX', p.suffix));
    if (p.nick) nameKids.push(N('NICK', p.nick));
    for (const c of p.nameCitations) nameKids.push(citationNode(c));
    kids.push(N('NAME', p.name, nameKids));
  }
  if (p.sex && p.sex !== 'U') kids.push(N('SEX', p.sex));
  if (p.title) kids.push(N('TITL', p.title));
  if (p.religion) kids.push(N('RELI', p.religion));
  if (p.restriction) kids.push(N('RESN', p.restriction));
  if (p.email) kids.push(N('EMAIL', p.email));
  if (p.www) kids.push(N('WWW', p.www));
  if (p.uid) kids.push(N('_UID', p.uid));

  if (p.birth.seen) kids.push(eventNode(p.birth));
  if (p.chr.seen) kids.push(eventNode(p.chr));
  if (p.death.seen) {
    const dn = eventNode(p.death);
    if (p.cause) dn.children.push(N('CAUS', p.cause));
    kids.push(dn);
  }
  if (p.buri.seen) kids.push(eventNode(p.buri));
  for (const ev of p.events) kids.push(eventNode(ev));

  for (const link of p.childOf) {
    const fkids: GedNode[] = [];
    if (link.pedigree) fkids.push(N('PEDI', link.pedigree));
    if (link.fatherRelSeen) fkids.push(N('_FREL', link.fatherRel));
    if (link.motherRelSeen) fkids.push(N('_MREL', link.motherRel));
    kids.push(N('FAMC', link.familyId, fkids));
  }
  for (const fid of p.parentIn) kids.push(N('FAMS', fid));

  for (const a of p.aliases) kids.push(N('ALIA', a));
  for (const an of p.aliaNames) kids.push(N('ALIA', an));

  for (const assoc of p.associations) {
    const akids: GedNode[] = [];
    if (assoc.role) akids.push(N('RELA', assoc.role));
    if (assoc.note) akids.push(N('NOTE', assoc.note));
    for (const c of assoc.citations) akids.push(citationNode(c));
    kids.push(N('ASSO', assoc.personRef ? assoc.personRef : '', akids));
  }

  for (const m of p.media) kids.push(mediaNode(m));

  if (p.noteText) kids.push(textNode('NOTE', p.noteText));
  for (const nr of p.noteRefs) kids.push(N('NOTE', nr));

  for (const c of p.topLevelCitations) kids.push(citationNode(c));

  for (const ex of p.exids) {
    const ekids = ex.type ? [N('TYPE', ex.type)] : [];
    kids.push(N('REFN', ex.value, ekids));
  }
  if (p.createdDate) kids.push(N('CREA', '', [N('DATE', p.createdDate)]));
  if (p.lastChanged) kids.push(chanNode(p.lastChanged));

  return N('INDI', '', kids, p.id);
}

/** CHAN-Knoten aus dem `lastChanged`-String (parser: `DATE` + optional `TIME`). */
function chanNode(lastChanged: string): GedNode {
  // parsePerson: lastChanged = DATE (+ ' ' + TIME wenn TIME vorhanden). Umkehr:
  const parts = lastChanged.split(' ');
  // Heuristik: ein trailing HH:MM(:SS)-Token ist die TIME.
  const last = parts[parts.length - 1];
  if (parts.length > 1 && /^\d{1,2}:\d{2}(:\d{2})?$/.test(last)) {
    const date = parts.slice(0, -1).join(' ');
    return N('CHAN', '', [N('DATE', date, [N('TIME', last)])]);
  }
  return N('CHAN', '', [N('DATE', lastChanged)]);
}

// --- Family (FAM) -----------------------------------------------------------------------

export function emitFamily(f: Family): GedNode {
  const kids: GedNode[] = [];
  if (f.husband) kids.push(N('HUSB', f.husband));
  if (f.wife) kids.push(N('WIFE', f.wife));
  for (const cid of f.children) kids.push(N('CHIL', cid));
  if (f.marriage.seen) kids.push(eventNode(f.marriage));
  if (f.engagement.seen) kids.push(eventNode(f.engagement));
  for (const ev of f.events) kids.push(eventNode(ev));
  if (f.noteText) kids.push(textNode('NOTE', f.noteText));
  for (const c of f.citations) kids.push(citationNode(c));
  if (f.lastChanged) kids.push(chanNode(f.lastChanged));
  return N('FAM', '', kids, f.id);
}

// --- Source (SOUR) ----------------------------------------------------------------------

export function emitSource(s: Source): GedNode {
  const kids: GedNode[] = [];
  if (s.abbr) kids.push(N('ABBR', s.abbr));
  if (s.title) kids.push(textNode('TITL', s.title));
  if (s.author) kids.push(N('AUTH', s.author));
  if (s.date) kids.push(N('DATE', s.date));
  if (s.publisher) kids.push(N('PUBL', s.publisher));
  if (s.text) kids.push(textNode('TEXT', s.text));
  if (s.repo) {
    const rkids: GedNode[] = [];
    if (s.callNumber) {
      const ckids = s.callMedia ? [N('MEDI', s.callMedia)] : [];
      rkids.push(N('CALN', s.callNumber, ckids));
    }
    const repoVal = typeof s.repo === 'string' && s.repo.startsWith('@') ? s.repo : s.repo;
    kids.push(N('REPO', repoVal, rkids));
  }
  for (const ex of s.externalRefs) {
    const ekids = ex.type ? [N('TYPE', ex.type)] : [];
    kids.push(N('REFN', ex.value, ekids));
  }
  for (const m of s.media) kids.push(mediaNode(m));
  return N('SOUR', '', kids, s.id);
}

// --- Repository (REPO) ------------------------------------------------------------------

export function emitRepository(r: Repository): GedNode {
  const kids: GedNode[] = [];
  if (r.name) kids.push(N('NAME', r.name));
  if (r.address) kids.push(textNode('ADDR', r.address));
  if (r.phone) kids.push(N('PHON', r.phone));
  if (r.www) kids.push(N('WWW', r.www));
  if (r.email) kids.push(N('EMAIL', r.email));
  if (r.type) kids.push(N('_RTYPE', r.type));
  if (r.findingAid) kids.push(N('_FAURL', r.findingAid));
  return N('REPO', '', kids, r.id);
}
