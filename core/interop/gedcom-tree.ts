// core/interop/gedcom-tree.ts — generischer GEDCOM-Zeilenbaum (Spec 13 §2.1, INV-PT).
//
// Das Fundament des Passthrough-Prinzips: JEDE GEDCOM-Zeile wird zu einem Knoten
// {tag, value, xref, pointer, children[]}. Erkannte Knoten projiziert der Parser
// später ins Domänenmodell (gedcom-parse.ts); nicht erkannte bleiben als Roh-Teilbaum
// hängen und werden vom Writer verbatim wieder ausgegeben. EIN Mechanismus statt der
// zehn v8-Ad-hoc-Kontexte (Altlast 03 §4).
//
// Reine Funktionen, DOM-/Plattform-frei (INV-ARCH-1).

/** Ein GEDCOM-Zeilenknoten. */
export interface GedNode {
  /** Level (0 für Records, >0 für Sub-Zeilen). */
  level: number;
  /** Xref-ID eines Records (`@I1@`) oder null. Nur auf Level-0-Records belegt. */
  xref: string | null;
  /** Tag (`INDI`, `NAME`, `_UID`, `CONT`, …). */
  tag: string;
  /** Zeilenwert (Rest nach dem Tag); '' wenn keiner. Pointer-Werte (`@S2@`) inklusive. */
  value: string;
  /** Untergeordnete Zeilen (nächsthöheres Level). */
  children: GedNode[];
}

/**
 * Eine geparste GEDCOM-Zeile (roh, vor Baumbau).
 * `raw` bewahrt die exakte Original-Zeile für Diagnose (nicht für Ausgabe).
 */
export interface GedLine {
  level: number;
  xref: string | null;
  tag: string;
  value: string;
}

const LINE_RE = /^(\d+)\s+(?:(@[^@]+@)\s+)?([A-Za-z0-9_.]+)(?: (.*))?$/;

/**
 * Zerlegt GEDCOM-Text in flache Zeilen.
 * - Trennt an `\r\n`, `\r` oder `\n` (Eingabe-tolerant; Ausgabe normiert der Writer).
 * - Führendes BOM wird entfernt.
 * - Leere Zeilen werden übersprungen (v8-Parität: assembleLines trimmt sie).
 * - `@@` → `@` NICHT hier — Escaping bleibt am Wert erhalten (siehe unescapeAt/escapeAt).
 */
export function lexLines(text: string): GedLine[] {
  let t = text;
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  const rawLines = t.split(/\r\n|\r|\n/);
  const out: GedLine[] = [];
  for (const raw of rawLines) {
    if (raw.trim() === '') continue;
    const m = LINE_RE.exec(raw);
    if (!m) {
      // Nicht-konforme Zeile: als Wert der letzten Zeile nicht sinnvoll rekonstruierbar;
      // wir bewahren sie als Level-99-Fremdkörper (praktisch nie in echten Dateien).
      out.push({ level: 0, xref: null, tag: '_MALFORMED', value: raw });
      continue;
    }
    out.push({
      level: parseInt(m[1], 10),
      xref: m[2] ?? null,
      tag: m[3],
      value: m[4] ?? '',
    });
  }
  return out;
}

/**
 * Baut aus flachen Zeilen den verschachtelten Knotenbaum.
 * Level 0 → Wurzel-Records. Jede Zeile hängt unter der letzten Zeile mit Level−1.
 * Toleriert Level-Sprünge (Legacy-Exporter): eine Zeile hängt am jüngsten Vorfahren
 * mit kleinerem Level.
 */
export function buildTree(lines: GedLine[]): GedNode[] {
  const roots: GedNode[] = [];
  // Stack der offenen Knoten, indiziert nach Level.
  const stack: GedNode[] = [];
  for (const l of lines) {
    const node: GedNode = {
      level: l.level,
      xref: l.xref,
      tag: l.tag,
      value: l.value,
      children: [],
    };
    if (l.level === 0) {
      roots.push(node);
      stack.length = 0;
      stack[0] = node;
    } else {
      // Finde den Elternknoten: jüngster Knoten mit Level < node.level.
      let parentLevel = l.level - 1;
      while (parentLevel >= 0 && !stack[parentLevel]) parentLevel--;
      const parent = parentLevel >= 0 ? stack[parentLevel] : null;
      if (parent) parent.children.push(node);
      else roots.push(node);
      // Alle tieferen/gleichen Stack-Einträge sind nun geschlossen.
      stack.length = l.level;
      stack[l.level] = node;
    }
  }
  return roots;
}

