// core/interop/write-back.ts — Writer-Write-Back: projiziert ein editiertes Domänenmodell
// (`db`) zurück in den Passthrough-Baum (`roots`), den serializeGedcom dann wie gewohnt
// verbatim schreibt (Spec 13 §2.1, zweiter Halbsatz; ADR-v9-14 "Offen, App-Schritt").
//
// ── Design (WARUM, nicht WAS) ────────────────────────────────────────────────────────
// Der Baum ist die ALLEINIGE Quelle der Roundtrip-Treue (ADR-v9-14, INV-PT). Ein voll-
// rekonstruktiver Writer (jedes Feld jedes Records aus dem Modell neu erzeugen) driftet
// unvermeidlich byte-weise ab (Feldreihenfolge, Formatnuancen, unmodellierte Tags) und
// reproduziert genau die v8-Altlast, die der Neuaufsatz auflöst. Deshalb gilt hier strikt:
//
//   1. Ein Record, dessen Modell-Felder UNVERÄNDERT sind, bleibt der IDENTISCHE
//      GedNode aus `roots` — keine Neuerzeugung. Das garantiert RT-1/RT-2 (net_delta=0,
//      out1===out2) für jeden nicht-editierten Record weiter strukturell.
//   2. „Unverändert" wird per STRUKTUR-VERGLEICH erkannt, NICHT per Dirty-Flag: die
//      Original-`GedNode` wird erneut ins Modell projiziert (identische parse-Funktion)
//      und Feld-für-Feld gegen die aktuelle db-Entität verglichen. Kein Zusatz-Tracking-
//      State nötig — funktioniert auch, wenn ein Aufrufer `db` direkt mutiert, statt über
//      ein Save-Kommando zu gehen (robuster als ein `lastChanged`/Dirty-Flag, das nur
//      greift, wenn JEDER Schreibpfad es diszipliniert setzt — die v8-Falle).
//   3. Ein GEÄNDERTER bestehender Record behält alle NICHT erkannten (Passthrough-)
//      Kind-Zeilen an Ort und Stelle; nur die erkannten Feldgruppen werden aus dem Modell
//      neu erzeugt und an ihre kanonische Position gesetzt (INV-PT bleibt gewahrt).
//   4. NEUE Records (ID nicht in `roots`) werden vollständig aus dem Modell synthetisiert —
//      hier gibt es nichts zu bewahren; roundtrip-stabil AB der Neuanlage (Re-Parse ergibt
//      exakt dasselbe Modell-Feld).
//   5. GELÖSCHTE Records (in `roots`, nicht in `db`) werden als Level-0-Knoten entfernt.
//      Hängende Refs (FAMS/FAMC/CHIL/SOUR-Zitate in anderen Records) werden NICHT
//      aufgeräumt — konsistent mit deletePerson/deleteFamily/deleteSource/deleteRepository
//      (core/model/commands.ts), die verwaiste Refs bewusst findOrphanRefs überlassen.
//
// Reine Funktion, DOM-/Plattform-frei (INV-ARCH-1).

import type {
  Citation,
  Database,
  Event,
  Family,
  Media,
  MediaCitation,
  Person,
  Repository,
  Source,
  SourceDataEvent,
} from '../model/types';
import type { ResearchTask, LogEntry, Hypothesis } from '../research/types';
import {
  buildPlacForGedcom,
  eventYear,
  makePlaceRegistry,
  makeHofRegistry,
  type PlaceContext,
} from '../places';
import type { GedNode } from './gedcom-tree';
import { evidenceEvalEqual, EVAL_TAGS } from './enum-maps';
import {
  parsePersonPublic,
  parseFamilyPublic,
  parseSourcePublic,
  parseRepositoryPublic,
  projectMediaRecord,
} from './gedcom-parse';
import {
  emitPerson,
  emitFamily,
  emitSource,
  emitRepository,
  emitMediaRecord,
  type MediaLookup,
} from './write-back-emit';

/** Tags, die der jeweilige Entitätstyp ins Modell projiziert (= „erkannt"). Alles andere
 *  bleibt Passthrough. Muss mit gedcom-parse.ts konsistent sein. */
