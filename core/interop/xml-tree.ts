// core/interop/xml-tree.ts — dependency-freier, struktur-erhaltender XML-Parser/Serializer
// für den GRAMPS-Roundtrip (Spec 13 §6). KEIN DOMParser (INV-ARCH-1: DOM-frei) — reine
// Funktion über Strings. Ziel: xml1===xml2 (Idempotenz) + logische Gleichheit zur Quelle.
//
// GRAMPS-Konventionen (aus der Orakel-Fixture verifiziert): UTF-8, 2-Space-Indent,
// self-closing leere Elemente, Entities &amp;/&lt;/&gt;/&quot;. Kein CDATA, keine Kommentare.
//
// Passthrough-Prinzip (INV-PT) gilt analog: jeder Knoten wird verbatim erfasst; der
// Projektions-Layer (gramps.ts) liest daraus das Modell, der Writer gibt den Baum wieder.

export interface XmlNode {
  tag: string;
  /** Attribute in Original-Reihenfolge (Reihenfolge-Treue für den Roundtrip). */
  attrs: [string, string][];
  children: XmlNode[];
  /** Textinhalt (nur bei Blattknoten mit Text; gemischter Inhalt → text + children). */
  text: string;
}

/** Prolog + DOCTYPE + Wurzel eines XML-Dokuments. */
export interface XmlDocument {
  /** Alles vor dem Wurzelelement (`<?xml …?>`, DOCTYPE), verbatim erhalten. */
  prolog: string;
  root: XmlNode;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

/** Escaping wie GRAMPS es ausgibt (Text-Kontext). */
export function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Escaping wie GRAMPS es für Attributwerte ausgibt (zusätzlich &quot;). */
export function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Parst ein XML-Dokument in { prolog, root }. Struktur-erhaltend: Attribut-Reihenfolge
 * und Textinhalte bleiben; Whitespace zwischen Elementen wird NICHT als Text bewahrt
 * (GRAMPS ist reines Element-XML mit deterministischer Einrückung — der Serializer
 * rekonstruiert die Einrückung). Blatt-Textknoten (z. B. `<type>Birth</type>`) bleiben.
 */
export function parseXml(xml: string): XmlDocument {
  let i = 0;
  const n = xml.length;

  // Prolog: alles bis zum ersten Element, das KEIN <?…?> oder <!…> ist.
  let j = 0;
  for (;;) {
    // überspringe Whitespace
    while (j < n && /\s/.test(xml[j])) j++;
    if (xml[j] === '<' && (xml[j + 1] === '?' || xml[j + 1] === '!')) {
      // <?...?> oder <!DOCTYPE ...> (evtl. mehrzeilig, keine verschachtelten <>)
      const close = xml[j + 1] === '?' ? '?>' : '>';
      const end = xml.indexOf(close, j);
      j = end + close.length;
    } else {
      break;
    }
  }
  const prologEnd = j;
  const prolog = xml.slice(0, prologEnd).replace(/\s+$/, '');
  i = prologEnd;

  function skipWs(): void {
    while (i < n && /\s/.test(xml[i])) i++;
  }

  function parseElement(): XmlNode {
    // erwartet xml[i] === '<'
    i++; // consume '<'
    let tagEnd = i;
    while (tagEnd < n && !/[\s/>]/.test(xml[tagEnd])) tagEnd++;
    const tag = xml.slice(i, tagEnd);
    i = tagEnd;
    const attrs: [string, string][] = [];
    // Attribute
    for (;;) {
      skipWs();
      if (xml[i] === '/' || xml[i] === '>') break;
      let nameEnd = i;
      while (nameEnd < n && !/[\s=/>]/.test(xml[nameEnd])) nameEnd++;
      const name = xml.slice(i, nameEnd);
      i = nameEnd;
      skipWs();
      let value = '';
      if (xml[i] === '=') {
        i++;
        skipWs();
        const q = xml[i];
        i++;
        const vEnd = xml.indexOf(q, i);
        value = decodeEntities(xml.slice(i, vEnd));
        i = vEnd + 1;
      }
      attrs.push([name, value]);
    }
    const node: XmlNode = { tag, attrs, children: [], text: '' };
    if (xml[i] === '/') {
      i += 2; // '/>'
      return node;
    }
    i++; // '>'
    // Inhalt
    for (;;) {
      // Text bis zum nächsten '<'
      const lt = xml.indexOf('<', i);
      const textChunk = xml.slice(i, lt);
      if (textChunk.trim() !== '') node.text += decodeEntities(textChunk);
      i = lt;
      if (xml[i + 1] === '/') {
        // Schließtag
        const gt = xml.indexOf('>', i);
        i = gt + 1;
        break;
      }
      node.children.push(parseElement());
    }
    return node;
  }

  skipWs();
  const root = parseElement();
  return { prolog, root };
}

/**
 * Serialisiert das Dokument zu XML. Rekonstruiert die GRAMPS-Einrückung (2 Spaces je
 * Tiefe), self-closing für leere Elemente, Text-Elemente inline. Idempotent: erneutes
 * Parsen+Serialisieren liefert dieselbe Ausgabe (xml1===xml2).
 */
export function serializeXml(doc: XmlDocument): string {
  const out: string[] = [];
  if (doc.prolog) out.push(doc.prolog);
  serializeNode(doc.root, 0, out);
  return out.join('\n') + '\n';
}

function serializeNode(node: XmlNode, depth: number, out: string[]): void {
  const indent = '  '.repeat(depth);
  let open = indent + '<' + node.tag;
  for (const [k, v] of node.attrs) open += ` ${k}="${escapeAttr(v)}"`;

  const hasChildren = node.children.length > 0;
  const hasText = node.text !== '';

  if (!hasChildren && !hasText) {
    out.push(open + '/>');
    return;
  }
  if (hasText && !hasChildren) {
    out.push(open + '>' + escapeText(node.text) + '</' + node.tag + '>');
    return;
  }
  // Gemischter Inhalt (Text UND Kinder) — Abbruch statt stiller Verlust (BL-81, LP-1).
  //
  // Bis hierher gab dieser Zweig nur die Kinder aus; `node.text` fiel weg, ohne dass
  // irgendetwas anschlug. Der Roundtrip merkte es nicht einmal: der zweite Durchlauf
  // erzeugte denselben Verlust und meldete brav `xml1 === xml2`.
  //
  // Warum nicht gerettet wird: WO der Text zwischen den Kindern stand, weiß dieses Modell
  // nicht — `text` ist ein String, `children` eine Liste, die Reihenfolge zwischen beiden
  // ist nirgends erfasst. „Text vor die Kinder" schriebe `<a><b/>Ende</a>` als
  // `<a>Ende<b/></a>` und machte aus einer unvollständigen Datei eine falsche. Wer das
  // ändern will, macht den Inhalt zuerst ordnungserhaltend (eine Liste aus Text- und
  // Element-Knoten) — dann ist es kein Sonderfall mehr, sondern der Normalfall.
  //
  // Gemessen (2026-07-21, `tests/core/xml-tree-mixed-content.test.ts`): in beiden echten
  // GRAMPS-Fixturen (5,7 MB, ~37.000 Elemente) kommt der Fall NULL mal vor — der Abbruch
  // kostet real nichts und bewacht den Datenverlust, der sonst niemandem auffiele.
  if (hasText) {
    const auszug = node.text.length > 60 ? node.text.slice(0, 60) + '…' : node.text;
    throw new Error(
      `xml-tree: gemischter Inhalt in <${node.tag}> — Text neben Kindelementen ` +
        `(${node.children.map((c) => `<${c.tag}>`).join(', ')}) kann nicht ordnungstreu ` +
        `geschrieben werden. Text: "${auszug}". Abbruch statt stillem Verlust (LP-1, BL-81).`,
    );
  }
  out.push(open + '>');
  for (const c of node.children) serializeNode(c, depth + 1, out);
  out.push(indent + '</' + node.tag + '>');
}

// --- Helfer für den Projektions-Layer (gramps.ts) ---------------------------

export function attr(node: XmlNode, name: string): string {
  for (const [k, v] of node.attrs) if (k === name) return v;
  return '';
}

export function firstChild(node: XmlNode, tag: string): XmlNode | null {
  for (const c of node.children) if (c.tag === tag) return c;
  return null;
}

export function childrenByTag(node: XmlNode, tag: string): XmlNode[] {
  return node.children.filter((c) => c.tag === tag);
}
