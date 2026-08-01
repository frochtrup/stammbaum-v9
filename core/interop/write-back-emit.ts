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
  EvidenceEval,
  Family,
  Media,
  MediaCitation,
  MediaId,
  Person,
  Repository,
  Source,
} from '../model/types';
import type { ResearchTask, LogEntry, Hypothesis } from '../research/types';
import { isEvidenceEvalEmpty } from '../research/eval';
import { buildPlacForGedcom, eventYear, type PlaceContext } from '../places';
import type { GedNode } from './gedcom-tree';
import { EVAL_TAGS, evalAxisValue } from './enum-maps';
import { mimeToGedForm } from './media-mime';

/** Auflösung `mediaId` → globales `Media` (ADR-v9-124) — intern aus `db.media` gebaut. */
export type MediaLookup = ReadonlyMap<MediaId, Media>;

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

/**
 * Rekonstruiert eine OBJE-Referenz aus MediaCitation + globalem Media (ADR-v9-124).
 * Invers zu `parseMedia`/`collectMedia`, deckt BEIDE Standard-Formen ab:
 *  - **Pointer** (`mediaId` = Xref `@M1@`, 7.0-Pflicht): `n OBJE @M1@` + Link-Felder;
 *    FILE/FORM liegen im Top-Level-Record (Passthrough), werden hier NICHT dupliziert —
 *    so bleibt der Zeiger beim Editieren erhalten (kein Fabrizieren eines leeren FILE).
 *  - **Inline** (`mediaId` = FILE-Pfad, nur 5.5.1): `n OBJE`→`FILE`(→`FORM`→`MEDI`).
 * `extra` (z. B. `_SCBK`, 7.0-`CROP`) verbatim.
 */
function mediaNode(mc: MediaCitation, media?: Media): GedNode {
  // Wire-Form aus der Media-Herkunft (ADR-v9-125): Record → Pointer, Inline → inline.
  // Fallback (kein Lookup): Xref-Form der mediaId.
  const isPointer = media ? media.wireOrigin === 'record' : /^@.+@$/.test(mc.mediaId);
  const kids: GedNode[] = [];
  if (mc.title) kids.push(N('TITL', mc.title));
  if (!isPointer) {
    const file = media ? media.file : mc.mediaId;
    // Output-Rückübersetzung (ADR-v9-126): kanonisches MIME → GEDCOM-5.5.1-FORM-Endung.
    const form = media ? mimeToGedForm(media.form, file) : '';
    const type = media ? media.type : '';
    const fileKids: GedNode[] = [];
    if (form) fileKids.push(N('FORM', form, type ? [N('MEDI', type)] : []));
    kids.push(N('FILE', file, fileKids));
  }
  if (mc.note) kids.push(textNode('NOTE', mc.note));
  if (mc.date) kids.push(N('_DATE', mc.date));
  if (mc.primary) kids.push(N('_PRIM', 'Y'));
  for (const e of mc.extra) kids.push(e);
  return N('OBJE', isPointer ? mc.mediaId : '', kids);
}

/**
 * Top-Level-Medien-Record `0 @M@ OBJE` (ADR-v9-125) — invers zu `projectMediaRecord`.
 * FILE(→FORM→MEDI) + globaler TITL. Nur für `wireOrigin==='record'`-Medien.
 */
export function emitMediaRecord(m: Media): GedNode {
  const form = mimeToGedForm(m.form, m.file);
  const fileKids: GedNode[] = [];
  if (form) fileKids.push(N('FORM', form, m.type ? [N('MEDI', m.type)] : []));
  const kids: GedNode[] = [N('FILE', m.file, fileKids)];
  if (m.title) kids.push(N('TITL', m.title));
  return N('OBJE', '', kids, m.id);
}

/**
 * Evidenz-Bewertung → `_EVAL`-Subtree (Spec 12 §3, Wire-Format 13 §2.3); `parseEvidenceEval`
 * ist die Umkehr. Struktur/Reihenfolge nach v8-Oracle (`gedcom-writer.js` `_writeSourCits`):
 * die `_EVAL`-Zeile trägt KEINEN Wert, darunter `_STYP`,`_INFO`,`_EVID`,`_INFM` — jede Achse
 * nur, wenn gesetzt.
 *
 * `null` liefert eine LEERE Bewertung zurück: ohne dieses Gate (v8: `!evalIsEmpty(c.eval)`)
 * erzeugte jedes `eval`-Objekt ohne Inhalt bei jedem Speichern eine nackte `_EVAL`-Zeile und
 * bräche `out1===out2`. `isEvidenceEvalEmpty` ist die EINE Fundstelle dieser Frage
 * (core/research/eval.ts) — dieselbe, die die Zitat-Zeile für ihr Bewertungs-Signal nutzt.
 */
