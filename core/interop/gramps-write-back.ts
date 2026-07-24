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
// `id` (I0001) ist nur ein Etikett. Das Modell hält als Schlüssel die `id` — und seit BL-136
// auch in den REFERENZEN die id (`projectFamily`/`projectSource` übersetzen die Datei-Handles
// beim Lesen über `buildRefIndex`). Beim Schreiben ist der Weg umgekehrt: `toHandle()` bildet
// die Modell-id wieder auf ihr Datei-Handle ab (ein bereits gültiges Handle bleibt). So sind
// Store-Schlüssel und Referenzen durchgängig id-basiert, die Datei bleibt handle-basiert.
//
// Reine Funktionen, DOM-/Plattform-frei (INV-ARCH-1).

import type { Citation, Database, Event, Family, Note, Person, Repository, Source } from '../model/types';
import type { XmlDocument, XmlNode } from './xml-tree';
import { attr, childrenByTag, firstChild } from './xml-tree';
import {
  buildRefIndex,
  grampsKey,
  projectFamily,
  projectNote,
  projectPerson,
  projectRepository,
  projectSource,
} from './gramps';
import type { GrampsRefIndex } from './gramps';
import { buildEnrichContext } from './gramps-enrich';
import { projectGrampsEvent, tagToGrampsType } from './gramps-events';
import { confidenceToQuay, projectGrampsCitation } from './gramps-citations';
import { gedcomToGramps, grampsDateOf } from './gramps-date';

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
  // Die vier Datums-Tags stehen als Choice an EINER Position (zwischen type und place bzw.
  // vor page); zur Laufzeit ist stets höchstens einer da. Reihenfolge unter ihnen egal.
  event: ['type', 'daterange', 'datespan', 'dateval', 'datestr', 'place', 'cause', 'description',
    'attribute', 'noteref', 'citationref', 'objref', 'tagref'],
  citation: ['daterange', 'datespan', 'dateval', 'datestr', 'page', 'confidence',
    'noteref', 'objref', 'srcattribute', 'sourceref', 'tagref'],
};

/** Die vier GRAMPS-Datums-Tags (Choice-Gruppe in event/citation). */
const DATE_TAGS = new Set(['dateval', 'daterange', 'datespan', 'datestr']);

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

/**
 * Setzt das Datums-Element (Choice `dateval|daterange|datespan|datestr`) eines geänderten
 * Events/Zitats. UNVERÄNDERTES Datum bleibt der ORIGINAL-Knoten — so überleben Qualitäts-/
 * Kalender-Attribute (`quality`, `cformat`, `dualdated`, `newyear`), die das Modell nicht
 * trägt, byte-treu, auch wenn ein ANDERES Feld des Records editiert wurde (INV-PT). Nur bei
 * echter Datums-Änderung wird über `gedcomToGramps` neu gebildet und an der Choice-Position
 * eingefügt.
 */
function setzeDate(children: XmlNode[], ordnung: string[], orig: XmlNode, date: string | null, datePhrase: string): XmlNode[] {
  const origD = grampsDateOf(orig);
  if ((origD.date ?? null) === (date ?? null) && origD.datePhrase === datePhrase) return children;
  const el = gedcomToGramps(date, datePhrase);
  const ohne = children.filter((c) => !DATE_TAGS.has(c.tag));
  if (!el) return ohne;
  const neu = [...ohne];
  neu.splice(einfuegePosition(ohne, ordnung, el.tag), 0, knoten(el.tag, '', el.attrs));
  return neu;
}

// ── Handles ─────────────────────────────────────────────────────────────────────────────

/** Deterministisches Handle für einen synthetisierten Record — stabil über Roundtrips. */
function neuesHandle(id: string): string {
  return `_stb${id.replace(/[^A-Za-z0-9]/g, '')}`;
}

/**
 * Schreib-Index: der Handle↔id-Index des vorhandenen Baums, ergänzt um die künftigen
 * Handles NEUER db-Records (Person/Archiv), die noch nicht im Baum stehen. So findet eine
 * Familien-/Quellen-Referenz auf einen frisch angelegten Record dasselbe Handle, das
 * `neuerRecord` ihm gleich zuweist — kein toter Verweis (das Kernversprechen dieses Moduls).
 */
function buildWriteIndex(root: XmlNode, db: Database): GrampsRefIndex {
  const index = buildRefIndex(root);
  const referenzierbar = [...db.individuals.keys(), ...db.repositories.keys()];
  for (const id of referenzierbar) {
    if (index.idToHandle.has(id)) continue;
    const h = neuesHandle(id);
    index.idToHandle.set(id, h);
    index.handleToId.set(h, id);
    index.handles.add(h);
  }
  return index;
}