const RECOGNIZED_PERSON = new Set([
  'NAME', 'SEX', 'TITL', 'RELI', 'RESN', 'EMAIL', 'WWW', '_UID',
  'BIRT', 'CHR', 'DEAT', 'BURI', 'FAMC', 'FAMS', 'ALIA', 'ASSO', 'OBJE',
  'NOTE', 'SOUR', 'CHAN', 'REFN', 'EXID', 'CREA', '_DATE', '_TASK', '_RLOG', '_HYPO',
  'OCCU', 'RESI', 'EDUC', 'EMIG', 'IMMI', 'NATU', 'EVEN', 'GRAD', 'ADOP',
  'MILI', 'FACT', 'CENS', 'PROP', 'BAPM', 'CONF', 'MARR', 'ENGA', 'DIV',
]);
const RECOGNIZED_FAMILY = new Set([
  'HUSB', 'WIFE', 'CHIL', 'MARR', 'ENGA', 'NOTE', 'SOUR', '_TASK', '_RLOG', '_HYPO',
  'OCCU', 'RESI', 'EDUC', 'EMIG', 'IMMI', 'NATU', 'EVEN', 'GRAD', 'ADOP',
  'MILI', 'FACT', 'CENS', 'PROP', 'BAPM', 'CONF', 'DIV',
]);
// `DATE` ist BEWUSST NICHT dabei (BL-243): ein `1 DATE` direkt unter `SOUR` kennt weder
// 5.5.1 noch 7.0 — es wird nie geschrieben und bleibt als Passthrough erhalten, falls eine
// Fremddatei eines trägt. Das Erfassungsdatum reist als `_DATE`/`CREA`.
// `DATA` als Ganzes erkannt (BL-217): der Container wird beim Neu-Emittieren komplett aus
// dem Modell gebaut — deshalb hält `Source.dataExtra` jedes nicht modellierte DATA-Kind
// (NOTE/SNOTE …), das sonst still verschwände.
const RECOGNIZED_SOURCE = new Set([
  'ABBR', 'TITL', 'AUTH', 'PUBL', 'TEXT', 'REPO', 'REFN', 'EXID', 'OBJE',
  'CREA', '_DATE', 'DATA',
]);
const RECOGNIZED_REPO = new Set(['NAME', 'ADDR', 'PHON', 'WWW', 'EMAIL', '_RTYPE', '_FAURL']);
// Medien-Record `0 @M@ OBJE` (ADR-v9-125): FILE (+FORM/MEDI darunter) + globaler TITL.
const RECOGNIZED_MEDIA = new Set(['FILE', 'TITL']);

/**
 * Projiziert ein editiertes `db` zurück in den Passthrough-Baum. Liefert einen NEUEN
 * roots-Array: unveränderte Records bleiben die identische GedNode-Referenz aus `roots`,
 * geänderte werden feldweise aktualisiert (Passthrough erhalten), neue synthetisiert,
 * gelöschte entfernt. HEAD/TRLR/unbekannte Level-0-Records bleiben unangetastet.
 *
 * serializeGedcom(doc mit diesem roots) schreibt das Ergebnis wie gewohnt verbatim.
 */
export function applyDatabaseToRoots(db: Database, roots: GedNode[]): GedNode[] {
  const out: GedNode[] = [];
  // PlaceContext INTERN aus db.placeObjects/db.hofObjects gebaut (ADR-v9-47): der Writer
  // UND der Dirty-Check leiten den PLAC-String bei gesetzter placeId/hofId LIVE ab, statt
  // dem möglicherweise veralteten ev.place-Cache zu vertrauen (INV-PLACE Mechanismus 2).
  // Kein neuer externer Parameter nötig — `db` enthält alles (Vereinfachen vor Erfinden).
  const ctx: PlaceContext = {
    places: makePlaceRegistry(db.placeObjects),
    hofs: makeHofRegistry(db.hofObjects),
  };
  // Medien-Auflösung (ADR-v9-124) ebenfalls INTERN aus db (kein neuer Parameter, wie ctx).
  const media: MediaLookup = db.media;
  // Record-Lookup nach xref (BL-164): der Passthrough absorbierter Verlierer-Records wird von
  // hier geholt, solange sie noch im Eingangs-Baum stehen (vor dem ersten Save).
  const recById = new Map<string, GedNode>();
  for (const r of roots) if (r.xref) recById.set(r.xref, r);
  // Welche IDs sind bereits im Baum vertreten? (für Neu-Erkennung)
  const seen = { INDI: new Set<string>(), FAM: new Set<string>(), SOUR: new Set<string>(), REPO: new Set<string>(), OBJE: new Set<string>() };
  let trlrIndex = -1;

  for (const rec of roots) {
    switch (rec.tag) {
      case 'INDI': {
        const id = rec.xref ?? '';
        seen.INDI.add(id);
        const cur = db.individuals.get(id);
        if (!cur) break; // gelöscht → weglassen
        out.push(personNode(rec, cur, ctx, media, recById));
        break;
      }
      case 'FAM': {
        const id = rec.xref ?? '';
        seen.FAM.add(id);
        const cur = db.families.get(id);
        if (!cur) break;
        out.push(familyNode(rec, cur, ctx, media));
        break;
      }
      case 'SOUR': {
        // Nur Level-0-SOUR-Records (xref gesetzt); `1 SOUR @Sx@`-Zitate haben kein xref
        // und tauchen hier ohnehin nicht als roots-Element auf.
        const id = rec.xref ?? '';
        seen.SOUR.add(id);
        const cur = db.sources.get(id);
        if (!cur) break;
        out.push(sourceNode(rec, cur, media));
        break;
      }
      case 'REPO': {
        const id = rec.xref ?? '';
        seen.REPO.add(id);
        const cur = db.repositories.get(id);
        if (!cur) break;
        out.push(repoNode(rec, cur));
        break;
      }
      case 'OBJE': {
        // Top-Level-Medien-Record (ADR-v9-125). Inline/Pointer-OBJE stehen nie auf Level 0.
        const id = rec.xref ?? '';
        if (!id) { out.push(rec); break; }
        seen.OBJE.add(id);
        const cur = db.media.get(id);
        if (!cur) break; // aus db.media entfernt → Record fällt weg
        out.push(mediaRecordNode(rec, cur));
        break;
      }
      case 'TRLR':
        trlrIndex = out.length;
        out.push(rec);
        break;
      default:
        out.push(rec); // HEAD, NOTE-Records, SUBM, Unbekanntes: unangetastet
        break;
    }
  }

  // Neue Records (im Modell, nicht im Baum) vor TRLR (bzw. am Ende) einfügen.
  const additions: GedNode[] = [];
  for (const p of db.individuals.values()) if (!seen.INDI.has(p.id)) additions.push(emitPerson(p, ctx, media));
  for (const f of db.families.values()) if (!seen.FAM.has(f.id)) additions.push(emitFamily(f, ctx, media));
  for (const s of db.sources.values()) if (!seen.SOUR.has(s.id)) additions.push(emitSource(s, media));
  for (const r of db.repositories.values()) if (!seen.REPO.has(r.id)) additions.push(emitRepository(r));
  // Neue record-basierte Medien (ADR-v9-125): nur `wireOrigin==='record'` sind Top-Level-Records;
  // inline-Medien leben am Verweis und werden nie als eigener Record geschrieben.
  for (const m of db.media.values()) if (m.wireOrigin === 'record' && !seen.OBJE.has(m.id)) additions.push(emitMediaRecord(m));

  if (additions.length) {
    if (trlrIndex >= 0) out.splice(trlrIndex, 0, ...additions);
    else out.push(...additions);
  }
  return out;
}

