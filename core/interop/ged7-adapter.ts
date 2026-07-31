// core/interop/ged7-adapter.ts — GED5→GED7 Baum-Adapter (Spec 13 §4, GEDCOM.md §2).
// Reiner Knotenbaum-Transform; HEAD-Deltas (CHAR/FORM/VERS/SCHMA) macht der Serializer.
//
// GED7-Deltas auf Record-Ebene:
//   0 NOTE @x@  → 0 SNOTE @x@          (geteilte Notiz)
//   1 REFN + 2 TYPE → 1 EXID + 2 TYPE  (externe ID)
//   1 NOTE Kein bekanntes Ereignis: X → 1 NO X   (bestätigtes Fehlen)
//   _TRAN → TRAN                       (Übersetzung)
//   ASSO/RELA → ASSO/ROLE (+PHRASE)    (Rolle — Enum, s. ged7Role)
// CONC-Auflösung (GED7 verbietet CONC) ist bei unserem Passthrough-Writer nicht nötig,
// solange die Quelle keine CONC enthält; enthält sie welche, faltet foldConc sie in CONT.

import type { GedNode } from './gedcom-tree';

const NO_EVENT_RE = /^Kein bekanntes Ereignis:\s*([A-Z]+)$/;

/**
 * `ROLE` ist in GEDCOM 7 eine ENUMERATION, kein Freitext (gegen die öffentliche
 * Definition geprüft: https://gedcom.io/terms/v7/enumset-ROLE). 5.5.1s `RELA` ist
 * dagegen frei — ein 1:1-Umbenennen des Tags schreibt also deutschen Klartext
 * („Taufpate") in ein Enum-Feld und erzeugt ungültiges GEDCOM 7 (BL-241).
 */
const ROLE_ENUM = new Set([
  'CHIL', 'CLERGY', 'FATH', 'FRIEND', 'GODP', 'HUSB', 'MOTH', 'MULTIPLE',
  'NGHBR', 'OFFICIATOR', 'PARENT', 'SPOU', 'WIFE', 'WITN', 'OTHER',
]);

/**
 * Bekannte Klartext-Rollen → Enum. Deckt die acht Presets der Assoziations-Eingabe
 * (`ui/views/person/PersonAssociations.svelte`) sowie die geläufigen englischen
 * Entsprechungen aus Fremddateien ab. Bewusst KEINE Rateheuristik darüber hinaus:
 * was hier nicht steht, wird `OTHER` + `PHRASE` — das ist verlustfrei und ehrlich,
 * eine falsche Enum-Zuordnung wäre es nicht.
 */
const ROLE_BY_TEXT = new Map<string, string>([
  ['pate', 'GODP'], ['patin', 'GODP'], ['taufpate', 'GODP'], ['taufpatin', 'GODP'],
  ['godparent', 'GODP'], ['godfather', 'GODP'], ['godmother', 'GODP'],
  ['zeuge', 'WITN'], ['zeugin', 'WITN'], ['trauzeuge', 'WITN'], ['trauzeugin', 'WITN'],
  ['witness', 'WITN'],
  ['freund', 'FRIEND'], ['freundin', 'FRIEND'], ['friend', 'FRIEND'],
  ['nachbar', 'NGHBR'], ['nachbarin', 'NGHBR'], ['neighbour', 'NGHBR'], ['neighbor', 'NGHBR'],
  ['pfarrer', 'CLERGY'], ['priester', 'CLERGY'], ['geistlicher', 'CLERGY'], ['clergy', 'CLERGY'],
  ['standesbeamter', 'OFFICIATOR'], ['officiator', 'OFFICIATOR'],
]);

/**
 * Bildet einen `RELA`-Freitext auf die GED7-Rolle ab: Enum-Wert plus optionale
 * `PHRASE` mit dem ursprünglichen Wortlaut.
 *
 * Drei Fälle:
 *   - der Text IST bereits ein Enum-Wert (Fremddatei, GED7-Rückimport) → unverändert,
 *     keine PHRASE (sonst wüchse bei jedem Durchlauf eine redundante Zeile nach).
 *   - bekannter Klartext → Enum + PHRASE mit dem Original (maschinenlesbar UND verlustfrei).
 *   - alles andere → `OTHER` + PHRASE.
 */
export function ged7Role(rela: string): { role: string; phrase: string | null } {
  const text = rela.trim();
  if (ROLE_ENUM.has(text)) return { role: text, phrase: null };
  const mapped = ROLE_BY_TEXT.get(text.toLowerCase());
  return { role: mapped ?? 'OTHER', phrase: text === '' ? null : text };
}

function cloneNode(n: GedNode): GedNode {
  return {
    level: n.level,
    xref: n.xref,
    tag: n.tag,
    value: n.value,
    children: n.children.map(cloneNode),
  };
}

/** Transformiert einen Record-Baum von GED5 nach GED7 (rein, neuer Baum). */
export function transformGed7(rec: GedNode): GedNode {
  const out = cloneNode(rec);
  // Record-Ebene: geteilte NOTE → SNOTE.
  if (out.tag === 'NOTE' && out.xref) out.tag = 'SNOTE';
  transformSubtree(out, out.tag === 'HEAD');
  return out;
}

