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
  makeMedia,
  makeMediaCitation,
} from '../model/factory';
import { makeTask } from '../research/task';
import { makeLogEntry } from '../research/log';
import { makeHypothesis } from '../research/hypothesis';
import { makeEvidenceEval } from '../research/eval';
import { applyEvalAxis, isEvalTag, logResultFromWire } from './enum-maps';
import type {
  ResearchTask,
  TaskStatus,
  LogEntry,
  LogResult,
  Hypothesis,
  HypothesisStatus,
  HypothesisWeight,
  HypothesisKind,
  EvidenceRef,
} from '../research/types';
import { normalizeSex } from '../model/sex';
import { splitGedcomName } from '../model/name-parts';
import type {
  Person,
  Family,
  Source,
  Repository,
  Note,
  Event,
  Citation,
  EvidenceEval,
  Media,
  MediaCitation,
  MediaId,
  PersonName,
  Quay,
} from '../model/types';
import { parseTree, child, children, childValue, unescapeAt } from './gedcom-tree';
import type { GedNode } from './gedcom-tree';
import { formToMime } from './media-mime';
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

/**
 * Parst einen `3 _EVAL`-Subtree unter einem Zitat in eine EvidenceEval (Spec 12 §3,
 * Wire-Format 13 §2.3). Struktur (v8-Oracle, `gedcom-writer.js` `_writeSourCits` +
 * `gedcom-parser.js` `_parseSourCitSub`):
 *   3 _EVAL                    (Zeile OHNE Wert)
 *   4 _STYP original|derivative|authored
 *   4 _INFO primary|secondary|undetermined
 *   4 _EVID direct|indirect|negative
 *   4 _INFM <Freitext oder @I…@>
 * Die vier Achsen werden MODELLIERT herausgelöst (Spec 13 §2.3, `_REPO_MODELLED`-Lehre) —
 * sonst schriebe der Writer sie neben den vom Baum getragenen Original-Subtree.
 * Ein UNBEKANNTES `_EVAL`-Kind (`4 _FOO …`) bleibt hier unangetastet und überlebt über den
 * Passthrough-Backbone (INV-PT) — wie jedes andere nicht modellierte Zitat-Kind auch.
 * Ein leeres `3 _EVAL` ergibt das leere Gerüst; der Writer schreibt daraus NICHTS
 * (isEvidenceEvalEmpty — v8-Gate `!evalIsEmpty(c.eval)`), die Zeile fällt also erst dann
 * weg, wenn der Record ohnehin aus dem Modell neu erzeugt wird.
 */
function parseEvidenceEval(node: GedNode): EvidenceEval {
  const ev = makeEvidenceEval();
  for (const c of node.children) if (isEvalTag(c.tag)) applyEvalAxis(ev, c.tag, c.value);
  return ev;
}

function parseCitation(sourNode: GedNode): Citation {
  const sid = unescapeAt(sourNode.value);
  const cit = makeCitation(sid);
  cit.page = childValue(sourNode, 'PAGE');
  // Tristate (BL-302): ohne `QUAY`-Zeile bleibt `quay` null — vorher fiel „keine
  // Bewertung" mit der ausdrücklichen `QUAY 0` („unzuverlässig") zusammen.
  const quayRaw = childValue(sourNode, 'QUAY');
  if (quayRaw !== '') {
    const q = parseInt(quayRaw, 10);
    if (q >= 0 && q <= 3) cit.quay = q as Quay;
  }
  const evalNode = child(sourNode, '_EVAL');
  if (evalNode) cit.eval = parseEvidenceEval(evalNode);
  const noteNode = child(sourNode, 'NOTE');
  if (noteNode) cit.note = collectText(noteNode);
  for (const obje of children(sourNode, 'OBJE')) {
    cit.media.push(parseMedia(obje));
  }
  if (cit.media.length) cit.deepLinkUrl = cit.media[0].mediaId;
  return cit;
}

// OBJE-Kinder mit eigenem Modell-Feld (parseMedia/mediaNode sind zueinander invers).
// FILE trägt zusätzlich das globale FORM/MEDI (→ db.media, s. collectMedia). Alles
// andere (z. B. `_SCBK`) landet verbatim in MediaCitation.extra (INV-PT, edit-sicher).
const RECOGNIZED_OBJE_SUB = new Set(['FILE', 'TITL', 'NOTE', '_DATE', '_PRIM']);

