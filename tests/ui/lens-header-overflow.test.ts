// @vitest-environment happy-dom
// tests/ui/lens-header-overflow.test.ts — BL-95: die Lens-Kopfzeile schiebt keine Lens
// aus dem Bild (Spec 21 §2 „Aktionsreihen brechen um statt horizontal aus dem Bild zu
// scrollen", §9 B7).
//
// DER BEFUND, im echten Browser bei 375 px gemessen (2026-07-21): die Umschalter-Reihe
// braucht 385 px. Auf der Karte hat sie 351, im Baum nur 272 — dort teilt sich der
// Vollbild-Knopf die Zeile. „📖 Story (folgt)" begann bei x=275 und endete bei 383, lag
// also VOLLSTÄNDIG außerhalb des sichtbaren Bereichs und war nur durch Horizontal-Scroll
// ohne jede Affordanz erreichbar. Das ist derselbe v8-Befund B7, den v9 als Baseline
// gefixt hatte.
//
// WARUM HIER KEIN GEOMETRIE-TEST STEHT: happy-dom hat keine Layout-Engine —
// `getBoundingClientRect()` liefert durchweg 0, `scrollWidth` ebenso. Ein gerenderter
// Test KANN einen Überlauf prinzipiell nicht sehen (dieselbe Grenze wie bei
// `design-system-flex.test.ts`/`overlay-z-index.test.ts`). Prüfbar ist der MECHANISMUS:
// dass die geteilte Reihe umbricht statt zu scrollen, und dass die Kopfzeile alle vier
// Lenses überhaupt rendert. Die Geometrie selbst wurde am laufenden System verifiziert
// und steht in ADR-v9-111.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/svelte';
import { vi } from 'vitest';
import LensSwitcher from '../../ui/shell/LensSwitcher.svelte';
import { LENSES } from '../../ui/shell/lens-model';

// Pfad über `process.cwd()` statt `import.meta.url`: unter happy-dom ist `import.meta.url`
// eine http-URL, `fileURLToPath` wirft dort („The URL must be of scheme file"). Vitest läuft
// aus dem Repo-Wurzelverzeichnis.
const css = readFileSync(join(process.cwd(), 'ui/shell/design-system.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
); // Kommentare raus — sonst prüft der Test seine eigene Erklärung

function ruleBody(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `Selektor ${selector} fehlt in design-system.css`).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('}', start));
}

describe('Lens-Kopfzeile: keine Lens rutscht aus dem Bild (BL-95)', () => {
  it('die geteilte Segment-Reihe bricht um, statt horizontal zu scrollen', () => {
    const body = ruleBody('.stb-segment-row');

    expect(body).toMatch(/flex-wrap:\s*wrap/);
    // Der eigentliche Defekt: eine scrollende Reihe versteckt ihren Überlauf ohne
    // Affordanz. Beides zugleich wäre widersprüchlich (Umbruch macht Scroll wirkungslos)
    // — die zweite Zusicherung hält fest, dass die alte Fassung nicht zurückkommt.
    expect(body).not.toMatch(/overflow-x:\s*(auto|scroll)/);
  });

  it('rendert ALLE Lenses — auch die noch nicht gebaute', () => {
    // „Story" ist der Eintrag, der beim Überlauf als erster verschwand. Ein Platzhalter,
    // den niemand sieht, ist kein Platzhalter.
    render(LensSwitcher, { props: { active: 'tree', onNavigate: vi.fn() } });

    for (const lens of LENSES) {
      const treffer = screen.getByText(new RegExp(lens.label));
      expect(treffer, `Lens „${lens.label}" fehlt in der Kopfzeile`).toBeTruthy();
    }
  });

  it('die Reihe hat keine feste Höhe, die einen Umbruch abschneiden würde', () => {
    // Ein `height`/`max-height` auf der Reihe würde die zweite Zeile unsichtbar machen —
    // der Überlauf wäre dann vertikal statt horizontal, also derselbe Fehler in neuer
    // Richtung.
    const body = ruleBody('.stb-segment-row');
    expect(body).not.toMatch(/(^|[;{]\s*)(max-)?height:/);
  });
});