function transformSubtree(node: GedNode, isHead: boolean): void {
  const kept: GedNode[] = [];
  for (const c of node.children) {
    // 1 NOTE "Kein bekanntes Ereignis: BIRT" → 1 NO BIRT
    if (!isHead && c.tag === 'NOTE') {
      const m = NO_EVENT_RE.exec(c.value);
      if (m) {
        kept.push({ level: c.level, xref: null, tag: 'NO', value: m[1], children: [] });
        continue;
      }
    }
    // Externe ID: REFN → EXID
    if (c.tag === 'REFN') c.tag = 'EXID';
    // Übersetzungen: _TRAN → TRAN
    if (c.tag === '_TRAN') c.tag = 'TRAN';
    // ASSO-Rolle: RELA (Freitext) → ROLE (Enum) + optionale PHRASE (BL-241).
    if (node.tag === 'ASSO' && c.tag === 'RELA') {
      const { role, phrase } = ged7Role(c.value);
      c.tag = 'ROLE';
      c.value = role;
      if (phrase) {
        c.children = [
          { level: c.level + 1, xref: null, tag: 'PHRASE', value: phrase, children: [] },
          ...c.children,
        ];
      }
    }
    transformSubtree(c, false);
    kept.push(c);
  }
  node.children = kept;
}

// --- SCHMA: Deklaration der eigenen Extension-Tags (BL-242) -------------------
//
// GEDCOM 7 unterscheidet DOKUMENTIERTE und UNDOKUMENTIERTE Extension-Tags (öffentliche
// Spec, HEAD.SCHMA/TAG): ein `_`-Tag ohne SCHMA-Eintrag ist undokumentiert — erlaubt,
// aber seine Bedeutung ist „durch seine Superstruktur und seinen Tag" bestimmt, also rein
// datei-lokal; die Spec empfiehlt ausdrücklich, keine zu verwenden. Erst die URI gibt dem
// Tag eine Identität über die Datei hinaus: zwei Programme, die beide `_EVAL` schreiben,
// meinen nur dann dasselbe, wenn sie auf dieselbe URI zeigen.
//
// Die Liste wird aus den TATSÄCHLICH geschriebenen Tags abgeleitet, nicht gepflegt. Das
// v8-Orakel (`gedcom-writer.js` `_g7WriteSchma`) führte eine feste 29er-Liste — die
// deklarierte einerseits Tags, die in der Datei gar nicht vorkommen, und verfehlte
// andererseits alles seither Hinzugekommene (`_TASKID`, `_HKIND`, `_HREF` fehlen dort
// bereits). Eine zweite, nachzupflegende Wahrheit neben dem Writer; abgeleitet kann sie
// nicht driften.

/**
 * URI-Basis der Extension-Tags. Bewusst die des v8-Orakels: dieselbe URI bedeutet dasselbe
 * Konzept — ein neuer Präfix behauptete, `_EVAL` aus v8 und aus v9 seien verschiedene Dinge.
 *
 * BEKANNTE GRENZE: deklariert werden ALLE geschriebenen `_`-Tags, also auch FREMDE, die
 * nur durchgereicht werden (an Realdaten gemessen: von 14 deklarierten Tags einer
 * Ancestris-Datei stammen die meisten — `_LATI`/`_STYLE`/`_VALID`/… — nicht von uns). Sie
 * unter unserem Namensraum zu führen heißt streng genommen „in DIESEM Dokument bedeutet
 * `_LATI`, was Stammbaum darunter versteht". Die Alternative wäre, sie undeklariert zu
 * lassen — laut Spec zulässig (ihre Bedeutung ergibt sich dann aus Superstruktur + Tag),
 * aber ausdrücklich nicht empfohlen. Bewusst so gewählt, weil die Unterscheidung „eigener
 * vs. fremder Tag" nur über eine gepflegte Zweitliste ginge — genau die, die dieser Bau
 * abschafft. Sollte sich das als Fehlannahme erweisen, ist es EINE Filterstelle hier.
 */
const EXT_URI_BASE = 'https://github.com/frochtrup/Stammbaum/ext';

/** Alle `_`-Tags eines Baums, aufsteigend sortiert (deterministische Ausgabe). */
function collectExtTags(node: GedNode, seen: Set<string>): void {
  if (node.tag.startsWith('_')) seen.add(node.tag);
  for (const c of node.children) collectExtTags(c, seen);
}

/**
 * Der `1 SCHMA`-Block für einen fertig nach GED7 transformierten Baum — `null`, wenn die
 * Datei keinen einzigen Extension-Tag führt (ein leerer Block deklarierte nichts).
 *
 * Muss NACH `transformGed7` laufen: dort wird u. a. `_TRAN` zu `TRAN`, ein vorher
 * gesammelter Tag wäre also falsch. Ein bereits vorhandener SCHMA-Block wird vom
 * Aufrufer ersetzt, nicht ergänzt — sonst wüchse bei jedem GED7→GED7-Durchlauf einer nach.
 */
export function g7Schma(roots: readonly GedNode[]): GedNode | null {
  const seen = new Set<string>();
  for (const r of roots) collectExtTags(r, seen);
  if (seen.size === 0) return null;
  return {
    level: 1,
    xref: null,
    tag: 'SCHMA',
    value: '',
    children: [...seen].sort().map((tag) => ({
      level: 2,
      xref: null,
      tag: 'TAG',
      value: `${tag} ${EXT_URI_BASE}/${tag}`,
      children: [],
    })),
  };
}
