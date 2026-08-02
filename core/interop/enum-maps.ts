// core/interop/enum-maps.ts — gebündelte, beidseitige Enum-/Wert-Abbildungen (BL-156, ADR-v9-127).
//
// EIN kohärenter Ort für die Enum-Übersetzungen zwischen Modell und Wire-Formaten, die bisher
// über gramps-events / gramps-citations / strict-adapter verstreut lagen. Die Cross-Family-
// Emission (BL-157/158) baut den Zielbaum aus dem Modell und braucht daher JEDE Richtung —
// hier gebündelt, auf Vollständigkeit gebracht und beidseitig getestet (Bijektivität auf den
// bekannten Werten; unbekannte Werte werden DEFINIERT — verlustschonend — behandelt, LP-1).
//
// Vereinfachen vor Erfinden: die vorhandenen Funktionen (grampsTypeToTag/tagToGrampsType,
// confidenceToQuay, die _FREL/_MREL→PEDI-Regex aus strict-adapter) ziehen HIERHER; die alten
// Module re-exportieren sie, damit kein bestehender Import bricht (kein Native-Test berührt).
//
// Reine Funktionen, DOM-/Plattform-frei (INV-ARCH-1), build-frei testbar (INV-ARCH-2).

import type { EvidenceEval, Quay } from '../model/types';
import { isEvidenceEvalEmpty } from '../research/eval';

// ── 1. Ereignistyp: GEDCOM-Tag ↔ GRAMPS-<type> ────────────────────────────────
// Nur Built-ins, deren Tag das Modell kennt (SPECIAL_EVENT_TAGS ∪ EVENT_TAGS in
// gedcom-parse.ts). Die GRAMPS-Strings sind die `xml_str`-Spalte aus `gen/lib/eventtype.py::
// _DATAMAP`. Alles Übrige (Built-ins ohne 1:1-Tag UND Custom-/deutsche Typen) → `EVEN` mit
// `eventType` = wörtlicher GRAMPS-Typ (verlustfrei, D1/D5).

export const TAG_BY_GRAMPS: Record<string, string> = {
  Birth: 'BIRT',
  Death: 'DEAT',
  Christening: 'CHR',
  Burial: 'BURI',
  Baptism: 'BAPM',
  Confirmation: 'CONF',
  Adopted: 'ADOP',
  Census: 'CENS',
  Occupation: 'OCCU',
  Residence: 'RESI',
  Education: 'EDUC',
  Emigration: 'EMIG',
  Immigration: 'IMMI',
  Naturalization: 'NATU',
  Graduation: 'GRAD',
  Property: 'PROP',
  Religion: 'RELI',
  'Military Service': 'MILI',
  Marriage: 'MARR',
  Engagement: 'ENGA',
  Divorce: 'DIV',
};

export const GRAMPS_BY_TAG: Record<string, string> = Object.fromEntries(
  Object.entries(TAG_BY_GRAMPS).map(([g, t]) => [t, g]),
);

/** GRAMPS-Typ → `{ tag, eventType }`. Nicht kartiert → `EVEN` + wörtlicher Typ. */
export function grampsTypeToTag(grampsType: string): { tag: string; eventType: string } {
  const tag = TAG_BY_GRAMPS[grampsType];
  return tag ? { tag, eventType: '' } : { tag: 'EVEN', eventType: grampsType };
}

/** GEDCOM-Tag (+ `eventType`) → GRAMPS-Typ-String. Umkehrung für das Write-Back/Cross-Emit. */
export function tagToGrampsType(tag: string, eventType: string): string {
  if (tag === 'EVEN' || tag === 'FACT') return eventType || 'Event';
  return GRAMPS_BY_TAG[tag] ?? (eventType || tag);
}

// ── 2. QUAY ↔ GRAMPS-<confidence> ─────────────────────────────────────────────
// GEDCOM-QUAY: 0–3. GRAMPS-<confidence>: 0–4 (4 = Very High). D4 ist verlustbehaftet in
// EINE Richtung (4→3 via min); die Rückrichtung ist die identische Zahl (0–3 → "0".."3").