/**
 * Projiziert eine OBJE-Referenz in eine referenz-spezifische MediaCitation (ADR-v9-124).
 * Deckt BEIDE vom Standard erlaubten Formen ab:
 *  - **Pointer** `n OBJE @M1@` (5.5.1 optional, **7.0 die einzige Form**): `mediaId` = der
 *    Xref-Wert; die globalen Felder liegen im Top-Level-`0 @M1@ OBJE`-Record.
 *  - **Inline** `n OBJE`→`FILE`→… (nur 5.5.1): `mediaId` = der FILE-Pfad (content-adressiert).
 * Globale Felder (form/type) leben in `db.media` (`collectMedia`). Unbekannte Kinder
 * (z. B. `_SCBK`, 7.0-`CROP`) bleiben in `extra`. Kontextfrei (Dirty-Check-tauglich).
 */
function parseMedia(objeNode: GedNode): MediaCitation {
  const fileNode = child(objeNode, 'FILE');
  const noteNode = child(objeNode, 'NOTE');
  // Pointer-Form: der Wert (`@M1@`) IST die Identität; inline: der FILE-Pfad.
  const mediaId = objeNode.value || (fileNode ? fileNode.value : '');
  // Was DIESE Fundstelle an globalen Datenzeilen trug (BL-306) — am Knoten gefragt, nicht am
  // Wert, und strikt an der Position, die `mediaNode` auch emittiert (`FILE`→`FORM`→`MEDI`).
  // Ein `MEDI` direkt unter `OBJE` ist un-modelliert und reist als `extra` durch; es hier
  // mitzuzählen erzeugte beim Neubau eine zweite MEDI-Zeile daneben.
  const formNode = fileNode ? child(fileNode, 'FORM') : null;
  return makeMediaCitation(mediaId, {
    title: childValue(objeNode, 'TITL'),
    date: childValue(objeNode, '_DATE'),
    note: noteNode ? collectText(noteNode) : '',
    primary: childValue(objeNode, '_PRIM') === 'Y',
    formSeen: formNode !== null,
    typeSeen: formNode !== null && child(formNode, 'MEDI') !== null,
    extra: objeNode.children.filter((c) => !RECOGNIZED_OBJE_SUB.has(c.tag)),
  });
}

/**
 * Assembliert `db.media` in einem Post-Pass über den Passthrough-Baum (ADR-v9-124).
 * Identität je OBJE, die eigene Mediendaten trägt:
 *  - **Top-Level-Record** `0 @M1@ OBJE` → `id` = Xref (`@M1@`) — die kanonische Identität
 *    der Pointer-Referenzen.
 *  - **Inline-OBJE** `n OBJE`→`FILE` (kein Xref, kein Pointer-Wert) → `id` = FILE-Pfad.
 *  - **Pointer-Referenzen** (`n OBJE @M1@`, Wert gesetzt, kein Xref) tragen KEINE eigenen
 *    Mediendaten → übersprungen (ihr Ziel-Record wird separat erfasst).
 * Medientyp = `MEDI` unter `FORM` (Standard; `_TYPE` ist eine v8-interne Größe, kein
 * GEDCOM-Tag). Kontextfrei, damit der isolierte Einzel-Record-Parse unberührt bleibt.
 */
/**
 * Projiziert EINE OBJE, die eigene Mediendaten trägt, in ein `Media` (ADR-v9-125) —
 * Top-Level-Record (`node.xref` gesetzt, `wireOrigin='record'`, globaler TITL) ODER
 * inline-OBJE mit FILE (`wireOrigin='inline'`). Eine reine Pointer-Referenz
 * (`n OBJE @M1@`, Wert gesetzt, kein Xref) trägt keine Daten → `null`. Kontextfrei
 * (Dirty-Check-tauglich), invers zu `emitMediaRecord`/`mediaNode`.
 */