// ── Pro-Entität: unverändert? → Original-Knoten. Sonst feldweise aktualisieren. ─────────

function personNode(
  orig: GedNode,
  cur: Person,
  ctx: PlaceContext,
  media: MediaLookup,
  recById: Map<string, GedNode>,
): GedNode {
  const carried = collectMergedPassthrough(cur.mergedRecordIds, recById, RECOGNIZED_PERSON);
  const projected = parsePersonPublic(orig);
  // Bei absorbiertem Passthrough NICHT kurzschließen — der Verlierer-Passthrough muss ran.
  if (carried.length === 0 && personEqual(projected, cur, ctx)) return orig; // byte-identisch bewahren
  return mergeRecord(orig, cur, RECOGNIZED_PERSON, (m) => emitPerson(m, ctx, media), carried);
}
function familyNode(orig: GedNode, cur: Family, ctx: PlaceContext, media: MediaLookup): GedNode {
  const projected = parseFamilyPublic(orig);
  if (familyEqual(projected, cur, ctx)) return orig;
  return mergeRecord(orig, cur, RECOGNIZED_FAMILY, (m) => emitFamily(m, ctx, media));
}
function sourceNode(orig: GedNode, cur: Source, media: MediaLookup): GedNode {
  const projected = parseSourcePublic(orig);
  if (sourceEqual(projected, cur)) return orig;
  return mergeRecord(orig, cur, RECOGNIZED_SOURCE, (m) => emitSource(m, media));
}
function repoNode(orig: GedNode, cur: Repository): GedNode {
  const projected = parseRepositoryPublic(orig);
  if (repoEqual(projected, cur)) return orig;
  return mergeRecord(orig, cur, RECOGNIZED_REPO, emitRepository);
}
function mediaRecordNode(orig: GedNode, cur: Media): GedNode {
  const projected = projectMediaRecord(orig);
  if (projected && mediaRecordEqual(projected, cur)) return orig;
  return mergeRecord(orig, cur, RECOGNIZED_MEDIA, emitMediaRecord);
}

/**
 * Baut den Knoten eines GEÄNDERTEN Records: die aus dem Modell frisch synthetisierten
 * erkannten Feldgruppen ERSETZEN die alten erkannten Kind-Zeilen an ihrer ersten Position;
 * alle NICHT erkannten (Passthrough-)Kind-Zeilen bleiben in Reihenfolge/Tiefe unangetastet
 * (INV-PT). Die erkannten Kinder werden an der Stelle des ersten alten erkannten Kindes
 * wieder eingesetzt (kanonische Position bleibt lokal stabil); ist keins vorhanden (neuer
 * Feldwert), landen sie vor dem ersten Passthrough-Kind bzw. am Ende.
 */
