// core/interop/gramps-write-back.ts — projiziert ein editiertes Domänenmodell (`db`) zurück
// in den GRAMPS-Passthrough-Baum, den serializeXml dann wie gewohnt schreibt (Spec 13 §6,
// BL-80). Das Gegenstück zu `write-back.ts` auf der GEDCOM-Seite — dieselben vier Regeln,
// KEIN zweites Konzept (ADR-v9-14):
//
//   1. Ein Record, dessen projizierte Felder UNVERÄNDERT sind, bleibt der IDENTISCHE
//      XmlNode. Nicht „gleich aussehend", sondern dasselbe Objekt — damit ist die
//      Roundtrip-Treue jedes nicht editierten Records strukturell garantiert, nicht durch
//      einen sorgfältigen Writer erkauft.
//   2. „Unverändert" wird per ERNEUTER PROJEKTION erkannt (`projectPerson` & Co. aus
//      gramps.ts, exakt dieselbe Vorschrift wie beim Parsen), nicht per Dirty-Flag: das
//      funktioniert auch, wenn ein Aufrufer `db` direkt mutiert.
//   3. Ein GEÄNDERTER Record behält alle nicht projizierten Kind-Elemente an Ort und
//      Stelle (INV-PT) — `<eventref>`, `<objref>`, `<citationref>`, `<attribute>`,
//      `<childof>`, `<style>`, alles Unbekannte. Nur die erkannten Elemente werden
//      aktualisiert, und zwar AN IHRER STELLE.
//   4. NEUE Records werden synthetisiert, GELÖSCHTE entfernt.
//
// ── Ein Unterschied zu GEDCOM, der Aufmerksamkeit braucht: die Reihenfolge ist Vorschrift.
// GEDCOM duldet jede Kind-Reihenfolge; GRAMPS-XML hat eine DTD, die sie festlegt. Die
// GEDCOM-Fassung setzt alle erkannten Felder gesammelt an die Position des ersten erkannten
// Kindes — hier wäre das ein DTD-Verstoß (ein `<childref>` zwischen `<father>` und
// `<eventref>` geschoben). Deshalb aktualisiert diese Fassung jedes Element EINZELN an
// seiner vorhandenen Position und fügt fehlende Elemente an der DTD-korrekten Stelle ein
// (`DTD_ORDER` unten). Die Ordnungstabellen stammen aus grampsxml.dtd 1.7.2.
//
// ── Handles, nicht IDs. GRAMPS verweist ausschließlich über `handle`; die menschenlesbare
// `id` (I0001) ist nur ein Etikett. Das Modell hält als Schlüssel die `id` (ersatzweise das
// Handle, s. `grampsKey`), in Familien-Referenzen aber die Handles aus der Datei. Wer eine
// Familienbindung im Modell ändert, hinterlässt dort daher je nach Weg eine id ODER ein
// Handle — `alsHandle()` löst beides auf. Dass Projektion und Referenzen zwei verschiedene
// Schlüsselarten benutzen, ist ein eigener Befund (BL-136), nicht hier zu heilen: dieses
// Modul sorgt nur dafür, dass das Write-Back keine toten Verweise erzeugt.
//
// Reine Funktionen, DOM-/Plattform-frei (INV-ARCH-1).

import type { Database, Family, Note, Person, Repository, Source } from '../model/types';
import type { XmlDocument, XmlNode } from './xml-tree';
import { attr, childrenByTag, firstChild } from './xml-tree';
import {
  grampsKey,
  projectFamily,
  projectNote,
  projectPerson,
  projectRepository,
  projectSource,
} from './gramps';

/** Kind-Reihenfolge laut grampsxml.dtd 1.7.2 — maßgeblich für das EINFÜGEN neuer Elemente. */
const DTD_ORDER: Record<string, string[]> = {
  person: [
    'gender', 'name', 'eventref', 'lds_ord', 'objref', 'address', 'attribute', 'url',
    'childof', 'parentin', 'personref', 'noteref', 'citationref', 'tagref',
  ],
  name: ['first', 'call', 'surname', 'suffix', 'title', 'nick', 'familynick', 'group', 'noteref', 'citationref'],
  family: ['rel', 'father', 'mother', 'eventref', 'lds_ord', 'objref', 'childref', 'attribute', 'noteref', 'citationref', 'tagref'],
  source: ['stitle', 'sauthor', 'spubinfo', 'sabbrev', 'noteref', 'objref', 'srcattribute', 'reporef', 'tagref'],
  repository: ['rname', 'type', 'address', 'url', 'noteref', 'tagref'],
  note: ['text', 'style', 'tagref'],
};