export function projectMediaRecord(node: GedNode): Media | null {
  if (node.tag !== 'OBJE') return null;
  const fileNode = child(node, 'FILE');
  const isRecord = !!node.xref;
  const id = node.xref || (!node.value && fileNode ? fileNode.value : '');
  if (!id) return null;
  const formNode = fileNode ? child(fileNode, 'FORM') : null;
  const file = fileNode ? fileNode.value : id;
  // Input-Kanonisierung (ADR-v9-126): FORM-Endung → einheitliches MIME (Narrow-Waist).
  // Der Rohwert bleibt daneben stehen (BL-290): die Kanonisierung ist nicht umkehrbar,
  // ohne ihn schriebe jedes Speichern `JPEG` als `jpg` zurück.
  const formWire = formNode ? formNode.value : '';
  const form = formToMime(formWire, file);
  const type = (formNode ? childValue(formNode, 'MEDI') : '') || childValue(node, 'MEDI');
  // Globaler Titel NUR bei Top-Level-Records (TITL unter FILE [7.0] oder unter OBJE [5.5.1]);
  // bei Inline liegt der Titel referenz-spezifisch auf der MediaCitation.
  const titleNode = isRecord ? (child(node, 'TITL') ?? (fileNode ? child(fileNode, 'TITL') : null)) : null;
  return makeMedia(id, {
    file,
    form,
    formWire,
    type,
    // Der Vergleichswert für „hat jemand den Typ angefasst?" (BL-306) — beim Laden gleich
    // `type`, danach der eingefrorene Dateistand.
    typeWire: type,
    title: titleNode ? collectText(titleNode) : '',
    wireOrigin: isRecord ? 'record' : 'inline',
  });
}

/**
 * Die OBJE-Knoten, die `db.media` tatsächlich DEFINIEREN — erstes Vorkommen in Dokument-
 * ordnung gewinnt. `collectMedia` baut die Medien-Map daraus, und der Write-Back stellt
 * über dieselbe Menge fest, WELCHE Fundstelle ein globaler Medien-Edit betrifft (BL-301).
 *
 * Beides aus EINER Regel, weil die Vorkommen einander widersprechen können: in der
 * 5.5.1-Inline-Form ist die Datei die Identität, dieselbe Datei kann aber mehrfach mit
 * ABWEICHENDEN Untertags dastehen (im Realbestand: dieselbe Matricula-URL 3× ohne `FORM`
 * in Zitaten, 1× mit `FORM URL` unter der Quelle). Wer die Frage „hat sich das Medium
 * geändert?" gegen ein nicht definierendes Vorkommen stellt, bekommt einen Unterschied
 * gemeldet, den nie ein Nutzer gemacht hat — und schreibt die Datei um (ADR-v9-197).
 */
export function definingMediaNodes(roots: GedNode[]): Set<GedNode> {
  const gesehen = new Set<MediaId>();
  const out = new Set<GedNode>();
  const visit = (node: GedNode): void => {
    const m = projectMediaRecord(node);
    if (m && !gesehen.has(m.id)) { gesehen.add(m.id); out.add(node); }
    for (const c of node.children) visit(c);
  };
  for (const rec of roots) visit(rec);
  return out;
}

function collectMedia(roots: GedNode[]): Map<MediaId, Media> {
  const out = new Map<MediaId, Media>();
  for (const node of definingMediaNodes(roots)) {
    const m = projectMediaRecord(node);
    if (m) out.set(m.id, m);
  }
  return out;
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

  // Tristate wie DATE/PLAC (BL-292): der Knoten kann leer sein und trotzdem `ADR1`/`CITY`/
  // `POST`/`CTRY` tragen. `''` hieße „kein ADDR" und ließe den Writer die Zeile weglassen —
  // mit ihr fiele der ganze un-modellierte Teilbaum darunter.
  const addrNode = child(node, 'ADDR');
  ev.addr = addrNode ? collectText(addrNode) : null;

  const noteNode = child(node, 'NOTE');
  if (noteNode) ev.note = collectText(noteNode);

  for (const s of children(node, 'SOUR')) ev.citations.push(parseCitation(s));
  for (const o of children(node, 'OBJE')) ev.media.push(parseMedia(o));

  return ev;
}