/**
 * Welche KIND-Tags bildet das Modell unterhalb eines Tags ab (BL-285, ADR-v9-197)?
 *
 * WOZU. Ein erkannter Knoten wird beim Write-Back aus dem Modell neu gebaut. Um seine
 * un-modellierten Enkel zu retten, muss unterschieden werden, ob ein Kind des ALTEN
 * Knotens fehlt, weil das Modell es gar nicht kennt (→ Passthrough, muss bleiben), oder
 * weil der Nutzer es GELÖSCHT hat (→ muss weg). Diese Menge ist deshalb bewusst
 * **statisch** und NICHT aus der frischen Emission abgeleitet: aus ihr abgeleitet wäre
 * jedes gelöschte Feld ununterscheidbar von einem un-modellierten und käme zurück — der
 * Fix hätte einen Datenverlust gegen einen anderen getauscht.
 *
 * Nach dem LETZTEN Tag geschlüsselt, nicht nach dem vollen Pfad: `SOUR`/`OBJE`/`PLAC`
 * tragen überall dieselbe Struktur (Zitat, Medien-Link, Ort), und ein Pfad-Schlüssel
 * hätte dieselbe Liste ein Dutzend Mal wiederholt.
 *
 * Ein Tag, der hier FEHLT, gilt als „hat keine modellierten Kinder" — seine Kinder
 * überleben also. Das ist die riskante Richtung (ein gelöschtes Feld käme zurück), und
 * genau deshalb prüft `tests/roundtrip/dirty-record-passthrough.test.ts` per Drift-Guard,
 * dass jedes Eltern-Kind-Paar, das der Emitter erzeugen kann, hier verzeichnet ist.
 */
/** Die Ereignis-Tags aus `RECOGNIZED_PERSON`/`RECOGNIZED_FAMILY`, die `eventNode` baut. */
const EREIGNIS_TAGS = [
  'BIRT', 'CHR', 'DEAT', 'BURI', 'OCCU', 'RESI', 'EDUC', 'EMIG', 'IMMI', 'NATU',
  'EVEN', 'GRAD', 'ADOP', 'MILI', 'FACT', 'CENS', 'PROP', 'BAPM', 'CONF',
  'MARR', 'ENGA', 'DIV',
] as const;

/** Was `eventNode` unter einem Ereignis schreibt (`CAUS` nur bei DEAT, schadet sonst nicht). */
const EREIGNIS_KINDER = ['TYPE', 'DATE', 'PLAC', 'ADDR', 'NOTE', 'SOUR', 'OBJE', 'CAUS'] as const;

const MODELLIERTE_KINDER: Readonly<Record<string, readonly string[]>> = {
  // Person/Familie
  NAME: ['GIVN', 'SURN', 'NPFX', 'NSFX', 'NICK', 'SOUR'],
  FAMC: ['PEDI', '_FREL', '_MREL'],
  ASSO: ['RELA', 'NOTE', 'SOUR'],
  REFN: ['TYPE'],
  CHAN: ['DATE'],
  // Ereignisse (eventNode) — dieselbe Struktur für BIRT/CHR/DEAT/BURI/OCCU/RESI/…
  ...Object.fromEntries(EREIGNIS_TAGS.map((t) => [t, EREIGNIS_KINDER])),
  PLAC: ['MAP'],
  MAP: ['LATI', 'LONG'],
  DATE: ['TIME'], // nur unter CHAN belegt; anderswo schadet der Eintrag nicht
  // Zitat (citationNode) und Medien-Link (mediaNode)
  SOUR: ['PAGE', 'QUAY', '_EVAL', 'NOTE', 'OBJE'],
  _EVAL: [...EVAL_TAGS],
  OBJE: ['TITL', 'FILE', 'NOTE', '_DATE', '_PRIM'],
  FILE: ['FORM'],
  FORM: ['MEDI'],
  // Quelle (emitSource) — `DATA` führt seinen Rest in `Source.dataExtra`, s.
  // SELBSTVERWALTETER_PASSTHROUGH; die Tabelle beschreibt trotzdem, was das Modell kennt.
  DATA: ['EVEN', 'AGNC'],
  // KEIN eigener `EVEN`-Eintrag: der Tag ist zugleich Ereignis (unter INDI/FAM) und
  // DATA-Kind. Die flache Schlüsselung nach dem letzten Tag verlangt hier die VEREINIGUNG —
  // und `EREIGNIS_KINDER` enthält `DATE`/`PLAC` bereits. Ein zweiter Eintrag überschrieb
  // den Ereignis-Eintrag und ließ `EVEN>TYPE`/`NOTE`/`SOUR`/`OBJE` als un-modelliert gelten
  // (vom Drift-Guard gefangen).
  REPO: ['CALN'],
  CALN: ['MEDI'],
  // Forschungsdaten (taskNode/logEntryNode/hypothesisNode)
  _TASK: ['_CAT', '_DONE', '_TSTAT', '_DATE', '_ID', 'SOUR'],
  _RLOG: ['DATE', 'REPO', 'SOUR', '_QUERY', '_RESULT', '_TASKID', '_ID', 'NOTE'],
  _HYPO: ['_HSTAT', '_HWGT', '_DATE', '_HKIND', '_HREF', 'PAGE', 'SOUR'],
};

