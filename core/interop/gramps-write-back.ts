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
import type { HofObject, PlaceObject } from '../places/types';
import { isEventPresent } from '../model/event';
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
import { descriptionIsAddress, projectGrampsEvent, tagToGrampsType } from './gramps-events';
import { projectBuildingHof, projectPlaceobj } from './gramps-places';
import { confidenceToQuay, projectGrampsCitation } from './gramps-citations';
import { gedcomToGramps, grampsDateOf } from './gramps-date';
import { parseCoord } from './gedcom-parse';

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
  placeobj: ['ptitle', 'pname', 'code', 'coord', 'placeref', 'location', 'url',
    'noteref', 'objref', 'tagref'],
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

// ── Schreib-Kontext für geteilte Records (Events/Zitate), BL-144 ─────────────────────────
// Neu HINZUGEFÜGTE Events/Zitate haben (noch) keine `grampsId`. Der Vor-Pass `assignNewIds`
// vergibt jedem eine frische, im Bestand eindeutige id + Handle und trägt beide in den Index
// ein; die Maps hier merken sich die Zuordnung Objekt→id für diesen einen Build-Lauf. So
// findet die Owner-Reconciliation (eventref/citationref) und die Record-Synthese dasselbe
// Handle. `db` wird NICHT mutiert (Reinheit) — die id lebt nur im Ausgabe-Baum; nach
// Speichern+Neuladen trägt das dann geparste Objekt sie regulär als `grampsId`.
interface Wb {
  index: GrampsRefIndex;
  evId: Map<Event, string>;
  citId: Map<Citation, string>;
}

/** Effektive id eines Events/Zitats: die eigene `grampsId`, sonst die frisch vergebene. */
const effEvId = (wb: Wb, e: Event): string | null => e.grampsId ?? wb.evId.get(e) ?? null;
const effCitId = (wb: Wb, c: Citation): string | null => c.grampsId ?? wb.citId.get(c) ?? null;
/** Datei-Handle eines Events/Zitats über seine (effektive) id (Index nach `assignNewIds`). */
const evHandle = (wb: Wb, e: Event): string => {
  const id = effEvId(wb, e);
  return id ? toHandle(id, wb.index) : '';
};
const citHandle = (wb: Wb, c: Citation): string => {
  const id = effCitId(wb, c);
  return id ? toHandle(id, wb.index) : '';
};

/** Die vom Personen-Owner besessenen (Rolle „Primary") Events — nur die vorhandenen. */
function personOwnedEvents(p: Person): Event[] {
  return [p.birth, p.chr, p.death, p.buri, ...p.events].filter(isEventPresent);
}
/** Die vom Familien-Owner besessenen (Rolle „Family") Events — nur die vorhandenen. */
function familyOwnedEvents(f: Family): Event[] {
  return [f.marriage, f.engagement, ...f.events].filter(isEventPresent);
}

const hlinksOf = (children: XmlNode[], tag: string, keep?: (n: XmlNode) => boolean): string[] =>
  children.filter((c) => c.tag === tag && (!keep || keep(c))).map((c) => attr(c, 'hlink'));

/** Zwei Handle-Listen als Menge gleich (Reihenfolge egal — Add/Remove-Erkennung)? */
function sameHandleSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((h) => sb.has(h));
}

/**
 * Reconciliation einer mehrwertigen Referenzliste (`<eventref>`/`<citationref>`) OHNE die
 * vorhandenen Refs umzuordnen — nur das erhält die Byte-Treue am unveränderten Bestand:
 *   - „verwaltete" Refs (Rolle passt), deren Ziel-Handle nicht mehr gewollt ist → entfernt;
 *   - unverwaltete Refs (andere Rolle, z. B. Witness) → unangetastet durchgereicht;
 *   - neue gewollte Handles (im Modell, noch kein Ref) → als frischer Ref ans Ende des
 *     bestehenden Ref-Blocks angefügt (DTD-korrekt, `makeRef` setzt Rolle/Attribute).
 * `wantHandles` ist die Modell-Sollmenge (Reihenfolge nur für neue Refs relevant).
 */
