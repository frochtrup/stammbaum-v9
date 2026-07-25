// tests/ui/text-contrast.test.ts — Kontrast-Kontrakt für die Text-Token (Spec 21 §6,
// ADR-v9-119). Erzwingt strukturell, was sonst nur ein Kommentar wäre: JEDER
// informationstragende Text-Token muss gegen den Seitenhintergrund WCAG AA (≥ 4.5:1)
// erreichen. Bricht künftig automatisch, wenn jemand einen solchen Token wieder unter
// die Lesbarkeitsschwelle setzt (der Fall, den `--stb-text-muted #5a4e38` ≈ 2,2:1 hatte:
// Rollen-Labels, Nav-Gruppen, Geneal.-Metadaten unlesbar auf dem Handy).
//
// Bewusst ausgenommen: reine Deko-/Nicht-Text-Token (`--stb-quay-meter-empty`, Rahmen,
// Führungslinien) — für die greift AA-4.5 nicht. Referenz-Hintergrund ist `--stb-bg`
// (Seiten-/Listenhintergrund); Komponenten-Füllflächen wie `--stb-surface-3` sind ein
// getrennter Fall (dort steht kein informationstragender Fließtext).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../ui/shell/design-system.css', import.meta.url), 'utf8');

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
  const [r, g, b] = [1, 2, 3].map((i) => srgbToLinear(parseInt(m[i], 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const [la, lb] = [relativeLuminance(a), relativeLuminance(b)];
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

describe('Text-Token-Kontrast — informationstragender Text erreicht WCAG AA', () => {
  const bg = token('bg');

  it.each(['text', 'text-dim', 'text-muted'])(
    '--stb-%s erreicht ≥ 4.5:1 gegen --stb-bg',
    (name) => {
      const ratio = contrastRatio(token(name), bg);
      expect(ratio, `--stb-${name} vs --stb-bg = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('die Text-Hierarchie bleibt monoton (text heller als dim heller als muted)', () => {
    const l = (n: string) => relativeLuminance(token(n));
    expect(l('text')).toBeGreaterThan(l('text-dim'));
    expect(l('text-dim')).toBeGreaterThan(l('text-muted'));
  });
});