/** Die Kind-Tags, die das Modell unter `tag` abbildet (leer = alles darunter ist Passthrough). */
export function modellierteKinder(tag: string): readonly string[] {
  return MODELLIERTE_KINDER[tag] ?? [];
}

/**
 * Paart alte und frische Knoten desselben Tags (BL-285).
 *
 * Bei GLEICHER Anzahl der Reihe nach — der Emitter erhält die Modell-Reihenfolge, die
 * ihrerseits aus der Datei stammt. Bei ungleicher Anzahl (der Nutzer hat eines hinzugefügt
 * oder gelöscht) verschiebt eine Paarung nach Position die Zuordnung und übernähme
 * Passthrough vom FALSCHEN Knoten; dann wird nur noch über den exakten Wert gepaart, und
 * was übrig bleibt, bleibt ungepaart. Lieber ein Knoten ohne Passthrough-Rettung als einer
 * mit fremden Zeilen.
 */
function paare(alte: GedNode[], frische: GedNode[]): [GedNode, GedNode][] {
  if (alte.length === frische.length) return alte.map((a, i) => [a, frische[i]]);
  const paare: [GedNode, GedNode][] = [];
  const offen = [...frische];
  for (const a of alte) {
    const i = offen.findIndex((f) => f.value === a.value);
    if (i >= 0) paare.push([a, offen.splice(i, 1)[0]]);
  }
  return paare;
}

/**
 * Überträgt die un-modellierten Kinder der alten erkannten Knoten in die frischen — rekursiv,
 * denn der Verlust sitzt beliebig tief (gemessen u. a. `INDI>OBJE>FILE>TITL`, BL-285).
 *
 * Mutiert die frischen Knoten in place; sie sind frisch emittiert, gehören also niemandem
 * sonst. Angehängt wird HINTEN und nur, was nicht schon (strukturgleich) vorhanden ist —
 * dieselbe Regel wie beim absorbierten Verlierer-Passthrough (BL-164).
 */
function uebernimmTiefenPassthrough(
  alteKinder: readonly GedNode[],
  frischeKinder: GedNode[],
  recognized: Set<string>,
): GedNode[] {
  const nachTag = (xs: readonly GedNode[]) => {
    const m = new Map<string, GedNode[]>();
    for (const x of xs) (m.get(x.tag) ?? m.set(x.tag, []).get(x.tag)!).push(x);
    return m;
  };
  const alt = nachTag(alteKinder.filter((c) => recognized.has(c.tag)));
  const frisch = nachTag(frischeKinder);
  for (const [tag, alteGruppe] of alt) {
    const frischeGruppe = frisch.get(tag);
    if (!frischeGruppe) continue; // im Modell nicht mehr vorhanden → bewusst gelöscht
    for (const [a, f] of paare(alteGruppe, frischeGruppe)) uebernimmIn(a, f);
  }
  return frischeKinder;
}

/**
 * `CONC`/`CONT` sind FORTSETZUNGEN des Elternwerts, keine eigenen Zeilen — sie als
 * un-modellierten Passthrough zu übernehmen, hängte die alten Textfragmente an den neuen
 * Wert an und verdoppelte damit jede geänderte Notiz/Adresse. (Vom Drift-Guard am
 * Realbestand aufgedeckt: `NOTE>CONT`, `ADDR>CONT`, `OBJE>CONT`.)
 */
const FORTSETZUNG = new Set(['CONC', 'CONT']);

/**
 * Knoten, die ihren un-modellierten Inhalt SELBST im Modell mitführen: `DATA` über
 * `Source.dataExtra` (BL-217), `OBJE` über `MediaCitation.extra` (ADR-v9-124). Für ihre
 * DIREKTEN Kinder darf der Tiefen-Passthrough nicht greifen — was dort fehlt, hat der
 * Nutzer gelöscht, und es zurückzuholen machte die Löschung wirkungslos.
 *
 * Genau das ist passiert: der erste Bau holte ein entferntes `2 EVEN MARR` unter `DATA`
 * zurück; `tests/roundtrip/source-data-roundtrip.test.ts` („eine ÄNDERUNG am Modell landet
 * in der Datei — nicht nur der Passthrough") wurde rot. Die Rekursion läuft trotzdem
 * weiter: unter `OBJE` hängt `FILE>TITL`, das `extra` NICHT abdeckt.
 */
const SELBSTVERWALTETER_PASSTHROUGH = new Set(['DATA', 'OBJE']);