function evidenceEvalNode(ev: EvidenceEval | null): GedNode | null {
  if (isEvidenceEvalEmpty(ev)) return null;
  const kids: GedNode[] = [];
  for (const tag of EVAL_TAGS) {
    const v = evalAxisValue(ev!, tag);
    if (v) kids.push(N(tag, v));
  }
  return N('_EVAL', '', kids);
}

/** Zitat `1/2 SOUR @Sx@` + PAGE/QUAY/_EVAL/NOTE/OBJE (parseCitation ist die Umkehr). */
function citationNode(c: Citation, media?: MediaLookup): GedNode {
  const kids: GedNode[] = [];
  if (c.page) kids.push(N('PAGE', c.page));
  if (c.quay !== 0) kids.push(N('QUAY', String(c.quay)));
  // v8-Orakel-Position: direkt nach QUAY, vor NOTE (`_writeSourCits`).
  const evalKid = evidenceEvalNode(c.eval);
  if (evalKid) kids.push(evalKid);
  if (c.note) kids.push(textNode('NOTE', c.note));
  for (const m of c.media) kids.push(mediaNode(m, media?.get(m.mediaId)));
  return N('SOUR', c.sourceId, kids);
}

/**
 * PLAC-Wert für ein Event (INV-PLACE Mechanismus 2, ADR-v9-47): ist `placeId`/`hofId`
 * gesetzt, ist `ev.place` nur Projektions-Cache — der Writer liest ihn NICHT roh, sondern
 * berechnet den periodengerechten String LIVE über `buildPlacForGedcom`. Nur wenn kein
 * `ctx` vorliegt oder die Live-Berechnung null liefert (z. B. `hofId` gesetzt, HofObject
 * fehlt/stale — GUARD in build-plac.ts), fällt er auf den letzten bekannten `ev.place`
 * zurück. Ohne gesetzte `placeId`/`hofId` ist `ev.place` die Wire-Wahrheit (unverändert).
 */
function placValue(ev: Event, ctx?: PlaceContext): string {
  if (ctx && (ev.placeId !== null || ev.hofId !== null)) {
    const live = buildPlacForGedcom(ev, eventYear(ev), ctx);
    if (live !== null) return live;
  }
  return ev.place ?? '';
}

/** Ereignis-Knoten (BIRT/OCCU/…) — parseEvent ist die Umkehr; nur „seen" Ereignisse. */
function eventNode(ev: Event, ctx?: PlaceContext, media?: MediaLookup): GedNode {
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
    kids.push(N('PLAC', placValue(ev, ctx), placKids));
  }
  // ADDR bleibt bewusst byte-identisch (Fill-if-empty-Regel, §7/§4.2 REPROJECT) — NICHT
  // live neu berechnet wie PLAC: die Hof-Adresse ist stärker nutzer-/quellen-eigen.
  if (ev.addr) kids.push(textNode('ADDR', ev.addr));
  if (ev.note) kids.push(textNode('NOTE', ev.note));
  for (const c of ev.citations) kids.push(citationNode(c, media));
  for (const m of ev.media) kids.push(mediaNode(m, media?.get(m.mediaId)));
  return N(ev.type, ev.value, kids);
}

/**
 * Forschungsaufgabe (ResearchTask) → `1 _TASK`-Block (Spec 12 §1, Wire-Format 13 §2.3).
 * parseTask (gedcom-parse.ts) ist die Umkehr. Reihenfolge/Tags nach v8-Oracle
 * (`gedcom-writer.js` `_writeINDIExt`): `_CAT`, `_DONE` (IMMER, 0/1), `_TSTAT`, `_DATE`,
 * `_ID`, `SOUR`. `_DONE` wird mitgeschrieben (Spec nennt den Tag), obwohl es beim Lesen
 * aus `_TSTAT` abgeleitet wird — reine Redundanz für fremde Leser.
 */
function taskNode(t: ResearchTask): GedNode {
  const kids: GedNode[] = [];
  if (t.category) kids.push(N('_CAT', t.category));
  kids.push(N('_DONE', t.done ? '1' : '0'));
  kids.push(N('_TSTAT', t.status));
  if (t.created) kids.push(N('_DATE', t.created));
  if (t.id) kids.push(N('_ID', t.id));
  if (t.sourceRef) kids.push(N('SOUR', t.sourceRef));
  return N('_TASK', t.text, kids);
}

/**
 * Forschungsprotokoll-Eintrag (LogEntry) → `1 _RLOG`-Block (Spec 12 §2, Wire-Format 13 §2.3).
 * parseLogEntry ist die Umkehr. Reihenfolge nach v8-Oracle: DATE (Standard-Tag, NICHT `_DATE`),
 * REPO, SOUR, `_QUERY`, `_RESULT`, NOTE (CONT-fähig), `_TASKID` (v9-Erweiterung). LogEntry hat
 * keine eigene id (Reihenfolge im Array = Reihenfolge in der Datei).
 */