/** Parst Text direkt zum Knotenbaum. */
export function parseTree(text: string): GedNode[] {
  return buildTree(lexLines(text));
}

/**
 * Die Zeilenlängen-Grenze von GEDCOM 5.5.1: 255 BYTES je physischer Zeile, Level und Tag
 * eingerechnet (BL-305). GEDCOM 7 kennt sie nicht — dort steht `Infinity`, und `CONC`
 * ist ohnehin abgeschafft.
 */
export const ZEILEN_MAX_BYTES = 255;

/**
 * Wie viele JS-Zeichen von `s` in `maxBytes` UTF-8-Bytes passen, OHNE ein Zeichen zu
 * zerreißen (v8-Orakel `gedcom-writer.js` `_sliceByteLen`). Ein Umlaut zählt 2 Bytes,
 * ein Emoji als Surrogatpaar 4 — nach Zeichen zu rechnen sprengte die Grenze still.
 * Mindestens 1, damit die Schleife auch bei absurd kleinem `maxBytes` terminiert.
 */
function sliceByteLen(s: string, maxBytes: number): number {
  if (maxBytes === Infinity) return s.length;
  let bytes = 0, i = 0;
  while (i < s.length) {
    const c = s.charCodeAt(i);
    const surrogat = c >= 0xd800 && c <= 0xdbff && i + 1 < s.length;
    const b = surrogat ? 4 : c < 0x80 ? 1 : c < 0x800 ? 2 : 3;
    if (bytes + b > maxBytes) break;
    bytes += b;
    i += surrogat ? 2 : 1;
  }
  return i || (s.length ? 1 : 0);
}

/** UTF-8-Byte-Länge — die Grenze ist in Bytes formuliert, nicht in Zeichen. */
function byteLen(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) { n += 4; i++; }
    else n += c < 0x80 ? 1 : c < 0x800 ? 2 : 3;
  }
  return n;
}

/**
 * Eine Zeile ausgeben und, wo nötig, per `CONC` fortsetzen (BL-305, ADR-v9-211).
 *
 * `CONC` hängt den Folge-Wert OHNE Trennzeichen an (GEDCOM 5.5.1 §1 „Grammar"), der
 * Schnitt liegt deshalb an der BYTE-Grenze und nicht an einer Wortgrenze — ein
 * Wortgrenzen-Schnitt müsste das verschluckte Leerzeichen erfinden oder verlieren. So
 * macht es auch das v8-Orakel (`pushCont`), und so ist der Umbruch verlustfrei umkehrbar:
 * `assembleLines` faltet ihn wieder zusammen, `net_delta` bleibt 0.
 *
 * `contTiefe` ist die Ebene, auf der die Fortsetzung steht — die Kinder-Ebene des Knotens,
 * ausser der Knoten IST bereits eine Fortsetzung: ein `2 CONT` wird von `2 CONC` fortgesetzt,
 * nicht von `3 CONC`.
 */