/** Ein Paar: un-modellierte Kinder von `alt` nach `frisch`, dann eine Ebene tiefer. */
function uebernimmIn(alt: GedNode, frisch: GedNode): void {
  const modelliert = new Set(modellierteKinder(alt.tag));
  if (!SELBSTVERWALTETER_PASSTHROUGH.has(alt.tag)) {
    for (const kind of alt.children) {
      if (modelliert.has(kind.tag) || FORTSETZUNG.has(kind.tag)) continue; // modelliert → fehlt es, ist es gelöscht
      if (frisch.children.some((x) => nodeEqual(x, kind))) continue;
      frisch.children.push(kind);
    }
  }
  uebernimmTiefenPassthrough(alt.children, frisch.children, modelliert);
}

function mergeRecord<T>(
  orig: GedNode,
  cur: T,
  recognized: Set<string>,
  emit: (m: T) => GedNode,
  carried: GedNode[] = [], // absorbierter Verlierer-Passthrough (BL-164), dedupliziert angehängt
): GedNode {
  const fresh = emit(cur); // vollständiger frischer Record aus dem Modell
  // Un-modellierte ENKEL aus den alten erkannten Kindern in die frischen übernehmen
  // (BL-285): ohne diesen Schritt nimmt jeder neu gebaute Knoten alles mit, was das Modell
  // unterhalb von ihm nicht abbildet.
  const recognizedChildren = uebernimmTiefenPassthrough(orig.children, fresh.children, recognized);

  const children: GedNode[] = [];
  let inserted = false;
  for (const c of orig.children) {
    if (recognized.has(c.tag)) {
      if (!inserted) {
        children.push(...recognizedChildren);
        inserted = true;
      }
      // altes erkanntes Kind fällt weg (durch fresh ersetzt — seine un-modellierten Enkel
      // sind oben in den frischen Knoten gewandert)
    } else {
      children.push(c); // Passthrough: verbatim, an Ort und Stelle
    }
  }
  if (!inserted) children.push(...recognizedChildren); // Record hatte nur Passthrough-Kinder
  // Verlierer-Passthrough hinten anhängen (INV-PT), byte-strukturell dedupliziert — kumulativ
  // gegen den WACHSENDEN Kinder-Satz, damit auch zwei gleiche Verlierer-Zeilen zu einer werden.
  for (const c of carried) {
    if (!children.some((x) => nodeEqual(x, c))) children.push(c);
  }
  return { level: orig.level, xref: orig.xref, tag: orig.tag, value: orig.value, children };
}

/** Sammelt den un-modellierten Passthrough der (per Dedup) absorbierten Verlierer-Records —
 *  aus dem Eingangs-Baum (`recById`), solange sie dort noch stehen (BL-164, ADR-v9-129). */
function collectMergedPassthrough(
  ids: string[] | undefined,
  recById: Map<string, GedNode>,
  recognized: Set<string>,
): GedNode[] {
  if (!ids || ids.length === 0) return [];
  const out: GedNode[] = [];
  for (const id of ids) {
    const rec = recById.get(id);
    if (!rec) continue; // schon materialisiert / nicht mehr im Baum → No-Op
    for (const c of rec.children) if (!recognized.has(c.tag)) out.push(c);
  }
  return out;
}

// ── Struktur-Vergleich: „hat sich das erkannte Modell-Feld geändert?" ──────────────────
// Verglichen wird NUR, was der Writer aus dem Modell erzeugt (die erkannten Felder).
// Nicht modellierte Passthrough-Zeilen sind an der Original-Projektion nicht beteiligt und
// überleben ohnehin — sie dürfen den Gleichheits-Vergleich nicht beeinflussen.

/**
 * Live-PLAC eines Events für den Dirty-Check (ADR-v9-47): ist `placeId`/`hofId` gesetzt,
 * ist der PLAC-String der LIVE berechnete Wert, nicht der `ev.place`-Cache — sonst hielte
 * der Vergleich einen Datensatz für „unverändert", obwohl sich die Projektion (z. B. eine
 * neue datierte `enclosedBy`-Periode) geändert hat, und der Writer synthetisierte ihn nie
 * neu. GUARD-Fallback (Live == null) → letzter bekannter `ev.place` (siehe placValue).
 */
function livePlace(ev: Event, ctx: PlaceContext): string | null {
  if (ev.placeId !== null || ev.hofId !== null) {
    const live = buildPlacForGedcom(ev, eventYear(ev), ctx);
    if (live !== null) return live;
  }
  return ev.place;
}