function logEntryNode(l: LogEntry): GedNode {
  const kids: GedNode[] = [];
  if (l.date) kids.push(N('DATE', l.date));
  if (l.repoRef) kids.push(N('REPO', l.repoRef));
  if (l.sourceRef) kids.push(N('SOUR', l.sourceRef));
  if (l.query) kids.push(N('_QUERY', l.query));
  kids.push(N('_RESULT', l.result));
  if (l.note) kids.push(textNode('NOTE', l.note));
  if (l.taskId) kids.push(N('_TASKID', l.taskId));
  return N('_RLOG', '', kids);
}

/**
 * Hypothese (Hypothesis) → `1 _HYPO`-Block (Spec 12 §4, Wire-Format 13 §2.3).
 * parseHypothesis ist die Umkehr. Reihenfolge nach v8-Oracle: `_ID`, `_HSTAT`, `_HWGT`,
 * `_DATE` (eigener Tag, wie bei _TASK), `_HKIND`/`_HREF` (v9-Erweiterung, ADR-v9-174 —
 * nur bei kind='identity' bzw. vorhandenen refs), dann je evidence[]-Item ein `2 SOUR`
 * (+ optional `3 PAGE`), zuletzt `_RATIO`/`_CONCL` (beide CONT-fähig).
 */
function hypothesisNode(h: Hypothesis): GedNode {
  const kids: GedNode[] = [];
  if (h.id) kids.push(N('_ID', h.id));
  kids.push(N('_HSTAT', h.status));
  kids.push(N('_HWGT', h.weight));
  if (h.created) kids.push(N('_DATE', h.created));
  if (h.kind === 'identity') kids.push(N('_HKIND', 'IDENT'));
  for (const r of h.refs) kids.push(N('_HREF', r));
  for (const e of h.evidence) {
    const ekids = e.page ? [N('PAGE', e.page)] : [];
    kids.push(N('SOUR', e.sourceId, ekids));
  }
  if (h.rationale) kids.push(textNode('_RATIO', h.rationale));
  if (h.conclusion) kids.push(textNode('_CONCL', h.conclusion));
  return N('_HYPO', h.text, kids);
}

// --- Person (INDI) ----------------------------------------------------------------------

/** Synthetisiert einen INDI-Record in kanonischer Reihenfolge (GEDCOM.md §1 INDI).
 *  `ctx` (optional): PlaceContext für die Live-PLAC-Berechnung (ADR-v9-47). Ohne ctx
 *  fällt die PLAC-Emission auf den `ev.place`-Cache zurück. */
export function emitPerson(p: Person, ctx?: PlaceContext, media?: MediaLookup): GedNode {
  const kids: GedNode[] = [];

  if (p.name || p.given || p.surname || p.prefix || p.suffix || p.nick || p.nameCitations.length) {
    const nameKids: GedNode[] = [];
    if (p.given) nameKids.push(N('GIVN', p.given));
    if (p.surname) nameKids.push(N('SURN', p.surname));
    if (p.prefix) nameKids.push(N('NPFX', p.prefix));
    if (p.suffix) nameKids.push(N('NSFX', p.suffix));
    if (p.nick) nameKids.push(N('NICK', p.nick));
    for (const c of p.nameCitations) nameKids.push(citationNode(c, media));
    kids.push(N('NAME', p.name, nameKids));
  }
  if (p.sex && p.sex !== 'U') kids.push(N('SEX', p.sex));
  if (p.title) kids.push(N('TITL', p.title));
  if (p.religion) kids.push(N('RELI', p.religion));
  if (p.restriction) kids.push(N('RESN', p.restriction));
  if (p.email) kids.push(N('EMAIL', p.email));
  if (p.www) kids.push(N('WWW', p.www));
  if (p.uid) kids.push(N('_UID', p.uid));

  if (p.birth.seen) kids.push(eventNode(p.birth, ctx, media));
  if (p.chr.seen) kids.push(eventNode(p.chr, ctx, media));
  if (p.death.seen) {
    const dn = eventNode(p.death, ctx, media);
    if (p.cause) dn.children.push(N('CAUS', p.cause));
    kids.push(dn);
  }
  if (p.buri.seen) kids.push(eventNode(p.buri, ctx, media));
  for (const ev of p.events) kids.push(eventNode(ev, ctx, media));

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
    for (const c of assoc.citations) akids.push(citationNode(c, media));
    kids.push(N('ASSO', assoc.personRef ? assoc.personRef : '', akids));
  }

  for (const m of p.media) kids.push(mediaNode(m, media?.get(m.mediaId)));

  if (p.noteText) kids.push(textNode('NOTE', p.noteText));
  for (const nr of p.noteRefs) kids.push(N('NOTE', nr));

  for (const c of p.topLevelCitations) kids.push(citationNode(c, media));

  for (const ex of p.exids) {
    const ekids = ex.type ? [N('TYPE', ex.type)] : [];
    kids.push(N('REFN', ex.value, ekids));
  }
  // 5.5.1-BASIS: `1 _DATE`. `CREA` gibt es in 5.5.1 gar nicht (0 Vorkommen im ganzen
  // Dokument) — es unbedingt zu schreiben hieße, einen 7.0-Tag in eine 5.5.1-Datei zu
  // setzen. `ged7-adapter` macht daraus `1 CREA / 2 DATE` (BL-243).
  if (p.createdDate) kids.push(N('_DATE', p.createdDate));
  if (p.lastChanged) kids.push(chanNode(p.lastChanged));

  for (const t of p.tasks) kids.push(taskNode(t));
  for (const l of p.researchLog) kids.push(logEntryNode(l));
  for (const h of p.hypotheses) kids.push(hypothesisNode(h));

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

