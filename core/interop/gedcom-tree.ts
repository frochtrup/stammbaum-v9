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
 * Serialisiert einen Knotenbaum zurück zu GEDCOM-Zeilen.
 * Level werden aus der Baumtiefe abgeleitet (Wurzel = 0), NICHT aus node.level —
 * so bleibt der Writer korrekt, auch wenn ein Teilbaum umgehängt wurde.
 */
export function writeNode(node: GedNode, depth: number, out: string[]): void {
  let line = String(depth);
  if (depth === 0 && node.xref) line += ' ' + node.xref;
  line += ' ' + node.tag;
  if (node.value !== '') line += ' ' + node.value;
  out.push(line);
  for (const c of node.children) writeNode(c, depth + 1, out);
}

/** Serialisiert mehrere Records; verbindet mit dem gegebenen Zeilenende. */
export function writeTree(roots: GedNode[], eol = '\r\n'): string {
  const out: string[] = [];
  for (const r of roots) writeNode(r, 0, out);
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

/** Wert eines direkten Kind-Tags, oder '' wenn nicht vorhanden. */
export function childValue(node: GedNode, tag: string): string {
  const c = child(node, tag);
  return c ? c.value : '';
}

/**
 * `@@Sxx@@` → `@Sxx@` (GEDCOM-Escaping: ein `@` am Wert-Anfang wird verdoppelt).
 * Wir normieren Pointer-Werte für den Modell-Vergleich.
 */
export function unescapeAt(value: string): string {
  return value.replace(/^@@/, '@').replace(/@@$/, '@');
}
