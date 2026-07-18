// tests/ui/overlay-z-index.test.ts — Regressionsschutz für die Überlagerungs-Ordnung.
//
// Warum ein CSS-Quelltext-Test: happy-dom hat keine Layout-Engine und kein Hit-Testing;
// „liegt A über B?" ist dort prinzipiell nicht beantwortbar (dieselbe Begründung wie in
// design-system-flex.test.ts). Der echte Nachweis lief im Browser per
// `document.elementFromPoint()` über der Navigations-Mitte — dieser Test hält nur die
// Bedingung fest, unter der das Ergebnis stimmt.
//
// Anlass (BL-04-Nachlauf): `EventEditModal` und `PlaceEnclosureEditModal` trugen je eine
// eigene Kopie desselben Backdrops mit `z-index: 100` und lagen damit UNTER der
// Bottom-Nav (400) — die Modale waren nicht modal, die Navigation blieb darüber
// bedienbar und verdeckte bei hohem Panel die eigenen Aktionsknöpfe. Drei Kopien, zwei
// davon falsch: der Fehler entstand durch Abschreiben, deshalb greift der Test genau
// dort an (eine neue Kopie mit eigener Zahl).
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const uiDir = fileURLToPath(new URL('../../ui', import.meta.url));

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(svelte|css)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const designSystem = readFileSync(join(uiDir, 'shell/design-system.css'), 'utf8');

/** Wert einer :root-Variablen aus design-system.css. */
function zVar(name: string): number {
  const m = designSystem.match(new RegExp(`--${name}:\\s*(\\d+)`));
  expect(m, `--${name} fehlt in design-system.css`).not.toBeNull();
  return Number(m![1]);
}

describe('Überlagerungs-Ordnung (Spec 21 §6, INV-UI-4)', () => {
  it('die Ebenen-Skala ist vollständig und aufsteigend', () => {
    // Ohne diese Ordnung ist jede einzelne Komponente für sich plausibel und das
    // Ergebnis trotzdem falsch — genau so ist der Fehler entstanden.
    expect(zVar('stb-z-nav')).toBeLessThan(zVar('stb-z-modal'));
    expect(zVar('stb-z-modal')).toBeLessThan(zVar('stb-z-tooltip'));
  });

  it('die Bottom-Nav nutzt die Skala statt einer eigenen Zahl', () => {
    const nav = readFileSync(join(uiDir, 'shell/BottomNav.svelte'), 'utf8');
    expect(nav).toMatch(/z-index:\s*var\(--stb-z-nav\)/);
  });

  it('das geteilte Modal-Backdrop liegt über der Navigation', () => {
    const start = designSystem.indexOf('.stb-modal-backdrop {');
    expect(start, '.stb-modal-backdrop fehlt').toBeGreaterThan(-1);
    const body = designSystem.slice(start, designSystem.indexOf('}', start));
    expect(body).toMatch(/z-index:\s*var\(--stb-z-modal\)/);
    // Ohne Freiraum unten verschwinden die Aktionsknöpfe eines hohen, scrollenden
    // Panels hinter der Navigation (im Browser gemessen).
    expect(body).toMatch(/padding:[^;]*\d/);
    expect(body).toMatch(/overflow-y:\s*auto/);
  });

  it('kein Vollflächen-Overlay vergibt einen eigenen z-index unterhalb der Navigation', () => {
    // Geschwister-Stellen-Prüfung (CLAUDE.md: ein Fix ist erst fertig, wenn ALLE
    // strukturgleichen Stellen mitgezogen sind). Gesucht ist das Muster, das zweimal
    // schiefging: `position: fixed` + `inset: 0` + eine ROHE Zahl als z-index.
    const navZ = zVar('stb-z-nav');
    const verstoesse: string[] = [];

    for (const file of walk(uiDir)) {
      const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const [, selector, body] of src.matchAll(/([.#][\w-]+)\s*\{([^}]*)\}/g)) {
        if (!/position:\s*fixed/.test(body)) continue;
        if (!/inset:\s*0/.test(body)) continue;
        const z = body.match(/z-index:\s*(\d+)\s*;/);
        if (z && Number(z[1]) < navZ) {
          verstoesse.push(`${file.replace(uiDir, 'ui')} ${selector} → z-index ${z[1]} < ${navZ}`);
        }
      }
    }

    // FilterBar/EventTypeMenu stehen hier bewusst NICHT als Ausnahme: ihr Backdrop trägt
    // zwar 20, ihr Panel liegt aber in einem klippenden/stapelnden Vorfahren — dort
    // wirkt eine höhere Zahl gar nicht, der Fix ist ein anderer (BL-85). Sie erfüllen
    // das gesuchte Muster (fixed + inset:0 + rohe Zahl) und würden hier anschlagen,
    // sobald jemand sie „nur" hochzählt statt sie richtig zu lösen.
    expect(verstoesse.filter((v) => !/filterbar|event-menu/.test(v))).toEqual([]);
  });
});