// `a` = Original aus der Datei re-geparst (`a.place` = was buchstäblich in der Datei stand),
// `b` = aktuelle db-Entität. Verglichen wird `a.place` gegen den LIVE-Wert von `b` — nicht
// mehr `a.place === b.place` roh (ADR-v9-47). ADDR bleibt roh (bewusst asymmetrisch, §7).
function eventEqual(a: Event, b: Event, ctx: PlaceContext): boolean {
  return (
    a.seen === b.seen &&
    a.type === b.type &&
    a.value === b.value &&
    a.eventType === b.eventType &&
    a.date === b.date &&
    a.place === livePlace(b, ctx) &&
    a.addr === b.addr &&
    a.note === b.note &&
    a.lati === b.lati &&
    a.long === b.long &&
    citationsEqual(a.citations, b.citations) &&
    mediaEqual(a.media, b.media)
  );
}

function citationsEqual(a: Citation[], b: Citation[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (
      x.sourceId !== y.sourceId || x.page !== y.page || x.quay !== y.quay ||
      x.note !== y.note || !mediaEqual(x.media, y.media) ||
      // Die Evidenz-Bewertung (BL-83) gehört in DENSELBEN Vergleich: ohne sie gälte ein
      // Record, an dem NUR die Bewertung geändert wurde, als „unverändert" — der Writer
      // gäbe den Original-Knoten zurück und der Edit verschwände still.
      !evidenceEvalEqual(x.eval, y.eval)
    ) return false;
  }
  return true;
}

function nodeEqual(a: GedNode, b: GedNode): boolean {
  if (a.tag !== b.tag || a.value !== b.value || a.xref !== b.xref) return false;
  if (a.children.length !== b.children.length) return false;
  for (let i = 0; i < a.children.length; i++) {
    if (!nodeEqual(a.children[i], b.children[i])) return false;
  }
  return true;
}

// MediaCitation-Vergleich (ADR-v9-124): referenz-spezifische Felder + Passthrough-`extra`.
// Die globalen Felder (form/type) leben in db.media und sind hier bewusst NICHT Teil des
// Dirty-Checks — ein reiner Global-Feld-Edit ohne Berührung des Owner-Records ist ein
// UI-Zeit-Belang (BL-126), nicht Teil dieses Kern-Vorbaus.
function mediaEqual(a: MediaCitation[], b: MediaCitation[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (
      x.mediaId !== y.mediaId || x.title !== y.title || x.date !== y.date ||
      x.note !== y.note || x.primary !== y.primary
    ) return false;
    if (x.extra.length !== y.extra.length) return false;
    for (let j = 0; j < x.extra.length; j++) {
      if (!nodeEqual(x.extra[j], y.extra[j])) return false;
    }
  }
  return true;
}

function arrEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Task-Vergleich: Reihenfolge UND alle Felder (inkl. done/created) — sonst wird z. B. eine
 *  reine Statusänderung nicht als Änderung erkannt und der Record bleibt fälschlich verbatim. */
function tasksEqual(a: ResearchTask[], b: ResearchTask[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (
      x.id !== y.id || x.text !== y.text || x.category !== y.category ||
      x.status !== y.status || x.done !== y.done || x.created !== y.created ||
      x.sourceRef !== y.sourceRef
    ) return false;
  }
  return true;
}

/** Log-Vergleich: Reihenfolge UND alle Felder (inkl. taskId) — sonst wird eine
 *  reine Feldänderung nicht als Änderung erkannt und der Record bleibt fälschlich verbatim. */
function researchLogEqual(a: LogEntry[], b: LogEntry[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (
      x.date !== y.date || x.repoRef !== y.repoRef || x.sourceRef !== y.sourceRef ||
      x.query !== y.query || x.result !== y.result || x.note !== y.note ||
      x.taskId !== y.taskId
    ) return false;
  }
  return true;
}

/** Hypothesen-Vergleich: Reihenfolge, alle Felder + evidence[]-Array (sourceId+page, Reihenfolge). */
function hypothesesEqual(a: Hypothesis[], b: Hypothesis[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (
      x.id !== y.id || x.text !== y.text || x.status !== y.status ||
      x.weight !== y.weight || x.created !== y.created ||
      x.rationale !== y.rationale || x.conclusion !== y.conclusion ||
      // kind/refs (ADR-v9-174) gehören in DENSELBEN Vergleich: ohne sie gälte ein
      // Dublettenausschluss, der nur diese beiden Felder setzt, als „unverändert" und
      // würde nie geschrieben.
      x.kind !== y.kind || x.refs.length !== y.refs.length ||
      x.refs.some((r, k) => r !== y.refs[k])
    ) return false;
    if (x.evidence.length !== y.evidence.length) return false;
    for (let j = 0; j < x.evidence.length; j++) {
      if (x.evidence[j].sourceId !== y.evidence[j].sourceId ||
        x.evidence[j].page !== y.evidence[j].page) return false;
    }
  }
  return true;
}