function knoten(tag: string, text = '', attrs: [string, string][] = [], children: XmlNode[] = []): XmlNode {
  return { tag, attrs, children, text };
}

/**
 * Position, an der `tag` in `children` einzufügen ist, damit die DTD-Reihenfolge hält:
 * hinter dem letzten Kind, das laut Ordnung davor gehört; sonst vor dem ersten, das
 * dahinter gehört; sonst ans Ende. Unbekannte Tags (kommen in der Ordnung nicht vor)
 * beeinflussen die Rechnung nicht — sie bleiben, wo sie sind.
 */
function einfuegePosition(children: XmlNode[], ordnung: string[], tag: string): number {
  const rang = ordnung.indexOf(tag);
  if (rang < 0) return children.length;
  let nach = 0;
  for (let i = 0; i < children.length; i++) {
    const r = ordnung.indexOf(children[i].tag);
    if (r < 0) continue;
    if (r < rang) nach = i + 1;
    else return Math.max(nach, i === 0 ? 0 : nach);
  }
  return nach || children.length;
}

/**
 * Setzt ein Text-Element auf `wert`: vorhandenes Element an seiner Stelle aktualisieren,
 * fehlendes an der DTD-Position einfügen, leeres entfernen. Vorhandene Attribute und
 * Kind-Elemente des Ziel-Elements bleiben erhalten (ein `<surname prefix="von">` verliert
 * sein Attribut nicht, nur weil der Text neu ist).
 */
function setzeText(children: XmlNode[], ordnung: string[], tag: string, wert: string): XmlNode[] {
  const idx = children.findIndex((c) => c.tag === tag);
  if (idx >= 0) {
    if (wert === '') return children.filter((_, i) => i !== idx);
    const alt = children[idx];
    if (alt.text === wert) return children;
    const neu = [...children];
    neu[idx] = { ...alt, text: wert };
    return neu;
  }
  if (wert === '') return children;
  const neu = [...children];
  neu.splice(einfuegePosition(children, ordnung, tag), 0, knoten(tag, wert));
  return neu;
}

/** Setzt ein Attribut eines (ggf. neu anzulegenden) leeren Elements, z. B. `<url href="…">`. */
function setzeAttribut(
  children: XmlNode[],
  ordnung: string[],
  tag: string,
  name: string,
  wert: string,
): XmlNode[] {
  const idx = children.findIndex((c) => c.tag === tag);
  if (idx >= 0) {
    if (wert === '') return children.filter((_, i) => i !== idx);
    const alt = children[idx];
    if (attr(alt, name) === wert) return children;
    const attrs = alt.attrs.some(([k]) => k === name)
      ? alt.attrs.map(([k, v]) => (k === name ? [k, wert] : [k, v]) as [string, string])
      : [...alt.attrs, [name, wert] as [string, string]];
    const neu = [...children];
    neu[idx] = { ...alt, attrs };
    return neu;
  }
  if (wert === '') return children;
  const neu = [...children];
  neu.splice(einfuegePosition(children, ordnung, tag), 0, knoten(tag, '', [[name, wert]]));
  return neu;
}

// ── Handles ─────────────────────────────────────────────────────────────────────────────

/** Deterministisches Handle für einen synthetisierten Record — stabil über Roundtrips. */
function neuesHandle(id: string): string {
  return `_stb${id.replace(/[^A-Za-z0-9]/g, '')}`;
}

interface HandleIndex {
  /** Modell-Schlüssel (id) → Handle, aus dem vorhandenen Baum. */
  byKey: Map<string, string>;
  /** Alle bekannten Handles — um „ist das schon ein Handle?" zu beantworten. */
  handles: Set<string>;
}

function indexPersonen(peopleSec: XmlNode | null): HandleIndex {
  const byKey = new Map<string, string>();
  const handles = new Set<string>();
  for (const person of peopleSec ? childrenByTag(peopleSec, 'person') : []) {
    const h = attr(person, 'handle');
    if (h) handles.add(h);
    byKey.set(grampsKey(person), h);
  }
  return { byKey, handles };
}

/**
 * Übersetzt einen Modell-Verweis in ein GRAMPS-Handle. Ein bereits gültiges Handle bleibt;
 * eine Modell-id wird über den Index aufgelöst. Bleibt beides erfolglos, wird der Wert
 * unverändert durchgereicht — erfinden wäre schlimmer als eine erkennbare Fremdreferenz.
 */
function alsHandle(ref: string, idx: HandleIndex): string {
  if (ref === '' || idx.handles.has(ref)) return ref;
  return idx.byKey.get(ref) ?? ref;
}

