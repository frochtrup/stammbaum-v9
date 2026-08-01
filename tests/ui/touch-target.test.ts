// tests/ui/touch-target.test.ts — Trefferflächen-Kontrakt (Spec 21 §6i, ADR-v9-155).
// Geschwister von `text-contrast.test.ts`: liest die ECHTEN CSS-Werte aus den Quellen,
// statt eine Konvention nur zu dokumentieren.
//
// WAS DIESER WÄCHTER KANN — und was nicht. Er fängt den Fall, der ihn ausgelöst hat:
// jemand setzt an einem Bedienelement eine EXPLIZITE Mindestgröße UNTER der Schwelle
// (`UndoControls` hatte `min-width: 2.2rem` → 35×27px, die kleinsten interaktiven
// Flächen der App, gefunden erst durch eine Design-Kritik des Nutzers). Er fängt NICHT
// „jemand setzt gar keine Größe" — dafür braucht es gerenderte Pixel MIT Layout. Der
// a11y-Scanner (tests/a11y/axe-setup.ts, ADR-v9-170) schließt die Lücke NICHT: er läuft
// unter happy-dom, das keine Geometrie rechnet. Sie bleibt manuell. Das ist bewusst so
// benannt statt als Voll-Abdeckung ausgegeben: ein Wächter, dessen Reichweite man
// überschätzt, ist schlimmer als einer, dessen Grenze man kennt.
//
// Warum überhaupt eine Zahl im CSS und nicht nur im Spec: die Vorgabe „44px" hing bis
// ADR-v9-155 an gar nichts — §6i nannte Tastatur, Screenreader, reduzierte Bewegung und
// Kontrast, aber kein Ziel-Größen-Kriterium. Eine Regel, die nur in Prosa steht, hängt am
// zufälligen Wieder-Erinnern jeder künftigen Bau-Session (CLAUDE.md, mehrfach belegt).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const UI_DIR = fileURLToPath(new URL('../../ui', import.meta.url));
const DESIGN_SYSTEM = fileURLToPath(new URL('../../ui/shell/design-system.css', import.meta.url));

/** Die Schwelle steht im Design-System, nicht hier — EINE Quelle (INV-UI-4). */
function touchTargetPx(): number {
  const css = readFileSync(DESIGN_SYSTEM, 'utf8');
  const m = /--stb-touch-target:\s*(\d+)px/.exec(css);
  if (!m) throw new Error('Token --stb-touch-target fehlt in design-system.css');
  return Number(m[1]);
}

function svelteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...svelteFiles(p));
    else if (name.endsWith('.svelte')) out.push(p);
  }
  return out;
}

/** `2.2rem` → 35.2 · `28px` → 28. Andere Einheiten (%, em, vw) sind kontextabhängig und
 *  werden bewusst NICHT geraten — sie zählen als „nicht bewertbar", nicht als Verstoß. */
function toPx(value: string): number | null {
  const m = /^([\d.]+)(px|rem)$/.exec(value.trim());
  if (!m) return null;
  return m[2] === 'rem' ? Number(m[1]) * 16 : Number(m[1]);
}

interface Finding {
  file: string;
  selector: string;
  prop: string;
  value: string;
  px: number;
}

/**
 * Sucht in `<style>`-Blöcken nach Regeln, deren Selektor ein Bedienelement benennt
 * (`button`, `__btn`, `[role="button"]` …) und die dort `min-width`/`min-height` unter
 * der Schwelle festschreiben.
 */
function findUndersizedControls(threshold: number): Finding[] {
  const findings: Finding[] = [];
  const CONTROL = /(^|[\s,>])(button|a)\b|(btn|button|control|toggle|chip|action)/i;

  for (const file of svelteFiles(UI_DIR)) {
    const src = readFileSync(file, 'utf8');
    const style = /<style[^>]*>([\s\S]*?)<\/style>/.exec(src);
    if (!style) continue;

    // Grobe, aber ausreichende Regel-Zerlegung: `selektor { … }` ohne Verschachtelung.
    for (const rule of style[1].matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = rule[1].replace(/\s+/g, ' ').trim();
      const body = rule[2];
      if (!CONTROL.test(selector)) continue;
      // Ein Selektor, der ausdrücklich KEIN Bedienelement ist (z. B. `.x__btn-row`),
      // trägt die Größe seines Kindes nicht — Container-Suffixe ausnehmen.
      if (/(row|bar|group|list|wrap|container)\s*$/i.test(selector)) continue;

      for (const decl of body.matchAll(/(min-width|min-height)\s*:\s*([^;]+);/g)) {
        const px = toPx(decl[2]);
        if (px == null || px >= threshold) continue;
        findings.push({
          file: file.slice(UI_DIR.length + 1),
          selector,
          prop: decl[1],
          value: decl[2].trim(),
          px,
        });
      }
    }
  }
  return findings;
}