/**
 * Parst einen `1 _TASK`-Block in einen ResearchTask (Spec 12 §1, Wire-Format 13 §2.3).
 * Struktur (v8-Oracle-Format, `gedcom-writer.js` `_writeINDIExt`):
 *   1 _TASK <text>
 *   2 _CAT <category>
 *   2 _DONE <0|1>            (eigener v8-Tag; `done` wird aus status abgeleitet, s. u.)
 *   2 _TSTAT <todo|doing|done>
 *   2 _DATE <created>         (EIGENER Tag `_DATE`, NICHT Standard-`DATE`)
 *   2 _ID <id>
 *   2 SOUR <sourceRef>        (Standard-Tag, roher @Sxx@-Xref — v9-Ergänzung ADR-v9-36)
 * `_TASK` MUSS modelliert (aus dem Passthrough herausgelöst) werden — sonst Doppelschreibung
 * pro Roundtrip (`_REPO_MODELLED`-Lehre, Spec 13 §2.3).
 *
 * `_DONE` und `_TSTAT` sind ZWEI Tags nebeneinander, keine Ablösung: `_DONE` ist v8s
 * Erledigt-Haken, `_TSTAT` der später dazugekommene Kanban-Status (v8 `RES-PROJ 3a`).
 * v8s Parser liest beide unabhängig. `_DONE` galt hier ursprünglich als NICHT gelesen
 * (aus status abgeleitet, INV Spec 12 §1) — seit BL-302 ist es der Rückfall, wenn
 * `_TSTAT` fehlt, s. den Kommentar in der Funktion. Der Writer schreibt beide.
 */
function parseTask(node: GedNode): ResearchTask {
  const raw = childValue(node, '_TSTAT');
  // `_DONE` als Rueckfall, wenn `_TSTAT` fehlt (BL-302). v8s eigener Parser liest ihn
  // (`gedcom-parser.js`: `x._curTask.done = val === '1'`), und Aufgaben aus der Zeit VOR
  // v8 sw v307 tragen nur `_DONE`. Ohne den Rueckfall wurde eine erledigte Aufgabe beim
  // naechsten Speichern wieder offen — der Tag stand da, nur las ihn niemand.
  const status: TaskStatus =
    raw === 'doing' || raw === 'done' || raw === 'todo'
      ? raw
      : childValue(node, '_DONE') === '1' ? 'done' : 'todo';
  const t = makeTask(childValue(node, '_ID'), {
    text: collectText(node),
    category: childValue(node, '_CAT'),
    status,
    created: childValue(node, '_DATE'),
  });
  const sour = child(node, 'SOUR');
  if (sour) t.sourceRef = unescapeAt(sour.value) as ResearchTask['sourceRef'];
  return t;
}

/**
 * Parst einen `1 _RLOG`-Block in einen LogEntry (Spec 12 §2, Wire-Format 13 §2.3).
 * Struktur (v8-Oracle, `gedcom-writer.js`/`gedcom-parser.js`):
 *   1 _RLOG
 *   2 DATE <date>            (Standard-Tag DATE — NICHT `_DATE`, anders als bei _TASK)
 *   2 REPO <repoRef>         (roher @Rxx@-Xref)
 *   2 SOUR <sourceRef>       (roher @Sxx@-Xref)
 *   2 _QUERY <query>
 *   2 _RESULT <found|partial|notfound|pending>
 *   2 NOTE <note>            (CONT-fähig, mehrzeilig)
 *   2 _TASKID <taskId>       (v9-Erweiterung, ADR-v9-36 — kein Oracle-Vorbild)
 * LogEntry hat KEINE eigene id (index-adressiert, v8-Parität). Aus dem Passthrough
 * herausgelöst (INV-PT/§2.3, `_REPO_MODELLED`-Lehre).
 */
function parseLogEntry(node: GedNode): LogEntry {
  // Beide Schreibweisen (BL-302): die DATEI traegt v8s `not-found`, das Modell `notfound`.
  const result = (logResultFromWire(childValue(node, '_RESULT')) || 'pending') as LogResult;
  const repo = child(node, 'REPO');
  const sour = child(node, 'SOUR');
  const noteNode = child(node, 'NOTE');
  return makeLogEntry({
    date: childValue(node, 'DATE'),
    repoRef: (repo ? unescapeAt(repo.value) : '') as LogEntry['repoRef'],
    sourceRef: (sour ? unescapeAt(sour.value) : '') as LogEntry['sourceRef'],
    query: childValue(node, '_QUERY'),
    result,
    note: noteNode ? collectText(noteNode) : '',
    taskId: childValue(node, '_TASKID'),
  });
}