function reconcileRefs(
  children: XmlNode[],
  ordnung: string[],
  tag: string,
  isManaged: (ref: XmlNode) => boolean,
  wantHandles: string[],
  makeRef: (handle: string) => XmlNode,
): XmlNode[] {
  const want = new Set(wantHandles);
  const vorhanden = new Set<string>();
  const kept: XmlNode[] = [];
  let letzterRefIdx = -1;
  for (const c of children) {
    if (c.tag === tag && isManaged(c)) {
      const h = attr(c, 'hlink');
      if (!want.has(h)) continue; // entfernt
      vorhanden.add(h);
    }
    kept.push(c);
    if (c.tag === tag) letzterRefIdx = kept.length - 1;
  }
  const neu = wantHandles.filter((h) => h !== '' && !vorhanden.has(h)).map(makeRef);
  if (neu.length === 0) return kept.length === children.length ? children : kept;
  const pos = letzterRefIdx >= 0 ? letzterRefIdx + 1 : einfuegePosition(kept, ordnung, tag);
  const out = [...kept];
  out.splice(pos, 0, ...neu);
  return out;
}

// ── Aktualisierung je Entität (nur die erkannten Elemente) ──────────────────────────────

/** Rolle „Primary" oder fehlend zählt als Personen-Owner (spiegelt `ownedEvents` beim Lesen). */
const personEventRole = (r: XmlNode): boolean => {
  const role = attr(r, 'role');
  return role === 'Primary' || role === '';
};
const familyEventRole = (r: XmlNode): boolean => {
  const role = attr(r, 'role');
  return role === 'Family' || role === '';
};
const eventref = (role: string) => (h: string): XmlNode => knoten('eventref', '', [['hlink', h], ['role', role]]);
const citationref = (h: string): XmlNode => knoten('citationref', '', [['hlink', h]]);

function personKinder(orig: XmlNode, cur: Person, wb: Wb): XmlNode[] {
  let children = setzeText(orig.children, DTD_ORDER.person, 'gender', cur.sex);

  const nameIdx = children.findIndex((c) => c.tag === 'name');
  const nameAlt = nameIdx >= 0 ? children[nameIdx] : knoten('name', '', [['type', 'Birth Name']]);
  let nk = nameAlt.children;
  nk = setzeText(nk, DTD_ORDER.name, 'first', cur.given);
  nk = setzeText(nk, DTD_ORDER.name, 'surname', cur.surname);
  nk = setzeText(nk, DTD_ORDER.name, 'title', cur.prefix);
  nk = setzeText(nk, DTD_ORDER.name, 'nick', cur.nick);
  nk = reconcileRefs(nk, DTD_ORDER.name, 'citationref', () => true,
    cur.nameCitations.map((c) => citHandle(wb, c)), citationref);
  const nameNeu = { ...nameAlt, children: nk };

  children = [...children];
  if (nameIdx >= 0) children[nameIdx] = nameNeu;
  else children.splice(einfuegePosition(children, DTD_ORDER.person, 'name'), 0, nameNeu);

  // Add/Remove (BL-144): Eventrefs (Rolle Primary) + direkte Person-Zitate (topLevelCitations).
  children = reconcileRefs(children, DTD_ORDER.person, 'eventref', personEventRole,
    personOwnedEvents(cur).map((e) => evHandle(wb, e)), eventref('Primary'));
  children = reconcileRefs(children, DTD_ORDER.person, 'citationref', () => true,
    cur.topLevelCitations.map((c) => citHandle(wb, c)), citationref);
  return children;
}

function familyKinder(orig: XmlNode, cur: Family, wb: Wb): XmlNode[] {
  const index = wb.index;
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
  children = [...ohne];
  children.splice(ziel, 0, ...neueRefs);

  // Add/Remove (BL-144): Eventrefs (Rolle Family) + Familien-Zitate.
  children = reconcileRefs(children, DTD_ORDER.family, 'eventref', familyEventRole,
    familyOwnedEvents(cur).map((e) => evHandle(wb, e)), eventref('Family'));
  children = reconcileRefs(children, DTD_ORDER.family, 'citationref', () => true,
    cur.citations.map((c) => citHandle(wb, c)), citationref);
  return children;
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
 * abbildung `tagToGrampsType`), das Datums-Element, `<description>` und — seit BL-144 — die
 * `<citationref>`-Liste (Add/Remove von Zitaten am Event). NICHT angetastet: `<place>`
 * (Orts-String→placeobj-Handle ist BL-143, D3) und alles Unbekannte (INV-PT).
 */