/**
 * BL-272 — die ANDERE Hälfte: ein Bedienelement, das GAR KEINE Mindestgröße setzt.
 *
 * Der Kopfkommentar oben nannte diese Lücke und ließ sie offen („dafür braucht es
 * gerenderte Pixel MIT Layout"). Die Design-Kritik der Bearbeitungsfunktion zeigte, dass
 * genau darin die gesamte Editier-Fläche liegt: kein einziges ihrer Bedienelemente setzt
 * eine Größe, keines erreicht die Schwelle — `✎` je Ereigniszeile rechnerisch ≈ 14px bei
 * `padding: 0; font-size: .85rem; line-height: 1`.
 *
 * Gerenderte Pixel braucht es dafür NICHT: es genügt zu fragen, ob eine Regel, die ein
 * Bedienelement gestaltet, die Größenfrage überhaupt beantwortet — entweder selbst
 * (`min-height`/`min-width`/`height`) oder durch Rückgriff auf die geteilte Primitive
 * `.stb-btn`, die sie beantwortet. Wer weder das eine noch das andere tut, hat die Frage
 * nicht gestellt. Das ist schwächer als eine Messung und stärker als nichts.
 *
 * RATSCHE statt Rot-Wand: der Ist-Stand ist bekannt und wird von BL-273 abgebaut
 * (Umstellung der Bearbeitungs-Bedienelemente auf `.stb-btn`). Die Zahl darf nur
 * FALLEN — dieselbe Bauform wie L3/L7/L11 im Backlog-Lint. Wer ein neues Bedienelement
 * ohne Größe anlegt, hebt sie sonst unbemerkt an; genau das soll auffliegen.
 *
 * Die Zahl ist GEMESSEN, nicht gegriffen: der erste Entwurf trug 44 als Platzhalter, der
 * Lauf ergab 116. Eine Ratsche mit geschätztem Startwert ist entweder sofort rot oder
 * blind — beides macht sie wertlos (dieselbe Lehre wie beim Perf-Budget, ADR-v9-91).
 */
const OHNE_GROESSE_RATSCHE = 93; // GEMESSEN. 116 → 93 durch BL-273/274 (`.stb-btn`-Umstellung).

/** Regeln, die ein Bedienelement gestalten, aber seine Größe nicht beantworten. */
function findControlsWithoutSize(): { file: string; selector: string }[] {
  const out: { file: string; selector: string }[] = [];
  const CONTROL = /(^|[\s,>])(button|a)\b|(btn|button|control|toggle|chip|action)/i;

  for (const file of svelteFiles(UI_DIR)) {
    const src = readFileSync(file, 'utf8');
    const style = /<style[^>]*>([\s\S]*?)<\/style>/.exec(src);
    if (!style) continue;

    for (const rule of style[1].matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = rule[1].replace(/\s+/g, ' ').trim();
      const body = rule[2];
      if (!CONTROL.test(selector)) continue;
      if (/(row|bar|group|list|wrap|container)\s*$/i.test(selector)) continue;
      // Nur Regeln, die das Element WIRKLICH gestalten — ein reiner `:hover`-Farbwechsel
      // ist keine Größen-Entscheidung und soll nicht mitzählen.
      if (/:(hover|focus|focus-visible|active|disabled)\b/.test(selector)) continue;
      if (!/(padding|background|border|font-size)\s*:/.test(body)) continue;
      if (/(min-height|min-width|height)\s*:/.test(body)) continue;
      out.push({ file: file.slice(UI_DIR.length + 1), selector });
    }
  }
  return out;
}

describe('Trefferflächen — Bedienelemente schreiben keine Größe unter der Schwelle fest', () => {
  it('das Schwellen-Token existiert und hält die Apple-HIG-Vorgabe für die Primärplattform', () => {
    expect(touchTargetPx()).toBeGreaterThanOrEqual(44);
  });

  it('keine Komponente setzt min-width/min-height eines Bedienelements darunter', () => {
    const threshold = touchTargetPx();
    const findings = findUndersizedControls(threshold);
    const report = findings
      .map((f) => `${f.file}  ${f.selector} { ${f.prop}: ${f.value} }  → ${f.px}px < ${threshold}px`)
      .join('\n');
    expect(report).toBe('');
  });

  it('BL-272: die Zahl der Bedienelemente OHNE Größenangabe fällt nur (Ratsche)', () => {
    const ohne = findControlsWithoutSize();
    const bericht = ohne.map((f) => `${f.file}  ${f.selector}`).sort().join('\n');
    expect(
      ohne.length,
      `Bedienelemente ohne jede Größenangabe: ${ohne.length} > Ratsche ${OHNE_GROESSE_RATSCHE}.\n` +
        'Ein neues Bedienelement nutzt `.stb-btn` (INV-UI-4) oder setzt selbst eine\n' +
        'Mindestgröße — die Ratsche wird nur GESENKT, nie angehoben (BL-273 baut sie ab).\n' +
        bericht,
    ).toBeLessThanOrEqual(OHNE_GROESSE_RATSCHE);
  });

  it('BL-272: der Rot-Fall ist belegt — eine Regel ohne Größe wird gefunden, eine mit nicht', () => {
    // Genau die Form der `✎`-Bearbeiten-Fläche vor BL-273 (padding, aber keine Größe)
    // gegen dieselbe Regel mit `.stb-btn`-Vertrag.
    const ohne = findControlsWithoutSize();
    expect(ohne.length).toBeGreaterThan(0);
    expect(ohne.some((f) => /edit-btn|__btn/.test(f.selector))).toBe(true);
  });

  it('erkennt einen Verstoß überhaupt (Selbsttest — ein Wächter, dessen Rot-Fall nie lief, ist unbelegt)', () => {
    // Genau die Form, die `UndoControls` hatte, bevor ADR-v9-155 sie behob.
    const probe = `<style>\n.foo__btn { min-width: 2.2rem; }\n</style>`;
    const rule = /([^{}]+)\{([^{}]*)\}/.exec(/<style[^>]*>([\s\S]*?)<\/style>/.exec(probe)![1])!;
    expect(rule[1].trim()).toBe('.foo__btn');
    expect(toPx(/min-width\s*:\s*([^;]+);/.exec(rule[2])![1])).toBeCloseTo(35.2, 1);
    expect(toPx('2.2rem')! < touchTargetPx()).toBe(true);
  });
});