function schreibeZeile(
  praefix: string,
  wert: string,
  contTiefe: number,
  out: string[],
  maxBytes: number,
): void {
  if (wert === '') { out.push(praefix); return; }
  // Ein Wert mit `\n` wird ZUERST in `CONT`-Zeilen zerlegt, dann greift die Byte-Grenze auf
  // jedem Stück (BL-378, ADR-v9-281). Roh geschrieben ergäbe ein Zeilenumbruch mitten im Wert
  // eine Ausgabe, die kein Leser mehr als GEDCOM-Zeile sieht — genau die Gefahr, die
  // [ADR-v9-266] E2 benannt hat, als sie die Schreib-Hälfte zur Lese-Hälfte forderte.
  //
  // WARUM HIER UND NICHT (nur) IM EMITTER: `textNode` (write-back-emit.ts) baut dieselbe
  // Zerlegung als Baumform und bleibt, wo sie steht — sie ist die Form, die der
  // Passthrough-Vergleich sieht. Aber sie deckt nur die Felder ab, an die jemand gedacht hat.
  // Seit `childValue` Fortsetzungen faltet, kann JEDER Modellwert ein `\n` tragen; die
  // Zusicherung „keine kaputte Zeile" gehört deshalb an die eine Stelle, durch die ausnahmslos
  // jeder Wert läuft. Zwang statt Erinnerung — für einen Wert ohne `\n` ändert sich nichts.
  if (wert.includes('\n')) {
    const teile = wert.split('\n');
    schreibeZeile(praefix, teile[0], contTiefe, out, maxBytes);
    // Die Fortsetzung steht auf `contTiefe` und wird ihrerseits von `CONC` fortgesetzt
    // (`2 CONT` → `2 CONC`, nicht `3 CONC`) — dieselbe Regel wie in `writeNode`.
    for (let i = 1; i < teile.length; i++) schreibeZeile(`${contTiefe} CONT`, teile[i], contTiefe, out, maxBytes);
    return;
  }
  const concPraefix = `${contTiefe} CONC`;
  let rest = wert;
  let p = praefix;
  for (;;) {
    let n = sliceByteLen(rest, maxBytes - byteLen(p) - 1);
    if (n < rest.length) n = schnittNebenLeerzeichen(rest, n);
    out.push(`${p} ${rest.slice(0, n)}`);
    rest = rest.slice(n);
    if (rest === '') return;
    p = concPraefix;
  }
}

/**
 * Rückt die Schnittstelle so weit nach links, dass an der Naht KEIN Leerzeichen steht —
 * weder am Ende des einen noch am Anfang des nächsten Stücks (BL-305, ADR-v9-211).
 *
 * WARUM, obwohl das v8-Orakel (`pushCont`) hart an der Byte-Grenze schneidet: `CONC` fügt
 * beim Zusammensetzen nichts ein, ein Leerzeichen an der Naht ist also inhaltlich korrekt —
 * aber es steht dann als FÜHRENDES oder NACHLAUFENDES Zeichen eines Zeilenwerts da, und
 * jeder trimmende Leser verliert es. Unser eigener `assembleLines` (das net_delta-Maß,
 * aus v8 portiert) trimmt: die Fixture dieses Tests, naiv an der Zeichengrenze umbrochen,
 * las sich als `GrünäckeräöüßÄÖÜ` statt `Grünäcker äöüßÄÖÜ` zurück — die Bilanz einer
 * Verlustmessung hätte das als geänderte Zeile gemeldet. Ein Umbruch, der die eigene
 * Messung stört, ist kein unsichtbarer Umbruch.
 *
 * Kostet je Zeile wenige Bytes und ist deterministisch; `n >= 1` hält die Schleife am
 * Laufen, auch wenn ein Wert nur aus Leerzeichen besteht.
 */
function schnittNebenLeerzeichen(s: string, n: number): number {
  while (n > 1 && (s.charCodeAt(n) === 32 || s.charCodeAt(n - 1) === 32)) n--;
  return n;
}

/**
 * Serialisiert einen Knotenbaum zurück zu GEDCOM-Zeilen.
 * Level werden aus der Baumtiefe abgeleitet (Wurzel = 0), NICHT aus node.level —
 * so bleibt der Writer korrekt, auch wenn ein Teilbaum umgehängt wurde.
 *
 * `maxBytes` ist per Default `Infinity`: der Baum-Writer ist format-AGNOSTISCH, die
 * 255-Byte-Politik gehört dorthin, wo die Format-Wahl bekannt ist (`serializeGedcom`).
 */
export function writeNode(
  node: GedNode,
  depth: number,
  out: string[],
  maxBytes: number = Infinity,
): void {
  let praefix = String(depth);
  if (depth === 0 && node.xref) praefix += ' ' + node.xref;
  praefix += ' ' + node.tag;
  const contTiefe = node.tag === 'CONC' || node.tag === 'CONT' ? depth : depth + 1;
  schreibeZeile(praefix, node.value, contTiefe, out, maxBytes);
  for (const c of node.children) writeNode(c, depth + 1, out, maxBytes);
}