// ── Aktualisierung je Entität (nur die erkannten Elemente) ──────────────────────────────

function personKinder(orig: XmlNode, cur: Person): XmlNode[] {
  let children = setzeText(orig.children, DTD_ORDER.person, 'gender', cur.sex);

  const nameIdx = children.findIndex((c) => c.tag === 'name');
  const nameAlt = nameIdx >= 0 ? children[nameIdx] : knoten('name', '', [['type', 'Birth Name']]);
  let nk = nameAlt.children;
  nk = setzeText(nk, DTD_ORDER.name, 'first', cur.given);
  nk = setzeText(nk, DTD_ORDER.name, 'surname', cur.surname);
  nk = setzeText(nk, DTD_ORDER.name, 'title', cur.prefix);
  nk = setzeText(nk, DTD_ORDER.name, 'nick', cur.nick);
  const nameNeu = { ...nameAlt, children: nk };

  children = [...children];
  if (nameIdx >= 0) children[nameIdx] = nameNeu;
  else children.splice(einfuegePosition(children, DTD_ORDER.person, 'name'), 0, nameNeu);
  return children;
}

function familyKinder(orig: XmlNode, cur: Family, idx: HandleIndex): XmlNode[] {
  let children = setzeAttribut(orig.children, DTD_ORDER.family, 'father', 'hlink', alsHandle(cur.husband ?? '', idx));
  children = setzeAttribut(children, DTD_ORDER.family, 'mother', 'hlink', alsHandle(cur.wife ?? '', idx));

  // childref ist mehrwertig: der ganze Block wird an der Stelle des ersten vorhandenen
  // childref ersetzt (Reihenfolge der Kinder kommt aus dem Modell), vorhandene Attribute
  // je Kind (z. B. `mrel="Birth"`) bleiben erhalten, solange das Kind bleibt.
  const alteRefs = new Map(childrenByTag(orig, 'childref').map((c) => [attr(c, 'hlink'), c]));
  const neueRefs = cur.children.map((ref) => {
    const h = alsHandle(ref, idx);
    return alteRefs.get(h) ?? knoten('childref', '', [['hlink', h]]);
  });
  const ersteIdx = children.findIndex((c) => c.tag === 'childref');
  const ohne = children.filter((c) => c.tag !== 'childref');
  // Zielposition IM GEFILTERTEN Array: so viele Nicht-childref-Kinder, wie vor dem ersten
  // childref standen — der Block landet wieder genau dort, wo er war.
  const ziel = ersteIdx >= 0
    ? children.slice(0, ersteIdx).filter((c) => c.tag !== 'childref').length
    : einfuegePosition(ohne, DTD_ORDER.family, 'childref');
  const out = [...ohne];
  out.splice(ziel, 0, ...neueRefs);
  return out;
}

function sourceKinder(orig: XmlNode, cur: Source): XmlNode[] {
  let children = setzeText(orig.children, DTD_ORDER.source, 'stitle', cur.title);
  children = setzeText(children, DTD_ORDER.source, 'sauthor', cur.author);
  children = setzeText(children, DTD_ORDER.source, 'spubinfo', cur.publisher);
  children = setzeText(children, DTD_ORDER.source, 'sabbrev', cur.abbr);
  return setzeAttribut(children, DTD_ORDER.source, 'reporef', 'hlink', cur.repo ?? '');
}

function repoKinder(orig: XmlNode, cur: Repository): XmlNode[] {
  let children = setzeText(orig.children, DTD_ORDER.repository, 'rname', cur.name);
  children = setzeText(children, DTD_ORDER.repository, 'type', cur.type);
  return setzeAttribut(children, DTD_ORDER.repository, 'url', 'href', cur.www);
}

function noteKinder(orig: XmlNode, cur: Note): XmlNode[] {
  return setzeText(orig.children, DTD_ORDER.note, 'text', cur.text);
}

// ── Gleichheit: nur die projizierten Felder zählen ──────────────────────────────────────

const personGleich = (a: Person, b: Person): boolean =>
  a.sex === b.sex && a.given === b.given && a.surname === b.surname && a.prefix === b.prefix && a.nick === b.nick;

const familyGleich = (a: Family, b: Family, idx: HandleIndex): boolean =>
  (a.husband ?? '') === alsHandle(b.husband ?? '', idx) &&
  (a.wife ?? '') === alsHandle(b.wife ?? '', idx) &&
  a.children.length === b.children.length &&
  a.children.every((h, i) => h === alsHandle(b.children[i], idx));

const sourceGleich = (a: Source, b: Source): boolean =>
  a.title === b.title && a.author === b.author && a.abbr === b.abbr && a.publisher === b.publisher &&
  (a.repo ?? '') === (b.repo ?? '');