/**
 * Parst einen `1 _HYPO`-Block in eine Hypothesis (Spec 12 §4, Wire-Format 13 §2.3).
 * Struktur (v8-Oracle, `gedcom-writer.js`/`gedcom-parser.js`):
 *   1 _HYPO <text>
 *   2 _ID <id>
 *   2 _HSTAT <open|confirmed|rejected>
 *   2 _HWGT <low|medium|high>
 *   2 _DATE <created>        (EIGENER Tag `_DATE`, wie bei _TASK)
 *   2 _HKIND IDENT           (v9-Erweiterung, ADR-v9-174 — nur dieser eine Wert; fehlt bei
 *                             einer freien Hypothese. Kein Oracle-Vorbild, wie _TASKID)
 *   2 _HREF <@I…@|@F…@>      (v9-Erweiterung, WIEDERHOLBAR — weitere betroffene Datensätze)
 *   2 SOUR <sourceId>        (WIEDERHOLBAR — ein evidence[]-Item pro Block)
 *   3 PAGE <page>            (gehört zum vorangehenden SOUR-Block)
 *   2 _RATIO <rationale>     (CONT-fähig)
 *   2 _CONCL <conclusion>    (CONT-fähig)
 * Aus dem Passthrough herausgelöst (INV-PT/§2.3).
 */
function parseHypothesis(node: GedNode): Hypothesis {
  const rawStat = childValue(node, '_HSTAT');
  const status: HypothesisStatus =
    rawStat === 'confirmed' || rawStat === 'rejected' || rawStat === 'open' ? rawStat : 'open';
  const rawWgt = childValue(node, '_HWGT');
  const weight: HypothesisWeight =
    rawWgt === 'low' || rawWgt === 'high' || rawWgt === 'medium' ? rawWgt : 'medium';
  const evidence: EvidenceRef[] = [];
  for (const s of children(node, 'SOUR')) {
    evidence.push({
      sourceId: unescapeAt(s.value) as EvidenceRef['sourceId'],
      page: childValue(s, 'PAGE'),
    });
  }
  const ratio = child(node, '_RATIO');
  const concl = child(node, '_CONCL');
  // Unbekannte _HKIND-Werte fallen bewusst auf 'free' zurück (wie _HSTAT/_HWGT): ein
  // fremder oder künftiger Wert darf nicht dazu führen, dass ein Filter ihn als
  // Identitäts-Aussage liest.
  const kind: HypothesisKind = childValue(node, '_HKIND') === 'IDENT' ? 'identity' : 'free';
  return makeHypothesis(childValue(node, '_ID'), {
    kind,
    refs: children(node, '_HREF').map((r) => unescapeAt(r.value)),
    text: collectText(node),
    status,
    weight,
    created: childValue(node, '_DATE'),
    evidence,
    rationale: ratio ? collectText(ratio) : '',
    conclusion: concl ? collectText(concl) : '',
  });
}

/** GED7-`ROLE`: die `PHRASE` (Wortlaut) schlägt den Enum-Wert; sonst der Enum-Wert selbst. */
function roleFromGed7(asso: GedNode): string {
  const role = child(asso, 'ROLE');
  if (!role) return '';
  return childValue(role, 'PHRASE') || role.value;
}

/**
 * Eine WEITERE `1 NAME`-Zeile → `PersonName` (BL-292). Bewusst OHNE die Untertag-Ergänzung
 * aus dem NAME-Wert (ADR-v9-112), die der Hauptname macht: die ist eine Anzeige-Bequemlichkeit
 * und erzeugte hier `GIVN`/`SURN`-Zeilen, die in der Quelle nicht standen — eine
 * byte-verändernde Ergänzung ohne Anlass (ADR-v9-197). Eine Namensform reist so, wie sie kam.
 */
function parsePersonName(node: GedNode): PersonName {
  return {
    nameRaw: node.value,
    given: childValue(node, 'GIVN'),
    surname: childValue(node, 'SURN'),
    prefix: childValue(node, 'NPFX'),
    suffix: childValue(node, 'NSFX'),
    type: childValue(node, 'TYPE'),
    citations: children(node, 'SOUR').map(parseCitation),
  };
}

