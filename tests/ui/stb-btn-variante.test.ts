// tests/ui/stb-btn-variante.test.ts — `.stb-btn` ohne `data-variant` ist unsichtbar.
//
// WARUM ES DIESEN WÄCHTER GIBT (Nutzer-Befund 2026-08-12, „das weisse feld ist nicht
// lesbar"): `.stb-btn` in `design-system.css` setzt Maße, Typo und Rahmen — Hintergrund
// und Textfarbe kommen ausschließlich aus den Varianten (`primary`/`secondary`/`danger`).
// Ein Knopf ohne Variante fällt deshalb auf den User-Agent-Hintergrund zurück; gemessen
// im laufenden Programm: `rgb(239, 239, 239)` hinter `rgb(242, 232, 212)` Text —
// Kontrast ≈ 1,02:1, also praktisch unsichtbar. Drei frisch gebaute Knöpfe der
// Erfassungs-Fläche hatten genau das (BL-352/353); die übrigen 74 Fundstellen im Repo
// waren korrekt, es war also kein Muster, sondern ein Vergessen.
//
// WARUM KEIN BESTEHENDES GATE DAS FÄNGT — der eigentliche Punkt: `npm run lint` sieht
// keine Farben, und `check:a11y` (axe-core) prüft Kontrast zwar grundsätzlich, läuft hier
// aber über Komponententests in happy-dom — dort ist `design-system.css` gar nicht
// geladen, jede berechnete Farbe wäre Fiktion. Ein Kontrast-Gate ist an dieser Stelle
// also nicht nachrüstbar; prüfbar ist die VORAUSSETZUNG dafür, dass die Farbe überhaupt
// gesetzt wird. Genau das tut dieser Test — Zwang statt Erinnerung (CLAUDE.md).
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const WURZELN = ['ui', 'app', 'app-orte'];

function svelteDateien(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const pfad = join(dir, name);
    if (statSync(pfad).isDirectory()) {
      if (!/node_modules|\.git|dist/.test(pfad)) svelteDateien(pfad, out);
    } else if (pfad.endsWith('.svelte')) {
      out.push(pfad);
    }
  }
  return out;
}

/** Jedes öffnende `<button …>`-Tag einer Datei, das die Primitive trägt. */
function stbBtnTags(src: string): string[] {
  return (src.match(/<button[\s\S]*?>/g) ?? []).filter(
    (tag) => /class="[^"]*\bstb-btn\b/.test(tag) || /class={[^}]*stb-btn/.test(tag),
  );
}

describe('`.stb-btn` trägt immer eine Variante', () => {
  const dateien = WURZELN.flatMap((w) => svelteDateien(w));

  it('findet die Fundstellen überhaupt (sonst prüft der Test nichts)', () => {
    // Die Zählung VOR der Zusicherung: eine grüne Schleife über eine leere Menge wäre
    // wertlos (ADR-v9-200). Beim Anlegen waren es 77 Knöpfe in 5 Wurzeln.
    expect(dateien.length).toBeGreaterThan(0);
    const alle = dateien.flatMap((f) => stbBtnTags(readFileSync(f, 'utf8')));
    expect(alle.length).toBeGreaterThan(50);
  });

  it('kein `.stb-btn` ohne `data-variant`', () => {
    const ohne: string[] = [];
    for (const f of dateien) {
      for (const tag of stbBtnTags(readFileSync(f, 'utf8'))) {
        if (!/data-variant/.test(tag)) ohne.push(`${f}: ${tag.replace(/\s+/g, ' ').slice(0, 80)}`);
      }
    }
    expect(ohne).toEqual([]);
  });
});
