// tests/ui/button-style.test.ts — EIN Aktions-Knopf-Stil (INV-UI-4, ADR-v9-128),
// Geschwister von `touch-target.test.ts`/`text-contrast.test.ts`: liest die ECHTEN
// CSS-/Markup-Quellen, statt eine Konvention nur zu dokumentieren.
//
// DER ANLASS, in der Reihenfolge, in der er aufgefallen ist:
//  1. `data-variant="secondary"` SAH aus wie ein globaler Stil-Hook, war aber keiner —
//     es gab keine `[data-variant]`-Regel im Design-System. Jede Komponente brachte ihre
//     eigene mit; wer das Attribut setzte, ohne eine Regel dazuzuschreiben, bekam den
//     Browser-Default (hellgrauer Grund, heller Text). Genau so passiert beim Bau von
//     BL-258. Die Component-Tests blieben grün: happy-dom rechnet keine Farben.
//  2. Die fünf lokalen Kopien waren NICHT identisch. Zwei setzten `min-height: 44px`,
//     drei gar nichts — am laufenden System gemessen lagen „Speichern" bei 31,5 px und
//     „Datei öffnen"/„Demo laden"/„Orte exportieren"/„Orte importieren" bei 33,5 px,
//     also unter der 44-px-Vorgabe (Spec 21 §6i, ADR-v9-155). Und die zwei konformen
//     Kopien trugen die Zahl als Literal, obwohl §6i sie EINMAL als Token verlangt.
//
// Der vorhandene Trefferflächen-Wächter konnte davon nichts sehen: er fängt eine zu KLEIN
// gesetzte Größe, nicht eine fehlende. Dieser hier schließt den Teil der Lücke, der
// mechanisch erreichbar ist — nicht mehr, aber auch nicht weniger.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const UI_DIR = fileURLToPath(new URL('../../ui', import.meta.url));
const DESIGN_SYSTEM = fileURLToPath(new URL('../../ui/shell/design-system.css', import.meta.url));

function svelteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...svelteFiles(p));
    else if (name.endsWith('.svelte')) out.push(p);
  }
  return out;
}

/** Alle Elemente, die `data-variant` setzen — mit ihrem `class`-Attribut. */
function variantElements(): { file: string; tag: string; variant: string; classAttr: string }[] {
  const out: { file: string; tag: string; variant: string; classAttr: string }[] = [];
  for (const file of svelteFiles(UI_DIR)) {
    const src = readFileSync(file, 'utf8');
    // Öffnendes Tag bis zum ersten `>`, das ein `data-variant` enthält. Reicht für das
    // hier übliche Markup (keine `>` in Attributwerten dieser Elemente).
    for (const m of src.matchAll(/<([a-zA-Z][\w-]*)\s([^>]*?data-variant[^>]*?)>/g)) {
      const attrs = m[2];
      const variant = /data-variant=(?:"([^"]*)"|\{([^}]*)\})/.exec(attrs);
      const cls = /class="([^"]*)"/.exec(attrs);
      out.push({
        file: file.slice(UI_DIR.length + 1),
        tag: m[1],
        variant: (variant?.[1] ?? variant?.[2] ?? '').trim(),
        classAttr: cls?.[1] ?? '',
      });
    }
  }
  return out;
}

