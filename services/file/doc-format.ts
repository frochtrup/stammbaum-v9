// services/file/doc-format.ts — Erkennung des geladenen Dateiformats (Spec 14 §3.2).
//
// Die Arbeitskopie/der Import behandelt BYTES (Spec 14 §2). GEDCOM ist Text, GRAMPS ist
// gzip-XML. Diese beiden reinen Helfer entscheiden — magic-byte-basiert, NICHT nur an der
// Endung (eine `.gramps`-Datei kann theoretisch unkomprimiertes XML sein, und der Auto-Load
// aus der Arbeitskopie hat gar keinen Dateinamen mit Endung):
//   - `isGzip(bytes)`  : gzip-Magic `1F 8B` → muss vor dem Parsen entpackt werden.
//   - `detectDocFormat(text)` : am ENTPACKTEN Text — GRAMPS-XML vs. GEDCOM.
//
// Rein und headless testbar (kein DOM/Plattform-Zugriff).

export type DocFormat = 'gedcom' | 'gramps';

/** gzip-Magic (`1F 8B`) — GRAMPS-Dateien sind gzip-komprimiertes XML. */
export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/**
 * Format am ENTPACKTEN Text erkennen. GRAMPS-XML beginnt mit der XML-Deklaration bzw. dem
 * `<database>`-Wurzelelement der GRAMPS-DTD; alles andere gilt als GEDCOM (dessen erste
 * nicht-leere Zeile `0 HEAD`/`0 @…@` ist — nie ein `<`). Führender BOM/Whitespace wird
 * ignoriert.
 */
export function detectDocFormat(text: string): DocFormat {
  const head = text.replace(/^\uFEFF/, '').trimStart().slice(0, 512);
  if (/^<\?xml/i.test(head) || /<database\b/i.test(head) || head.includes('gramps-project.org')) {
    return 'gramps';
  }
  return 'gedcom';
}