function eventKinder(orig: XmlNode, cur: Event, wb: Wb): XmlNode[] {
  let children = setzeText(orig.children, DTD_ORDER.event, 'type', tagToGrampsType(cur.type, cur.eventType));
  children = setzeDate(children, DTD_ORDER.event, orig, cur.date, cur.datePhrase);
  // BL-143: bei RESI/PROP trägt `<description>` die Adresse (event.addr), sonst den Wert.
  children = setzeText(children, DTD_ORDER.event, 'description', eventDescription(cur));
  children = reconcileRefs(children, DTD_ORDER.event, 'citationref', () => true,
    cur.citations.map((c) => citHandle(wb, c)), citationref);
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

// Der `<description>`-Wert eines Events: bei RESI/PROP die Adresse (event.addr), sonst der
// Freitext-Wert (BL-143). Genau die Umkehrung von `projectGrampsEvent`.
const eventDescription = (e: Event): string => (descriptionIsAddress(e.type) ? e.addr : e.value);

// Event: nur die SCHREIBBAREN projizierten Felder zählen. `place` ist absichtlich AUSGENOMMEN
// (der Orts-String lässt sich ohne die volle placeobj-Projektion — BL-143 — nicht in ein
// Handle zurückschreiben; ein reiner Orts-Edit bleibt vorerst folgenlos, statt Unsinn zu
// schreiben). Zitate sind eigene Records und zählen hier nicht mit. `<description>` deckt je
// nach Typ `value` ODER `addr` ab (RESI/PROP, BL-143) — `eventDescription` löst das auf.
const eventGleich = (a: Event, b: Event): boolean =>
  a.type === b.type &&
  a.eventType === b.eventType &&
  (a.date ?? null) === (b.date ?? null) &&
  a.datePhrase === b.datePhrase &&
  eventDescription(a) === eventDescription(b);

const citationGleich = (a: Citation, b: Citation): boolean =>
  a.sourceId === b.sourceId && a.page === b.page && a.quay === b.quay;

// ── Owner-Gleichheit inkl. Referenz-Mengen (BL-144) ─────────────────────────────────────
// Ein Owner (Person/Familie) gilt zusätzlich als geändert, wenn sich die MENGE seiner
// besessenen Event-/Zitat-Refs ändert (Add/Remove) — NICHT, wenn nur ein Feld INNERHALB
// eines referenzierten Events/Zitats editiert wurde (das ändert den geteilten Record, nicht
// den Owner; BL-142). Bleibt die Menge gleich, ist der Owner-Knoten byte-treu identisch.

function personGleichNode(node: XmlNode, cur: Person, wb: Wb): boolean {
  if (!personGleich(projectPerson(node), cur)) return false;
  if (!sameHandleSet(hlinksOf(node.children, 'eventref', personEventRole),
    personOwnedEvents(cur).map((e) => evHandle(wb, e)))) return false;
  if (!sameHandleSet(hlinksOf(node.children, 'citationref'),
    cur.topLevelCitations.map((c) => citHandle(wb, c)))) return false;
  const name = firstChild(node, 'name');
  const nameRefs = name ? hlinksOf(name.children, 'citationref') : [];
  return sameHandleSet(nameRefs, cur.nameCitations.map((c) => citHandle(wb, c)));
}

function familyGleichNode(node: XmlNode, cur: Family, wb: Wb): boolean {
  if (!familyGleich(projectFamily(node, wb.index), cur)) return false;
  if (!sameHandleSet(hlinksOf(node.children, 'eventref', familyEventRole),
    familyOwnedEvents(cur).map((e) => evHandle(wb, e)))) return false;
  return sameHandleSet(hlinksOf(node.children, 'citationref'),
    cur.citations.map((c) => citHandle(wb, c)));
}

/** Event unverändert? Felder (BL-142) UND die Zitat-Ref-Menge (BL-144). */
function eventUnveraendert(node: XmlNode, cur: Event, resolvePlace: (h: string) => string, wb: Wb): boolean {
  if (!eventGleich(projectGrampsEvent(node, resolvePlace), cur)) return false;
  return sameHandleSet(hlinksOf(node.children, 'citationref'), cur.citations.map((c) => citHandle(wb, c)));
}

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
  /**
   * Alternativ zu `gleich` ein KNOTEN-basierter Vergleich (BL-144): Owner (Person/Familie)
   * müssen zusätzlich ihre Event-/Zitat-Ref-MENGE vergleichen, die `project` bewusst NICHT
   * mitprojiziert. Ist gesetzt, ersetzt er `gleich(project(node), cur)`.
   */
  gleichNode?: (node: XmlNode, aktuell: T) => boolean;
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
    const unveraendert = s.gleichNode ? s.gleichNode(node, cur) : s.gleich(s.project(node), cur);
    if (unveraendert) {
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

// ── GETEILTE Sektionen (Events/Zitate) ──────────────────────────────────────────────────
// Anders als die besessenen Records liegen Events/Zitate im Modell NICHT in einem Store,
// sondern verstreut über Person/Familie — und dieselbe id kann von mehreren Ownern
// referenziert und dabei in MEHRERE unabhängige Modell-Kopien projiziert worden sein.
// Deshalb: (a) Zuordnung über die eindeutige `grampsId` (nicht das Handle — BL-136/144);
// (b) je id werden ALLE Kopien gesammelt, geändert sobald IRGENDEINE abweicht; (c) ein
// Record ohne Modell-Owner (Witness-Rolle/entfernt) bleibt PASSTHROUGH; (d) NEUE Records
// (BL-144) werden aus `neu` synthetisiert. Das Entfernen verwaister Records passiert NICHT
// hier, sondern zentral am Schluss (`bereinigeVerwaiste`), wo die Owner-Refs schon stehen.

interface GeteilteSektion<T> {
  section: string;
  item: string;
  /** grampsId → alle vorhandenen Modell-Kopien dieses geteilten Records. */
  map: Map<string, T[]>;
  unveraendert: (node: XmlNode, cur: T) => boolean;
  kinder: (orig: XmlNode, cur: T) => XmlNode[];
  /** Neue Records (BL-144): frische id + das Modell-Objekt. */
  neu: Array<{ id: string; cur: T }>;
  synth: (id: string, cur: T) => XmlNode;
}

function verarbeiteGeteilteSektion<T>(root: XmlNode, s: GeteilteSektion<T>): XmlNode | null {
  const sec = firstChild(root, s.section);
  const kinder: XmlNode[] = [];
  for (const node of sec ? sec.children : []) {
    if (node.tag !== s.item) {
      kinder.push(node);
      continue;
    }
    const copies = s.map.get(grampsKey(node));
    if (!copies || copies.length === 0) {
      kinder.push(node); // kein Modell-Owner → Passthrough (byte-treu)
      continue;
    }
    const geaendert = copies.find((c) => !s.unveraendert(node, c)); // erste abweichende Kopie gewinnt
    kinder.push(geaendert ? { ...node, children: s.kinder(node, geaendert) } : node);
  }
  for (const { id, cur } of s.neu) kinder.push(s.synth(id, cur)); // Synthese (BL-144)
  if (!sec) return kinder.length ? knoten(s.section, '', [], kinder) : null;
  return { ...sec, children: kinder };
}

// ── id→Modell-Kopien für die geteilten Records (nur VORHANDENE, id gesetzt) ──────────────

function allEvents(db: Database): Event[] {
  const out: Event[] = [];
  for (const p of db.individuals.values()) out.push(p.birth, p.chr, p.death, p.buri, ...p.events);
  for (const f of db.families.values()) out.push(f.marriage, f.engagement, ...f.events);
  return out;
}

function pushById<T extends { grampsId: string | null }>(m: Map<string, T[]>, c: T): void {
  if (!c.grampsId) return;
  const list = m.get(c.grampsId);
  if (list) list.push(c);
  else m.set(c.grampsId, [c]);
}

function buildEventMap(db: Database): Map<string, Event[]> {
  const m = new Map<string, Event[]>();
  for (const e of allEvents(db)) pushById(m, e);
  return m;
}

function buildCitationMap(db: Database): Map<string, Citation[]> {
  const m = new Map<string, Citation[]>();
  const add = (c: Citation): void => pushById(m, c);
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

// ── Neue id-Vergabe für hinzugefügte Events/Zitate (BL-144) ──────────────────────────────

function collectExistingIds(root: XmlNode, section: string, item: string): Set<string> {
  const ids = new Set<string>();
  const sec = firstChild(root, section);
  if (sec) for (const n of childrenByTag(sec, item)) { const id = attr(n, 'id'); if (id) ids.add(id); }
  return ids;
}

/** Fortlaufender id-Generator `<prefix>NNNN`, kollisionsfrei gegen den vorhandenen Bestand. */
function idGenerator(prefix: string, existing: Set<string>): () => string {
  let n = 0;
  const re = new RegExp(`^${prefix}(\\d+)$`);
  for (const id of existing) { const m = re.exec(id); if (m) n = Math.max(n, parseInt(m[1], 10) + 1); }
  return () => {
    let id: string;
    do { id = prefix + String(n++).padStart(4, '0'); } while (existing.has(id));
    existing.add(id);
    return id;
  };
}

/**
 * Vor-Pass: vergibt jedem NEUEN (vorhandenen, `grampsId`-losen) Event/Zitat eine frische
 * eindeutige id + Handle und trägt beide in den Schreib-Index ein. Deterministische Reihen-
 * folge (Personen dann Familien; Slots dann `events[]`; Zitatlisten) → stabile ids über
 * wiederholte Builds. `db` wird NICHT mutiert — die Zuordnung lebt in `wb`.
 */
function assignNewIds(db: Database, root: XmlNode, index: GrampsRefIndex): Wb {
  const wb: Wb = { index, evId: new Map(), citId: new Map() };
  const nextEv = idGenerator('E', collectExistingIds(root, 'events', 'event'));
  const nextCit = idGenerator('C', collectExistingIds(root, 'citations', 'citation'));
  const allocHandle = (id: string): void => {
    let h = neuesHandle(id);
    let i = 0;
    while (index.handles.has(h)) h = neuesHandle(`${id}_${++i}`);
    index.handles.add(h);
    index.idToHandle.set(id, h);
    index.handleToId.set(h, id);
  };
  const newEvent = (e: Event): void => {
    if (e.grampsId || wb.evId.has(e)) return;
    const id = nextEv();
    allocHandle(id);
    wb.evId.set(e, id);
  };
  const newCit = (c: Citation): void => {
    if (c.grampsId || wb.citId.has(c)) return;
    const id = nextCit();
    allocHandle(id);
    wb.citId.set(c, id);
  };
  for (const p of db.individuals.values()) {
    p.nameCitations.forEach(newCit);
    p.topLevelCitations.forEach(newCit);
    for (const e of personOwnedEvents(p)) { newEvent(e); e.citations.forEach(newCit); }
  }
  for (const f of db.families.values()) {
    f.citations.forEach(newCit);
    for (const e of familyOwnedEvents(f)) { newEvent(e); e.citations.forEach(newCit); }
  }
  return wb;
}

function synthEvent(id: string, e: Event, wb: Wb): XmlNode {
  const node = knoten('event', '', [['handle', toHandle(id, wb.index)], ['change', '0'], ['id', id]]);
  return { ...node, children: eventKinder(node, e, wb) };
}

function synthCitation(id: string, c: Citation, wb: Wb): XmlNode {
  const node = knoten('citation', '', [['handle', toHandle(id, wb.index)], ['change', '0'], ['id', id]]);
  return { ...node, children: citationKinder(node, c, wb.index) };
}

// ── Verwaiste geteilte Records entfernen (BL-144) ────────────────────────────────────────

function collectRefHandles(root: XmlNode, tag: string): Set<string> {
  const out = new Set<string>();
  const walk = (n: XmlNode): void => {
    if (n.tag === tag) { const h = attr(n, 'hlink'); if (h) out.add(h); }
    for (const c of n.children) walk(c);
  };
  walk(root);
  return out;
}

/**
 * Entfernt `<event>`/`<citation>`-Records, auf die nach der Owner-Reconciliation KEIN Ref
 * mehr zeigt. Fixpunkt-Iteration, weil ein entfernter Event ein nur-von-ihm referenziertes
 * Zitat verwaisen lassen kann (Kaskade) — erst wenn ein Durchlauf nichts mehr entfernt, ist
 * das Ergebnis stabil (und damit idempotent).
 */
function bereinigeVerwaiste(root: XmlNode): XmlNode {
  let children = root.children;
  for (;;) {
    const refEv = collectRefHandles({ ...root, children }, 'eventref');
    const refCit = collectRefHandles({ ...root, children }, 'citationref');
    let geaendert = false;
    children = children.map((sec) => {
      const item = sec.tag === 'events' ? 'event' : sec.tag === 'citations' ? 'citation' : null;
      if (!item) return sec;
      const refs = item === 'event' ? refEv : refCit;
      const kept = sec.children.filter((c) => c.tag !== item || refs.has(attr(c, 'handle')));
      if (kept.length === sec.children.length) return sec;
      geaendert = true;
      return { ...sec, children: kept };
    });
    if (!geaendert) break;
  }
  return { ...root, children };
}

// ── GETEILTE Sektion `<places>` (BL-143) ────────────────────────────────────────────────
// Orte sind — wie Events/Zitate — Top-Level-`<placeobj>`-Records, von Events per `<place
// hlink>` geteilt. Anders als jene sind sie im Modell aber 1:1 auf `db.placeObjects` (Schlüssel
// = placeobj-`id`, z. B. P0000) bzw. Building-Höfe (`hof.grampsId`) abgebildet — kein Multi-
// Kopie-Problem. Deshalb ein eigener Durchlauf (verwandt mit `verarbeiteSektion`, aber er
// aktualisiert AUCH das `type`-ATTRIBUT des placeobj, nicht nur Kinder). Unverändert →
// IDENTISCHER Knoten (byte-treu, net_delta=0 beim reinen Laden/Speichern). AUS RESI/PROP-
// Adressen gebootete Höfe (`grampsId` fehlt) sind NICHT hier — ihre Adresse round-trippt über
// das Event-`<description>` (Stage A), nicht als eigenes placeobj (sonst net_delta≠0).

/** Ein Ort ODER ein Building-Hof, adressiert über die placeobj-`id`. */
type PlaceEntry = { place: PlaceObject } | { hof: HofObject };

const sameYear = (a: number | null, b: number | null): boolean => (a ?? null) === (b ?? null);

/** Setzt/entfernt ein Attribut am Knoten selbst (z. B. `type` am `<placeobj>`). */
function setzeKnotenAttr(node: XmlNode, name: string, wert: string): XmlNode {
  const hat = node.attrs.some(([k]) => k === name);
  if (wert === '') return hat ? { ...node, attrs: node.attrs.filter(([k]) => k !== name) } : node;
  if (attr(node, name) === wert) return node;
  const attrs = hat
    ? node.attrs.map(([k, v]) => (k === name ? [k, wert] : [k, v]) as [string, string])
    : [...node.attrs, [name, wert] as [string, string]];
  return { ...node, attrs };
}

/** Geo-Koordinate zurück ins `N52.15`/`E7.33`-Wire-Format (parseCoord ist die Umkehr). */
function coordWire(n: number, kind: 'lat' | 'long'): string {
  const pos = kind === 'lat' ? 'N' : 'E';
  const neg = kind === 'lat' ? 'S' : 'W';
  return (n < 0 ? neg : pos) + Math.abs(n);
}

/**
 * Setzt das `<coord>`-Element. UNVERÄNDERTE Koordinaten behalten den ORIGINAL-Knoten (byte-
 * treu — GRAMPS' eigene Präzision `E7.333333` bleibt, statt durch Parse→Emit zu driften);
 * beide null → Element entfernt; sonst neu gesetzt (nur bei echter Änderung).
 */
function setzeCoord(children: XmlNode[], lat: number | null, long: number | null): XmlNode[] {
  const idx = children.findIndex((c) => c.tag === 'coord');
  if (idx >= 0) {
    const alt = children[idx];
    if (lat === null && long === null) return children.filter((_, i) => i !== idx);
    if (parseCoord(attr(alt, 'lat')) === lat && parseCoord(attr(alt, 'long')) === long) return children;
    const neu = [...children];
    neu[idx] = { ...alt, attrs: [['lat', coordWire(lat!, 'lat')], ['long', coordWire(long!, 'long')]] };
    return neu;
  }
  if (lat === null && long === null) return children;
  const neu = [...children];
  neu.splice(einfuegePosition(children, DTD_ORDER.placeobj, 'coord'), 0,
    knoten('coord', '', [['lat', coordWire(lat!, 'lat')], ['long', coordWire(long!, 'long')]]));
  return neu;
}

/**
 * Reconciliation der `<pname>`-Liste aus `pnames` (mehrwertig): vorhandene `<pname>` mit
 * gleichem `value` bleiben AN IHRER STELLE (bewahren `lang`/Datums-Kinder byte-treu), entfallene
 * fallen weg, neue kommen an die DTD-Position. `value` ist der Schlüssel (der Anzeigename).
 */
function reconcilePnames(children: XmlNode[], pnames: readonly { value: string }[]): XmlNode[] {
  const alt = new Map(children.filter((c) => c.tag === 'pname').map((c) => [attr(c, 'value'), c]));
  const want = pnames.map((n) => n.value);
  const neuePnames = want.map((v) => alt.get(v) ?? knoten('pname', '', [['value', v]]));
  const ersteIdx = children.findIndex((c) => c.tag === 'pname');
  const ohne = children.filter((c) => c.tag !== 'pname');
  const ziel = ersteIdx >= 0
    ? children.slice(0, ersteIdx).filter((c) => c.tag !== 'pname').length
    : einfuegePosition(ohne, DTD_ORDER.placeobj, 'pname');
  const out = [...ohne];
  out.splice(ziel, 0, ...neuePnames);
  return out;
}

/**
 * Reconciliation der `<placeref>`-Kette (enclosedBy): vorhandene Refs mit gleichem Ziel-Handle
 * bleiben AN IHRER STELLE (bewahren ihre `<dateval>`-Kinder), entfallene fallen weg, neue
 * kommen ans Ende des Ref-Blocks. Ziel-Handle = `toHandle(placeId)`.
 */
function reconcilePlacerefs(children: XmlNode[], enclosedBy: readonly { placeId: string }[], index: GrampsRefIndex): XmlNode[] {
  return reconcileRefs(children, DTD_ORDER.placeobj, 'placeref', () => true,
    enclosedBy.map((r) => toHandle(r.placeId, index)),
    (h) => knoten('placeref', '', [['hlink', h]]));
}

// Gleichheit: nur die schreibbaren projizierten Felder. `dateRaw` ist abgeleitet (aus from/to
// projiziert), zählt nicht mit; `note`/`existsFrom`/… haben kein GRAMPS-Pendant (Passthrough).
const sameNames = (a: PlaceObject['pnames'], b: PlaceObject['pnames']): boolean =>
  a.length === b.length && a.every((n, i) => n.value === b[i].value && sameYear(n.from, b[i].from) && sameYear(n.to, b[i].to));
const sameRefs = (a: PlaceObject['enclosedBy'], b: PlaceObject['enclosedBy']): boolean =>
  a.length === b.length && a.every((r, i) => r.placeId === b[i].placeId && sameYear(r.from, b[i].from) && sameYear(r.to, b[i].to));

const placeGleich = (a: PlaceObject, b: PlaceObject): boolean =>
  a.title === b.title && a.type === b.type && a.lat === b.lat && a.long === b.long &&
  sameNames(a.pnames, b.pnames) && sameRefs(a.enclosedBy, b.enclosedBy);

const hofGleich = (a: HofObject, b: HofObject): boolean =>
  a.villageId === b.villageId && a.lat === b.lat && a.long === b.long &&
  (a.addrs[0]?.value ?? '') === (b.addrs[0]?.value ?? '');

/** Ist der `<placeobj>`-Knoten unverändert gegenüber seinem Modell-Eintrag? */
function placeobjUnveraendert(node: XmlNode, entry: PlaceEntry, index: GrampsRefIndex): boolean {
  const resolve = (h: string): string => index.handleToId.get(h) ?? h;
  if ('place' in entry) {
    if (attr(node, 'type') === 'Building') return false; // Ort ↔ Building-Wechsel = Änderung
    return placeGleich(projectPlaceobj(node, resolve), entry.place);
  }
  if (attr(node, 'type') !== 'Building') return false;
  return hofGleich(projectBuildingHof(node, resolve, new Map()), entry.hof);
}

/** Aktualisiert einen geänderten `<placeobj>`-Knoten (Attribut `type` + erkannte Kinder). */
function updatePlaceobj(node: XmlNode, entry: PlaceEntry, index: GrampsRefIndex): XmlNode {
  if ('place' in entry) {
    const po = entry.place;
    let children = setzeText(node.children, DTD_ORDER.placeobj, 'ptitle', po.title);
    children = reconcilePnames(children, po.pnames);
    children = setzeCoord(children, po.lat, po.long);
    children = reconcilePlacerefs(children, po.enclosedBy, index);
    return { ...setzeKnotenAttr(node, 'type', po.type), children };
  }
  const hof = entry.hof;
  const addr = hof.addrs[0]?.value ?? '';
  let children = setzeText(node.children, DTD_ORDER.placeobj, 'ptitle', addr);
  children = reconcilePnames(children, [{ value: addr }]);
  children = setzeCoord(children, hof.lat, hof.long);
  children = reconcilePlacerefs(children, hof.villageId ? [{ placeId: hof.villageId }] : [], index);
  return { ...setzeKnotenAttr(node, 'type', 'Building'), children };
}

/** Synthetisiert einen NEUEN `<placeobj>` (Ort oder Building-Hof) für einen model-only-Eintrag. */
function synthPlaceobj(id: string, entry: PlaceEntry, index: GrampsRefIndex): XmlNode {
  const node = knoten('placeobj', '', [['handle', neuesHandle(id)], ['change', '0'], ['id', id]]);
  return updatePlaceobj(node, entry, index);
}

/** id (placeobj-`id` bzw. `hof.grampsId`) → Modell-Eintrag; Building-Höfe nur MIT grampsId. */
function buildPlaceMap(db: Database): Map<string, PlaceEntry> {
  const m = new Map<string, PlaceEntry>();
  for (const [id, po] of db.placeObjects) m.set(id, { place: po });
  for (const hof of db.hofObjects.values()) if (hof.grampsId) m.set(hof.grampsId, { hof });
  return m;
}

/** Durchlauf der `<places>`-Sektion: unverändert → identisch, geändert → aktualisiert, model-los → entfernt, model-only → synthetisiert. */
function verarbeitePlaces(root: XmlNode, map: Map<string, PlaceEntry>, index: GrampsRefIndex): XmlNode | null {
  const sec = firstChild(root, 'places');
  const gesehen = new Set<string>();
  const kinder: XmlNode[] = [];
  for (const node of sec ? sec.children : []) {
    if (node.tag !== 'placeobj') { kinder.push(node); continue; }
    const key = grampsKey(node);
    gesehen.add(key);
    const entry = map.get(key);
    if (!entry) continue; // im Modell gelöscht → weglassen
    kinder.push(placeobjUnveraendert(node, entry, index) ? node : updatePlaceobj(node, entry, index));
  }
  for (const [key, entry] of map) {
    if (gesehen.has(key)) continue;
    kinder.push(synthPlaceobj(key, entry, index));
  }
  if (!sec) return kinder.length ? knoten('places', '', [], kinder) : null;
  return { ...sec, children: kinder };
}

/**
 * Projiziert `db` in den GRAMPS-Baum. Unveränderte Records bleiben identisch; geänderte
 * behalten ihren Passthrough; neue kommen hinzu, gelöschte/verwaiste fallen weg. Reine
 * Funktion — der übergebene Baum (und `db`) werden nicht mutiert.
 */
export function applyDatabaseToXml(db: Database, doc: XmlDocument): XmlDocument {
  const root = doc.root;
  const index = buildWriteIndex(root, db);
  const wb = assignNewIds(db, root, index); // neue Event-/Zitat-ids+Handles, füllt den Index

  const ersetzt = new Map<string, XmlNode | null>();
  ersetzt.set('people', verarbeiteSektion(root, {
    section: 'people', item: 'person', map: db.individuals,
    project: projectPerson, gleich: personGleich,
    gleichNode: (n, cur) => personGleichNode(n, cur, wb),
    kinder: (orig, cur) => personKinder(orig, cur, wb),
  }));
  ersetzt.set('families', verarbeiteSektion(root, {
    section: 'families', item: 'family', map: db.families,
    project: (n) => projectFamily(n, index), gleich: familyGleich,
    gleichNode: (n, cur) => familyGleichNode(n, cur, wb),
    kinder: (orig, cur) => familyKinder(orig, cur, wb),
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

  // GETEILTE Records (Events/Zitate): Feld-Edits an Vorhandenen (BL-142) + Synthese Neuer
  // (BL-144). Die Re-Projektion zum Vergleich braucht dieselben Auflöser wie der Parser.
  const enrich = buildEnrichContext(root, index);
  ersetzt.set('events', verarbeiteGeteilteSektion(root, {
    section: 'events', item: 'event', map: buildEventMap(db),
    unveraendert: (n, cur) => eventUnveraendert(n, cur, enrich.resolvePlace, wb),
    kinder: (orig, cur) => eventKinder(orig, cur, wb),
    neu: [...wb.evId].map(([cur, id]) => ({ id, cur })),
    synth: (id, cur) => synthEvent(id, cur, wb),
  }));
  ersetzt.set('citations', verarbeiteGeteilteSektion(root, {
    section: 'citations', item: 'citation', map: buildCitationMap(db),
    unveraendert: (n, cur) => citationGleich(projectGrampsCitation(n, enrich.resolveSourceId), cur),
    kinder: (orig, cur) => citationKinder(orig, cur, index),
    neu: [...wb.citId].map(([cur, id]) => ({ id, cur })),
    synth: (id, cur) => synthCitation(id, cur, wb),
  }));

  // GETEILTE Records `<places>` (BL-143): Orts-/Building-Hof-Edits zurückschreiben.
  ersetzt.set('places', verarbeitePlaces(root, buildPlaceMap(db), index));

  const sektionen: XmlNode[] = [];
  for (const kind of root.children) {
    if (!ersetzt.has(kind.tag)) {
      sektionen.push(kind); // objects, header … unangetastet
      continue;
    }
    const neu = ersetzt.get(kind.tag);
    if (neu) sektionen.push(neu);
    ersetzt.delete(kind.tag);
  }
  // Sektionen, die es im Baum noch gar nicht gab (erste neue Quelle/erstes neue Event in
  // einer Datei ohne <sources>/<events>): ans Ende — die DTD-Sektionsreihenfolge ist frei.
  for (const neu of ersetzt.values()) if (neu) sektionen.push(neu);

  return { prolog: doc.prolog, root: bereinigeVerwaiste({ ...root, children: sektionen }) };
}