export function emitFamily(f: Family, ctx?: PlaceContext, media?: MediaLookup): GedNode {
  const kids: GedNode[] = [];
  if (f.husband) kids.push(N('HUSB', f.husband));
  if (f.wife) kids.push(N('WIFE', f.wife));
  for (const cid of f.children) kids.push(N('CHIL', cid));
  if (f.marriage.seen) kids.push(eventNode(f.marriage, ctx, media));
  if (f.engagement.seen) kids.push(eventNode(f.engagement, ctx, media));
  for (const ev of f.events) kids.push(eventNode(ev, ctx, media));
  if (f.noteText) kids.push(textNode('NOTE', f.noteText));
  for (const c of f.citations) kids.push(citationNode(c, media));
  if (f.lastChanged) kids.push(chanNode(f.lastChanged));
  for (const t of f.tasks) kids.push(taskNode(t));
  for (const l of f.researchLog) kids.push(logEntryNode(l));
  for (const h of f.hypotheses) kids.push(hypothesisNode(h));
  return N('FAM', '', kids, f.id);
}

// --- Source (SOUR) ----------------------------------------------------------------------

export function emitSource(s: Source, media?: MediaLookup): GedNode {
  const kids: GedNode[] = [];
  // Freitext-Felder CONT-fähig (textNode): GRAMPS-Quellen können mehrzeilige ABBR/AUTH/PUBL
  // tragen; ein roher `\n` im value erzeugte sonst eine level-lose Fortsetzungszeile
  // (malformed GEDCOM). Für einzeilige Werte identisch zu N(tag,value) — native unberührt.
  if (s.abbr) kids.push(textNode('ABBR', s.abbr));
  if (s.title) kids.push(textNode('TITL', s.title));
  if (s.author) kids.push(textNode('AUTH', s.author));
  // Erfassungsdatum (BL-243): im 5.5.1-BASIS-Baum als `1 _DATE` — der einzige legale Weg,
  // den Kontext zu erweitern (5.5.1 Kap. 1: standardisierte Tags nur im gezeigten
  // Kontext, Erweiterung ausschließlich über `_`-Tags). Für 7.0 macht `ged7-adapter`
  // daraus `1 CREA / 2 DATE`; ein `1 DATE` unter SOUR entsteht nie mehr.
  if (s.createdDate) kids.push(N('_DATE', s.createdDate));
  if (s.publisher) kids.push(textNode('PUBL', s.publisher));
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
  // `SOUR.DATA` (BL-217) — Grammatik-Reihenfolge: EVEN*, AGNC, dann der Passthrough-Rest.
  // `eventTypes` ist die Enum-LISTE (`BIRT, MARR, DEAT`) und steht als Wert am EVEN selbst.
  if (s.dataEvents.length || s.agnc || s.dataExtra.length) {
    const dkids: GedNode[] = [];
    for (const de of s.dataEvents) {
      const ekids: GedNode[] = [];
      if (de.date) ekids.push(N('DATE', de.date));
      if (de.place) ekids.push(N('PLAC', de.place));
      dkids.push(N('EVEN', de.eventTypes, ekids));
    }
    if (s.agnc) dkids.push(N('AGNC', s.agnc));
    dkids.push(...s.dataExtra);
    kids.push(N('DATA', '', dkids));
  }
  for (const ex of s.externalRefs) {
    const ekids = ex.type ? [N('TYPE', ex.type)] : [];
    kids.push(N('REFN', ex.value, ekids));
  }
  for (const m of s.media) kids.push(mediaNode(m, media?.get(m.mediaId)));
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