function parsePerson(rec: GedNode): Person {
  const id = rec.xref ?? '';
  const p = makePerson(id);
  let nameGesehen = false;

  for (const c of rec.children) {
    switch (c.tag) {
      case 'NAME': {
        // Erste NAME-Zeile = Hauptname, jede weitere eine Namensform (BL-292). Vorher
        // wurden sie stillschweigend verworfen — 95 Zeilen samt Untertags und Zitaten in
        // `Unsere Familie 2026.ged`. Der Modell-Slot `extraNames` existierte bereits, wurde
        // aber von KEINEM Parser gefüllt (dieselbe Lücke wie `dataEvents`, ADR-v9-151).
        if (nameGesehen) { p.extraNames.push(parsePersonName(c)); break; }
        nameGesehen = true;
        {
          p.name = c.value;
          p.given = childValue(c, 'GIVN');
          p.surname = childValue(c, 'SURN');
          p.prefix = childValue(c, 'NPFX');
          p.suffix = childValue(c, 'NSFX');
          // Stand der Untertag in der DATEI? (BL-304) Nach der Ergänzung unten ist das nicht
          // mehr ablesbar — und genau diese Auskunft braucht der Writer, um nicht 200 Zeilen
          // zu schreiben, die die Quelle nie hatte. Am KNOTEN gefragt, nicht am Wert: ein
          // `2 GIVN` OHNE Wert ist vorhanden, sein `childValue` aber ''.
          p.givenSeen = child(c, 'GIVN') !== null;
          p.surnameSeen = child(c, 'SURN') !== null;
          p.suffixSeen = child(c, 'NSFX') !== null;
          // Untertags sind optional (ADR-v9-112): fehlende Teile aus dem NAME-Wert
          // ergänzen, sofern er eindeutig zerlegbar ist. FELDWEISE, nicht als Block —
          // eine Quelle darf `GIVN Anna` bewusst enger setzen als der NAME-Wert
          // (`Anna Maria /Decker/`) und trotzdem `SURN` weglassen. Ein explizit
          // gesetztes Untertag wird nie überschrieben.
          const parts = splitGedcomName(c.value);
          if (parts) {
            if (!p.given) p.given = parts.given;
            if (!p.surname) p.surname = parts.surname;
            if (!p.suffix) p.suffix = parts.suffix;
          }
          if (!p.nick) p.nick = childValue(c, 'NICK');
          p.nameType = childValue(c, 'TYPE');
          for (const s of children(c, 'SOUR')) p.nameCitations.push(parseCitation(s));
        }
        break;
      }
      case 'SEX':
        p.sex = normalizeSex(c.value);
        // Nur bei einem der drei GUELTIGEN Werte (BL-302). Ein fremder Wert (`1 SEX X`)
        // normalisiert zu `U`; ihn als "gesehen" zu fuehren, schriebe `SEX U` zurueck —
        // eine erfundene Aussage. Er faellt weiter weg, wie bisher.
        p.sexSeen = ['M', 'F', 'U'].includes(c.value.trim().toUpperCase());
        break;
      case 'TITL':
        p.title = c.value;
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
          // GED7 trägt die Rolle als Enum in `ROLE`, den Wortlaut in dessen `PHRASE`
          // (BL-241). Der Wortlaut gewinnt: „Taufpate" ist die Aussage, `GODP` ihre
          // Kodierung — läse man das Enum, ginge beim Rückschreiben nach 5.5.1 die
          // Formulierung des Bearbeiters verloren.
          role: childValue(c, 'RELA') || roleFromGed7(c),
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
      case 'CREA': // 7.0
        p.createdDate = childValue(c, 'DATE');
        break;
      case '_DATE': // 5.5.1 kennt kein CREA (BL-243) — gleiche Bedeutung, anderer Tag
        p.createdDate = c.value;
        break;
      case '_TASK':
        p.tasks.push(parseTask(c));
        break;
      case '_RLOG':
        p.researchLog.push(parseLogEntry(c));
        break;
      case '_HYPO':
        p.hypotheses.push(parseHypothesis(c));
        break;
      default:
        // Bekannte Ereignis-Tags → events[]; alles andere bleibt im Baum (Passthrough).
        if (isEventTag(c.tag)) p.events.push(parseEvent(c));
        break;
    }
  }
  return p;
}

