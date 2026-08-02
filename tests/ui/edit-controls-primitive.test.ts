// tests/ui/edit-controls-primitive.test.ts — EINE Button-Primitive für die
// beschrifteten Bedienelemente der Bearbeitung (Spec 21 §6/§6i, INV-UI-4, BL-273).
//
// DER BEFUND, DER IHN AUSLÖSTE. `.stb-btn` existiert seit ADR-v9-155 mit
// `min-height: var(--stb-touch-target)` und hatte 19 Verwendungen — keine davon in einer
// Detail-Bearbeitung. Stattdessen: sechs byte-identische Kopien von „✎ Bearbeiten" und
// acht Kopien von Speichern/Abbrechen mit DREI verschiedenen Paddings und zwei
// Disabled-Bildern. Die Optik war schon auseinandergelaufen, nicht bloß die Definition —
// und keine der Kopien erreichte die 44px, weil keine eine Größe setzte.
//
// WAS GEPRÜFT WIRD: keine Komponente definiert eigenes CSS für einen BESCHRIFTETEN
// Speichern-/Abbrechen-/Verwerfen-/Löschen-/Bearbeiten-Knopf. Sie nimmt `.stb-btn`
// (+ `data-variant`) und ergänzt höchstens Positionierung.
//
// AUSDRÜCKLICH NICHT GEPRÜFT: ikonische Inline-Bedienelemente (`✎`/`✕` in einer
// Ereigniszeile, an einer Pille, an einer Referenzzeile). Für sie ist `.stb-btn` die
// FALSCHE Antwort — sein Rahmen und sein Padding sprengen die kompakte Zeile (INV-UI-5),
// während ihr eigentliches Problem die Trefferfläche ist, nicht die Optik. Sie brauchen
// eine eigene Primitive und damit eine eigene Entscheidung; die Ratsche in
// `touch-target.test.ts` hält sie sichtbar, bis die gefallen ist. Ein Wächter, der hier
// so täte, als sei das mit erledigt, wäre schlimmer als seine benannte Grenze.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const UI_DIR = fileURLToPath(new URL('../../ui', import.meta.url));
const DESIGN_SYSTEM = 'shell/design-system.css';

function svelteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...svelteFiles(p));
    else if (name.endsWith('.svelte')) out.push(p);
  }
  return out;
}

/**
 * Klassennamen beschrifteter Bearbeitungs-Knöpfe. Bewusst auf das Wortende gefasst
 * (`__save`, `__save-btn`), damit `__save-row`/`__actions` als Container nicht mitzählen —
 * die dürfen und sollen lokal bleiben (Positionierung ist keine Optik-Dopplung).
 */
const VERBOTEN = /\.[a-z0-9-]+__(save|cancel|discard|delete|edit)(-btn)?\s*(?=[,{:])/gi;

/** Ikonische Inline-Controls: eigene Primitive nötig, s. Kopfkommentar — nicht hier. */
const IKONISCH = /^\.(event-line__edit-btn|stb-pill__remove)/;

function offeneKopien(): { file: string; selector: string }[] {
  const out: { file: string; selector: string }[] = [];
  for (const file of svelteFiles(UI_DIR)) {
    const style = /<style[^>]*>([\s\S]*?)<\/style>/.exec(readFileSync(file, 'utf8'));
    if (!style) continue;
    for (const m of style[1].matchAll(VERBOTEN)) {
      const selector = m[0].trim();
      if (IKONISCH.test(selector)) continue;
      out.push({ file: file.slice(UI_DIR.length + 1), selector });
    }
  }
  return out;
}

describe('BL-273 — beschriftete Bearbeitungs-Knöpfe kommen aus `.stb-btn`', () => {
  it('die Primitive existiert und beantwortet die Größenfrage (sonst löst die Umstellung nichts)', () => {
    const css = readFileSync(join(UI_DIR, DESIGN_SYSTEM), 'utf8');
    // Seit BL-299 beantwortet die geteilte Trefferzone die Größenfrage (`::after`), nicht
    // die gezeichnete Höhe des Knopfes — die drückt nur noch die Hierarchie aus.
    expect(css).toMatch(/\.stb-btn::after[^{]*\{[^}]*height:\s*var\(--stb-touch-target\)/s);
    expect(css).toMatch(/\.stb-btn\[data-variant='primary'\]/);
    expect(css).toMatch(/\.stb-btn\[data-variant='secondary'\]/);
  });

  it('keine Komponente definiert eigenes CSS für einen beschrifteten Speichern-/Abbrechen-/Löschen-/Bearbeiten-Knopf', () => {
    const bericht = offeneKopien()
      .map((f) => `${f.file}  ${f.selector}`)
      .sort()
      .join('\n');
    expect(bericht, 'lokale Kopie statt `.stb-btn` (INV-UI-4) — die Optik driftet, und die Trefferfläche fehlt').toBe('');
  });

  it('erkennt eine Kopie überhaupt (Selbsttest — ein Wächter ohne gesehenen Rot-Fall ist unbelegt)', () => {
    const probe = '.foo__save-btn, .foo__cancel-btn { padding: 1px; }';
    expect([...probe.matchAll(VERBOTEN)].map((m) => m[0].trim())).toEqual(['.foo__save-btn', '.foo__cancel-btn']);
    // Container bleiben erlaubt.
    expect([...'.foo__save-row { display: flex; }'.matchAll(VERBOTEN)]).toEqual([]);
  });
});