/** GRAMPS-`<confidence>` (0–4) → GEDCOM-QUAY (0–3). 4 (Very High) und 3 (High) → 3. */
export function confidenceToQuay(text: string): Quay {
  const n = parseInt(text, 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return (n >= 3 ? 3 : n) as Quay;
}

/** GEDCOM-QUAY (0–3) → GRAMPS-`<confidence>`-String. Die Modell-Zahl IST der Confidence-Level. */
export function quayToConfidence(quay: Quay): string {
  return String(quay);
}

// ── 3. PEDI ↔ GRAMPS-childref-Relation (frel/mrel) ────────────────────────────
// Modell-`ChildLink.pedigree` = GEDCOM-PEDI-Enum {birth,adopted,foster,sealing,''}. GRAMPS
// trägt die Relation je Kind als `frel`/`mrel`-Attribut am `<childref>` (Werte aus
// `gen/lib/childreftype.py`: Birth/Adopted/Stepchild/Sponsored/Foster/Unknown/Custom).
// `sealing` (LDS) hat KEIN GRAMPS-Built-in → als Custom-String "Sealing" emittiert (verlust-
// schonend). Unbekannte GRAMPS-Relationen (Stepchild/Sponsored/Unknown/Custom) haben keinen
// PEDI-Wert → leeres PEDI (kein Rateversuch; der Rohbaum sichert die Fidelity über INV-PT).

export type Pedigree = 'birth' | 'adopted' | 'foster' | 'sealing' | '';

const REL_BY_PEDI: Record<Exclude<Pedigree, ''>, string> = {
  birth: 'Birth',
  adopted: 'Adopted',
  foster: 'Foster',
  sealing: 'Sealing',
};

/** PEDI-Enum → GRAMPS-childref-Relation (frel/mrel). Leeres PEDI → leere Relation. */
export function pediToChildrefRel(pedi: Pedigree): string {
  return pedi === '' ? '' : REL_BY_PEDI[pedi];
}

/**
 * GRAMPS-childref-Relation (frel/mrel) ODER GEDCOM-`_FREL`/`_MREL`-Wert (auch deutsch) →
 * PEDI-Enum. Unbekannt/leer → '' (definiert). Trägt die aus der `_REPO_MODELLED`-/Strict-
 * Lehre bewährte Regex-Erkennung (deutsch + englisch), damit strict-adapter dieselbe Quelle
 * nutzt statt einer zweiten Kopie.
 */
export function childrefRelToPedi(rel: string): Pedigree {
  const s = rel.trim().toLowerCase();
  if (s === '') return '';
  if (/^(adopt|adoptiv|adopted)/.test(s)) return 'adopted';
  if (/^(foster|pflege)/.test(s)) return 'foster';
  if (/^(seal|siegel)/.test(s)) return 'sealing';
  if (/^(birth|geburt|leiblich|natural)/.test(s)) return 'birth';
  return '';
}

// ── 4. MEDI (GEDCOM-Medientyp-Enum unter FORM) ────────────────────────────────
// MEDI ist die GEDCOM-5.5.1-Standard-Enum für die ART des Mediums (Foto/Buch/…), getrennt
// vom Dateiformat FORM/MIME (das media-mime.ts kanonisiert). GRAMPS hat KEIN direktes
// Gegenstück — der Medientyp ist GEDCOM-nativ; auf GEDCOM-Ebene round-trippt er über
// `Media.type`, GRAMPS→GEDCOM kann ihn nicht befüllen (leer), GEDCOM→GRAMPS trägt ihn nicht
// als eigenes Feld (Coverage-Kandidat BL-155-Report). Deshalb hier nur eine kanonisierende
// Normalisierung mit VERLUSTFREIEM Durchreichen unbekannter Werte (kein stiller Verlust).

export const MEDI_TYPES = new Set<string>([
  'audio', 'book', 'card', 'electronic', 'fiche', 'film', 'magazine', 'manuscript',
  'map', 'newspaper', 'photo', 'tombstone', 'video',
]);

/** Bekannter MEDI-Wert → kanonisch (lowercase); unbekannter → getrimmt durchgereicht. */
export function normalizeMedi(value: string): string {
  const v = value.trim();
  const lower = v.toLowerCase();
  return MEDI_TYPES.has(lower) ? lower : v;
}

// ── 5. Evidenz-Bewertung `_EVAL` (Spec 12 §3, BL-83) ──────────────────────────
// Die drei Achsen + der Informant reisen in BEIDEN Formaten unter DENSELBEN vier Namen:
// GEDCOM als `_`-Subtags unter `SOUR`→`_EVAL`, GRAMPS als `type` eines Zitat-Attributs.
// Deshalb EINE Tabelle statt zwei (v8 hielt sie doppelt: `_writeSourCits` + `_GR_EVAL_ATTR`).
// Wire-Namen sind aus dem v8-Orakel übernommen; die MODELL-Feldnamen weichen bewusst ab
// (`source`/`information`/`evidence` statt `srcType`/`infoQual`/`evidence`).

/** Die vier Wire-Tags in der v8-Schreibreihenfolge — sie IST die kanonische Ausgabefolge. */
export const EVAL_TAGS = ['_STYP', '_INFO', '_EVID', '_INFM'] as const;
export type EvalTag = (typeof EVAL_TAGS)[number];

/** Zulässige Enum-Werte je Achse; `_INFM` ist Freitext (oder Person-Xref) → keine Menge. */
const EVAL_VALUES: Record<EvalTag, ReadonlySet<string> | null> = {
  _STYP: new Set(['original', 'derivative', 'authored']),
  _INFO: new Set(['primary', 'secondary', 'undetermined']),
  _EVID: new Set(['direct', 'indirect', 'negative']),
  _INFM: null,
};

export function isEvalTag(tag: string): tag is EvalTag {
  return tag === '_STYP' || tag === '_INFO' || tag === '_EVID' || tag === '_INFM';
}

/**
 * Setzt eine Achse aus ihrem Wire-Wert. Ein unbekannter Enum-Wert fällt auf `''` zurück
 * (dieselbe Vorsicht wie bei `_HSTAT`/`_HWGT` in gedcom-parse.ts): ein fremder oder künftiger
 * Wert darf nicht dazu führen, dass eine Auswertung ihn als gültige Aussage liest. Parser und
 * Dirty-Check gehen durch DIESELBE Normalisierung — ein exotischer Wert kippt einen Record
 * daher nicht in „geändert", er bleibt über den Passthrough-Backbone byte-treu erhalten.
 */
export function applyEvalAxis(ev: EvidenceEval, tag: EvalTag, raw: string): void {
  const v = raw.trim();
  if (tag === '_INFM') {
    ev.informant = v;
    return;
  }
  const val = EVAL_VALUES[tag]!.has(v) ? v : '';
  if (tag === '_STYP') ev.source = val as EvidenceEval['source'];
  else if (tag === '_INFO') ev.information = val as EvidenceEval['information'];
  else ev.evidence = val as EvidenceEval['evidence'];
}

/** Modellfeld → Wire-Wert. `''` heißt: der Tag wird NICHT geschrieben (v8-Gate-Parität). */
export function evalAxisValue(ev: EvidenceEval, tag: EvalTag): string {
  if (tag === '_STYP') return ev.source;
  if (tag === '_INFO') return ev.information;
  if (tag === '_EVID') return ev.evidence;
  return ev.informant ?? '';
}

/**
 * Bewertungs-Gleichheit für den Dirty-Check beider Write-Back-Pfade. `null` und ein leeres
 * Gerüst sind ÄQUIVALENT — beide schreiben nichts, ein Unterschied zwischen ihnen darf einen
 * Record nicht als „geändert" markieren (sonst würde ein unberührter Record neu synthetisiert
 * und verlöre seinen Byte-Stand, RT-2).
 */
export function evidenceEvalEqual(a: EvidenceEval | null, b: EvidenceEval | null): boolean {
  const la = isEvidenceEvalEmpty(a);
  const lb = isEvidenceEvalEmpty(b);
  if (la || lb) return la && lb;
  return EVAL_TAGS.every((t) => evalAxisValue(a!, t) === evalAxisValue(b!, t));
}

// ── 5. Signatur-Medium: GEDCOM `SOUR.REPO.CALN.MEDI` ↔ GRAMPS `<reporef medium=…>` ──────
// (BL-245, ADR-v9-180.) Abgeleitet aus den GRAMPS-Quellen SELBST, nicht aus einer
// Bestandsdatei: `plugins/lib/libgedcom.py::MEDIA_MAP` (GEDCOM-Wert, kleingeschrieben →
// Enum) und `gen/lib/srcmediatype.py::_DATAMAP` (Enum → der `xml_str`, den GRAMPS in die
// Datei schreibt). Beleg im Realbestand: `<reporef … medium="Book"/>` an 9 Stellen.
//
// NICHT UMKEHRBAR, und zwar von GRAMPS aus so gebaut: `microfiche` und `microfilm` fallen
// mit `fiche` auf denselben Enum-Wert, `grave` mit `tombstone`. Der Rückweg wählt den
// kanonischen GEDCOM-Wert (`fiche`/`tombstone`); ein `microfilm` kehrt daher als `fiche`
// zurück. Das ist eine Repräsentationsgrenze des Zielformats, kein Fehler unserer Abbildung
// — sie steht als solche in [13 §1] und tritt im Realbestand 0× auf (dort nur `manuscript`).
//
// Unbekannte Werte reisen WÖRTLICH in beide Richtungen: GRAMPS legt sie als CUSTOM-Typ mit
// genau diesem Text ab (`MEDIA_MAP.get(name.lower(), (CUSTOM, name))`), verliert sie also
// nicht — und wir dürfen sie deshalb ebenfalls nicht normalisieren (LP-1).

const MEDIUM_BY_MEDI: Record<string, string> = {
  audio: 'Audio',
  book: 'Book',
  card: 'Card',
  electronic: 'Electronic',
  fiche: 'Fiche',
  microfiche: 'Fiche',
  microfilm: 'Fiche',
  film: 'Film',
  magazine: 'Magazine',
  manuscript: 'Manuscript',
  map: 'Map',
  newspaper: 'Newspaper',
  photo: 'Photo',
  tombstone: 'Tombstone',
  grave: 'Tombstone',
  video: 'Video',
};

/** Kanonischer GEDCOM-Wert je GRAMPS-`medium` (Rückweg; die Mehrdeutigen s. o.). */
const MEDI_BY_MEDIUM: Record<string, string> = {
  Audio: 'audio',
  Book: 'book',
  Card: 'card',
  Electronic: 'electronic',
  Fiche: 'fiche',
  Film: 'film',
  Magazine: 'magazine',
  Manuscript: 'manuscript',
  Map: 'map',
  Newspaper: 'newspaper',
  Photo: 'photo',
  Tombstone: 'tombstone',
  Video: 'video',
};

/** `MEDI`-Wert → `<reporef medium>`. Unbekanntes bleibt wörtlich (GRAMPS-CUSTOM). */
export function mediToGrampsMedium(medi: string): string {
  if (!medi) return '';
  return MEDIUM_BY_MEDI[medi.toLowerCase()] ?? medi;
}

/** `<reporef medium>` → `MEDI`-Wert. Unbekanntes bleibt wörtlich. */
export function grampsMediumToMedi(medium: string): string {
  if (!medium) return '';
  return MEDI_BY_MEDIUM[medium] ?? medium;
}

// ── 7. NAME.TYPE ↔ GRAMPS `<name type>` (BL-292) ──────────────────────────────
// GEDCOM 5.5.1 `NAME_TYPE` kennt `aka`/`birth`/`immigrant`/`maiden`/`married` (+ Freitext),
// GRAMPS die ausgeschriebenen Formen. EINE Tabelle für beide Richtungen — dieselbe Regel
// wie bei `_EVAL` (BL-83): unbekannte Werte reisen VERLUSTFREI durch, statt auf einen
// Default zu fallen (ein erfundener Typ wäre schlimmer als ein fremder).

const NAME_TYPE_ZU_GRAMPS: Record<string, string> = {
  aka: 'Also Known As', birth: 'Birth Name', immigrant: 'Unknown',
  maiden: 'Birth Name', married: 'Married Name',
};

const GRAMPS_ZU_NAME_TYPE: Record<string, string> = {
  'also known as': 'aka', 'birth name': 'birth', 'married name': 'married',
};

/** GEDCOM-`NAME.TYPE` → GRAMPS-`<name type>`; Unbekanntes bleibt, wie es ist. */
export function nameTypeToGramps(value: string): string {
  const v = value.trim();
  return NAME_TYPE_ZU_GRAMPS[v.toLowerCase()] ?? v;
}

/** GRAMPS-`<name type>` → GEDCOM-`NAME.TYPE`; Unbekanntes bleibt, wie es ist. */
export function nameTypeFromGramps(value: string): string {
  const v = value.trim();
  return GRAMPS_ZU_NAME_TYPE[v.toLowerCase()] ?? v;
}
