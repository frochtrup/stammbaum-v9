// tests/ui/safe-area.test.ts — Geräte-Sicherheitsabstände (Spec 21 §6, ADR-v9-189).
// Geschwister von `touch-target.test.ts`/`text-contrast.test.ts`: liest die ECHTEN
// CSS-Quellen, statt eine Konvention nur zu dokumentieren.
//
// AUSLÖSER (Nutzer-Fund per Screenshot, 2026-08-01): `app/index.html` setzt
// `viewport-fit=cover` + `apple-mobile-web-app-status-bar-style: black-translucent` —
// die App zeichnet also bewusst unter die iOS-Systemleisten. Umgesetzt war das aber nur
// unten (`BottomNav`); oben lag die Uhr auf dem App-Titel und die Systemsymbole rechts
// genau auf Rückgängig/Wiederherstellen: sichtbar, aber nicht bedienbar.
//
// WAS DIESER WÄCHTER KANN: er hält die zwei Regeln fest, an denen der Fehler hing —
// (1) die Insets kommen aus EINER Quelle (Token), damit niemand die Hälfte davon
// vergisst oder mit eigenem `env()` daneben baut, und (2) wer über der Bottom-Nav
// andockt, rechnet mit ihrer GESAMTHÖHE inkl. Inset. Dazu prüft er punktuell die zwei
// obersten Flächen der Schale.
// WAS ER NICHT KANN: er kennt keine Geometrie und weiß nicht, ob eine KÜNFTIGE
// randberührende Fläche das Inset braucht — happy-dom rechnet kein Layout, und
// `env(safe-area-inset-*)` ist auf jedem Testrechner 0. Der echte Beweis bleibt eine
// Sichtprüfung auf dem Gerät (bzw. mit gesetzten Token-Werten im Browser).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DESIGN_SYSTEM = join(ROOT, 'ui/shell/design-system.css');
const SCAN_DIRS = [join(ROOT, 'ui'), join(ROOT, 'app')];

function styleFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules' || name === 'dist' || name === 'public') continue;
      out.push(...styleFiles(p));
    } else if (name.endsWith('.svelte') || name.endsWith('.css')) out.push(p);
  }
  return out;
}

const files = SCAN_DIRS.flatMap(styleFiles);

/** CSS-Kommentare raus, BEVOR nach Token-Namen gesucht wird. Ohne das prüft der Wächter
 *  sich selbst blind: die Begründung über einer Regel nennt den Token, den die Regel
 *  benutzen soll — die Zusicherung wäre schon durch den Kommentar erfüllt und bliebe
 *  grün, während die Deklaration darunter das Inset verloren hat (beim Negativ-Test
 *  dieses Wächters genau so passiert). */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('Geräte-Sicherheitsabstände', () => {
  it('definiert die vier Inset-Token im Design-System', () => {
    const css = readFileSync(DESIGN_SYSTEM, 'utf8');
    for (const side of ['top', 'bottom', 'left', 'right']) {
      expect(css, `Token --stb-safe-${side} fehlt`).toMatch(
        new RegExp(`--stb-safe-${side}:\\s*env\\(safe-area-inset-${side}`),
      );
    }
    // Die Nav-Gesamthöhe (Basis + Inset) ist die zweite geteilte Größe: sie ist der
    // Andockpunkt für alles, was sich über die Nav legt.
    expect(css).toMatch(/--stb-nav-total:\s*calc\(var\(--stb-nav-height\)\s*\+\s*var\(--stb-safe-bottom\)\)/);
  });

  it('nutzt env(safe-area-inset-*) nur an der Token-Definition', () => {
    const offenders = files
      .filter((f) => f !== DESIGN_SYSTEM)
      .filter((f) => /env\(\s*safe-area-inset-/.test(withoutComments(readFileSync(f, 'utf8'))))
      .map((f) => relative(ROOT, f));
    // Ein zweites, direktes env() daneben ist genau der Weg, auf dem die Hälfte der
    // Ränder vergessen wird — die Token führen alle vier an einer Stelle zusammen.
    expect(offenders, `env() direkt statt var(--stb-safe-*): ${offenders.join(', ')}`).toEqual([]);
  });

  it('dockt über der Bottom-Nav an ihrer Gesamthöhe an, nicht an der Basis-Höhe', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const css = withoutComments(readFileSync(f, 'utf8'));
      // `min-height: var(--stb-nav-height)` in BottomNav selbst ist korrekt — dort kommt
      // das Inset als eigenes padding dazu. Falsch ist nur das ANDOCKEN an der Basishöhe.
      if (/(^|[\s;{])(bottom|margin-bottom|padding-bottom)\s*:\s*[^;]*var\(--stb-nav-height\)/m.test(css)) {
        offenders.push(relative(ROOT, f));
      }
    }
    expect(offenders, `nutzt --stb-nav-height statt --stb-nav-total: ${offenders.join(', ')}`).toEqual([]);
  });

  it('rechnet das obere Inset in den beiden obersten Flächen der Schale ein', () => {
    // Punktuell statt generisch: die Kopfzeile (mobil) und die Sidebar (Desktop/iPad)
    // sind die Flächen, die den oberen Bildschirmrand berühren.
    const header = withoutComments(readFileSync(join(ROOT, 'app/App.svelte'), 'utf8'));
    expect(header, '.app-shell__header ohne --stb-safe-top').toMatch(
      /\.app-shell__header\s*\{[^}]*--stb-safe-top/,
    );
    const sidebar = withoutComments(readFileSync(join(ROOT, 'ui/shell/Sidebar.svelte'), 'utf8'));
    expect(sidebar, '.sidebar ohne --stb-safe-top').toMatch(/\.sidebar\s*\{[^}]*--stb-safe-top/);
  });
});
