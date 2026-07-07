// tests/roundtrip/roundtrip-helpers.ts — net_delta / Idempotenz-Vergleich (Spec 13 §1,
// portiert aus legacy-v8 test-roundtrip.js: assembleLines + calcNetDelta).
//
// net_delta ist KEIN Byte-Vergleich gegen die Ur-Quelle, sondern der Delta der
// LOGISCHEN Zeilenanzahl (CONC/CONT in den Elternwert gefaltet, `@@`→`@`, getrimmt,
// Leerzeilen verworfen, Zeilenende-agnostisch) minus zulässiger PEDI-Zuwächse.
// out1===out2 hingegen ist Byte-Idempotenz zwischen den zwei Writer-Durchläufen.

/**
 * Faltet GEDCOM-Text in logische Zeilen: CONC/CONT verschmelzen mit dem Elternwert,
 * `@@`→`@`, trim, Leerzeilen raus. Zeilenende-agnostisch (\r\n | \r | \n).
 */
export function assembleLines(text: string): string[] {
  const result: string[] = [];
  let buf: string | null = null;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = src.split(/\r\n|\r|\n/);
  for (const raw of lines) {
    const line = raw.replace(/@@/g, '@').trim();
    if (!line) continue;
    const m = /^(\d+) (CONC|CONT)(?: (.*))?$/.exec(line);
    if (m && buf !== null) {
      buf += m[2] === 'CONT' ? '\n' + (m[3] ?? '') : (m[3] ?? '');
    } else {
      if (buf !== null) result.push(buf);
      buf = line;
    }
  }
  if (buf !== null) result.push(buf);
  return result;
}

export interface NetDelta {
  /** logische Zeilenanzahl-Differenz (out − orig) */
  delta: number;
  /** zusätzlich geschriebene PEDI-Zeilen (erlaubt, Spec: Konvention-Zuwachs) */
  pediDelta: number;
  /** delta ohne die erlaubten PEDI-Zuwächse — muss 0 sein */
  normDelta: number;
}

export function calcNetDelta(orig: string, out: string): NetDelta {
  const delta = assembleLines(out).length - assembleLines(orig).length;
  const origPedi = (orig.match(/^\s*2 PEDI\b/gm) || []).length;
  const outPedi = (out.match(/^\s*2 PEDI\b/gm) || []).length;
  const pediDelta = Math.max(0, outPedi - origPedi);
  return { delta, pediDelta, normDelta: delta - pediDelta };
}

/** Findet den ersten logischen Zeilenunterschied (Diagnose bei Instabilität). */
export function firstDiff(a: string, b: string): string | null {
  const la = a.split(/\r\n|\r|\n/);
  const lb = b.split(/\r\n|\r|\n/);
  const n = Math.max(la.length, lb.length);
  for (let i = 0; i < n; i++) {
    if (la[i] !== lb[i]) {
      return `Zeile ${i + 1}:\n  out1: ${JSON.stringify(la[i])}\n  out2: ${JSON.stringify(lb[i])}`;
    }
  }
  return null;
}
