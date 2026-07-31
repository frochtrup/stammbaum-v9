// tests/ui/design-tokens.test.ts — Regressionsschutz für zwei Token-Kontrakte aus
// ADR-v9-157/158, die sonst nur ein Kommentar wären (CLAUDE.md: "wo mechanisch möglich,
// den Zwang statt die Erinnerung wählen").
//
// 1. `--stb-ok` MUSS als echter Token existieren, nicht nur über den Inline-Fallback
//    `var(--stb-ok, #5fb85f)` (ADR-v9-157 Befund: der Token fehlte, der Fallback griff
//    faktisch immer — genau die Drift, die ein Token verhindern soll).
// 2. Die Projekt-Farbpalette (`--stb-proj-1..6`, ADR-v9-158) ist EIN Token-Satz (kein
//    roher v8-Hex-Wert direkt in ProjectBar.svelte) und erreicht auf beiden Flächen, auf
//    denen der Chip-Punkt/die Swatch-Auswahl tatsächlich sitzen (`--stb-surface-1`,
//    `--stb-surface-2`), den WCAG-1.4.11-Mindestkontrast für nicht-textuelle UI-Elemente
//    (3:1) — das ist die "gemessen statt roh übernommen"-Zusage aus dem ADR.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const cssPath = new URL('../../ui/shell/design-system.css', import.meta.url);
const css = readFileSync(cssPath, 'utf8');
const qualityDashboardPath = new URL(
  '../../ui/views/quality/QualityDashboard.svelte',
  import.meta.url,
);
const qualityDashboard = readFileSync(qualityDashboardPath, 'utf8');

function token(name: string): string {
  const m = new RegExp(`--stb-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!m) throw new Error(`Token --stb-${name} nicht in design-system.css gefunden`);
  return m[1];
}

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)!;
  const [r, g, b] = [1, 2, 3].map((i) => srgbToLinear(parseInt(m[i]!, 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const [la, lb] = [relativeLuminance(a), relativeLuminance(b)];
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

describe('--stb-ok (ADR-v9-157) — echter Token statt Inline-Fallback', () => {
  it('ist in design-system.css definiert', () => {
    expect(() => token('ok')).not.toThrow();
  });

  it('QualityDashboard.svelte referenziert --stb-ok OHNE Inline-Fallback', () => {
    expect(qualityDashboard).not.toMatch(/var\(--stb-ok,/);
    expect(qualityDashboard).toContain('var(--stb-ok)');
  });
});

describe('--stb-proj-1..6 (ADR-v9-158) — Token-Satz statt roher v8-Hex-Werte', () => {
  const names = ['proj-1', 'proj-2', 'proj-3', 'proj-4', 'proj-5', 'proj-6'];

  it.each(names)('%s ist definiert', (name) => {
    expect(() => token(name)).not.toThrow();
  });

  it('alle sechs Werte sind paarweise verschieden (kein Etiketten-Zufall)', () => {
    const values = names.map(token);
    expect(new Set(values).size).toBe(names.length);
  });

  it.each(names)(
    '%s erreicht >= 3:1 (WCAG 1.4.11, nicht-textuelle Komponente) gegen --stb-surface-1 und --stb-surface-2',
    (name) => {
      const hex = token(name);
      const s1 = token('surface-1');
      const s2 = token('surface-2');
      expect(contrastRatio(hex, s1), `${name} vs surface-1`).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(hex, s2), `${name} vs surface-2`).toBeGreaterThanOrEqual(3);
    },
  );

  it('ProjectBar.svelte referenziert die Palette über Tokens, nicht über rohe v8-Hex-Literale', () => {
    const projectBar = readFileSync(
      new URL('../../ui/views/research-projects/ProjectBar.svelte', import.meta.url),
      'utf8',
    );
    // Die sechs rohen v8-Werte (ui-views-projects.js:10) dürfen NICHT literal auftauchen.
    const v8Raw = ['#b8860b', '#4caf50', '#c0392b', '#2980b9', '#8e44ad', '#d68910'];
    for (const hex of v8Raw) {
      expect(projectBar.toLowerCase()).not.toContain(hex.toLowerCase());
    }
    expect(projectBar).toMatch(/--stb-proj-/);
  });
});