describe('Aktions-Knopf — EIN Stil im Design-System', () => {
  const css = readFileSync(DESIGN_SYSTEM, 'utf8');

  it('`.stb-btn` existiert und holt die Trefferfläche aus dem Token, nicht als Literal', () => {
    const rule = /\.stb-btn\s*\{([^}]*)\}/.exec(css);
    expect(rule, '.stb-btn fehlt in design-system.css').not.toBeNull();
    // Seit BL-299 trägt die ZONE das Token, nicht die gezeichnete Höhe: der Knopf darf
    // kleiner AUSSEHEN (Hierarchie), angefasst wird die volle Schwelle. Ein Literal in
    // der Zone wäre der Rückfall in genau die Doppelung, die diese Regel auflöst.
    expect(css).toMatch(/\.stb-btn::after[^{]*\{[^}]*height:\s*var\(--stb-touch-target\)/s);
    expect(css).not.toMatch(/\.stb-btn::after[^{]*\{[^}]*height:\s*\d+px/s);
  });

  it('beide Varianten sind im Design-System definiert — das Attribut hält, was es verspricht', () => {
    expect(css).toMatch(/\.stb-btn\[data-variant='primary'\]/);
    expect(css).toMatch(/\.stb-btn\[data-variant='secondary'\]/);
  });
});

/**
 * Klassen, für die das Design-System überhaupt eine `[data-variant]`-Regel führt —
 * aus dem CSS ABGELEITET, nicht aufgezählt. Anfangs war das nur `.stb-btn`; mit BL-280
 * kam `.stb-icon-btn` dazu (destruktive Glyphe). Eine feste Namensliste hätte den
 * zweiten Fall als Verstoß gemeldet, obwohl das Attribut dort sehr wohl wirkt — die
 * Frage des Wächters ist „gibt es eine Regel dazu?", nicht „heißt es `.stb-btn`?".
 */
function variantTraegerKlassen(css: string): string[] {
  const out = new Set<string>();
  for (const m of css.matchAll(/\.([\w-]+)\[data-variant=/g)) out.add(m[1]);
  return [...out];
}

describe('WÄCHTER: `data-variant` ohne tragende Klasse ist ein Marker ohne Wirkung', () => {
  it('jedes Element mit data-variant trägt auch die Klasse, die den Stil liefert', () => {
    const traeger = variantTraegerKlassen(readFileSync(DESIGN_SYSTEM, 'utf8'));
    expect(traeger).toContain('stb-btn');
    const offenders = variantElements()
      .filter((e) => !traeger.some((k) => new RegExp(`\\b${k}\\b`).test(e.classAttr)))
      .map((e) => `${e.file}  <${e.tag} data-variant=${e.variant || '?'} class="${e.classAttr}">`);
    // Der Fall, der ihn ausgelöst hat: SettingsViews „Ordner wählen" trug das Attribut,
    // aber keine Regel — und rendete im Browser-Default, unlesbar.
    expect(offenders.join('\n')).toBe('');
  });

  it('findet mindestens die bekannten Fundstellen (der Wächter prüft nicht die leere Menge)', () => {
    // Ohne diese Zusicherung bliebe der Test auch dann grün, wenn die Suche gar nichts
    // fände — ein Wächter über einer leeren Menge ist keiner.
    const found = variantElements();
    expect(found.length).toBeGreaterThanOrEqual(8);
    expect(new Set(found.map((e) => e.file)).size).toBeGreaterThanOrEqual(5);
  });
});

describe('WÄCHTER: keine Komponente erfindet den Knopf-Stil neu', () => {
  it('kein <style>-Block baut die Sekundär-Optik lokal nach', () => {
    // Signatur der Sekundär-Variante: Gold-Text auf transparentem Grund mit gedimmtem
    // Gold-Rahmen. Eng gefasst (beide Merkmale zusammen), damit legitime Gold-Akzente
    // (Pillen, Links, Segment-Buttons) nicht falsch anschlagen.
    //
    // ZUSÄTZLICH auf Bedienelement-Selektoren begrenzt — dieselbe Heuristik wie im
    // Trefferflächen-Wächter. Ohne sie meldete der erste Lauf `PlaceMiniMap`s
    // `.mini-map__cue`: ein dekorativer Hinweis-Punkt mit `pointer-events: none`, der
    // dieselben zwei Farben trägt, aber kein Knopf ist und keinen Stil erbt.
    const CONTROL = /(^|[\s,>])(button|a)\b|(btn|button|control|toggle|chip|action)/i;
    const offenders: string[] = [];
    for (const file of svelteFiles(UI_DIR)) {
      const src = readFileSync(file, 'utf8');
      const style = /<style[^>]*>([\s\S]*?)<\/style>/.exec(src);
      if (!style) continue;
      for (const rule of style[1].matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!CONTROL.test(rule[1])) continue;
        const body = rule[2];
        const goldText = /color:\s*var\(--stb-gold\)/.test(body);
        const dimBorder = /border(-color)?:\s*(1px solid )?var\(--stb-gold-dim\)/.test(body);
        if (goldText && dimBorder) {
          offenders.push(`${file.slice(UI_DIR.length + 1)}  ${rule[1].replace(/\s+/g, ' ').trim()}`);
        }
      }
    }
    expect(offenders.join('\n')).toBe('');
  });
});