/**
 * Übersetzt einen Modell-Verweis (id) in ein GRAMPS-Handle. Ein bereits gültiges Handle
 * bleibt; eine Modell-id wird über den Index aufgelöst. Bleibt beides erfolglos, wird der
 * Wert unverändert durchgereicht — erfinden wäre schlimmer als eine erkennbare Fremdreferenz.
 */
function toHandle(ref: string, index: GrampsRefIndex): string {
  if (ref === '' || index.handles.has(ref)) return ref;
  return index.idToHandle.get(ref) ?? ref;
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

function familyKinder(orig: XmlNode, cur: Family, index: GrampsRefIndex): XmlNode[] {
  let children = setzeAttribut(orig.children, DTD_ORDER.family, 'father', 'hlink', toHandle(cur.husband ?? '', index));
  children = setzeAttribut(children, DTD_ORDER.family, 'mother', 'hlink', toHandle(cur.wife ?? '', index));

  // childref ist mehrwertig: der ganze Block wird an der Stelle des ersten vorhandenen
  // childref ersetzt (Reihenfolge der Kinder kommt aus dem Modell), vorhandene Attribute
  // je Kind (z. B. `mrel="Birth"`) bleiben erhalten, solange das Kind bleibt.
  const alteRefs = new Map(childrenByTag(orig, 'childref').map((c) => [attr(c, 'hlink'), c]));
  const neueRefs = cur.children.map((ref) => {
    const h = toHandle(ref, index);
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

function sourceKinder(orig: XmlNode, cur: Source, index: GrampsRefIndex): XmlNode[] {
  let children = setzeText(orig.children, DTD_ORDER.source, 'stitle', cur.title);
  children = setzeText(children, DTD_ORDER.source, 'sauthor', cur.author);
  children = setzeText(children, DTD_ORDER.source, 'spubinfo', cur.publisher);
  children = setzeText(children, DTD_ORDER.source, 'sabbrev', cur.abbr);
  return setzeAttribut(children, DTD_ORDER.source, 'reporef', 'hlink', toHandle(cur.repo ?? '', index));
}

function repoKinder(orig: XmlNode, cur: Repository): XmlNode[] {
  let children = setzeText(orig.children, DTD_ORDER.repository, 'rname', cur.name);
  children = setzeText(children, DTD_ORDER.repository, 'type', cur.type);
  return setzeAttribut(children, DTD_ORDER.repository, 'url', 'href', cur.www);
}

function noteKinder(orig: XmlNode, cur: Note): XmlNode[] {
  return setzeText(orig.children, DTD_ORDER.note, 'text', cur.text);
}

/**
 * Aktualisiert die ERKANNTEN Kinder eines geänderten `<event>`-Records: `<type>` (Rück-
 * abbildung `tagToGrampsType`), das Datums-Element und `<description>`. NICHT angetastet:
 * `<place>` (Orts-String→placeobj-Handle ist BL-143, D3), `<citationref>` (das Hinzufügen/
 * Entfernen ganzer Zitate ist nicht Teil dieses Cuts) und alles Unbekannte (INV-PT).
 */
function eventKinder(orig: XmlNode, cur: Event): XmlNode[] {
  let children = setzeText(orig.children, DTD_ORDER.event, 'type', tagToGrampsType(cur.type, cur.eventType));
  children = setzeDate(children, DTD_ORDER.event, orig, cur.date, cur.datePhrase);
  children = setzeText(children, DTD_ORDER.event, 'description', cur.value);
  return children;
}

/**
 * Aktualisiert die erkannten Kinder eines geänderten `<citation>`-Records: `<page>`,
 * `<confidence>` (QUAY→confidence) und `<sourceref hlink>`. Die `<confidence>` wird NUR
 * neu geschrieben, wenn der Nutzer die QUAY tatsächlich geändert hat — sonst bleibt der
 * Original-Wert erhalten (D4 ist verlustbehaftet: 4→3; ohne diesen Schutz würde ein reiner
 * Seiten-Edit ein „Very High"(4) still auf 3 herabstufen). Datum/Notizen/`srcattribute`
 * des Zitats bleiben Passthrough (nicht ins Modell projiziert).
 */
function citationKinder(orig: XmlNode, cur: Citation, index: GrampsRefIndex): XmlNode[] {
  let children = setzeText(orig.children, DTD_ORDER.citation, 'page', cur.page);
  const origConf = firstChild(orig, 'confidence')?.text ?? '';
  const conf = confidenceToQuay(origConf) === cur.quay ? origConf : String(cur.quay);
  children = setzeText(children, DTD_ORDER.citation, 'confidence', conf);
  return setzeAttribut(children, DTD_ORDER.citation, 'sourceref', 'hlink', toHandle(cur.sourceId, index));
}

// ── Gleichheit: nur die projizierten Felder zählen ──────────────────────────────────────

const personGleich = (a: Person, b: Person): boolean =>
  a.sex === b.sex && a.given === b.given && a.surname === b.surname && a.prefix === b.prefix && a.nick === b.nick;

// Beide Seiten halten seit BL-136 die Modell-id (a projiziert über denselben Index wie beim
// Parsen, b aus dem Modell) — direkter id-Vergleich, kein Handle-Umweg mehr nötig.
const familyGleich = (a: Family, b: Family): boolean =>
  (a.husband ?? '') === (b.husband ?? '') &&
  (a.wife ?? '') === (b.wife ?? '') &&
  a.children.length === b.children.length &&
  a.children.every((h, i) => h === b.children[i]);

const sourceGleich = (a: Source, b: Source): boolean =>
  a.title === b.title && a.author === b.author && a.abbr === b.abbr && a.publisher === b.publisher &&
  (a.repo ?? '') === (b.repo ?? '');

const repoGleich = (a: Repository, b: Repository): boolean =>
  a.name === b.name && a.type === b.type && a.www === b.www;

const noteGleich = (a: Note, b: Note): boolean => a.text === b.text;

// Event: nur die SCHREIBBAREN projizierten Felder zählen. `place` ist absichtlich AUSGENOMMEN
// (der Orts-String lässt sich ohne die volle placeobj-Projektion — BL-143 — nicht in ein
// Handle zurückschreiben; ein reiner Orts-Edit bleibt vorerst folgenlos, statt Unsinn zu
// schreiben). Zitate sind eigene Records und zählen hier nicht mit.
const eventGleich = (a: Event, b: Event): boolean =>
  a.type === b.type &&
  a.eventType === b.eventType &&
  (a.date ?? null) === (b.date ?? null) &&
  a.datePhrase === b.datePhrase &&
  a.value === b.value;

const citationGleich = (a: Citation, b: Citation): boolean =>
  a.sourceId === b.sourceId && a.page === b.page && a.quay === b.quay;

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

// ── GETEILTE Sektionen (Events/Zitate): handle-adressiert, ohne Synthese/Löschung ─────────
// Anders als die besessenen Records liegen Events/Zitate im Modell NICHT in einem Store,
// sondern verstreut über Person/Familie — und dieselbe Quelle/derselbe Event kann von
// mehreren Ownern referenziert und dabei in MEHRERE unabhängige Modell-Kopien projiziert
// worden sein. Deshalb: (a) Zuordnung über das `grampsHandle`, nicht die id; (b) je Handle
// werden ALLE Kopien gesammelt — ein geteilter Record gilt als geändert, sobald IRGENDEINE
// Kopie von der Original-Projektion abweicht (der Nutzer kann jede Kopie editiert haben);
// (c) ein `<event>`/`<citation>` ohne Modell-Owner (nur Witness-Rolle → ASSO, oder gelöscht)
// bleibt PASSTHROUGH — das Hinzufügen/Entfernen ganzer geteilter Records berührt die Owner-
// eventref/citationref-Liste und ist NICHT Teil dieses Cuts (ADR-v9-114 D5-Plan).

interface GeteilteSektion<T> {
  section: string;
  item: string;
  /** Handle → alle Modell-Kopien dieses geteilten Records. */
  map: Map<string, T[]>;
  project: (n: XmlNode) => T;
  gleich: (projiziert: T, aktuell: T) => boolean;
  kinder: (orig: XmlNode, cur: T) => XmlNode[];
}

function verarbeiteGeteilteSektion<T>(root: XmlNode, s: GeteilteSektion<T>): XmlNode | null {
  const sec = firstChild(root, s.section);
  if (!sec) return null; // geteilte Sektionen entstehen in diesem Cut nicht neu
  const kinder: XmlNode[] = [];
  for (const node of sec.children) {
    if (node.tag !== s.item) {
      kinder.push(node);
      continue;
    }
    const copies = s.map.get(attr(node, 'handle'));
    if (!copies || copies.length === 0) {
      kinder.push(node); // kein Modell-Owner → Passthrough (byte-treu)
      continue;
    }
    const orig = s.project(node);
    const geaendert = copies.find((c) => !s.gleich(orig, c)); // erste abweichende Kopie gewinnt
    if (!geaendert) {
      kinder.push(node); // IDENTISCH — byte-treu
      continue;
    }
    kinder.push({ ...node, children: s.kinder(node, geaendert) });
  }
  return { ...sec, children: kinder };
}

// ── Handle→Modell-Kopien für die geteilten Records ───────────────────────────────────────
// Nur Objekte MIT `grampsHandle` (GRAMPS-Ursprung) zählen; leere Main-Slots und GEDCOM-
// Events (Handle null) fallen weg.

function allEvents(db: Database): Event[] {
  const out: Event[] = [];
  for (const p of db.individuals.values()) out.push(p.birth, p.chr, p.death, p.buri, ...p.events);
  for (const f of db.families.values()) out.push(f.marriage, f.engagement, ...f.events);
  return out;
}

function pushByHandle<T extends { grampsHandle: string | null }>(m: Map<string, T[]>, c: T): void {
  if (!c.grampsHandle) return;
  const list = m.get(c.grampsHandle);
  if (list) list.push(c);
  else m.set(c.grampsHandle, [c]);
}

function buildEventMap(db: Database): Map<string, Event[]> {
  const m = new Map<string, Event[]>();
  for (const e of allEvents(db)) pushByHandle(m, e);
  return m;
}

function buildCitationMap(db: Database): Map<string, Citation[]> {
  const m = new Map<string, Citation[]>();
  const add = (c: Citation): void => pushByHandle(m, c);
  for (const p of db.individuals.values()) {
    p.nameCitations.forEach(add);
    p.topLevelCitations.forEach(add);
    p.extraNames.forEach((n) => n.citations.forEach(add));
    p.childOf.forEach((cl) => cl.citations.forEach(add));
    p.associations.forEach((a) => a.citations.forEach(add));
  }
  for (const f of db.families.values()) f.citations.forEach(add);
  for (const e of allEvents(db)) e.citations.forEach(add);
  return m;
}

/**
 * Projiziert `db` in den GRAMPS-Baum. Unveränderte Records bleiben identisch; geänderte
 * behalten ihren Passthrough; neue kommen hinzu, gelöschte fallen weg. Reine Funktion —
 * der übergebene Baum wird nicht mutiert.
 */
export function applyDatabaseToXml(db: Database, doc: XmlDocument): XmlDocument {
  const root = doc.root;
  const index = buildWriteIndex(root, db);

  const sektionen: XmlNode[] = [];
  const ersetzt = new Map<string, XmlNode | null>();
  ersetzt.set('people', verarbeiteSektion(root, {
    section: 'people', item: 'person', map: db.individuals,
    project: projectPerson, gleich: personGleich, kinder: personKinder,
  }));
  ersetzt.set('families', verarbeiteSektion(root, {
    section: 'families', item: 'family', map: db.families,
    project: (n) => projectFamily(n, index), gleich: familyGleich,
    kinder: (orig, cur) => familyKinder(orig, cur, index),
  }));
  ersetzt.set('sources', verarbeiteSektion(root, {
    section: 'sources', item: 'source', map: db.sources,
    project: (n) => projectSource(n, index), gleich: sourceGleich,
    kinder: (orig, cur) => sourceKinder(orig, cur, index),
  }));
  ersetzt.set('repositories', verarbeiteSektion(root, {
    section: 'repositories', item: 'repository', map: db.repositories,
    project: projectRepository, gleich: repoGleich, kinder: repoKinder,
  }));
  ersetzt.set('notes', verarbeiteSektion(root, {
    section: 'notes', item: 'note', map: db.notes,
    project: projectNote, gleich: noteGleich, kinder: noteKinder,
  }));

  // GETEILTE Records (Events/Zitate): handle-adressiert, ohne Synthese/Löschung. Die
  // Re-Projektion zum Vergleich braucht dieselben Auflöser wie der Parser (Orts-String,
  // Quellen-Handle→id) — buildEnrichContext stellt sie aus dem Baum + Schreib-Index.
  const enrich = buildEnrichContext(root, index);
  ersetzt.set('events', verarbeiteGeteilteSektion(root, {
    section: 'events', item: 'event', map: buildEventMap(db),
    project: (n) => projectGrampsEvent(n, enrich.resolvePlace),
    gleich: eventGleich, kinder: eventKinder,
  }));
  ersetzt.set('citations', verarbeiteGeteilteSektion(root, {
    section: 'citations', item: 'citation', map: buildCitationMap(db),
    project: (n) => projectGrampsCitation(n, enrich.resolveSourceId),
    gleich: citationGleich, kinder: (orig, cur) => citationKinder(orig, cur, index),
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