function personEqual(a: Person, b: Person, ctx: PlaceContext): boolean {
  return (
    a.name === b.name && a.given === b.given && a.surname === b.surname &&
    a.prefix === b.prefix && a.suffix === b.suffix && a.nick === b.nick &&
    a.sex === b.sex && a.title === b.title && a.religion === b.religion &&
    a.restriction === b.restriction && a.email === b.email && a.www === b.www &&
    a.uid === b.uid && a.cause === b.cause &&
    eventEqual(a.birth, b.birth, ctx) && eventEqual(a.chr, b.chr, ctx) &&
    eventEqual(a.death, b.death, ctx) && eventEqual(a.buri, b.buri, ctx) &&
    eventsEqual(a.events, b.events, ctx) &&
    childOfEqual(a.childOf, b.childOf) &&
    arrEqual(a.parentIn, b.parentIn) &&
    arrEqual(a.aliases, b.aliases) && arrEqual(a.aliaNames, b.aliaNames) &&
    associationsEqual(a.associations, b.associations) &&
    mediaEqual(a.media, b.media) &&
    a.noteText === b.noteText && arrEqual(a.noteRefs, b.noteRefs) &&
    citationsEqual(a.topLevelCitations, b.topLevelCitations) &&
    citationsEqual(a.nameCitations, b.nameCitations) &&
    exidsEqual(a.exids, b.exids) &&
    tasksEqual(a.tasks, b.tasks) &&
    researchLogEqual(a.researchLog, b.researchLog) &&
    hypothesesEqual(a.hypotheses, b.hypotheses) &&
    a.lastChanged === b.lastChanged && a.createdDate === b.createdDate
  );
}

function eventsEqual(a: Event[], b: Event[], ctx: PlaceContext): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!eventEqual(a[i], b[i], ctx)) return false;
  return true;
}

function childOfEqual(a: Person['childOf'], b: Person['childOf']): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (
      x.familyId !== y.familyId || x.pedigree !== y.pedigree ||
      x.fatherRel !== y.fatherRel || x.motherRel !== y.motherRel ||
      x.fatherRelSeen !== y.fatherRelSeen || x.motherRelSeen !== y.motherRelSeen
    ) return false;
  }
  return true;
}

function associationsEqual(a: Person['associations'], b: Person['associations']): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (x.personRef !== y.personRef || x.role !== y.role || x.note !== y.note ||
      !citationsEqual(x.citations, y.citations)) return false;
  }
  return true;
}

function exidsEqual(a: { value: string; type: string }[], b: { value: string; type: string }[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].value !== b[i].value || a[i].type !== b[i].type) return false;
  }
  return true;
}

function familyEqual(a: Family, b: Family, ctx: PlaceContext): boolean {
  return (
    a.husband === b.husband && a.wife === b.wife &&
    arrEqual(a.children, b.children) &&
    eventEqual(a.marriage, b.marriage, ctx) && eventEqual(a.engagement, b.engagement, ctx) &&
    eventsEqual(a.events, b.events, ctx) &&
    a.noteText === b.noteText &&
    citationsEqual(a.citations, b.citations) &&
    tasksEqual(a.tasks, b.tasks) &&
    researchLogEqual(a.researchLog, b.researchLog) &&
    hypothesesEqual(a.hypotheses, b.hypotheses) &&
    a.lastChanged === b.lastChanged
  );
}

/** Abdeckungs-Einträge feldweise (BL-217). `dataExtra` zählt NICHT mit: reiner Passthrough,
 *  von niemandem editierbar — ein Unterschied ist dort nicht möglich. */
function dataEventsEqual(a: SourceDataEvent[], b: SourceDataEvent[]): boolean {
  return a.length === b.length && a.every((x, i) =>
    x.eventTypes === b[i].eventTypes && x.date === b[i].date && x.place === b[i].place);
}

function sourceEqual(a: Source, b: Source): boolean {
  return (
    a.abbr === b.abbr && a.title === b.title && a.author === b.author &&
    a.createdDate === b.createdDate && a.publisher === b.publisher && a.text === b.text &&
    a.repo === b.repo && a.callNumber === b.callNumber && a.callMedia === b.callMedia &&
    a.agnc === b.agnc && dataEventsEqual(a.dataEvents, b.dataEvents) &&
    exidsEqual(a.externalRefs, b.externalRefs) &&
    mediaEqual(a.media, b.media) && a.lastChanged === b.lastChanged
  );
}

function repoEqual(a: Repository, b: Repository): boolean {
  return (
    a.name === b.name && a.type === b.type && a.address === b.address &&
    a.phone === b.phone && a.www === b.www && a.email === b.email &&
    a.findingAid === b.findingAid && a.lastChanged === b.lastChanged
  );
}

// Medien-Record-Vergleich (ADR-v9-125): die GLOBALEN Felder — hier wird eine Änderung an
// Datei/Format/Typ/Titel erkannt (die natürliche Stelle, EIN Record statt jeder Referenz).
function mediaRecordEqual(a: Media, b: Media): boolean {
  return a.file === b.file && a.form === b.form && a.type === b.type && a.title === b.title;
}