const repoGleich = (a: Repository, b: Repository): boolean =>
  a.name === b.name && a.type === b.type && a.www === b.www;

const noteGleich = (a: Note, b: Note): boolean => a.text === b.text;

// ── Synthese neuer Records ──────────────────────────────────────────────────────────────

function neuerRecord(tag: string, id: string, kinder: (orig: XmlNode) => XmlNode[]): XmlNode {
  const geruest = knoten(tag, '', [
    ['handle', neuesHandle(id)],
    ['change', '0'],
    ['id', id],
  ]);
  return { ...geruest, children: kinder(geruest) };
}

// ── Der Durchlauf ───────────────────────────────────────────────────────────────────────

interface Sektion<T> {
  section: string;
  item: string;
  map: Map<string, T>;
  /** Original-Knoten → Modell (dieselbe Vorschrift wie der Parser). */
  project: (n: XmlNode) => T;
  gleich: (projiziert: T, aktuell: T) => boolean;
  kinder: (orig: XmlNode, cur: T) => XmlNode[];
}

function verarbeiteSektion<T>(root: XmlNode, s: Sektion<T>): XmlNode | null {
  const sec = firstChild(root, s.section);
  const gesehen = new Set<string>();
  const kinder: XmlNode[] = [];

  for (const node of sec ? sec.children : []) {
    if (node.tag !== s.item) {
      kinder.push(node); // Fremdes in der Sektion: unangetastet
      continue;
    }
    const key = grampsKey(node);
    gesehen.add(key);
    const cur = s.map.get(key);
    if (!cur) continue; // gelöscht → weglassen
    if (s.gleich(s.project(node), cur)) {
      kinder.push(node); // IDENTISCHER Knoten — byte-treu
      continue;
    }
    kinder.push({ ...node, children: s.kinder(node, cur) });
  }

  for (const [key, cur] of s.map) {
    if (gesehen.has(key)) continue;
    kinder.push(neuerRecord(s.item, key, (geruest) => s.kinder(geruest, cur)));
  }

  if (!sec) return kinder.length ? knoten(s.section, '', [], kinder) : null;
  return { ...sec, children: kinder };
}

/**
 * Projiziert `db` in den GRAMPS-Baum. Unveränderte Records bleiben identisch; geänderte
 * behalten ihren Passthrough; neue kommen hinzu, gelöschte fallen weg. Reine Funktion —
 * der übergebene Baum wird nicht mutiert.
 */
export function applyDatabaseToXml(db: Database, doc: XmlDocument): XmlDocument {
  const root = doc.root;
  const idx = indexPersonen(firstChild(root, 'people'));

  const sektionen: XmlNode[] = [];
  const ersetzt = new Map<string, XmlNode | null>();
  ersetzt.set('people', verarbeiteSektion(root, {
    section: 'people', item: 'person', map: db.individuals,
    project: projectPerson, gleich: personGleich, kinder: personKinder,
  }));
  ersetzt.set('families', verarbeiteSektion(root, {
    section: 'families', item: 'family', map: db.families,
    project: projectFamily, gleich: (a, b) => familyGleich(a, b, idx),
    kinder: (orig, cur) => familyKinder(orig, cur, idx),
  }));
  ersetzt.set('sources', verarbeiteSektion(root, {
    section: 'sources', item: 'source', map: db.sources,
    project: projectSource, gleich: sourceGleich, kinder: sourceKinder,
  }));
  ersetzt.set('repositories', verarbeiteSektion(root, {
    section: 'repositories', item: 'repository', map: db.repositories,
    project: projectRepository, gleich: repoGleich, kinder: repoKinder,
  }));
  ersetzt.set('notes', verarbeiteSektion(root, {
    section: 'notes', item: 'note', map: db.notes,
    project: projectNote, gleich: noteGleich, kinder: noteKinder,
  }));

  for (const kind of root.children) {
    if (!ersetzt.has(kind.tag)) {
      sektionen.push(kind); // events, citations, places, objects, header … unangetastet
      continue;
    }
    const neu = ersetzt.get(kind.tag);
    if (neu) sektionen.push(neu);
    ersetzt.delete(kind.tag);
  }
  // Sektionen, die es im Baum noch gar nicht gab (erste neue Quelle in einer Datei ohne
  // <sources>): ans Ende — die DTD-Reihenfolge der Sektionen ist frei.
  for (const neu of ersetzt.values()) if (neu) sektionen.push(neu);

  return { prolog: doc.prolog, root: { ...root, children: sektionen } };
}
