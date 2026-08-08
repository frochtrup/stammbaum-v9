// tests/ui/plain-input.test.ts — Wächter: KEINE Texteingabe ohne abgeschaltete Autokorrektur.
//
// Nutzer-Befund 2026-08-08: „bei den Eingaben wirkt die Autokorrektur, das ist bei Namen und
// Orten natürlich nicht hilfreich". Der Fix ist eine Wertequelle (`ui/shell/plain-input.ts`)
// plus ein Spread je Feld — und damit genau die Sorte Konvention, die ohne Zwang wiederkehrt
// (Vorbild: die `<select bind:value>`-Falle, die nach ihrer ersten Behebung in sieben neuen
// Stellen wieder auftauchte, Spec 32 TST-12).
//
// Warum ein Quelltext-Scan und keine DOM-Prüfung: `autocorrect` wirkt nur auf dem echten
// Zielgerät (iOS Safari) — in happy-dom ist es ein wirkungsloses Attribut, und in Chromium
// gibt es das Verhalten gar nicht. Prüfbar ist also nur, ob es DRANSTEHT; genau das prüft
// dieser Test, dafür aber an JEDER Fundstelle statt an einem Beispiel.
//
// `type="number"` ist bewusst NICHT erfasst (Jahre/Koordinaten kennen keine Textkorrektur),
// ebenso wenig `type="checkbox"`/`"radio"`/`"date"`.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const WURZELN = ['ui', 'app-orte'];

function svelteDateien(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e !== 'node_modules' && e !== 'dist') svelteDateien(p, out);
      continue;
    }
    if (p.endsWith('.svelte')) out.push(p);
  }
  return out;
}

/** Alle Fundstellen als `datei:zeile` — je Eintrag ein Feld, das den Spread tragen muss. */
function fundstellen(muster: RegExp): { ort: string; zeile: string }[] {
  const treffer: { ort: string; zeile: string }[] = [];
  for (const wurzel of WURZELN) {
    for (const f of svelteDateien(wurzel)) {
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((zeile, i) => {
          if (muster.test(zeile)) treffer.push({ ort: `${f}:${i + 1}`, zeile: zeile.trim() });
        });
    }
  }
  return treffer;
}

describe('Autokorrektur ist an jeder Texteingabe abgeschaltet (Nutzer-Befund 2026-08-08)', () => {
  it('jede text-/search-Eingabe trägt {...PLAIN_FIELD}', () => {
    const felder = fundstellen(/type="(text|search)"/);
    // Zählung VOR der Prüfung: eine Schleife über eine leere Menge ist ein grüner Test,
    // der nichts sagt (Spec 32, Reflex aus ADR-v9-200).
    expect(felder.length).toBeGreaterThan(50);
    const ohne = felder.filter((t) => !t.zeile.includes('PLAIN_FIELD'));
    expect(ohne.map((t) => t.ort)).toEqual([]);
  });

  it('jede <textarea> trägt {...PROSE_FIELD} (Autokorrektur aus, Rechtschreibprüfung an)', () => {
    const felder = fundstellen(/<textarea/);
    expect(felder.length).toBeGreaterThan(5);
    const ohne = felder.filter((t) => !t.zeile.includes('PROSE_FIELD'));
    expect(ohne.map((t) => t.ort)).toEqual([]);
  });

  it('die Werte stehen an EINER Stelle — kein handgeschriebenes autocorrect-Attribut daneben', () => {
    const handarbeit = fundstellen(/\bautocorrect=/).filter(
      (t) => !t.ort.startsWith('ui/shell/plain-input'),
    );
    expect(handarbeit.map((t) => t.ort)).toEqual([]);
  });
});