/** Serialisiert mehrere Records; verbindet mit dem gegebenen Zeilenende. */
export function writeTree(roots: GedNode[], eol = '\r\n', maxBytes: number = Infinity): string {
  const out: string[] = [];
  for (const r of roots) writeNode(r, 0, out, maxBytes);
  return out.join(eol);
}

// --- Helfer für den Projektions-Layer (gedcom-parse.ts) ---------------------

/** Erstes direktes Kind mit dem gegebenen Tag, oder null. */
export function child(node: GedNode, tag: string): GedNode | null {
  for (const c of node.children) if (c.tag === tag) return c;
  return null;
}

/** Alle direkten Kinder mit dem gegebenen Tag. */
export function children(node: GedNode, tag: string): GedNode[] {
  return node.children.filter((c) => c.tag === tag);
}

/**
 * Sammelt reinen Text aus value + `CONC`/`CONT`-Kindern (GEDCOM-Textmodell §5).
 *
 * Wohnt hier und nicht im Projektions-Layer, seit `childValue` sie benutzt — eine zweite
 * Kopie in `gedcom-parse.ts` wäre die Sorte Doppelung, die auseinanderläuft.
 */
export function collectText(node: GedNode): string {
  let out = node.value;
  for (const c of node.children) {
    if (c.tag === 'CONC') out += c.value;
    else if (c.tag === 'CONT') out += '\n' + c.value;
  }
  return out;
}

/**
 * Wert eines direkten Kind-Tags MIT seinen Fortsetzungen, oder '' wenn nicht vorhanden.
 *
 * WARUM MIT FORTSETZUNGEN, AUSNAHMSLOS (BL-378, ADR-v9-281). Ein `CONC`/`CONT`-Kind macht den
 * Elternwert zum FRAGMENT — der volle Text steht erst mit ihm zusammen da. Wer den Wert allein
 * liest, kürzt ihn still. Und der Passthrough kann das nicht auffangen: `CONC`/`CONT` sind von
 * ihm bewusst ausgenommen (`FORTSETZUNG`, write-back.ts), sonst hängten die alten Fragmente an
 * jeden neuen Wert. Ein Wert, den das Modell BEANSPRUCHT, aber roh liest, ist deshalb beim
 * nächsten Neubau des Records verloren — nicht latent, sondern sofort.
 *
 * Das trifft nicht nur die Tags, für die GEDCOM Fortsetzungen vorsieht: unser eigener
 * Serialisierer bricht JEDEN Wert über 255 Bytes per `CONC` um (ZEILEN_MAX_BYTES,
 * [ADR-v9-211]). Ein langer `_QUERY` aus der Import-Vergleichs-Fläche überlebte so genau einen
 * Speicher-Zyklus — die Arbeitskopie in IndexedDB ist serialisierter GEDCOM-Text, der Verlust
 * brauchte also nicht einmal eine Datei. Gemessen: 306 Zeichen rein, 246 zurück.
 *
 * [ADR-v9-266] hat dieselbe Lücke am Ereigniswert geschlossen und die Geschwister
 * (`DATE`/`PLAC`/`TYPE`/`PAGE`) bewusst liegen lassen, weil sie „heute ohne Daten im Bestand"
 * seien. Die Zusicherung wohnt jetzt in den zwei Funktionen, durch die jeder Wert läuft, statt
 * in einer Liste von Feldern, an die jemand denken muss.
 */
export function childValue(node: GedNode, tag: string): string {
  const c = child(node, tag);
  return c ? collectText(c) : '';
}

/**
 * `@@Sxx@@` → `@Sxx@` (GEDCOM-Escaping: ein `@` am Wert-Anfang wird verdoppelt).
 * Wir normieren Pointer-Werte für den Modell-Vergleich.
 */
export function unescapeAt(value: string): string {
  return value.replace(/^@@/, '@').replace(/@@$/, '@');
}