// `RELI` steht hier, seit BL-289 es vom Skalarfeld zum Ereignis gemacht hat: die Quelle
// haengt Datum, Ort und Quellenzitate darunter (110 Zeilen, 119 `SOUR` in
// `Unsere Familie 2026.ged`) — ein String konnte davon nur die Konfession halten, der Rest
// ueberlebte bloss als Passthrough und war weder sichtbar noch editierbar (ADR-v9-156
// hatte die Diagnose bereits gestellt, ohne die Konsequenz zu ziehen).
const EVENT_TAGS = new Set([
  'OCCU', 'RESI', 'EDUC', 'EMIG', 'IMMI', 'NATU', 'EVEN', 'GRAD', 'ADOP',
  'MILI', 'FACT', 'CENS', 'PROP', 'BAPM', 'CONF', 'RELI', 'MARR', 'ENGA', 'DIV',
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
      case '_TASK':
        f.tasks.push(parseTask(c));
        break;
      case '_RLOG':
        f.researchLog.push(parseLogEntry(c));
        break;
      case '_HYPO':
        f.hypotheses.push(parseHypothesis(c));
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
  // ABBR/AUTH/PUBL CONT-fähig lesen (symmetrisch zu emitSource): mehrzeilige Freitext-Werte
  // (GRAMPS) werden gefaltet statt an der ersten Zeile abgeschnitten. Einzeilig identisch.
  const abbr = child(rec, 'ABBR');
  if (abbr) s.abbr = collectText(abbr);
  const titl = child(rec, 'TITL');
  if (titl) s.title = collectText(titl);
  const auth = child(rec, 'AUTH');
  if (auth) s.author = collectText(auth);
  // Erfassungsdatum (BL-243, ADR-v9-179): `1 CREA / 2 DATE` (7.0) ODER `1 _DATE` (5.5.1,
  // Legacy/v8). Ein `1 DATE` direkt unter SOUR wird NICHT gelesen — den Tag kennt weder
  // 5.5.1 noch 7.0 im `SOURCE_RECORD`, er bleibt Passthrough (LP-1).
  const crea = child(rec, 'CREA');
  s.createdDate = (crea ? childValue(crea, 'DATE') : '') || childValue(rec, '_DATE');
  const publ = child(rec, 'PUBL');
  if (publ) s.publisher = collectText(publ);
  const text = child(rec, 'TEXT');
  if (text) s.text = collectText(text);
  const repo = child(rec, 'REPO');
  if (repo) {
    s.repo = repo.value.startsWith('@') ? unescapeAt(repo.value) : repo.value;
    s.callNumber = childValue(repo, 'CALN');
    const caln = child(repo, 'CALN');
    if (caln) s.callMedia = childValue(caln, 'MEDI');
  }
  // `SOUR.DATA` (BL-217): Abdeckung + verantwortliche Stelle. Der Container wird als Ganzes
  // erkannt (RECOGNIZED_SOURCE) — deshalb MUSS jedes nicht modellierte Kind (NOTE/SNOTE …)
  // in `dataExtra` mitgenommen werden, sonst fällt es beim Neu-Emittieren eines geänderten
  // Records still aus dem Passthrough (INV-PT). Reihenfolge im Grammatik-Sinn: EVEN*, AGNC.
  const data = child(rec, 'DATA');
  if (data) {
    s.agnc = childValue(data, 'AGNC');
    for (const ev of children(data, 'EVEN')) {
      s.dataEvents.push({
        eventTypes: ev.value,
        date: childValue(ev, 'DATE'),
        place: childValue(ev, 'PLAC'),
      });
    }
    s.dataExtra = data.children.filter((c) => c.tag !== 'AGNC' && c.tag !== 'EVEN');
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
  r.address = addr ? collectText(addr) : null;
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
  // Globale Medien-Identität aus dem gesamten Baum assemblieren (ADR-v9-124).
  db.media = collectMedia(roots);
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
